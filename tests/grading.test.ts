import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HomeworkStore } from "../src/server/homework/store";
import { HomeworkGrader } from "../src/server/homework/grader";
import { DailyReportSchema } from "../src/domain/homework";
import { GradingQuestionSchema, reconcileQuestion, equivalentAnswer, readAutoGrading } from "../src/domain/grading";
import { AIServiceError, type StructuredAI } from "../src/server/ai/provider";
const date = "2026-11-17";
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "xiaobu-grade-")), store = new HomeworkStore(directory, Date.now, null, false, true);
  const u = store.begin({ date, kind: "homework", files: [{ name: "synthetic.png", size: 1, sha256: "a".repeat(64) }] });
  const file = u.files[0].id, page = file + "-p1"; store.stored(file, "image/png"); store.setPages(file, [{ id: page, file_id: file, number: 1 }]); store.finalize(u.id);
  const job = store.claim()!; store.recognized(job, { pages: [{ fileId: page, readable: true, subject: "数学", book: "模拟数学", printedPage: "12", content: "模拟算式", uncertainties: [] }] }, ["数学"], false, 0, "Synthetic fixture"); store.db.exec("UPDATE jobs SET status='done'");
  store.transaction(() => store.grading.queueDay(date, null));
  return { store, directory, page, u, close() { store.close(); rmSync(directory, { recursive: true, force: true }); } };
}
function question(page: string, verdict: "correct" | "wrong" = "wrong") { return GradingQuestionSchema.parse({ kind: "objective", label: "第1题", question: "2+3=?", studentAnswer: verdict === "wrong" ? "6" : "5", expectedAnswer: "5", verdict, confidence: "high", explanation: "2和3相加等于5。", knowledgePoints: ["整数加法"], cause: "计算错误", causeExplanation: "可能在相加时多算了1。", nextStep: "分两步数一数，再检查总数。", evidence: [{ fileId: page, page: 1, excerpt: "模拟手写答案" }] }); }
test("grading configuration and reconciliation require two agreeing objective answers; subjective and disagreements do not become errors", () => {
  assert.equal(readAutoGrading({}), false); assert.throws(() => readAutoGrading({ ASSISTANT_AUTO_GRADING: "yes" }));
  assert.equal(equivalentAnswer("\\frac{2}{4}", "1/2"), true); assert.equal(equivalentAnswer("1/0", "1/2"), false);
  const first = question("page"), check = { ...first, questionId: "q" };
  assert.equal(reconcileQuestion("q", first, check).verdict, "wrong");
  assert.equal(reconcileQuestion("q", first, { ...check, verdict: "correct" }).verdict, "uncertain");
  assert.equal(reconcileQuestion("q", first, { ...check, studentAnswer: "5" }).verdict, "uncertain");
  const right = question("page", "correct");
  assert.equal(reconcileQuestion("q", right, { ...right, questionId: "q", expectedAnswer: "2+3=5" }).verdict, "correct", "independent correct verdicts must not be rejected for reference wording alone");
  assert.equal(reconcileQuestion("q", { ...right, studentAnswer: "图中涂色表示1/2", expectedAnswer: "1/2" }, { ...right, questionId: "q", studentAnswer: "涂了2/4", expectedAnswer: "2/4" }).verdict, "correct", "two high-confidence correct interpretations with equivalent references may describe a drawing differently");
  assert.equal(reconcileQuestion("q", { ...right, studentAnswer: "3，2，5", expectedAnswer: "3/8+2/8=5/8" }, { ...right, questionId: "q", studentAnswer: "3，2，5", expectedAnswer: "5/8" }).verdict, "correct", "a list of fill-in values must not be mistaken for a single number");
  const visual = { ...right, label: "涂色题", question: "在图中涂色表示1/3+1/3", studentAnswer: "六等份涂了四份", expectedAnswer: "涂色表示2/3（六份涂四份）" };
  assert.equal(reconcileQuestion("q", visual, { ...right, questionId: "q", studentAnswer: "涂了2/3", expectedAnswer: "涂色2/3（涂四份）" }).verdict, "correct");
  assert.equal(reconcileQuestion("q", visual, { ...right, questionId: "q", studentAnswer: "涂了1/3", expectedAnswer: "涂色1/3" }).verdict, "uncertain");
  assert.equal(reconcileQuestion("q", right, { ...right, questionId: "q", studentAnswer: "6", expectedAnswer: "5" }).verdict, "uncertain", "internally contradictory numeric judgments must never be accepted");
  assert.equal(reconcileQuestion("q", first, { ...check, kind: "subjective" }).verdict, "feedback");
});
for (const disagree of [false, true]) test(`grading pipeline ${disagree ? "disagreement" : "verified wrong"}: blind verification, persistent book, dedup and immutable originals`, async () => {
  const f = fixture(); let firstCalls = 0, verifyCalls = 0;
  const raw = f.store.upload(f.u.id)!.result;
  const ai: StructuredAI = { async run(task, schema, metadata) {
    if (task === "grade_homework") { assert.deepEqual((metadata as { pages: unknown }).pages, [{ fileId: f.page, page: 1 }]); firstCalls++; return schema.parse({ scopeComplete: true, note: "", questions: [question(f.page)] }); }
    assert.equal(task, "verify_homework_grading"); verifyCalls++;
    const input = metadata as { questions: { questionId: string; verdict?: unknown; expectedAnswer?: unknown; studentAnswer?: unknown }[] };
    assert.ok(input.questions.every(q => q.verdict === undefined && q.expectedAnswer === undefined && q.studentAnswer === undefined && !("evidence" in q) && !("label" in q) && !("question" in q)));
    return schema.parse({ scopeComplete: true, omittedLabels: [], checks: [{ ...question(f.page), questionId: input.questions[0].questionId, verdict: disagree ? (metadata as { source?: { focus?: boolean } }).source?.focus ? "uncertain" : "correct" : "wrong" }] });
  } };
  const grader = new HomeworkGrader(f.store, () => ai, { images: () => [{ fileId: f.page, mimeType: "image/png", base64: "synthetic" }] });
  try {
    assert.equal(await grader.tick(), true);
    const summary = f.store.grading.summary(date); assert.equal(summary.pending, 0); assert.equal(summary.wrong, disagree ? 0 : 1); assert.equal(summary.uncertain, disagree ? 1 : 0);
    const book = f.store.grading.mistakes(null); assert.equal(book.total, disagree ? 0 : 1);
    f.store.transaction(() => f.store.grading.queueDay(date, null)); assert.equal(await grader.tick(), false);
    assert.equal(firstCalls, 1); assert.equal(verifyCalls, disagree ? 3 : 1); assert.equal(f.store.upload(f.u.id)!.result, raw);
    if (!disagree) {
      assert.equal(book.items[0].question.cause, "计算错误"); assert.equal(book.items[0].occurrences, 1);
      assert.equal(f.store.grading.mistakes("英语").total, 0);
      const open = new HomeworkStore(f.directory, Date.now, null, false, true); assert.equal(open.grading.mistakes("数学").total, 1); open.close();
    }
  } finally { f.close(); }
});
test("failed grading keeps receipts intact and bounded retries preserve budget", async () => {
  const f = fixture();
  try {
    const run = f.store.grading.claim()!; f.store.grading.fail(run, false, false);
    assert.equal(f.store.grading.summary(date).failed, 1); assert.equal(f.store.view(f.u.id).status, "processed");
    assert.equal(f.store.grading.retry(date), 1); assert.ok(f.store.grading.claim()); assert.equal(f.store.grading.claim(), undefined);
  } finally { f.close(); }
});

test("superseded grading cannot create a current mistake and forged photo references are rejected", async () => {
  const f = fixture();
  try {
    const run = f.store.grading.claim()!;
    f.store.db.prepare("UPDATE grading_runs SET active=0 WHERE id=?").run(run.id);
    f.store.grading.save(run, { version: "grading-v1", scopeComplete: true, note: "", questions: [reconcileQuestion("q", question(f.page), { ...question(f.page), questionId: "q" })] });
    assert.equal(f.store.grading.mistakes(null).total, 0);
    f.store.transaction(() => f.store.grading.queueDay(date, null));
    f.store.db.prepare("UPDATE grading_runs SET status='queued' WHERE id=?").run(run.id);
    const grader = new HomeworkGrader(f.store, () => ({ async run(task, schema) { assert.equal(task, "grade_homework"); return schema.parse({ scopeComplete: true, note: "", questions: [question("foreign-page")] }); } }), { images: () => [] });
    await grader.tick(); assert.equal(f.store.grading.mistakes(null).total, 0); assert.equal(f.store.grading.summary(date).pending, 1);
  } finally { f.close(); }
});

test("publishing a processed report queues automatic grading without changing its receipt status", () => {
  const f = fixture(); let closed = false;
  try {
    f.store.db.exec("DELETE FROM grading_runs");
    const revision = f.store.revision(date);
    f.store.publish({ id: -1, date, revision, kind: "organize", upload_id: null, attempts: 1 }, null, "waiting_memo", "等待备忘录");
    assert.equal(f.store.grading.summary(date).pending, 1);
    assert.equal(f.store.snapshot(date).status, "waiting_memo");
    f.store.grading.claim(); f.store.close(); closed = true;
    const reopened = new HomeworkStore(f.directory, Date.now, null, false, true);
    assert.ok(reopened.grading.claim(), "an interrupted grading run recovers after restart"); reopened.close();
  } finally { if (!closed) f.store.close(); rmSync(f.directory, { recursive: true, force: true }); }
});

test("a corrected reading of the same source withdraws the former mistake rather than leaving an OCR ghost", () => {
  const f = fixture();
  try {
    const run = f.store.grading.claim()!;
    const wrong = question(f.page);
    f.store.grading.save(run, { version: "grading-v1", scopeComplete: true, note: "", questions: [reconcileQuestion("q", wrong, { ...wrong, questionId: "q" })] });
    assert.equal(f.store.grading.mistakes(null).total, 1);
    const correct = question(f.page, "correct");
    f.store.grading.save(run, { version: "grading-v1", scopeComplete: true, note: "", questions: [reconcileQuestion("q", correct, { ...correct, questionId: "q" })] });
    assert.equal(f.store.grading.mistakes(null).total, 0);
    assert.equal((f.store.db.prepare("SELECT COUNT(*) AS n FROM grading_mistakes WHERE status='withdrawn'").get() as { n: number }).n, 1);
  } finally { f.close(); }
});

test("two targeted independent rechecks can resolve an OCR disagreement without creating a false mistake", async () => {
  const f = fixture(); let focused = 0, active = 0, peak = 0;
  const grader = new HomeworkGrader(f.store, () => ({ async run(task, schema, metadata) {
    if (task === "grade_homework") return schema.parse({ scopeComplete: true, note: "", questions: [{ ...question(f.page), verdict: "uncertain", confidence: "low" }] });
    const input = metadata as { source: { focus?: boolean }; questions: { questionId: string }[] };
    if (input.source.focus) { focused++; active++; peak = Math.max(peak, active); await new Promise(resolve => setTimeout(resolve, 15)); active--; }
    return schema.parse({ scopeComplete: true, omittedLabels: [], checks: [{ ...(input.source.focus ? question(f.page, "correct") : { ...question(f.page), verdict: "uncertain", confidence: "low" }), questionId: input.questions[0].questionId }] });
  } }), { images: () => [] });
  try { await grader.tick(); assert.equal(focused, 2); assert.equal(peak, 2, "Independent targeted rechecks can run together"); assert.equal(f.store.grading.summary(date).correct, 1); assert.equal(f.store.grading.summary(date).uncertain, 0); assert.equal(f.store.grading.mistakes(null).total, 0); }
  finally { f.close(); }
});


test("grading failure reasons and stages persist, are safe to show, and survive retry and success", async () => {
  const f = fixture(); try {
    const grader = new HomeworkGrader(f.store, () => ({ async run() { throw new AIServiceError("INVALID_ENVELOPE", true, "private raw provider text must never appear"); } }), { images: () => [] });
    await grader.tick();
    const queued = f.store.grading.results(date).batches[0]; assert.equal(queued.status, "queued"); assert.equal(queued.failure!.code, "INVALID_ENVELOPE"); assert.equal(queued.failure!.stage, "inspection"); assert.match(queued.failure!.reason, /解析/); assert.ok(!JSON.stringify(queued).includes("private raw"));
    const row = f.store.db.prepare("SELECT * FROM grading_runs LIMIT 1").get() as any; f.store.grading.fail({ ...row, attempts: 3 }, true, false, { code: "INVALID_ENVELOPE", stage: "verification" });
    const failed = f.store.grading.results(date).batches[0]; assert.equal(failed.status, "failed"); assert.equal(failed.attempts, 3); assert.equal(failed.retryAllowed, true); assert.equal(failed.failure!.stage, "verification");
    assert.equal(f.store.grading.retry(date), 1); assert.equal(f.store.grading.results(date).batches[0].failure!.code, "INVALID_ENVELOPE", "Keep the last reason while retrying");
    f.store.grading.save(row, { version: "grading-v2", scopeComplete: true, note: "", questions: [] }); assert.equal(f.store.grading.results(date).batches[0].failure, null);
    f.store.grading.fail({ ...row, attempts: 6 }, false, false, { code: "NETWORK_ERROR", stage: "inspection" }); assert.equal(f.store.grading.results(date).batches[0].retryAllowed, false);
  } finally { f.close(); }
});

test("a medium-confidence Chinese glyph is not turned into a wrong-book entry by four repeated OCR readings", async () => {
  const f = fixture(); let calls = 0;
  const sourceRow = f.store.db.prepare('SELECT id,source FROM grading_runs LIMIT 1').get() as {id:string;source:string};
  const source = {...JSON.parse(sourceRow.source),subject:"语文",title:"模拟默写"};f.store.db.prepare('UPDATE grading_runs SET source=? WHERE id=?').run(JSON.stringify(source),sourceRow.id);
  const glyph = {...question(f.page),label:"第9题：当地",question:"第9题词语默写",studentAnswer:"挡地",expectedAnswer:"当地",confidence:"medium",cause:"书写或单位",knowledgePoints:["词语默写"],evidence:[{fileId:f.page,page:1,excerpt:"挡地"}]};
  const grader = new HomeworkGrader(f.store,()=>({async run(task,schema,metadata){
    calls++;
    if(task==="grade_homework")return schema.parse({scopeComplete:true,note:"",questions:[glyph]});
    const input=metadata as {source:Record<string,unknown>;questions:{questionId:string}[]};
    assert.ok(!('expectedLabels' in input.source));assert.doesNotMatch(JSON.stringify(input.questions),/挡地|当地|studentAnswer|expectedAnswer|excerpt/);
    return schema.parse({scopeComplete:true,omittedLabels:[],checks:[{...glyph,confidence:"high",questionId:input.questions[0].questionId}]});
  }}),{images:()=>[]});
  try{await grader.tick();assert.equal(calls,4);assert.equal(f.store.grading.summary(date).wrong,0);assert.equal(f.store.grading.summary(date).uncertain,1);assert.equal(f.store.grading.mistakes(null).total,0);}finally{f.close();}
});

test("explicit dictation labeled other is queued for grading instead of silently excluded",()=>{
 const f=fixture();try{
  f.store.db.exec("DELETE FROM grading_runs");
  const task={id:"memo:task:0",subject:"英语",title:"课外默写单词16个",requirement:"默写16个单词并订正",format:"other",coverage:"complete",missing:[],evidence:[{fileId:f.page,page:1,excerpt:"模拟16项已填写"}],memoEvidence:[],writtenCompletion:null};
  const report=DailyReportSchema.parse({date,memoId:"memo",updatedAt:"",tasks:[task],unclassified:[],uncertainties:[],unassigned:[]});
  f.store.transaction(()=>f.store.grading.queueDay(date,report));
  const run=f.store.grading.claim()!;assert.ok(run);const source=JSON.parse(run.source);assert.equal(source.assigned,true);assert.deepEqual(source.taskIds,[task.id]);assert.deepEqual(source.requirements,[task.requirement]);
  f.store.db.prepare("UPDATE grading_runs SET status='done'").run();
  report.tasks[0]={...report.tasks[0],title:"口头背诵",requirement:"背诵课文，无需书面"};
  f.store.transaction(()=>f.store.grading.queueDay(date,report));assert.equal(f.store.grading.claim(),undefined,"Nonwritten work must still stay out of image grading");
 }finally{f.close();}
});
