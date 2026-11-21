import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { z } from "zod";
import { WorkPool, mapParallel } from "../src/server/work/concurrency";
import { HomeworkExecution } from "../src/server/homework/execution";
import { HomeworkStore, type Job } from "../src/server/homework/store";
import { HomeworkWorker } from "../src/server/homework/worker";
import { AIServiceError, type StructuredAI, type AIImage } from "../src/server/ai/provider";
import type { AITask } from "../src/domain/ai-contracts";
import type { Subject } from "../src/domain/contracts";
const date = "2026-11-22", pause = (ms = 20) => new Promise<void>(resolve => setTimeout(resolve, ms));
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(r => resolve = r); return { promise, resolve }; };
async function until(check: () => boolean) { for (let i = 0; i < 200; i++) { if (check()) return; await pause(5); } throw Error("Synthetic work did not reach expected state"); }
function temporary(grading = false) { const dir = mkdtempSync(join(tmpdir(), "xiaobu-parallel-")), store = new HomeworkStore(dir, Date.now, null, false, grading); return { store, close() { store.close(); rmSync(dir, { recursive: true, force: true }); } }; }

test("bounded calls reserve quota and load images only on entry, prioritize uploads, and never exceed three", async () => {
  const f = temporary(), gate = deferred(), order: string[] = []; let active = 0, peak = 0, imagesLoaded = 0;
  const provider: StructuredAI = { async run(_task, schema, input) { active++; peak = Math.max(peak, active); order.push(String(input)); try { if (String(input).startsWith("hold")) await gate.promise; return schema.parse("ok"); } finally { active--; } } };
  const execution = new HomeworkExecution(f.store, () => provider), grade = execution.forJob();
  try {
    const calls = [0, 1, 2].map(i => grade.run("tutor_answer", z.string(), "hold" + i, () => { imagesLoaded++; return []; }));
    await until(() => active === 3); assert.equal(f.store.quota().calls, 3);
    const laterGrade = grade.run("tutor_answer", z.string(), "later-grade", () => { imagesLoaded++; return []; });
    const recognize = execution.forJob({ kind: "recognize" } as Job).run("tutor_answer", z.string(), "upload");
    assert.equal(imagesLoaded, 3); assert.equal(f.store.quota().calls, 3, "Queued calls must not spend quota yet");
    gate.resolve(); await Promise.all([...calls, laterGrade, recognize]); assert.equal(peak, 3); assert.ok(order.indexOf("upload") < order.indexOf("later-grade")); assert.equal(f.store.quota().calls, 5);
  } finally { gate.resolve(); f.close(); }
});
test("concurrent cache readers share a single paid call and exact response", async () => {
  const f = temporary(); let calls = 0;
  const ai: StructuredAI = { async run(_task, schema) { calls++; await pause(); return schema.parse({ result: "shared" }); } };
  const execution = new HomeworkExecution(f.store, () => ai);
  try {
    const work = () => execution.forJob().run("tutor_answer", z.object({ result: z.string() }), {});
    const results = await Promise.all(Array.from({ length: 6 }, () => execution.cached("synthetic:shared", work)));
    assert.equal(calls, 1); assert.equal(f.store.quota().calls, 1); assert.ok(results.every(r => r.result === "shared"));
    await execution.cached("synthetic:shared", work); assert.equal(calls, 1);
  } finally { f.close(); }
});
test("parallel calls respect the current daily quota without overspending", async () => {
  const f = temporary(); let calls = 0;
  const ai: StructuredAI = { async run(_task, schema) { calls++; await pause(); return schema.parse("ok"); } };
  const execution = new HomeworkExecution(f.store, () => ai);
  try {
    f.store.setQuota({ dailyCalls: 2 }, "synthetic-parent");
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => execution.forJob().run("tutor_answer", z.string(), {})));
    assert.equal(results.filter(r => r.status === "fulfilled").length, 2); assert.equal(calls, 2); assert.equal(f.store.quota().calls, 2);
  } finally { f.close(); }
});
test("a superseded organization waiting for a call slot does not invoke AI or spend quota", async () => {
  const f = temporary(), gate = deferred(); let active = 0;
  const ai: StructuredAI = { async run(_task, schema) { active++; await gate.promise; return schema.parse("ok"); } };
  const execution = new HomeworkExecution(f.store, () => ai);
  try {
    f.store.bump(date); const job = f.store.claim()!;
    const holds = [0, 1, 2].map(() => execution.forJob().run("tutor_answer", z.string(), {})); await until(() => active === 3);
    const stale = execution.forJob(job).run("tutor_answer", z.string(), {}); const rejected = assert.rejects(stale, /新资料/);
    f.store.bump(date); gate.resolve(); await Promise.all([...holds, rejected]); assert.equal(active, 3); assert.equal(f.store.quota().calls, 3);
  } finally { gate.resolve(); f.close(); }
});
test("a parallel scope failure drains siblings before reporting failure and stops unscheduled work", async () => {
  const gate = deferred(); let settled = false, running = 0;
  const result = mapParallel([0, 1, 2, 3], 3, async i => { running++; try { if (i === 0) throw Error("synthetic failure"); await gate.promise; return i; } finally { running--; } });
  const rejection = assert.rejects(result, /synthetic failure/).then(() => { settled = true; });
  await pause(5); assert.equal(settled, false); assert.equal(running, 2); gate.resolve(); await rejection; assert.equal(running, 0);
  assert.deepEqual(await mapParallel([0, 1, 2], 3, async i => { await pause(3 - i); return i; }), [0, 1, 2]);
});

function fixture(written = false) {
  const dir = mkdtempSync(join(tmpdir(), "xiaobu-parallel-worker-")); let now = Date.parse(date + "T04:00:00Z");
  const store = new HomeworkStore(dir, () => now, null, written), calls: { task: AITask; input: any }[] = [], activeByTask = new Map<AITask, number>(), peaks = new Map<AITask, number>();
  let active = 0, peak = 0, conversions = 0, conversionPeak = 0, pageCount = 1, failSecondBatch = false, failed = false;
  const ai: StructuredAI = { async run<T>(task: AITask, schema: z.ZodType<T>, input: unknown, images: AIImage[] = []) {
    const v = input as any; calls.push({ task, input: v }); active++; peak = Math.max(peak, active); activeByTask.set(task, (activeByTask.get(task) || 0) + 1); peaks.set(task, Math.max(peaks.get(task) || 0, activeByTask.get(task)!));
    try {
      await pause(35);
      if (task === "extract_homework") {
        if (failSecondBatch && !failed && v.pages[0].page === 7) { failed = true; throw new AIServiceError("SYNTHETIC_FAILURE", true, "synthetic retry"); }
        return schema.parse({ pages: images.map(image => ({ fileId: image.fileId, readable: true, subject: "数学", book: "模拟", printedPage: "1", content: "模拟作答", studyTrace: null, uncertainties: [] })) });
      }
      if (task === "organize_homework") return schema.parse({ readable: true, subjects: v.candidates.map((t: any) => t.subject), matches: v.candidates.map((t: any) => ({ taskId: t.id, coverage: "complete", evidence: v.extractedPages.map((p: any) => ({ fileId: p.fileId, page: p.page, excerpt: "模拟作答" })), missing: [] })), unassigned: [], uncertainties: [] });
      if (task === "assess_written_completion") return schema.parse({ scopeComplete: true, reason: "模拟已填写", parts: v.pages.map((p: any) => ({ label: "第1题", status: "answered", evidence: { fileId: p.fileId, page: p.page, excerpt: "模拟笔迹" } })) });
      throw Error("Unexpected synthetic task " + task);
    } finally { active--; activeByTask.set(task, activeByTask.get(task)! - 1); }
  } };
  const pipeline = {
    async convert(file: { id: string }) { conversions++; conversionPeak = Math.max(conversionPeak, conversions); try { await pause(5); const pages = Array.from({ length: pageCount }, (_, i) => ({ id: file.id + "-p" + (i + 1), file_id: file.id, number: i + 1 })); store.setPages(file.id, pages); return pages; } finally { conversions--; } },
    images(pages: { id: string }[]) { return pages.map(p => ({ fileId: p.id, mimeType: "image/jpeg" as const, base64: "synthetic" })); },
  };
  const worker = new HomeworkWorker(store, () => ai, pipeline);
  const add = (kind: "memo" | "homework", seed: string) => { now++; const u = store.begin({ date, kind, files: [{ name: seed + ".png", size: 1, sha256: createHash("sha256").update(seed).digest("hex") }] }); store.stored(u.files[0].id, "image/png"); store.finalize(u.id); return u; };
  function seed(kind: "memo" | "homework", subject: Subject | null, name: string) {
    const u = add(kind, name), job = store.claim()!; assert.equal(job.upload_id, u.id); const file = store.files(u.id)[0], id = file.id + "-p1"; store.setPages(file.id, [{ id, file_id: file.id, number: 1 }]);
    const result = kind === "memo" ? { date, readable: true, assignments: (["数学", "英语", "语文"] as Subject[]).map(subject => ({ subject, title: subject + "练习", requirement: subject + "第1页", format: "written", evidence: [{ fileId: id, page: 1, excerpt: subject }] })), uncertainties: [] } : { pages: [{ fileId: id, subject, readable: true, book: "模拟", printedPage: "1", content: "模拟作答", studyTrace: null, uncertainties: [] }] };
    store.recognized(job, result, subject ? [subject] : [], false, 0, "");
  }
  return { store, worker, calls, add, seed, peak: () => peak, peakTask: (task: AITask) => peaks.get(task), conversionPeak: () => conversionPeak, active: () => active, setPages(n: number) { pageCount = n; }, failSecond() { failSecondBatch = true; }, advance() { now += 16000; }, close() { worker.stop(); store.close(); rmSync(dir, { recursive: true, force: true }); } };
}
test("three uploaded assignments recognize simultaneously, converters remain serial, and no partial day is organized", async () => {
  const f = fixture(); try {
    for (let i = 0; i < 3; i++) f.add("homework", "parallel-" + i);
    const jobs = [f.worker.tick(), f.worker.tick(), f.worker.tick()]; await until(() => f.active() === 3);
    assert.equal(await f.worker.tick(), false, "The worker job bound is enforced"); assert.equal(f.store.claim(), undefined, "Organization waits for all date recognition jobs");
    await Promise.all(jobs); assert.equal(f.peak(), 3); assert.equal(f.conversionPeak(), 1);
    assert.equal(f.store.uploads(date).filter(u => u.status === "processed").length, 3);
    await f.worker.tick(); assert.equal(f.store.snapshot(date).status, "waiting_memo");
  } finally { f.close(); }
});
test("single large upload recognizes independent batches concurrently, preserves page order, and reuses successful retries", async () => {
  const f = fixture(); try {
    f.setPages(13); f.failSecond(); const u = f.add("homework", "thirteen-pages"); await f.worker.tick();
    assert.equal(f.peakTask("extract_homework"), 3); assert.equal(f.store.view(u.id).status, "retrying"); assert.equal(f.active(), 0);
    f.advance(); await f.worker.tick(); assert.equal(f.calls.filter(c => c.task === "extract_homework").length, 4, "Only the failed six-page batch is retried");
    const pages = JSON.parse(f.store.upload(u.id)!.result!).pages; assert.equal(pages.length, 13); assert.deepEqual(pages.map((p: any) => Number(p.fileId.split("-p").at(-1))), Array.from({ length: 13 }, (_, i) => i + 1));
  } finally { f.close(); }
});
test("three subject associations and three written checks run in parallel without publishing unfinished scopes", async () => {
  const f = fixture(true); try {
    f.seed("memo", null, "memo"); for (const subject of ["数学", "英语", "语文"] as Subject[]) f.seed("homework", subject, subject);
    const pending = f.worker.tick(); await until(() => f.active() === 3); assert.equal(f.store.snapshot(date).report, null); assert.equal(f.store.claim(), undefined, "Same date cannot organize twice");
    await pending; assert.equal(f.peakTask("organize_homework"), 3); assert.equal(f.peakTask("assess_written_completion"), 3); assert.equal(f.peak(), 3); assert.equal(f.store.quota().calls, 6);
    assert.ok(f.store.snapshot(date).report!.tasks.every(t => t.writtenCompletion?.status === "done"));
  } finally { f.close(); }
});
test("the started scheduler automatically fills its three slots and completes queued work", async () => {
  const f = fixture(); try {
    for (let i = 0; i < 3; i++) f.add("homework", "scheduled-" + i);
    f.worker.start(); await until(() => f.peak() === 3); await until(() => !f.store.snapshot(date).pending);
    f.worker.stop(); await until(() => f.active() === 0); assert.equal(f.store.snapshot(date).status, "waiting_memo");
  } finally { f.close(); }
});


test("parallel grading reserves a worker slot for newly uploaded work", async () => {
  const f = temporary(true), gate = deferred(), started: string[] = [];
  let active = 0, peak = 0;
  const ai: StructuredAI = { async run(task, schema, input, images = []) {
    active++; peak = Math.max(peak, active); started.push(task);
    try {
      if (task === "grade_homework") { await gate.promise; return schema.parse({ scopeComplete: true, note: "", questions: [] }); }
      assert.equal(task, "extract_homework");
      return schema.parse({ pages: images.map(image => ({ fileId: image.fileId, readable: true, subject: "数学", book: "模拟", printedPage: "1", content: "模拟", studyTrace: null, uncertainties: [] })) });
    } finally { active--; }
  } };
  const pipeline = { async convert(file: { id: string }) { const pages = [{ id: file.id + "-p1", file_id: file.id, number: 1 }]; f.store.setPages(file.id, pages); return pages; }, images(pages: { id: string }[]) { return pages.map(p => ({ fileId: p.id, mimeType: "image/jpeg" as const, base64: "synthetic" })); } };
  const worker = new HomeworkWorker(f.store, () => ai, pipeline);
  const tasks: Promise<boolean>[] = [];
  try {
    for (let i = 0; i < 3; i++) {
      const source = { date, title: "模拟批改", subject: "数学", assigned: false, requirements: [], taskIds: [], primaryPageId: "page-" + i, pages: [], expectedLabels: [] };
      f.store.db.prepare("INSERT INTO grading_runs(id,date,primary_page_id,source,created_at,updated_at) VALUES(?,?,?,?,?,?)").run("grade-" + i, date, source.primaryPageId, JSON.stringify(source), "", "");
    }
    tasks.push(worker.tick(), worker.tick()); await until(() => active === 2); assert.equal(await worker.tick(), false, "Grading cannot occupy every worker slot");
    const upload = f.store.begin({ date, kind: "homework", files: [{ name: "new-upload.png", size: 1, sha256: "a".repeat(64) }] }); f.store.stored(upload.files[0].id, "image/png"); f.store.finalize(upload.id);
    tasks.push(worker.tick()); await until(() => started.includes("extract_homework")); await until(() => f.store.view(upload.id).status === "processed");
    assert.equal(active, 2, "The new upload completes while both grading pages are still waiting"); assert.equal(peak, 3);
    gate.resolve(); await Promise.all(tasks); assert.equal(f.store.grading.summary(date).finished, 2);
  } finally { gate.resolve(); await Promise.allSettled(tasks); worker.stop(); f.close(); }
});
test("two versions of the same grading page cannot run together", () => {
  const f = temporary(true); try {
    for (const [id, page, active] of [["old", "same-page", 0], ["new", "same-page", 1], ["other", "other-page", 1]] as const) f.store.db.prepare("INSERT INTO grading_runs(id,date,primary_page_id,source,status,active,created_at,updated_at) VALUES(?,?,?,'{}',?,?,?,?)").run(id, date, page, id === "old" ? "running" : "queued", active, "", "");
    assert.equal(f.store.grading.claim()!.id, "other"); assert.equal(f.store.grading.claim(), undefined);
    f.store.db.prepare("UPDATE grading_runs SET status='done' WHERE id='old'").run(); assert.equal(f.store.grading.claim()!.id, "new");
  } finally { f.close(); }
});
