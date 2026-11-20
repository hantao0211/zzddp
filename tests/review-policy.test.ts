import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readReviewPolicy, usesReviewTraces, reviewActivityLabel, obsoleteReadingProofConcern, needsReviewTraceUpdate } from "../src/domain/review-policy";
import { HomeworkStore } from "../src/server/homework/store";
import { HomeworkWorker } from "../src/server/homework/worker";
import { homeworkHomeStatus } from "../src/domain/homework-home";
import { DailyReportSchema } from "../src/domain/homework";
import type { StructuredAI } from "../src/server/ai/provider";
const date = "2026-11-17";
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "xiaobu-review-policy-"));
  const store = new HomeworkStore(directory, Date.now, readReviewPolicy({ ASSISTANT_REVIEW_TRACE_POLICY: "1" }));
  function record(kind: "memo" | "homework", label: string, result: (pageId: string) => unknown) {
    const u = store.begin({ date, kind, files: [{ name: label + ".png", size: 10, sha256: (label === "memo" ? "a" : "b").repeat(64) }] });
    const f = u.files[0]; writeFileSync(join(directory, "originals", f.id), "synthetic-original");
    store.stored(f.id, "image/png"); store.setPages(f.id, [{ id: f.id + "-p1", file_id: f.id, number: 1 }]); store.finalize(u.id);
    const job = store.claim()!; store.recognized(job, result(f.id + "-p1"), ["语文"], false, 0, "Synthetic fixture");
    store.db.exec("UPDATE jobs SET status='done'"); return u.id;
  }
  const memo = record("memo", "memo", fileId => ({ date, readable: true, assignments: [{ subject: "语文", title: "预习第7课", requirement: "预习第7课", format: "reading", evidence: [{ fileId, page: 1, excerpt: "预7" }] }], uncertainties: [] }));
  const homework = record("homework", "book", fileId => ({ pages: [{ fileId, readable: true, subject: "语文", book: "模拟课本", printedPage: "10", content: "第7课课文页面", uncertainties: ["纸面照片不能证明预习过程已完成。"], studyTrace: null }] }));
  return { store, memo, homework, directory, cleanup() { store.close(); rmSync(directory, { recursive: true, force: true }); } };
}

test("trace policy is explicit, bounded to review without extra deliverables, and not a grading result", () => {
  assert.equal(obsoleteReadingProofConcern("照片不能证明英语朗读任务已完成。"), false);
  assert.equal(obsoleteReadingProofConcern("纸面照片不能证明预习过程已完成。"), true);
  assert.equal(readReviewPolicy({}), null); assert.throws(() => readReviewPolicy({ ASSISTANT_REVIEW_TRACE_POLICY: "yes" }));
  assert.ok(usesReviewTraces({ title: "语文预习", requirement: "预习语文园地第30—31页" }));
  assert.ok(usesReviewTraces({ title: "复习第7课", requirement: "复习课文，不需要写笔记" }));
  for (const requirement of ["预习第7课，抄写词语两遍", "复习后完成第2题", "预习并写笔记", "复习练习册第10页"]) assert.equal(usesReviewTraces({ title: "语文作业", requirement }), false, requirement);
  assert.equal(usesReviewTraces({ title: "朗读", requirement: "朗读课文两遍" }), false);
});

for (const state of ["marked", "blank", "unclear"] as const) test(`review ${state}: material coverage stays separate and originals stay immutable`, async () => {
  const f = fixture(); let inspections = 0, organizations = 0;
  const rawMemo = f.store.upload(f.memo)!.result, rawHomework = f.store.upload(f.homework)!.result;
  const pageId = f.store.pages(f.store.files(f.homework)[0].id)[0].id;
  const ai: StructuredAI = { async run(task, schema, metadata) {
    if (task === "inspect_study_traces") { inspections++; return schema.parse({ pages: [{ fileId: pageId, readable: state !== "unclear", trace: { state, description: state === "marked" ? "学生有蓝色圈词和旁批" : state === "blank" ? "课文页面清晰，没有动笔" : "照片模糊" } }] }); }
    assert.equal(task, "organize_homework"); organizations++;
    const input = metadata as { reviewPolicy: unknown; candidates: { id: string; reviewByTraces: boolean }[]; extractedPages: { studyTrace: { state: string } }[] };
    assert.ok(input.reviewPolicy); assert.equal(input.candidates[0].reviewByTraces, true);
    return schema.parse({ readable: true, subjects: ["语文"], matches: [{ taskId: input.candidates[0].id, coverage: "complete", evidence: [{ fileId: pageId, page: 1, excerpt: "已收到第7课页面" }], missing: [] }], unassigned: [], uncertainties: ["纸面照片不能证明预习过程已完成。"] });
  } };
  const worker = new HomeworkWorker(f.store, () => ai, { async convert() { return []; }, images(pages) { return pages.map(p => ({ fileId: p.id, mimeType: "image/png", base64: "c3ludGhldGlj" })); } });
  try {
    f.store.bump(date); await worker.tick();
    let report = f.store.snapshot(date).report!; assert.ok(report);
    const task = report.tasks[0]; assert.equal(task.coverage, "complete"); assert.equal(task.reviewActivity!.status, state);
    assert.equal(report.uncertainties.length, 0);
    assert.equal(reviewActivityLabel(task), state === "marked" ? "已做（有痕迹）" : state === "blank" ? "未做（无痕迹）" : "AI没看清学习痕迹");
    if (state === "blank") assert.match(homeworkHomeStatus(f.store.snapshot(date)).text, /未动笔/);
    if (state === "unclear") assert.equal(homeworkHomeStatus(f.store.snapshot(date)).help, true);
    assert.equal(f.store.upload(f.memo)!.result, rawMemo); assert.equal(f.store.upload(f.homework)!.result, rawHomework);
    assert.equal(readFileSync(join(f.directory, "originals", f.store.files(f.homework)[0].id), "utf8"), "synthetic-original");
    f.store.bump(date); await worker.tick(); assert.equal(inspections, 1); assert.equal(organizations, 1, "Unchanged pages and policy reuse analysis");
  } finally { worker.stop(); f.cleanup(); }
});

test("partial photographs with no markings cannot establish that the review was not done", async () => {
  const f = fixture(), pageId = f.store.pages(f.store.files(f.homework)[0].id)[0].id;
  const worker = new HomeworkWorker(f.store, () => ({ async run(task, schema, metadata) {
    if (task === "inspect_study_traces") return schema.parse({ pages: [{ fileId: pageId, readable: true, trace: { state: "blank", description: "已拍这一页没有动笔" } }] });
    const input = metadata as { candidates: { id: string }[] };
    return schema.parse({ readable: true, subjects: ["语文"], matches: [{ taskId: input.candidates[0].id, coverage: "partial", evidence: [{ fileId: pageId, page: 1, excerpt: "只拍到一页" }], missing: ["还缺另一页"] }], unassigned: [], uncertainties: [] });
  } }), { async convert() { return []; }, images() { return []; } });
  try { f.store.bump(date); await worker.tick(); const task = f.store.snapshot(date).report!.tasks[0]; assert.equal(task.reviewActivity!.status, "unclear"); assert.equal(task.coverage, "partial"); }
  finally { worker.stop(); f.cleanup(); }
});


test("old review reports require updated AI analysis rather than more proof from the family", () => {
  const policy = readReviewPolicy({ ASSISTANT_REVIEW_TRACE_POLICY: "1" });
  const old = { title: "预习第7课", requirement: "预习第7课，无需笔记", reviewActivity: null };
  assert.equal(needsReviewTraceUpdate(old, policy), true);
  assert.equal(needsReviewTraceUpdate(old, null), false);
  assert.equal(needsReviewTraceUpdate({ ...old, reviewActivity: { status: "marked" } }, policy), false);
  assert.equal(needsReviewTraceUpdate({ ...old, requirement: "预习并抄写词语" }, policy), false);
});


test("reorganize accepts an outdated processed review once, preserving originals and rejecting duplicate jobs", () => {
  const f = fixture();
  try {
    f.store.bump(date); const job = f.store.claim()!;
    const report = DailyReportSchema.parse({ date, memoId: f.memo, tasks: [{ id: "synthetic-old-review", subject: "语文", title: "预习第7课", requirement: "预习第7课", format: "reading", memoEvidence: [], coverage: "uncertain", evidence: [], missing: ["纸面照片不能证明预习过程已完成。"] }], uncertainties: [], unassigned: [], updatedAt: new Date().toISOString() });
    f.store.publish(job, report, "processed", "Synthetic legacy report");
    const original = f.store.upload(f.homework)!.result;
    f.store.retryDay(date);
    assert.equal(f.store.snapshot(date).pending, true);
    assert.throws(() => f.store.retryDay(date), /正在整理/);
    assert.equal(f.store.upload(f.homework)!.result, original);
    const updatedJob = f.store.claim()!;
    report.tasks[0].reviewActivity = { status: "marked", reason: "模拟圈画痕迹" };
    f.store.publish(updatedJob, report, "processed", "Synthetic updated report");
    assert.throws(() => f.store.retryDay(date), /当前规则/);
  } finally { f.cleanup(); }
});
