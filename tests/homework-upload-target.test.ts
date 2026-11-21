import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { z } from "zod";
import type { AITask } from "../src/domain/ai-contracts";
import { UploadInputSchema } from "../src/domain/homework";
import type { Subject } from "../src/domain/contracts";
import { homeworkSummary } from "../src/domain/homework-summary";
import { HomeworkStore, HomeworkError } from "../src/server/homework/store";
import { HomeworkWorker } from "../src/server/homework/worker";
import { resolveUploadTarget } from "../src/server/homework/upload-target";
import type { StructuredAI, AIImage } from "../src/server/ai/provider";
const date = "2026-11-20", hash = (value: string) => createHash("sha256").update(value).digest("hex");
function fixture(grading = false) {
  const dir = mkdtempSync(join(tmpdir(), "xiaobu-upload-target-"));
  let store = new HomeworkStore(dir, Date.now, null, false, grading), subject: Subject | null = "数学", mode = "match";
  const calls: { task: AITask; input: any }[] = [];
  const ai: StructuredAI = { async run<T>(task: AITask, schema: z.ZodType<T>, input: unknown, images: AIImage[] = []) {
    const value = input as any; calls.push({ task, input: value });
    if (task === "extract_homework") return schema.parse({ pages: images.map(p => ({ fileId: p.fileId, readable: true, subject, book: "模拟练习", printedPage: "74", content: "模拟练习", studyTrace: { state: "marked", description: "模拟笔迹" }, uncertainties: [] })) });
    assert.equal(task, "organize_homework");
    return schema.parse({ readable: true, subjects: ["数学"], matches: mode === "omit" ? [] : value.candidates.map((t: any) => ({ taskId: t.id, coverage: "complete", evidence: value.extractedPages.map((p: any) => ({ fileId: p.fileId, page: p.page, excerpt: "模拟页面" })), missing: [] })), unassigned: [], uncertainties: [] });
  } };
  const pipeline = { async convert(file: { id: string }) { const pages = [{ id: file.id + "-p1", file_id: file.id, number: 1 }]; store.setPages(file.id, pages); return pages; }, images(pages: { id: string }[]) { return pages.map(p => ({ fileId: p.id, mimeType: "image/jpeg" as const, base64: "synthetic" })); } };
  let worker = new HomeworkWorker(store, () => ai, pipeline);
  function memo(seed = "memo") {
    const u = store.begin({ date, kind: "memo", files: [{ name: seed + ".png", size: 1, sha256: hash(seed) }] });
    store.stored(u.files[0].id, "image/png"); store.finalize(u.id); const job = store.claim()!;
    store.recognized(job, { date, readable: true, assignments: ["P74", "P75"].map(title => ({ subject: "数学", title, requirement: "完成数学" + title, format: "written", evidence: [{ fileId: u.files[0].id + "-p1", page: 1, excerpt: title }] })), uncertainties: [] }, ["数学"], false, 1, "");
    return u;
  }
  const input = (seed: string, targetTaskId?: string) => ({ date, kind: "homework" as const, ...(targetTaskId ? { targetTaskId } : {}), files: [{ name: seed + ".png", size: 1, sha256: hash(seed) }] });
  function upload(seed: string, targetTaskId?: string) { const u = store.begin(input(seed, targetTaskId)); if (u.status === "uploading") { store.stored(u.files[0].id, "image/png"); store.finalize(u.id); } return u; }
  async function drain() { for (let i = 0; i < 12; i++) if (!await worker.tick()) return; throw Error("queue did not settle"); }
  return { store: () => store, calls, memo, input, upload, drain, tick: () => worker.tick(), setSubject(s: typeof subject) { subject = s; }, setMode(m: string) { mode = m; }, restart() { worker.stop(); store.close(); store = new HomeworkStore(dir); worker = new HomeworkWorker(store, () => ai, pipeline); }, cleanup() { worker.stop(); store.close(); rmSync(dir, { recursive: true, force: true }); } };
}
test("target upload persists the child's destination, informs recognition, and prevents another same-subject task borrowing its photo", async () => {
  const f = fixture(); try {
    f.memo(); await f.drain(); const task = f.store().snapshot(date).report!.tasks[0], other = f.store().snapshot(date).report!.tasks[1];
    const upload = f.upload("targeted", task.id); assert.equal(upload.target?.title, "P74");
    const pending = f.store().snapshot(date); assert.deepEqual(pending.processing?.taskIds, [task.id]); assert.deepEqual(pending.processing?.subjects, []);
    const rows = homeworkSummary(pending)!.rows; assert.equal(rows[0].updating, true); assert.equal(rows[1].updating, false);
    f.restart(); await f.drain(); assert.equal(f.store().view(upload.id).target?.taskId, task.id);
    const extract = f.calls.find(c => c.task === "extract_homework")!; assert.equal(extract.input.uploadTarget.taskId, task.id); assert.equal(extract.input.uploadTarget.requirement, task.requirement);
    const organization = f.calls.find(c => c.task === "organize_homework")!; assert.equal(organization.input.extractedPages[0].uploadTarget.taskId, task.id);
    const report = f.store().snapshot(date).report!; assert.equal(report.tasks[0].coverage, "complete"); assert.equal(report.tasks[0].evidence.length, 1);
    assert.equal(report.tasks.find(t => t.id === other.id)!.evidence.length, 0, "Model cannot override selected destination");
    f.upload("second-target", other.id); await f.drain();
    assert.equal(f.store().snapshot(date).pending, false);
    assert.ok(f.store().snapshot(date).report!.tasks.every(t => t.evidence.length === 1), "Repeated uploads and cache reuse retain independent destinations");
  } finally { f.cleanup(); }
});
test("ordinary uploads still automatically associate without a selected destination", async () => {
  const f = fixture(); try { f.memo(); await f.drain(); f.upload("mixed"); await f.drain(); assert.equal(f.calls.find(c => c.task === "extract_homework")!.input.uploadTarget, undefined); assert.ok(f.store().snapshot(date).report!.tasks.every(t => t.coverage === "complete")); } finally { f.cleanup(); }
});
test("a clearly wrong subject is retained with a concrete conflict instead of being reassigned", async () => {
  const f = fixture(); try {
    f.memo(); await f.drain(); f.setSubject("英语"); const task = f.store().snapshot(date).report!.tasks[0]; f.upload("wrong-subject", task.id); await f.drain();
    const state = f.store().snapshot(date); assert.equal(state.pending, false); assert.equal(state.status, "needs_rescan"); assert.ok(state.report!.tasks.every(t => !t.evidence.length)); assert.match(state.report!.unassigned[0].reason, /P74.*数学.*英语/);
  } finally { f.cleanup(); }
});
test("model omission preserves explicit destination as uncertain and does not mark work complete", async () => {
  const f = fixture(); try {
    f.memo(); await f.drain(); const task = f.store().snapshot(date).report!.tasks[0]; f.setMode("omit"); f.upload("omitted", task.id); await f.drain();
    const current = f.store().snapshot(date).report!.tasks[0]; assert.equal(current.coverage, "uncertain"); assert.equal(current.evidence.length, 1); assert.match(current.missing.join(" "), /不表示已经做完/);
  } finally { f.cleanup(); }
});
test("unknown photographed subject can use the explicit task as context without rewriting raw recognition", async () => {
  const f = fixture(); try {
    f.memo(); await f.drain(); f.setSubject(null); const task = f.store().snapshot(date).report!.tasks[0], u = f.upload("unknown", task.id); await f.drain();
    assert.equal(JSON.parse(f.store().upload(u.id)!.result!).pages[0].subject, null); assert.equal(f.store().snapshot(date).report!.tasks[0].coverage, "complete");
  } finally { f.cleanup(); }
});
test("foreign dates, unknown tasks, and memo uploads cannot spoof a target", async () => {
  const f = fixture(); try {
    f.memo(); await f.drain(); const task = f.store().snapshot(date).report!.tasks[0];
    assert.throws(() => f.store().begin(f.input("foreign", "not-a-task")), HomeworkError);
    assert.throws(() => f.store().begin({ ...f.input("foreign", task.id), date: "2026-11-21" }), HomeworkError);
    assert.equal(UploadInputSchema.safeParse({ ...f.input("memo", task.id), kind: "memo" }).success, false);
    assert.equal((f.store().db.prepare("SELECT COUNT(*) n FROM upload_targets").get() as { n: number }).n, 0);
  } finally { f.cleanup(); }
});
test("duplicate files attach once without reupload or duplicate storage, and cannot silently move to another task", async () => {
  const f = fixture(); try {
    f.memo(); await f.drain(); const tasks = f.store().snapshot(date).report!.tasks, ordinary = f.upload("same-file"); await f.drain(); f.calls.length = 0;
    const targeted = f.store().begin(f.input("same-file", tasks[0].id)); assert.equal(targeted.id, ordinary.id); assert.equal(targeted.target?.taskId, tasks[0].id); await f.drain();
    assert.equal(f.calls.filter(c => c.task === "extract_homework").length, 0); assert.equal((f.store().db.prepare("SELECT COUNT(*) n FROM upload_targets").get() as { n: number }).n, 1);
    const revision = f.store().revision(date); f.store().begin(f.input("same-file", tasks[0].id)); assert.equal(f.store().revision(date), revision);
    assert.throws(() => f.store().begin(f.input("same-file", tasks[1].id)), /另一项作业/);
  } finally { f.cleanup(); }
});
test("replaced memos do not reuse positional task ids for previously targeted photos", async () => {
  const f = fixture(); try {
    f.memo(); await f.drain(); const task = f.store().snapshot(date).report!.tasks[0], u = f.upload("old-task", task.id); await f.drain(); f.memo("replacement"); await f.drain();
    assert.equal(resolveUploadTarget(f.store(), u.id), null); assert.match(f.store().snapshot(date).report!.unassigned[0].reason, /清单已变更/); assert.ok(f.store().snapshot(date).report!.tasks.every(t => !t.evidence.length));
  } finally { f.cleanup(); }
});

test("a selected destination carries a matched unknown-subject page through to automatic grading", async () => {
  const f = fixture(true); try {
    f.memo(); await f.drain(); f.setSubject(null); const task = f.store().snapshot(date).report!.tasks[0];
    f.upload("unknown-for-grading", task.id); await f.tick(); await f.tick();
    const run = f.store().db.prepare("SELECT source FROM grading_runs WHERE active=1").get() as { source: string };
    assert.ok(run); const source = JSON.parse(run.source); assert.equal(source.subject, "数学"); assert.equal(source.assigned, true); assert.deepEqual(source.taskIds, [task.id]);
  } finally { f.cleanup(); }
});
