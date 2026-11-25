import assert from "node:assert/strict";
import test from "node:test";
import { DailyReportSchema, type HomeworkSnapshot } from "../src/domain/homework";
import { gardenReminderTiming, needsHomeworkUpload } from "../src/domain/homework-home";
import { homeworkProgress, homeworkSummary } from "../src/domain/homework-summary";
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
test("daily heading counts activity across the full list and distinguishes missing records from incomplete work", () => {
  const s=snapshot();
  const badge=(off=false)=>homeworkProgress(s,homeworkSummary(s),off);
  assert.equal(homeworkProgress(null,null,false),null);
  assert.deepEqual(badge(),{kind:"in-progress",text:"（共2项，1项已完成）"});
  s.report!.tasks.pop();
  assert.deepEqual(badge(),{kind:"done",text:"（共1项，全部完成）"});
  s.pending=true;
  assert.equal(badge()?.text,"正在整理");
  s.pending=false;
  s.report!.tasks[0].reviewActivity=null;
  assert.deepEqual(badge(),{kind:"in-progress",text:"（共1项，0项已完成）"});
  const [memo,homework]=s.uploads;
  s.uploads=[memo];
  assert.deepEqual(badge(),{kind:"not-started",text:"（共1项，0项已完成）"});
  s.report=null;
  assert.equal(badge()?.text,"清单待确认");
  memo.files[0].stored=false;
  assert.equal(badge()?.text,"备忘录待传完");
  s.uploads=[homework];
  assert.deepEqual(badge(),{kind:"in-progress",text:"备忘录未上传"});
  s.uploads=[];
  assert.equal(badge(true)?.text,"无作业日");
  assert.equal(badge()?.text,"备忘录未上传");
});

test("overview distinguishes receipt from completion, counts only stored files and includes unclassified assignments", () => {
  const s = snapshot(); s.report!.unclassified.push({ title: "模拟简称", requirement: "", evidence: [] });
  const summary = homeworkSummary(s)!;
  assert.equal(summary.memo, "已上传1份"); assert.equal(summary.homework, "已上传1份");
  assert.equal(summary.rows.length, 3);
  assert.equal(summary.rows[0].activity.text, "已做");
  assert.equal(summary.rows[1].photo.text, "已收到"); assert.equal(summary.rows[1].activity.text, "尚未判断");
  assert.equal(summary.rows[2].subject, "待识别");
  s.report!.tasks[0].reviewActivity = { status: "blank", reason: "模拟空白" };
  assert.equal(homeworkSummary(s)!.rows[0].activity.text, "待完成");
  s.report!.tasks[0].coverage = "partial"; s.report!.tasks[0].reviewActivity = { status: "marked", reason: "只拍到一页" };
  assert.equal(homeworkSummary(s)!.rows[0].activity.text, "已做");
  s.report!.tasks[0].reviewActivity = null;
  assert.equal(homeworkSummary(s)!.rows[0].activity.text, "待完成");
});
test("new uploads preserve previous results; dates with no report or no uploads have honest empty states", () => {
  const s = snapshot(); s.pending = true;
  assert.equal(homeworkSummary(s)!.rows[0].activity.text,"已做");
  assert.ok(homeworkSummary(s)!.rows.every(row=>row.photo.text!=="整理中"&&!row.updating));
  s.processing={subjects:["数学"],memo:false,unclassified:false,retrying:false};
  assert.equal(homeworkSummary(s)!.rows[1].updating,true);assert.equal(homeworkSummary(s)!.rows[0].updating,false);
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
  s.pending = true; row = homeworkSummary(s)!.rows[1]; assert.match(row.activityDetail, /系统会自动检查/);
});


test("partial association never claims a proven missing photo and homepage does not ask for blind supplements", async () => {
  const s = snapshot();
  s.report!.tasks = s.report!.tasks.filter(t => t.subject === "数学");
  s.report!.tasks.forEach(t => { t.coverage = "partial"; t.reviewActivity = null; t.format = "other"; t.missing = ["本子编号无法辨认"]; });
  const row = homeworkSummary(s)!.rows[0];
  assert.equal(row.photo.text, "对应待确认");
  assert.match(row.photoDetail, /不等于需要重新上传/);
  assert.doesNotMatch(row.photoDetail, /需要补齐/);
  s.reviewPolicy = null;
  const { homeworkHomeStatus } = await import("../src/domain/homework-home");
  assert.match(homeworkHomeStatus(s).text, /点各项状态查看原因/);
});


test("uncertain tasks with linked evidence do not claim the photos have never been associated", () => {
  const s = snapshot(); const task = s.report!.tasks[1]; task.coverage = "uncertain";
  task.evidence = [{ fileId: "synthetic-page", page: 1, excerpt: "已交到本项但范围不清" }];
  assert.match(homeworkSummary(s)!.rows[1].photoDetail, /已关联/);
  assert.doesNotMatch(homeworkSummary(s)!.rows[1].photoDetail, /AI还没把照片与这一项对应/);
});

test("flower reminders follow the Shanghai school week and stop at 23:00 every day", () => {
  for (const [date, hour] of [
    ["2026-11-23", "19"], ["2026-11-24", "19"], ["2026-11-25", "19"],
    ["2026-11-26", "19"], ["2026-11-27", "19"], ["2026-11-28", "09"], ["2026-11-29", "09"],
  ]) {
    const at = (time: string) => Date.parse(`${date}T${time}+08:00`);
    const start = at(`${hour}:00:00`), end = at("23:00:00");
    for (const time of [at("00:00:00"), at("07:45:00"), start - 1]) {
      assert.deepEqual(gardenReminderTiming(date, time), { open: false, nextChange: start }, date);
    }
    for (const time of [start, at("22:00:00"), end - 1]) {
      assert.deepEqual(gardenReminderTiming(date, time), { open: true, nextChange: end }, date);
    }
    for (const time of [end, at("23:59:59"), at("00:00:00") + 86400000, start + 86400000]) {
      assert.deepEqual(gardenReminderTiming(date, time), { open: false, nextChange: null }, date);
    }
  }
});

test("homework upload prompts respect the day's work and saved submissions", () => {
  const day = snapshot();
  day.uploads = day.uploads.filter(upload => upload.kind === "memo");
  day.homeworkReward = { eligible: true, earned: false, points: 1 };
  assert.equal(needsHomeworkUpload(day, false), true);
  assert.equal(needsHomeworkUpload(day, true), false);
  assert.equal(needsHomeworkUpload(null, false), false);
  assert.equal(needsHomeworkUpload(snapshot(), false), false);
  day.report!.tasks = [day.report!.tasks[0]];
  assert.equal(needsHomeworkUpload(day, false), false);
  day.report = null;
  day.uploads = [];
  assert.equal(needsHomeworkUpload(day, false), true);
  day.homeworkReward = { eligible: true, earned: true, points: 1 };
  assert.equal(needsHomeworkUpload(day, false), false);
});
