import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { HomeworkStore } from "../src/server/homework/store";
import { HomeworkWorker } from "../src/server/homework/worker";
import { WrittenInspectionSchema, evaluateWrittenInspection, readWrittenCompletion, isWrittenTask, needsWrittenCompletionUpdate } from "../src/domain/written-completion";
import { homeworkHomeStatus } from "../src/domain/homework-home";
import { homeworkSummary } from "../src/domain/homework-summary";
const date = "2026-11-17";
test("completion is separate from correctness, incomplete page scope and unclear answers cannot count as done", () => {
  assert.equal(readWrittenCompletion({}), false); assert.throws(() => readWrittenCompletion({ ASSISTANT_WRITTEN_COMPLETION: "yes" }));
  const value = WrittenInspectionSchema.parse({ scopeComplete: true, reason: "错误答案也已填写", parts: [{ label: "第1题", status: "answered", evidence: { fileId: "page", page: 1, excerpt: "1+1=3，已填写但不在此批改" } }] });
  assert.equal(evaluateWrittenInspection(value, "complete").status, "done");
  assert.equal(evaluateWrittenInspection(WrittenInspectionSchema.parse({ ...value, parts: [] }), "complete").status, "unclear", "An entirely excluded or unrecognized task must never count as completed");
  assert.equal(evaluateWrittenInspection(value, "partial").status, "unclear");
  assert.equal(evaluateWrittenInspection({ ...value, scopeComplete: false }, "complete").status, "unclear");
  assert.equal(evaluateWrittenInspection({ ...value, parts: [{ ...value.parts[0], status: "unclear" }] }, "complete").status, "unclear");
});
for (const state of ["answered", "blank", "unclear", "resolved"] as const) test(`written ${state}: visible parts determine completion, analysis is cached and original extraction unchanged`, async () => {
  const directory = mkdtempSync(join(tmpdir(), "xiaobu-written-")); const store = new HomeworkStore(directory, Date.now, null, true);
  const record = (kind: "memo" | "homework") => {
    const u = store.begin({ date, kind, files: [{ name: "synthetic.png", size: 1, sha256: (kind === "memo" ? "a" : "b").repeat(64) }] });
    const fileId = u.files[0].id; store.stored(fileId, "image/png"); store.setPages(fileId, [{ id: fileId + "-p1", file_id: fileId, number: 1 }]); store.finalize(u.id);
    const job = store.claim()!;
    store.recognized(job, kind === "memo" ? { date, readable: true, assignments: [{ subject: "数学", title: "数学P12", requirement: "完成数学第12页", format: "written", evidence: [{ fileId: fileId + "-p1", page: 1, excerpt: "数P12" }] }], uncertainties: [] } : { pages: [{ fileId: fileId + "-p1", subject: "数学", readable: true, book: "模拟练习", printedPage: "12", content: "模拟算式练习", uncertainties: [] }] }, ["数学"], false, 0, "Synthetic fixture");
    store.db.exec("UPDATE jobs SET status='done'"); return u;
  };
  const memo = record("memo"), book = record("homework"), raw = store.upload(book.id)!.result, pageId = book.files[0].id + "-p1"; let calls = 0;
  const worker = new HomeworkWorker(store, () => ({ async run(task, schema, metadata) {
    if (task === "organize_homework") return schema.parse({ readable: true, subjects: ["数学"], matches: [{ taskId: (metadata as any).candidates[0].id, coverage: "complete", evidence: [{ fileId: pageId, page: 1, excerpt: "指定页面" }], missing: [] }], unassigned: [], uncertainties: [] });
    if (task === "recheck_written_parts") return schema.parse({ parts: (metadata as any).targets.map((p: any) => ({ ...p, status: state === "resolved" ? "answered" : p.status })) });
    assert.equal(task, "assess_written_completion"); calls++;
    return schema.parse({ scopeComplete: true, reason: state === "blank" ? "第2题尚未填写" : state === "unclear" ? "第2题遮挡" : "两个小题均已填写，未判断对错", parts: [{ label: "第1题", status: "answered", evidence: { fileId: pageId, page: 1, excerpt: "可见手写答案" } }, { label: "第2题", status: state === "resolved" ? "unclear" : state, evidence: { fileId: pageId, page: 1, excerpt: "模拟第2题状态" } }] });
  } }), { async convert() { return []; }, images() { return [{ fileId: pageId, mimeType: "image/png", base64: "synthetic" }]; } });
  try {
    store.bump(date); await worker.tick();
    const report = store.snapshot(date).report!, task = report.tasks[0];
    assert.equal(task.writtenCompletion!.status, ["answered", "resolved"].includes(state) ? "done" : state === "blank" ? "incomplete" : "unclear");
    assert.equal(homeworkSummary(store.snapshot(date))!.rows[0].activity.text, ["answered", "resolved"].includes(state) ? "已做完" : state === "blank" ? "未做完" : "AI未判清");
    if (["answered", "resolved"].includes(state)) {
      const summaryState = store.snapshot(date); summaryState.report!.uncertainties.push("原始提取阶段尚未批改答案对错");
      assert.match(homeworkHomeStatus(summaryState).text, /都已做完/);
      assert.equal(homeworkHomeStatus(summaryState).help, false, "non-completion notes must not ask the child to explain finished work again");
    }
    assert.equal(task.coverage, "complete", "a blank answer is separate from photo receipt");
    assert.equal(store.upload(book.id)!.result, raw); assert.ok(store.upload(memo.id));
    store.bump(date); await worker.tick(); assert.equal(calls, 1);
    const old = store.snapshot(date).report!; old.tasks[0].writtenCompletion = null;
    const oldJob = { id: -1, revision: store.revision(date), date, upload_id: null, kind: "organize" as const, attempts: 1 };
    store.publish(oldJob, old, "processed", "Synthetic old report"); store.retryDay(date); assert.equal(store.snapshot(date).pending, true);
  } finally { worker.stop(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("handwritten dictation and other explicit paper work cannot be skipped because OCR labeled them other",()=>{
 for(const title of ["课外默写单词16个","家默","抄写词语两遍","作文","2#本订签"]){
  const task={title,requirement:"按当天要求完成",format:"other"};assert.equal(isWrittenTask(task),true,title);assert.equal(needsWrittenCompletionUpdate({...task,writtenCompletion:null},true),true,title);
 }
 for(const title of ["看不清的事项","整理书包","口头背诵课文"]){assert.equal(isWrittenTask({title,requirement:"按当天要求完成",format:"other"}),false,title);}
});
