import assert from "node:assert/strict";
import test from "node:test";
import { DailyReportSchema, type HomeworkSnapshot } from "../src/domain/homework";
import { homeworkSummary } from "../src/domain/homework-summary";
import { readReviewPolicy } from "../src/domain/review-policy";
function snapshot(): HomeworkSnapshot {
  return { date: "2026-11-17", status: "processed", pending: false, note: "", dates: [], quota: { calls: 0, limit: 60 }, reviewPolicy: readReviewPolicy({ ASSISTANT_REVIEW_TRACE_POLICY: "1" }), uploads: [
    { id: "memo", date: "2026-11-17", kind: "memo", status: "processed", createdAt: "", subjects: [], aiMs: 0, issues: [], note: "", files: [{ id: "memo-file", name: "synthetic.png", size: 1, stored: true, pages: [] }] },
    { id: "homework", date: "2026-11-17", kind: "homework", status: "processed", createdAt: "", subjects: [], aiMs: 0, issues: [], note: "", files: [{ id: "book", name: "synthetic.png", size: 1, stored: true, pages: [] }, { id: "incomplete", name: "synthetic.pdf", size: 1, stored: false, pages: [] }] },
  ], report: DailyReportSchema.parse({ date: "2026-11-17", memoId: "memo", updatedAt: "", uncertainties: [], unassigned: [], tasks: [
    { id: "review", subject: "语文", title: "预习第7课", requirement: "预习第7课", format: "reading", memoEvidence: [], evidence: [], coverage: "complete", missing: [], reviewActivity: { status: "marked", reason: "模拟圈画" } },
    { id: "written", subject: "数学", title: "练习第12页", requirement: "完成第12页练习", format: "written", memoEvidence: [], evidence: [], coverage: "complete", missing: [] },
  ] }) };
}
test("overview distinguishes receipt from completion, counts only stored files and includes unclassified assignments", () => {
  const s = snapshot(); s.report!.unclassified.push({ title: "模拟简称", requirement: "", evidence: [] });
  const summary = homeworkSummary(s)!;
  assert.equal(summary.memo, "已上传1份"); assert.equal(summary.homework, "已上传1份");
  assert.equal(summary.rows.length, 3);
  assert.equal(summary.rows[0].activity.text, "已做");
  assert.equal(summary.rows[1].photo.text, "已收到"); assert.equal(summary.rows[1].activity.text, "尚未判断");
  assert.equal(summary.rows[2].subject, "待识别");
  s.report!.tasks[0].reviewActivity = { status: "blank", reason: "模拟空白" };
  assert.equal(homeworkSummary(s)!.rows[0].activity.text, "未做");
  s.report!.tasks[0].coverage = "partial"; s.report!.tasks[0].reviewActivity = { status: "marked", reason: "只拍到一页" };
  assert.equal(homeworkSummary(s)!.rows[0].activity.text, "有痕迹，缺页");
  s.report!.tasks[0].reviewActivity = null;
  assert.equal(homeworkSummary(s)!.rows[0].activity.text, "需重新整理");
});
test("processing masks stale results; dates with no report or no uploads have honest empty states", () => {
  const s = snapshot(); s.pending = true;
  assert.ok(homeworkSummary(s)!.rows.every(row => row.photo.text === "整理中" && row.activity.text === "整理中"));
  s.report = null; assert.match(homeworkSummary(s)!.empty, /AI正在整理/);
  s.pending = false; s.uploads = s.uploads.filter(u => u.kind === "homework"); assert.match(homeworkSummary(s)!.empty, /补一张备忘录/);
  s.uploads = []; assert.equal(homeworkSummary(s), null); assert.equal(homeworkSummary(null), null);
});

test("photo and completion explanations distinguish not submitted, unmatched, partial and written checks", () => {
  const s = snapshot(); s.writtenCompletionEnabled = true;
  s.report!.tasks[1].coverage = "none";
  let row = homeworkSummary(s)!.rows[1]; assert.equal(row.photo.text, "未匹配"); assert.equal(row.activity.text, "等匹配"); assert.match(row.photoDetail, /已经有作业照片/); assert.match(row.activityDetail, /无需一律重传/);
  s.uploads = s.uploads.filter(u => u.kind === "memo");
  row = homeworkSummary(s)!.rows[1]; assert.equal(row.photo.text, "未交照片"); assert.equal(row.activity.text, "等照片"); assert.match(row.activityDetail, /不是要求家长/);
  s.report!.tasks[1].coverage = "complete"; row = homeworkSummary(s)!.rows[1]; assert.equal(row.activity.text, "需检查"); assert.match(row.activityDetail, /系统会自动检查/);
  s.pending = true; row = homeworkSummary(s)!.rows[1]; assert.match(row.activityDetail, /不沿用旧/);
});
