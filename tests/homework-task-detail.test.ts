import test from "node:test";
import assert from "node:assert/strict";
import { DailyReportSchema, type HomeworkSnapshot, type UploadView } from "../src/domain/homework";
import { homeworkTaskDetail } from "../src/domain/homework-task-detail";
const date = "2026-11-20";
const ev = (fileId: string, excerpt = "可定位内容", page = 1) => ({ fileId, excerpt, page });
function fixture(): HomeworkSnapshot {
  const upload = (id: string, kind: "memo" | "homework", day = date): UploadView => ({ id, date: day, kind, status: "processed", createdAt: "", note: "", subjects: [], aiMs: 0, issues: [], files: [{ id: id + "-file", name: id + ".pdf", stored: true, size: 100, pages: [{ id: id + "-page", number: 2 }] }] });
  return { date, status: "processed", note: "", dates: [date], quota: { calls: 0, limit: 100 }, pending: false, uploads: [upload("memo", "memo"), upload("first", "homework"), upload("second", "homework"), upload("other-task", "homework"), upload("wrong-date", "homework", "2026-11-19"), upload("old-memo", "memo")], report: DailyReportSchema.parse({ date, memoId: "memo", updatedAt: "", uncertainties: [], unassigned: [], tasks: [{ id: "task", subject: "语文", title: "2号本订正签字", requirement: "订正并签字", format: "other", coverage: "partial", memoEvidence: [ev("memo-page")], evidence: [ev("first-page", "第一个订正"), ev("first-page", "另一个订正"), ev("first-page", "第一个订正"), ev("second-page", "签字处")], missing: ["关键边缘看不清", "关键边缘看不清"] }] }) };
}
test("task details resolve exact evidence pages across uploads, deduplicate pages but retain excerpts and page issues", () => {
  const s = fixture(), task = s.report!.tasks[0];
  s.uploads[1].issues.push({ pageId: "first-page", message: "左下角不清楚" }, { pageId: "other-task-page", message: "其他任务的问题" });
  const detail = homeworkTaskDetail(s, task);
  assert.equal(detail.requirement, "订正并签字"); assert.deepEqual(detail.concerns, ["关键边缘看不清"]);
  assert.deepEqual(detail.homework.photos.map(p => p.pageId), ["first-page", "second-page"]);
  assert.deepEqual(detail.homework.photos[0].excerpts, ["第一个订正", "另一个订正"]);
  assert.deepEqual(detail.homework.photos[0].issues, ["左下角不清楚"]);
  assert.equal(detail.homework.photos[0].number, 2, "display real original page order rather than model printed-page guesses");
  assert.deepEqual(detail.memo.photos.map(p => p.pageId), ["memo-page"]);
  assert.equal(task.evidence.length, 4, "view construction does not rewrite the report");
});
test("invalid, wrong-kind, old-date, unstored and old-memo references cannot become clickable task photos", () => {
  const s = fixture(), task = s.report!.tasks[0]; s.uploads[2].files[0].stored = false;
  task.evidence.push(ev("missing-page"), ev("wrong-date-page"), ev("memo-page"), ev("../../admin"));
  task.memoEvidence.push(ev("old-memo-page"), ev("first-page"));
  const detail = homeworkTaskDetail(s, task);
  assert.deepEqual(detail.homework.photos.map(p => p.pageId), ["first-page"]);
  assert.equal(detail.homework.unavailable, 5);
  assert.deepEqual(detail.memo.photos.map(p => p.pageId), ["memo-page"]); assert.equal(detail.memo.unavailable, 2);
  task.evidence = []; assert.equal(homeworkTaskDetail(s, task).homework.photos.length, 0, "never borrow another task's same-subject photo");
});
test("specific unanswered parts preserve their own evidence without treating uncertainty as missing pages", () => {
  const s = fixture(), task = s.report!.tasks[0];
  task.writtenCompletion = { status: "unclear", reason: "第2题未判清", parts: [{ label: "第1题", status: "answered", evidence: ev("first-page") }, { label: "第2题", status: "unclear", evidence: ev("second-page") }] };
  assert.deepEqual(homeworkTaskDetail(s, task).parts.map(p => [p.label, p.status, p.evidence.fileId]), [["第2题", "unclear", "second-page"]]);
});
