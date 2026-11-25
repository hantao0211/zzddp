import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { makeDemoState } from "../src/domain/demo";
import { MaterialSchema, type LearningState } from "../src/domain/contracts";
import { applyHomeworkOrganization, applyMemoRecognition } from "../src/domain/ai-results";
import { MemoRecognitionSchema, type AITask, type MemoRecognition } from "../src/domain/ai-contracts";
import { AIServiceError, readAIConfiguration, VisionAI, type StructuredAI } from "../src/server/ai/provider";
import { answerTutor, preparePractice } from "../src/server/ai/workflows";

function fixture(): LearningState {
  return { ...makeDemoState(), tasks: [], materials: [
    { id: "memo", name: "当天备忘录", kind: "备忘录", date: "2026-11-18", sample: false, fileIds: ["memo-photo"], filenames: ["memo.jpg"], processing: "waiting_for_ai" },
    { id: "homework", name: "混合作业", kind: "待识别", date: "2026-11-18", sample: false, fileIds: ["math-photo", "english-photo"], filenames: ["1.jpg", "2.jpg"], processing: "waiting_for_ai" },
  ] };
}
const memo: MemoRecognition = {
  date: "2026-11-18", readable: true, uncertainties: [], assignments: [
    { subject: "数学", title: "数学练习", requirement: "练习册32、33页", format: "written", evidence: [{ fileId: "memo-photo", page: null, excerpt: "数：练习册32、33页" }] },
    { subject: "英语", title: "英语抄写", requirement: "抄写Unit 4单词", format: "written", evidence: [{ fileId: "memo-photo", page: null, excerpt: "英：抄写Unit 4单词" }] },
    { subject: "语文", title: "语文朗读", requirement: "朗读课文两遍", format: "oral", evidence: [{ fileId: "memo-photo", page: null, excerpt: "语：朗读课文两遍" }] },
  ],
};

test("raw uploads need neither subject nor a manually linked task", () => {
  assert.equal(MaterialSchema.safeParse(fixture().materials[1]).success, true);
});

test("one memo produces separate assignments across all three subjects and retries preserve progress", () => {
  const recognized = applyMemoRecognition(fixture(), "memo", memo);
  assert.deepEqual(recognized.tasks.map((task) => task.subject), ["数学", "英语", "语文"]);
  recognized.tasks[0].completed = true;
  const repeated = applyMemoRecognition(recognized, "memo", memo);
  assert.equal(repeated.tasks.length, 3);
  assert.equal(repeated.tasks[0].completed, true);
  const changed = applyMemoRecognition(repeated, "memo", { ...memo, assignments: [{ ...memo.assignments[0], requirement: "练习册34页" }, ...memo.assignments] });
  assert.equal(new Set(changed.tasks.map((task) => task.id)).size, changed.tasks.length);
});

test("unreadable memo and unknown subject never create invented tasks", () => {
  const unreadable = applyMemoRecognition(fixture(), "memo", { ...memo, readable: false });
  assert.equal(unreadable.tasks.length, 0);
  assert.equal(unreadable.materials[0].processing, "needs_rescan");
  const unknown = applyMemoRecognition(fixture(), "memo", { ...memo, assignments: [{ ...memo.assignments[0], subject: null }] });
  assert.equal(unknown.tasks.length, 0);
  assert.throws(() => applyMemoRecognition(fixture(), "memo", { ...memo, assignments: [{ ...memo.assignments[0], evidence: [{ fileId: "invented-file", page: null, excerpt: "text" }] }] }));
});

test("mixed homework links to multiple memo tasks without marking work completed", () => {
  const state = applyMemoRecognition(fixture(), "memo", memo);
  const result = applyHomeworkOrganization(state, "homework", {
    readable: true, subjects: ["数学", "英语"], uncertainties: [], unassigned: [], matches: [
      { taskId: state.tasks[0].id, coverage: "partial", missing: ["第33页"], evidence: [{ fileId: "math-photo", page: null, excerpt: "第32页" }] },
      { taskId: state.tasks[1].id, coverage: "complete", missing: [], evidence: [{ fileId: "english-photo", page: null, excerpt: "Unit 4 单词抄写" }] },
    ],
  });
  assert.equal(result.tasks[0].coverage, "partial");
  assert.equal(result.tasks[1].coverage, "complete");
  assert.equal(result.tasks[2].uploaded, false);
  assert.equal(result.tasks.some((task) => task.completed), false);
  assert.equal(result.materials[1].taskIds?.length, 2);
});

test("AI cannot link nonexistent or wrong-day tasks", () => {
  const state = applyMemoRecognition(fixture(), "memo", memo);
  const input = { readable: true, subjects: ["数学" as const], uncertainties: [], unassigned: [], matches: [{ taskId: "not-in-context", coverage: "complete" as const, missing: [], evidence: [{ fileId: "math-photo", page: null, excerpt: "work" }] }] };
  assert.throws(() => applyHomeworkOrganization(state, "homework", input));
  state.tasks[0].date = "2026-11-17";
  input.matches[0].taskId = state.tasks[0].id;
  assert.throws(() => applyHomeworkOrganization(state, "homework", input));
});

test("unconfigured AI fails explicitly instead of returning sample recognition", () => {
  assert.throws(() => readAIConfiguration({}), (error: unknown) => error instanceof AIServiceError && error.code === "AI_UNCONFIGURED");
});

test("DeepSeek vision request uses supplied images and validates structured output", async () => {
  let called = false;
  const request: typeof fetch = async (url, init) => {
    called = true;
    assert.equal(url, "https://api.deepseek.com/chat/completions");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.messages[1].content[1].image_url.url, "data:image/jpeg;base64,c2FtcGxl");
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(memo) } }] });
  };
  const ai = new VisionAI({ provider: "deepseek", model: "deepseek-flash", apiKey: "test-key" }, request);
  const result = await ai.run("recognize_memo", MemoRecognitionSchema, {}, [{ fileId: "memo-photo", mimeType: "image/jpeg", base64: "c2FtcGxl" }]);
  assert.equal(called, true);
  assert.equal(result.assignments.length, 3);
});

test("malformed AI transport envelopes report a bounded error instead of an uncaught parser failure", async () => {
  for (const data of ["<html>busy</html>", "null"]) {
    const ai = new VisionAI({ provider: "deepseek", model: "deepseek-flash", apiKey: "test-key" }, async () => new Response(data));
    await assert.rejects(ai.run("recognize_memo", MemoRecognitionSchema, {}), (error: unknown) => error instanceof AIServiceError && error.code === "INVALID_ENVELOPE");
  }
});

function stub(replies: unknown[]): StructuredAI {
  return { async run<T>(_task: AITask, schema: z.ZodType<T>): Promise<T> { return schema.parse(replies.shift()); } };
}
const practiceInput = { subject: "数学" as const, grade: 4, count: 1, mistakes: [{ id: "wrong-1", question: "12.5-3.78", answer: "8.72", knowledgePoint: "小数减法" }] };
const draft = { title: "小数减法", subject: "数学", questions: [{ id: "q1", sourceMistakeIds: ["wrong-1"], knowledgePoint: "小数减法", question: "14.6-5.82", answer: "8.78", explanation: "小数点对齐后按位相减。" }] };

test("AI-generated questions cannot publish until a separate verification passes", async () => {
  await assert.rejects(preparePractice(stub([draft, { approved: false, checks: [{ questionId: "q1", correct: false, reason: "需修正" }] }]), practiceInput));
  const ready = await preparePractice(stub([draft, { approved: true, checks: [{ questionId: "q1", correct: true, reason: "答案与解析一致" }] }]), practiceInput);
  assert.equal(ready.status, "verified");
  await assert.rejects(preparePractice(stub([{ ...draft, questions: [{ ...draft.questions[0], sourceMistakeIds: ["invented"] }] }]), practiceInput));
});

test("learning assistant cannot cite material outside the child context", async () => {
  await assert.rejects(answerTutor(stub([{ answer: "解释", spokenAnswer: "解释", hint: null, followUpQuestion: null, sourceMaterialIds: ["other-child"] }]), { question: "这题怎么做？", materials: [{ id: "own", text: "本人资料" }] }));
});


test("DeepSeek photo association requests a bounded direct response while independent grading retains its reasoning budget",async()=>{
 const bodies:any[]=[];
 const ai=new VisionAI({provider:"deepseek",model:"deepseek-flash",apiKey:"synthetic-test-key"},async(_url,init)=>{
  bodies.push(JSON.parse(String(init?.body)));
  return Response.json({choices:[{finish_reason:"stop",message:{content:JSON.stringify(memo)}}]});
 });
 await ai.run("organize_homework",MemoRecognitionSchema,{});
 await ai.run("grade_homework",MemoRecognitionSchema,{});
 assert.deepEqual(bodies[0].thinking,{type:"disabled"});assert.equal(bodies[0].max_tokens,8192);
 assert.equal(bodies[1].thinking,undefined);assert.equal(bodies[1].max_tokens,16000);
 const incomplete=new VisionAI({provider:"deepseek",model:"deepseek-flash",apiKey:"synthetic-test-key"},async()=>Response.json({choices:[{finish_reason:"length",message:{content:JSON.stringify(memo)}}]}));
 await assert.rejects(()=>incomplete.run("organize_homework",MemoRecognitionSchema,{}),(e:unknown)=>e instanceof AIServiceError&&e.code==="INCOMPLETE_RESPONSE");
});

test("exam output limits, filtering and missing finish flags have distinct safe diagnostics",async()=>{
 for(const [provider,payload,code,retryable] of [
   ["deepseek",{choices:[{finish_reason:"length"}]},"EXAM_OUTPUT_LIMIT",true],
   ["openai",{status:"incomplete",incomplete_details:{reason:"max_output_tokens"}},"EXAM_OUTPUT_LIMIT",true],
   ["deepseek",{choices:[{finish_reason:"content_filter"}]},"EXAM_CONTENT_FILTER",false],
   ["deepseek",{choices:[{}]},"EXAM_STOP_UNKNOWN",true]
 ] as const){
   const ai=new VisionAI({provider,model:"test",apiKey:"synthetic"},async()=>Response.json(payload));
   await assert.rejects(()=>ai.run("read_marked_exam",MemoRecognitionSchema,{}),(e:unknown)=>e instanceof AIServiceError&&e.code===code&&e.retryable===retryable);
 }
});
