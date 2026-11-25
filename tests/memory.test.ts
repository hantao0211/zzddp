import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { MemoryCandidateSchema } from "../src/domain/memory";
import { HomeworkStore } from "../src/server/homework/store";
import { LearnedMemories } from "../src/server/homework/memory";
import { HomeworkConversation } from "../src/server/homework/conversation";
import { HomeworkWorker } from "../src/server/homework/worker";
import type { StructuredAI } from "../src/server/ai/provider";
const date = "2026-11-18";
// Synthetic teaching example; never seeded into the real family archive.
const quote = "备忘录里的预19就是预习第19课，后面数字就是课号。";
const candidate = () => MemoryCandidateSchema.parse({ kind: "memo_abbreviation", trigger: "预+课号", subject: "语文", summary: "语文备忘录中的“预+课号”表示预习对应课文；按当前数字确定课号，不能固定为19。", evidenceQuote: quote });
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "xiaobu-memory-test-"));
  const store = new HomeworkStore(directory), memories = new LearnedMemories(store);
  return { directory, store, memories, cleanup() { store.close(); rmSync(directory, { recursive: true, force: true }); } };
}

test("distilled knowledge persists, matches another lesson number and is retrieved in a new conversation", async () => {
  const f = fixture();
  try {
    const learned = f.memories.remember([candidate()], quote, date); assert.equal(learned.saved.length, 1);
    assert.equal(f.memories.recall("预21是什么意思")[0].id, learned.saved[0].id);
    f.store.close(); const reopened = new HomeworkStore(f.directory);
    (f.store as unknown as { db: unknown }).db = reopened.db;
    const ai: StructuredAI = { async run(_task, schema, metadata) {
      const input = metadata as { learnedMemories: { summary: string }[]; history: unknown[] };
      assert.equal(input.history.length, 0); assert.ok(input.learnedMemories[0].summary.includes("对应课文"));
      return schema.parse({ answer: "按之前聊清楚的简称，预21是预习第21课。", spokenAnswer: "预习第二十一课。", hint: null, followUpQuestion: null, sourceMaterialIds: [], clarification: null, memoryCandidates: [] });
    } };
    const answer = await new HomeworkConversation(f.store).answer(ai, { question: "预21是什么意思", history: [] }, "a".repeat(64));
    assert.ok(answer.answer.includes("第21课")); assert.equal(f.memories.list().length, 1);
  } finally { f.cleanup(); }
});

test("multi-turn knowledge needs actual confirmation; guesses, questions and illustrative examples do not become memory", () => {
  const f = fixture();
  try {
    const proposed = { ...candidate(), confirmationQuote: "对，就是这个意思" };
    const history = [{ role: "assistant" as const, content: quote }];
    assert.equal(f.memories.remember([proposed], "我没说这个意思", date, history).saved.length, 0);
    assert.equal(f.memories.remember([candidate()], "预19是什么意思？", date, history).saved.length, 0);
    assert.equal(f.memories.remember([candidate()], "只是举例，不要记住。" + quote, date).saved.length, 0);
    const question = "预19是不是预习第19课？";
    assert.equal(f.memories.remember([{ ...candidate(), evidenceQuote: question }], question, date).saved.length, 0);
    const learned = f.memories.remember([proposed], "对，就是这个意思", date, history);
    assert.equal(learned.saved.length, 1); assert.ok(learned.saved[0].sourceQuote.includes("用户确认"));
    assert.equal(f.memories.remember([proposed], "后来还有别的问题", date, history).saved.length, 0);
  } finally { f.cleanup(); }
});

test("stable teaching preferences remain available when the next question uses different words", () => {
  const f = fixture();
  try {
    const quote = "我喜欢先看一个图示提示，然后自己尝试。";
    const preference = MemoryCandidateSchema.parse({ kind: "learning_preference", trigger: "图示提示", summary: "讲解时先给一个简短图示提示，留出自己尝试的机会。", subject: null, evidenceQuote: quote });
    f.memories.remember([preference], quote, date);
    assert.equal(f.memories.recall("3.2减1.5怎么算")[0].kind, "learning_preference");
  } finally { f.cleanup(); }
});

test("memory deduplicates, versions explicit updates, and revocation removes it from future retrieval without restoring superseded facts", () => {
  const f = fixture();
  try {
    const first = f.memories.remember([candidate()], quote, date).saved[0];
    assert.equal(f.memories.remember([candidate()], quote, date).saved.length, 0);
    const newerQuote = "我更正一下，这里的预只用于语文课文预习，不用于数学页码。";
    const update = { ...candidate(), summary: "语文备忘录中的预表示预习对应课文，不用于数学练习页码。", evidenceQuote: newerQuote };
    assert.equal(f.memories.remember([update], newerQuote, date).saved.length, 0);
    const second = f.memories.remember([{ ...update, replacesMemoryId: first.id }], newerQuote, date).saved[0];
    assert.equal(f.memories.list().length, 1); assert.equal(f.memories.list()[0].id, second.id);
    assert.equal(f.memories.catalog().rules.length, 1); assert.equal(f.memories.catalog().history[0].status, "superseded");
    f.memories.revoke(second.id); assert.equal(f.memories.recall("预21").length, 0);
    assert.equal(f.memories.forRecognition().rules.length, 0);
    assert.equal(f.memories.catalog().rules.length, 0); assert.equal(f.memories.catalog().history.length, 2); assert.equal(f.memories.catalog().history[0].status, "revoked");
    assert.equal(f.store.db.prepare("SELECT COUNT(*) AS n FROM learned_memories").get()!.n, 2);
  } finally { f.cleanup(); }
});

test("future uploaded memo recognition receives distilled knowledge and expands the current lesson, preserving the original", async () => {
  const f = fixture();
  try {
    f.memories.remember([candidate()], quote, date);
    const bytes = Buffer.from("synthetic memo photo");
    const upload = f.store.begin({ date: "2026-11-20", kind: "memo", files: [{ name: "synthetic.png", size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }] });
    const file = upload.files[0]; writeFileSync(join(f.directory, "originals", file.id), bytes);
    f.store.stored(file.id, "image/png"); f.store.finalize(upload.id);
    let seen = false;
    const worker = new HomeworkWorker(f.store, () => ({ async run(_task, schema, metadata) {
      const value = metadata as { knowledge: { rules: { summary: string }[] } };
      assert.ok(value.knowledge.rules[0].summary.includes("课号")); seen = true;
      return schema.parse({ date: "2026-11-20", readable: true, assignments: [{ subject: "语文", title: "预习第21课", requirement: "预习第21课", format: "reading", evidence: [{ fileId: file.id + "-p1", page: 1, excerpt: "预21" }] }], uncertainties: [] });
    } }), { async convert() { return [{ id: file.id + "-p1", file_id: file.id, number: 1 }]; }, images() { return []; } });
    await worker.tick(); assert.ok(seen); assert.ok(f.store.upload(upload.id)!.result!.includes("预习第21课"));
    assert.equal(f.store.file(file.id)!.sha256, createHash("sha256").update(bytes).digest("hex")); worker.stop();
  } finally { f.cleanup(); }
});

test("confirmed corrections are recognition examples and cease to be used when undone", () => {
  const f = fixture();
  try {
    const upload = f.store.begin({ date, kind: "memo", files: [{ name: "synthetic.png", size: 1, sha256: "f".repeat(64) }] });
    const file = upload.files[0]; f.store.stored(file.id, "image/png"); f.store.finalize(upload.id); const job = f.store.claim()!;
    f.store.recognized(job, { date, readable: true, assignments: [{ subject: null, title: "缩写不清", requirement: "预21", format: "other", evidence: [{ fileId: file.id + "-p1", page: 1, excerpt: "预21" }] }], uncertainties: ["科目不清"] }, [], true, 0, "Synthetic fixture");
    const service = new HomeworkConversation(f.store), owner = "a".repeat(64), explanation = "这项是语文预习第21课";
    const preview = service.propose(service.context(date), { entryId: upload.id + ":entry:0", changes: { subject: "语文", title: "预习课文", requirement: "预习第21课", format: "reading" }, userQuote: explanation, resolves: [0] }, owner, [explanation]);
    const receipt = service.confirm(preview.id, owner);
    const knowledge = f.memories.forRecognition(); assert.equal(knowledge.corrections.length, 1); assert.equal(knowledge.corrections[0].explanation, explanation);
    assert.deepEqual(f.memories.catalog().corrections, knowledge.corrections); assert.equal(f.memories.catalog().rules.length, 0);
    service.undo(receipt.id, owner); assert.equal(f.memories.forRecognition().corrections.length, 0); assert.equal(f.memories.catalog().corrections.length, 0);
    assert.notEqual(f.memories.forRecognition().revision, knowledge.revision);
  } finally { f.cleanup(); }
});

test("today's photo association is not a reusable abbreviation, including old polluted memories", () => {
  const f = fixture();
  try {
    const quote = "预习就是阅读园地那张图里拍的内容。";
    const oneOff = MemoryCandidateSchema.parse({ kind: "memo_abbreviation", trigger: "阅读园地", summary: "在语文预习语境中，阅读园地指拍摄的阅读园地页面。", subject: "语文", evidenceQuote: quote });
    const result = f.memories.remember([oneOff], quote, date);
    assert.equal(result.saved.length, 0); assert.ok(result.notices.some((s) => s.includes("当前说明")));
    const stored = f.memories.remember([candidate()], candidate().evidenceQuote, date).saved[0];
    f.store.db.prepare("UPDATE learned_memories SET source_quote=? WHERE id=?").run(quote, stored.id);
    assert.equal(f.memories.recall("预22").length, 0);
    assert.equal(f.memories.forRecognition().rules.length, 0);
    assert.equal(f.memories.list().length, 1); // Audit/UI visibility retained; only future use is filtered.
    assert.equal(f.memories.catalog().rules.length, 0); assert.equal(f.memories.catalog().history[0].status, "excluded"); assert.ok(f.memories.catalog().history[0].reason.includes("当次照片"));
    const general = { ...oneOff, evidenceQuote: "以后备忘录里的预加数字表示预习对应课文，那张照片只是本次的内容。" };
    assert.equal(f.memories.remember([general], general.evidenceQuote, date).saved.length, 1);
  } finally { f.cleanup(); }
});

test("OCR numeral corrections cannot become reusable aliases, including old mismatched Chinese numeral rules", () => {
  const f = fixture();
  try {
    for (const quote of ["孩子原文是复27，字写得潦草，被误识别成复7。", "复七就是语文的复习第27课。", "复八就是复习第十八课。", "复27就是复习第7课。"] ) {
      const bad = { ...candidate(), trigger: "复", summary: "语文备忘录中的复7表示复习第27课。", evidenceQuote: quote };
      const result = f.memories.remember([bad], quote, date);
      assert.equal(result.saved.length, 0); assert.ok(result.notices.length);
    }
    const stored = f.memories.remember([candidate()], candidate().evidenceQuote, date).saved[0];
    f.store.db.prepare("UPDATE learned_memories SET source_quote=?,summary=? WHERE id=?").run("复七就是语文的复习第27课。", "复表示复习第27课。", stored.id);
    assert.equal(f.memories.recall("复28是什么意思").length, 0);
    assert.equal(f.memories.forRecognition().rules.length, 0);
    f.store.db.prepare("UPDATE learned_memories SET source_quote=?,summary=? WHERE id=?").run(candidate().evidenceQuote, "复7表示复习第27课。", stored.id);
    assert.equal(f.memories.recall("预28是什么意思").length, 0); assert.equal(f.memories.catalog().rules.length, 0);
    assert.equal(f.memories.catalog().history[0].status, "excluded");
    const valid = { ...candidate(), trigger: "复", evidenceQuote: "复七就是复习第七课，复27就是复习第27课，后面的数字是课号。", summary: "语文备忘录里的复加数字表示复习对应课文，保留当前课号。" };
    assert.equal(f.memories.remember([valid], valid.evidenceQuote, date).saved.length, 1);
  } finally { f.cleanup(); }
});

test("only a parent-confirmed reusable convention reaches the matching subject and stage", async () => {
  const f = fixture();
  const quote = "我们通常用蓝笔在原题旁订正，检查订正时可以看那里。";
  const convention = { ...candidate(), kind:"homework_completion" as const, trigger:"订正位置", evidenceQuote:quote, summary:"模型自行扩写的规则不应进入下一份作业" };
  const chat = new HomeworkConversation(f.store);
  const reply: StructuredAI = { async run(_task, schema) {
    return schema.parse({answer:"已收到说明。",spokenAnswer:"收到。",hint:null,followUpQuestion:null,sourceMaterialIds:[],clarification:null,memoryCandidates:[convention]});
  }};
  const viewer = {id:"p", username:"parent", name:"家长", role:"parent" as const};
  try {
    assert.equal((await chat.answer(reply, {question:quote, history:[]}, "owner", {...viewer,role:"child"})).memoriesSaved.length, 0);
    for (const oneOff of ["这张照片是订正页。", "以后是不是都看蓝笔？"]) {
      assert.equal(f.memories.remember([{...convention,evidenceQuote:oneOff}], oneOff, date, [], true).saved.length, 0);
    }
    const result = await chat.answer(reply, {question:quote, history:[]}, "owner", viewer);
    assert.equal(result.memoriesSaved.length, 1);
    assert.deepEqual(f.memories.forJudgment("homework_completion", ["语文"]), [{subject:"语文",convention:quote}]);
    assert.deepEqual(f.memories.forJudgment("homework_grading", ["语文"]), []);
    assert.deepEqual(f.memories.forJudgment("homework_completion", ["英语"]), []);
    assert.deepEqual(f.memories.forRecognition().rules, []);
    assert.equal(f.memories.catalog().rules[0].sourceQuote, quote);
    f.memories.revoke(result.memoriesSaved[0].id);
    assert.deepEqual(f.memories.forJudgment("homework_completion", ["语文"]), []);
  } finally { f.cleanup(); }
});
