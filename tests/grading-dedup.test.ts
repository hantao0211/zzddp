import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HomeworkStore } from "../src/server/homework/store";
import { HomeworkGrader } from "../src/server/homework/grader";
import { GRADING_VERSION, type GradingResult } from "../src/domain/grading";

const day = "2026-11-20", nextDay = "2026-11-21", a = "a".repeat(64), b = "b".repeat(64);
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "xiaobu-grade-dedup-"));
  const store = new HomeworkStore(directory, Date.now, null, false, true);
  function upload(hashes: string[], date = day, rendered?: string[]) {
    const view = store.begin({ date, kind: "homework", files: hashes.map((sha256, i) => ({ name: `synthetic-${i}.jpg`, size: 1, sha256 })) });
    const pages = view.files.map((file, i) => {
      store.stored(file.id, "image/jpeg"); const page = { id: file.id + "-p1", file_id: file.id, number: 1 }; store.setPages(file.id, [page]);
      if (rendered) writeFileSync(join(directory, "pages", page.id + ".jpg"), rendered[i]);
      return page;
    });
    store.db.prepare("UPDATE uploads SET status='processed',result=? WHERE id=?").run(JSON.stringify({ pages: pages.map(p => ({ fileId: p.id, subject: "数学", book: "模拟数学" })) }), view.id);
    store.transaction(() => store.grading.queueDay(date, null)); return { view, pages };
  }
  return { store, upload, close() { store.close(); rmSync(directory, { recursive: true, force: true }); } };
}
function result(page: string): GradingResult {
  return { version: GRADING_VERSION, scopeComplete: true, note: "", questions: [{ id: "synthetic-q", label: "第1题", sourcePartLabels: [], kind: "objective", question: "1+1=?", studentAnswer: "2", expectedAnswer: "2", verdict: "correct", confidence: "high", explanation: "1与1相加等于2", knowledgePoints: [], cause: "原因待确认", causeExplanation: "", nextStep: "", verification: "agreed", evidence: [{ fileId: page, page: 1, excerpt: "模拟答案2" }] }] };
}

test("one photo repeated within a batch or mixed into another batch has one active grading task", () => {
  const f = fixture(); try {
    f.upload([a, a]); assert.equal(f.store.grading.summary(day).pages, 1);
    f.upload([a, b]); assert.equal(f.store.grading.summary(day).pages, 2);
    assert.equal(f.store.db.prepare("SELECT count(*) n FROM files").get()!.n, 4, "Receipts and originals are retained");
  } finally { f.close(); }
});
test("identical converted image bytes are deduplicated even when original file hashes differ", () => {
  const f = fixture(); try {
    f.upload([a, b], day, ["synthetic-normalized-image", "synthetic-normalized-image"]);
    assert.equal(f.store.grading.summary(day).pages, 1);
  } finally { f.close(); }
});
test("new visible writing is retained as separate work", () => {
  const f = fixture(); try {
    f.upload([a, b], day, ["synthetic-before-correction", "synthetic-new-writing"]);
    assert.equal(f.store.grading.summary(day).pages, 2);
  } finally { f.close(); }
});
test("a completed photo keeps its result when it appears in a later mixed batch", () => {
  const f = fixture(); try {
    const first = f.upload([a]), run = f.store.grading.claim()!; f.store.grading.save(run, result(first.pages[0].id));
    f.upload([a, b]); const summary = f.store.grading.summary(day);
    assert.equal(summary.pages, 2); assert.equal(summary.correct, 1); assert.equal(summary.pending, 1);
    assert.equal(f.store.grading.results(day).batches.find(batch => batch.status === "done")!.id, run.id);
  } finally { f.close(); }
});
test("completed work is reused across dates, with photo evidence remapped and zero AI requests", async () => {
  const f = fixture(); try {
    const first = f.upload([a]), run = f.store.grading.claim()!; f.store.grading.save(run, result(first.pages[0].id));
    const second = f.upload([a], nextDay); let calls = 0;
    const grader = new HomeworkGrader(f.store, () => ({ async run() { calls++; throw Error("Duplicate photo must not call AI"); } }), { images: () => [] });
    assert.equal(await grader.tick(), true); assert.equal(calls, 0);
    const reused = f.store.grading.results(nextDay).batches[0].result!;
    assert.equal(reused.questions[0].evidence[0].fileId, second.pages[0].id);
    assert.notEqual(reused.questions[0].id, "synthetic-q");
    assert.equal(f.store.grading.summary(nextDay).correct, 1);
    assert.equal(f.store.grading.results(day).batches[0].result!.questions[0].evidence[0].fileId, first.pages[0].id);
  } finally { f.close(); }
});
test("equivalent photos on different dates cannot start duplicate concurrent AI requests", () => {
  const f = fixture(); try {
    f.upload([a]); f.upload([a], nextDay);
    const first = f.store.grading.claim()!; assert.ok(first);
    assert.equal(f.store.grading.claim(), undefined);
    f.store.grading.save(first, result(JSON.parse(first.source).primaryPageId));
    assert.ok(f.store.grading.claim());
  } finally { f.close(); }
});
test("changed assignment requirements do not reuse an earlier grading result", () => {
  const f = fixture(); try {
    const first = f.upload([a]), run = f.store.grading.claim()!; f.store.grading.save(run, result(first.pages[0].id));
    f.upload([a], nextDay); const next = f.store.grading.claim()!;
    const source = JSON.parse(next.source); source.requirements = ["只检查新指定的题目"];
    assert.equal(f.store.grading.reuseCompleted({ ...next, source: JSON.stringify(source) }), null);
  } finally { f.close(); }
});
test("uploading a duplicate cannot reset a failed page's retry limit", () => {
  const f = fixture(); try {
    f.upload([a]); const run = f.store.grading.claim()!;
    f.store.db.prepare("UPDATE grading_runs SET attempts=3 WHERE id=?").run(run.id);
    f.store.grading.fail({ ...run, attempts: 3 }, true, false);
    f.upload([a, b]);
    const failed = f.store.grading.results(day).batches.find(batch => batch.status === "failed")!;
    assert.equal(failed.id, run.id); assert.equal(failed.attempts, 3);
    assert.equal(f.store.grading.summary(day).pages, 2);
  } finally { f.close(); }
});
test("inferred label differences do not create a second grading of the same photo and requirements", () => {
  const f = fixture(); try {
    const first = f.upload([a]), run = f.store.grading.claim()!; f.store.grading.save(run, result(first.pages[0].id));
    f.upload([a], nextDay); const next = f.store.grading.claim()!, source = JSON.parse(next.source);
    source.expectedLabels = ["识别得到的题号"];
    assert.ok(f.store.grading.reuseCompleted({ ...next, source: JSON.stringify(source) }));
  } finally { f.close(); }
});
test("historical duplicate grading and mistake entries are folded without deleting their records", () => {
  const f = fixture(); try {
    f.upload([a, b], day, ["synthetic-identical-image", "synthetic-identical-image"]);
    const old = f.store.db.prepare("SELECT * FROM grading_runs ORDER BY rowid").all() as unknown as import("../src/server/homework/grading-store").GradingRun[];
    for (const run of old) {
      f.store.db.prepare("UPDATE grading_runs SET active=1 WHERE id=?").run(run.id);
      const value = result(JSON.parse(run.source).primaryPageId); value.questions[0] = { ...value.questions[0], verdict: "wrong", studentAnswer: "3" };
      f.store.grading.save(run, value);
    }
    assert.equal(f.store.grading.mistakes(null).total, 2);
    f.store.transaction(() => f.store.grading.queueDay(day, null));
    assert.equal(f.store.grading.summary(day).wrong, 1);
    assert.equal(f.store.grading.mistakes(null).total, 1);
    assert.equal(f.store.db.prepare("SELECT count(*) n FROM grading_runs").get()!.n, 2);
    assert.equal(f.store.db.prepare("SELECT count(*) n FROM grading_mistakes").get()!.n, 2);
    f.store.transaction(() => f.store.grading.queueDay(day, null));
    assert.equal(f.store.grading.mistakes(null).total, 1, "Repeated queue refreshes remain idempotent");
  } finally { f.close(); }
});
test("superseded grading results are never restored through the duplicate-photo cache", () => {
  const f = fixture(); try {
    const first = f.upload([a]), run = f.store.grading.claim()!; f.store.grading.save(run, result(first.pages[0].id));
    f.store.db.prepare("UPDATE grading_runs SET active=0 WHERE id=?").run(run.id);
    f.upload([a], nextDay); const next = f.store.grading.claim()!;
    assert.equal(f.store.grading.reuseCompleted(next), null);
  } finally { f.close(); }
});
