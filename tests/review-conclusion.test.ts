import test from "node:test";
import assert from "node:assert/strict";
import { DailyReportSchema, type HomeworkSnapshot } from "../src/domain/homework";
import { reviewReportConclusion, reviewConclusion } from "../src/domain/review-conclusion";
import { readReviewPolicy } from "../src/domain/review-policy";
import { homeworkSummary } from "../src/domain/homework-summary";
import { homeworkTaskDetail } from "../src/domain/homework-task-detail";
const policy = readReviewPolicy({ ASSISTANT_REVIEW_TRACE_POLICY: "1" });
const concern = "未写明复习页码、课文或方式，无法判断指定范围是否收齐。";
function report() { return DailyReportSchema.parse({ date: "2026-11-20", memoId: "memo", updatedAt: "", uncertainties: [concern, "其他任务疑点保留"], unassigned: [], tasks: [{ id: "review", title: "复习单元六", subject: "语文", requirement: "复习单元六，未写明具体页码或方式", format: "other", coverage: "uncertain", missing: [concern], memoEvidence: [], evidence: [{ fileId: "page", page: 1, excerpt: "第六单元的课文" }], reviewActivity: { status: "marked", reason: "有圈画、注音和旁批" } }] }); }
test("named-unit review with matched markings resolves an obsolete scope/method complaint without rewriting the stored report", () => {
 const raw = report(), saved = JSON.stringify(raw), next = reviewReportConclusion(raw, policy);
 assert.equal(next.tasks[0].coverage,"complete");assert.deepEqual(next.tasks[0].missing,[]);assert.deepEqual(next.uncertainties,["其他任务疑点保留"]);assert.equal(JSON.stringify(raw),saved);
 const s: HomeworkSnapshot = {date:raw.date,status:"processed",note:"",pending:false,report:raw,reviewPolicy:policy,quota:{calls:0,limit:100},dates:[],uploads:[{id:"work",date:raw.date,kind:"homework",createdAt:"",status:"processed",note:"",aiMs:0,issues:[],subjects:["语文"],files:[{id:"file",name:"synthetic.png",size:1,stored:true,pages:[{id:"page",number:1}]}]}]};
 const row = homeworkSummary(s)!.rows[0];assert.equal(row.photo.text,"已收到");assert.equal(row.activity.text,"已做");assert.match(row.activityDetail,/圈画/);assert.deepEqual(homeworkTaskDetail(s,raw.tasks[0]).concerns,[]);
});
test("real missing pages, unreadable evidence, extra deliverables and policy-off are never declared complete", () => {
 const base = report().tasks[0];
 for (const change of [{missing:[concern,"第77页未拍到"]},{missing:["缺少第77页"]},{missing:["图片右侧裁切看不清"]},{reviewActivity:{status:"unclear",reason:"模糊"}},{reviewActivity:{status:"blank",reason:"没有动笔"}},{evidence:[]},{requirement:"复习单元六，抄写词语两遍"},{title:"语文复习",requirement:"语文复习"}] as const) {
  const task = {...base,...structuredClone(change)} as typeof base;assert.notEqual(reviewConclusion(task,policy).coverage,"complete");
 }
 assert.equal(reviewConclusion(base,null).coverage,"uncertain");
 const mixed = reviewConclusion({...base,missing:[concern,"第77页未拍到"]},policy);assert.deepEqual(mixed.missing,["第77页未拍到"]);
});
test("linked photos and a known marking result cannot be overwritten as waiting for a match", () => {
 const r = report();r.tasks[0].missing=["第77页未拍到"];const s={date:r.date,status:"processed",note:"",pending:false,report:r,reviewPolicy:policy,quota:{calls:0,limit:100},dates:[],uploads:[{id:"work",date:r.date,kind:"homework",createdAt:"",status:"processed",note:"",aiMs:0,issues:[],subjects:["语文"],files:[{id:"file",name:"synthetic.png",size:1,stored:true,pages:[{id:"page",number:1}]}]}]} as HomeworkSnapshot;
 const row=homeworkSummary(s)!.rows[0];assert.equal(row.photo.text,"已关联");assert.equal(row.photo.tone,"attention");assert.equal(row.activity.text,"已做");assert.match(row.activityDetail,/圈画/);assert.doesNotMatch(row.activityDetail,/还没有对应/);
});
