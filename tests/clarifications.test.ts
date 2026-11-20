import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import type { AITask } from "../src/domain/ai-contracts";
import type { z } from "zod";
import { HomeworkStore } from "../src/server/homework/store";
import { HomeworkConversation } from "../src/server/homework/conversation";
import { effectiveMemo } from "../src/server/homework/memo-context";
import { HomeworkWorker } from "../src/server/homework/worker";
import { AIServiceError, type StructuredAI } from "../src/server/ai/provider";
import type { ClarificationAction } from "../src/domain/clarifications";
const date = "2026-11-20", owner = "a".repeat(64), other = "b".repeat(64);
function setup() {
  const directory = mkdtempSync(join(tmpdir(), "xiaobu-clarification-test-"));
  let now = Date.parse("2026-11-20T04:00:00Z");
  const store = new HomeworkStore(directory, () => now);
  const u = store.begin({ date, kind: "memo", files: [{ name: "synthetic.png", size: 100, sha256: createHash("sha256").update("synthetic").digest("hex") }] });
  store.stored(u.files[0].id, "image/png"); store.finalize(u.id); const job = store.claim()!;
  const page = { fileId: u.files[0].id + "-p1", page: 1, excerpt: "复9" };
  const original = { date, readable: true, assignments: [{ subject: "数学", title: "数学练习", requirement: "第32页", format: "written", evidence: [page] }, { subject: null, title: "复9", requirement: "复9，含义不清", format: "other", evidence: [page] }], uncertainties: ["复9的科目不清", "9是课数还是页数不清", "另一项作业的书名不清"] };
  store.recognized(job, original, ["数学"], true, 100, "fixture");
  const service = new HomeworkConversation(store);
  const action: ClarificationAction = { entryId: `${u.id}:entry:1`, changes: { subject: "语文", title: "复习第9课", requirement: "复习语文第9课", format: "other" }, userQuote: "复9是语文复习第9课", resolves: [0, 1] };
  const worker = new HomeworkWorker(store, () => ({ async run() { throw new Error("No paid call expected without homework"); } }), { async convert() { return []; }, images() { return []; } });
  async function drain() { for (let i = 0; i < 20; i++) if (!await worker.tick()) return; throw new Error("queue did not drain"); }
  return { directory, store, service, original, uploadId: u.id, action, drain, advance(ms: number) { now += ms; }, cleanup() { worker.stop(); store.close(); rmSync(directory, { recursive: true, force: true }); } };
}

test("homework explanation receives real selected-day records and never writes without a proposal confirmation", async () => {
  const f = setup();
  try {
    await f.drain();
    const seen: unknown[] = [];
    const ai: StructuredAI = { async run<T>(_task: AITask, schema: z.ZodType<T>, metadata: unknown): Promise<T> { seen.push(metadata); return schema.parse({ answer: "备忘录有一项缩写的科目不确定。", spokenAnswer: "有一项缩写需要你说明。", hint: null, followUpQuestion: "这个缩写是什么意思？", sourceMaterialIds: [f.uploadId], clarification: null }); } };
    const result = await f.service.answer(ai, { studyDate: date, question: "有哪些疑问", history: [] }, owner);
    assert.equal(result.changeStatus, "none");
    assert.ok(JSON.stringify(seen).includes("复9"));
    assert.equal(f.store.db.prepare("SELECT COUNT(*) AS n FROM clarifications").get()!.n, 0);
    assert.equal(f.service.context("2026-11-21").entries.length, 0);
    assert.equal(f.store.upload(f.uploadId)!.result, JSON.stringify(f.original));
  } finally { f.cleanup(); }
});

test("asking to look at homework sends only selected-day photos, bounds the review, and normalizes known page citations", async () => {
  const f = setup();
  try {
    const file = f.store.files(f.uploadId)[0];
    const pages = Array.from({ length: 8 }, (_, i) => ({ id: `${file.id}-p${i + 1}`, file_id: file.id, number: i + 1 }));
    f.store.setPages(file.id, pages);
    const foreign = f.store.begin({ date: "2026-11-21", kind: "memo", files: [{ name: "other-day.png", size: 100, sha256: "f".repeat(64) }] });
    f.store.stored(foreign.files[0].id, "image/png"); f.store.finalize(foreign.id);
    f.store.setPages(foreign.files[0].id, [{ id: "different-day-page", file_id: foreign.files[0].id, number: 1 }]);
    const read: string[] = [];
    const service = new HomeworkConversation(f.store, { images(pages) { read.push(...pages.map((p) => p.id)); return pages.map((p) => ({ fileId: p.id, mimeType: "image/jpeg", base64: "c3ludGhldGlj" })); } });
    const ai: StructuredAI = { async run(_task, schema, metadata, images) {
      const data = metadata as { photoReview: { requested: boolean; pages: { fileId: string }[] } };
      assert.equal(data.photoReview.requested, true); assert.equal(images!.length, 6); assert.equal(data.photoReview.pages.length, 6);
      assert.ok(!JSON.stringify(metadata).includes("different-day-page"));
      return schema.parse({ answer: "已重新查看提供的6页，另外2页尚未查看。19的含义仍需结合上下文。", spokenAnswer: "已查看六页。", hint: null, followUpQuestion: null, sourceMaterialIds: [images![0].fileId, f.uploadId], clarification: null });
    } };
    const response = await service.answer(ai, { studyDate: date, question: "你你看作业就知道了，作业里面有19。", history: [] }, owner);
    assert.equal(read.length, 6); assert.equal(response.photoReview.totalAvailablePages, 8); assert.equal(response.photoReview.providedPages, 6);
    assert.deepEqual(response.sourceMaterialIds, [f.uploadId]);
    assert.equal(response.changeStatus, "none"); assert.equal(f.store.upload(f.uploadId)!.result, JSON.stringify(f.original));
    await assert.rejects(service.answer({ async run(_task, schema) { return schema.parse({ answer: "解释", spokenAnswer: "解释", hint: null, followUpQuestion: null, sourceMaterialIds: ["different-day-page"], clarification: null }); } }, { studyDate: date, question: "这天有什么疑问", history: [] }, owner), (e: unknown) => e instanceof AIServiceError && e.code === "INVALID_SOURCE");
  } finally { f.cleanup(); }
});

test("ordinary explanations do not send photos; explicit review survives unavailable pages without claiming to see them", async () => {
  const f = setup();
  try {
    let reads = 0;
    const file = f.store.files(f.uploadId)[0];
    f.store.setPages(file.id, [{ id: `${file.id}-p1`, file_id: file.id, number: 1 }]);
    const service = new HomeworkConversation(f.store, { images() { reads++; throw new Error("private path must not escape"); } });
    const ai: StructuredAI = { async run(_task, schema, metadata, images) {
      assert.equal(images!.length, 0);
      return schema.parse({ answer: "只能依据识别记录解释。", spokenAnswer: "只能依据识别记录解释。", hint: null, followUpQuestion: null, sourceMaterialIds: [file.id], clarification: null });
    } };
    await service.answer(ai, { studyDate: date, question: "系统有什么疑问", history: [] }, owner); assert.equal(reads, 0);
    const declined = await service.answer(ai, { studyDate: date, question: "不用再看作业照片，只解释已有记录", reviewPhotos: true, history: [] }, owner);
    assert.equal(reads, 0); assert.equal(declined.photoReview.requested, false);
    const response = await service.answer(ai, { studyDate: date, question: "19是什么意思", reviewPhotos: true, history: [] }, owner);
    assert.equal(reads, 1); assert.equal(response.photoReview.requested, true); assert.equal(response.photoReview.providedPages, 0); assert.equal(response.photoReview.unavailablePages, 1);
    assert.equal(f.store.db.prepare("SELECT COUNT(*) AS n FROM clarifications").get()!.n, 0);
  } finally { f.cleanup(); }
});

test("confirm is session-bound, idempotent, persistent, and leaves original recognition unchanged", async () => {
  const f = setup();
  try {
    const proposal = f.service.propose(f.service.context(date), f.action, owner, [f.action.userQuote]);
    assert.equal(effectiveMemo(f.store, f.store.upload(f.uploadId)!).result.assignments[1].subject, null);
    assert.throws(() => f.service.confirm(proposal.id, other), /不存在/);
    const first = f.service.confirm(proposal.id, owner), again = f.service.confirm(proposal.id, owner);
    assert.equal(first.id, again.id);
    assert.equal(f.store.db.prepare("SELECT COUNT(*) AS n FROM clarifications").get()!.n, 1);
    await f.drain();
    const report = f.store.snapshot(date).report!;
    assert.equal(report.tasks.length, 2); assert.equal(report.unclassified.length, 0); assert.equal(report.familyNotes.length, 1);
    assert.ok(report.uncertainties.includes("另一项作业的书名不清"));
    assert.ok(!report.uncertainties.includes("复9的科目不清"));
    assert.equal(f.store.upload(f.uploadId)!.result, JSON.stringify(f.original));
    f.store.close(); const reopened = new HomeworkStore(f.directory);
    assert.equal(new HomeworkConversation(reopened).context(date).entries[1].subject, "语文");
    (f.store as unknown as { db: unknown }).db = reopened.db;
  } finally { f.cleanup(); }
});

test("stale and expired proposals fail; AI cannot use its own guesses or invented targets as family corrections", () => {
  const f = setup();
  try {
    const context = f.service.context(date);
    assert.throws(() => f.service.propose(context, f.action, owner, ["有哪些疑问？"]), /没有对应/);
    assert.throws(() => f.service.propose(context, { ...f.action, entryId: "someone-else:entry:0" }, owner, [f.action.userQuote]), /没有对应/);
    assert.throws(() => f.service.propose(context, { ...f.action, changes: { ...f.action.changes, completed: true } } as never, owner, [f.action.userQuote]));
    const stale = f.service.propose(context, f.action, owner, [f.action.userQuote]);
    f.store.transaction(() => f.store.bump(date));
    assert.throws(() => f.service.confirm(stale.id, owner), /已更新/);
    const expired = f.service.propose(f.service.context(date), f.action, owner, [f.action.userQuote]);
    f.advance(16 * 60_000); assert.throws(() => f.service.confirm(expired.id, owner), /过期/);
    assert.equal(f.store.db.prepare("SELECT COUNT(*) AS n FROM clarifications").get()!.n, 0);
  } finally { f.cleanup(); }
});

test("undo removes only the latest family overlay and restores the unresolved item", async () => {
  const f = setup();
  try {
    const proposal = f.service.propose(f.service.context(date), f.action, owner, [f.action.userQuote]);
    const receipt = f.service.confirm(proposal.id, owner); await f.drain();
    assert.throws(() => f.service.undo(receipt.id, other), /不存在/);
    f.service.undo(receipt.id, owner); await f.drain();
    assert.equal(f.store.snapshot(date).report!.unclassified.length, 1);
    assert.equal(f.service.context(date).entries[1].subject, null);
    assert.throws(() => f.service.confirm(proposal.id, owner), /撤销/);
    assert.equal(f.store.upload(f.uploadId)!.result, JSON.stringify(f.original));
  } finally { f.cleanup(); }
});

test("homework dialogue HTTP protects context and confirmation with family session, origin, and server-owned drafts", async () => {
  const { createAssistantServer } = await import("../src/server/assistant/server");
  const { AssistantStore } = await import("../src/server/assistant/store");
  const { request } = await import("node:http");
  const f = setup(); const auth = new AssistantStore(join(f.directory, "auth"));
  const origin = "https://family.test", first = "__Secure-xiaobu-assistant=" + auth.createSession(), second = "__Secure-xiaobu-assistant=" + auth.createSession();
  const ai: StructuredAI = { async run<T>(_task: AITask, schema: z.ZodType<T>): Promise<T> { return schema.parse({ answer: "我会先显示修改预览，请确认。", spokenAnswer: "请确认修改预览。", hint: null, followUpQuestion: null, sourceMaterialIds: [f.uploadId], clarification: f.action }); } };
  const server = createAssistantServer({ origin, accessHash: "ab".repeat(16) + ":" + "ab".repeat(32), store: auth, ai: () => ai, learning: f.service });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const send = (path: string, method = "GET", value?: unknown, cookie = first, source = origin) => new Promise<{ status: number; value: Record<string, any> }>((resolve, reject) => {
    const body = value === undefined ? undefined : Buffer.from(JSON.stringify(value));
    const req = request({ hostname: "127.0.0.1", port: address.port, method, path: "/assistant-api/" + path, headers: { Host: "family.test", "X-Forwarded-Proto": "https", Origin: source, Cookie: cookie, ...(body ? { "Content-Type": "application/json", "Content-Length": body.length } : {}) } }, (res) => { const chunks: Buffer[] = []; res.on("data", (b) => chunks.push(b)); res.on("end", () => resolve({ status: res.statusCode!, value: JSON.parse(Buffer.concat(chunks).toString()) })); }); req.on("error", reject); req.end(body);
  });
  try {
    assert.equal((await send("homework-context", "GET", undefined, "")).status, 401);
    assert.equal((await send("memories", "GET", undefined, "")).status, 401);
    assert.equal((await send("memories")).status, 200);
    const context = await send("homework-context?date=" + date); assert.equal(context.status, 200); assert.equal(context.value.entries.length, 2);
    const chat = await send("chat", "POST", { studyDate: date, question: f.action.userQuote, history: [] });
    assert.equal(chat.status, 200); assert.equal(chat.value.changeStatus, "pending");
    const id = chat.value.proposal.id;
    assert.equal(f.store.db.prepare("SELECT COUNT(*) AS n FROM clarifications").get()!.n, 0);
    assert.equal((await send(`clarifications/${id}/confirm`, "POST", {}, second)).status, 404);
    assert.equal((await send(`clarifications/${id}/confirm`, "POST", {}, first, "https://evil.test")).status, 403);
    assert.equal((await send(`clarifications/${id}/confirm`, "POST", { completed: true })).status, 400);
    const saved = await send(`clarifications/${id}/confirm`, "POST", {}); assert.equal(saved.status, 200);
    assert.equal((await send(`clarifications/${saved.value.id}/undo`, "POST", {})).status, 200);
    assert.equal(f.service.context(date).entries[1].subject, null);
    const { MemoryCandidateSchema } = await import("../src/domain/memory");
    const quote = "我喜欢先看一个提示，再自己试着解题。";
    const memory = f.service.memories.remember([MemoryCandidateSchema.parse({ kind: "learning_preference", trigger: "提示", summary: "讲解题目时先给一个提示，让孩子自己试着解题。", subject: null, evidenceQuote: quote })], quote, date).saved[0];
    assert.equal((await send(`memories/${memory.id}/revoke`, "POST", {}, first, "https://evil.test")).status, 403);
    assert.equal((await send(`memories/${memory.id}/revoke`, "POST", { grantPoints: true })).status, 400);
    assert.equal((await send(`memories/${memory.id}/revoke`, "POST", {})).status, 200);
    assert.equal((await send("memories")).value.items.length, 0);
  } finally { await new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }); f.cleanup(); }
});

test("a short reply keeps its previous question and produces an immediate truthful preview without unrelated reminders", async () => {
  const f = setup();
  try {
    const question = "是语文预习的作业";
    const history = [
      { role: "user" as const, content: "那张阅读园地照片是今天要预习的内容。" },
      { role: "assistant" as const, content: "阅读园地第60—61页算语文预习这一项，还是另外一项？" },
    ];
    const ai: StructuredAI = { async run(_task, schema, metadata) {
      const input = metadata as { dialogueGuide: { shortFollowUp: boolean; previousAssistantTurn: string; recentUserStatements: string[] } };
      assert.equal(input.dialogueGuide.shortFollowUp, true);
      assert.equal(input.dialogueGuide.previousAssistantTurn, history[1].content);
      assert.equal(input.dialogueGuide.recentUserStatements.at(-1), question);
      return schema.parse({ answer: "请等一会儿看预览。另外整份批改还没上线。", spokenAnswer: "等待预览", hint: null, followUpQuestion: "请再说是哪一课？", sourceMaterialIds: [f.uploadId], clarification: { ...f.action, userQuote: question, changes: { subject: "语文", title: "语文预习", requirement: "预习阅读园地第60—61页", format: "other" } } });
    } };
    const result = await f.service.answer(ai, { question, history, studyDate: date }, owner);
    assert.equal(result.changeStatus, "pending"); assert.ok(result.proposal);
    assert.ok(result.answer.includes("预习阅读园地第60—61页"));
    assert.ok(result.answer.includes("确认修改并重新查缺"));
    assert.ok(!/批改|等一会|已保存|哪一课/.test(result.answer)); assert.equal(result.followUpQuestion, null);
    assert.equal(f.store.db.prepare("SELECT COUNT(*) AS n FROM clarifications").get()!.n, 0);
    assert.equal(f.store.upload(f.uploadId)!.result, JSON.stringify(f.original));
  } finally { f.cleanup(); }
});

test("confirmed current facts outrank the stale report while rechecking is pending", async () => {
  const f = setup();
  try {
    await f.drain();
    const oldReport = f.store.snapshot(date).report;
    assert.ok(oldReport?.uncertainties.includes("复9的科目不清"));
    const proposal = f.service.propose(f.service.context(date), f.action, owner, [f.action.userQuote]);
    f.service.confirm(proposal.id, owner);
    assert.equal(f.store.snapshot(date).pending, true);
    assert.ok(f.store.snapshot(date).report?.uncertainties.includes("复9的科目不清"));
    const ai: StructuredAI = { async run(_task, schema, metadata) {
      const input = metadata as { report: unknown; dialogueGuide: { currentFacts: { subject: string; title: string }[]; confirmedClarifications: unknown[] }; homeworkContext: { uncertainties: { text: string }[] } };
      assert.equal(input.report, null);
      assert.ok(input.dialogueGuide.currentFacts.some((e) => e.subject === "语文" && e.title === f.action.changes.title));
      assert.equal(input.dialogueGuide.confirmedClarifications.length, 1);
      assert.ok(!input.homeworkContext.uncertainties.some((u) => u.text === "复9的科目不清"));
      return schema.parse({ answer: "这项说明已保存，不需要重复解释，后台正在重新查缺。", spokenAnswer: "已经清楚了", hint: null, followUpQuestion: null, sourceMaterialIds: [], clarification: null });
    } };
    await f.service.answer(ai, { question: "这项还不清楚吗", history: [], studyDate: date }, owner);
  } finally { f.cleanup(); }
});

test("latest explanation supplies the complete current meaning; old quotes stay auditable but out of AI current facts", async () => {
  const f = setup();
  try {
    await f.drain();
    const old = { ...f.action, userQuote: "复9就是复习第29课。", changes: { ...f.action.changes, title: "复习第29课", requirement: "你说明复9就是复习第29课。" } };
    const first = f.service.propose(f.service.context(date), old, owner, [old.userQuote]);
    f.service.confirm(first.id, owner); await f.drain();
    const correction = "原文写的是复29，系统漏识别了2，不是复9表示第29课。";
    const next = { ...f.action, userQuote: correction, resolves: [], changes: { subject: null, title: null, requirement: "复习语文第29课；原文为复29，之前漏识别了数字2。", format: null } };
    const second = f.service.propose(f.service.context(date), next, owner, [correction]);
    const receipt = f.service.confirm(second.id, owner);
    const notes = f.service.context(date, owner).familyNotes;
    assert.equal(notes.length, 2); assert.equal(notes[0].current, false); assert.equal(notes[1].current, true);
    assert.equal(notes[0].userQuote, old.userQuote); assert.equal(receipt.title, "复习第29课"); assert.equal(receipt.requirement, next.changes.requirement);
    const storedReport = f.store.db.prepare("SELECT report FROM days WHERE date=?").get(date)!.report;
    assert.equal(f.store.snapshot(date).report!.familyNotes[1].requirement, next.changes.requirement);
    assert.equal(f.store.db.prepare("SELECT report FROM days WHERE date=?").get(date)!.report, storedReport);
    const ai: StructuredAI = { async run(_task, schema, metadata) {
      const input = metadata as { homeworkContext: { familyNotes: { userQuote: string; requirement: string }[] }; dialogueGuide: { confirmedClarifications: unknown[] } };
      assert.equal(input.homeworkContext.familyNotes.length, 1);
      assert.equal(input.homeworkContext.familyNotes[0].requirement, next.changes.requirement);
      assert.ok(!JSON.stringify(input).includes(old.userQuote));
      return schema.parse({ answer: "明白，是之前漏认了数字，不是简称规则。", spokenAnswer: "是之前认错了数字。", hint: null, followUpQuestion: null, sourceMaterialIds: [], clarification: null });
    } };
    await f.service.answer(ai, { studyDate: date, question: "你理解了吗？", history: [] }, owner);
    assert.equal(f.store.upload(f.uploadId)!.result, JSON.stringify(f.original));
    f.service.undo(receipt.id, owner);
    const restored = f.service.context(date).familyNotes;
    assert.equal(restored.length, 1); assert.equal(restored[0].current, true);
  } finally { f.cleanup(); }
});


test("new chat pictures take focus without silently sending the day's stored homework photos", async () => {
  const f = setup();
  try {
    const file = f.store.files(f.uploadId)[0];
    f.store.setPages(file.id, [{ id: `${file.id}-p1`, file_id: file.id, number: 1 }]);
    let reads = 0;
    const service = new HomeworkConversation(f.store, { images(pages) { reads++; return pages.map(p => ({ fileId: p.id, mimeType: "image/jpeg", base64: "synthetic" })); } });
    const photo = { id: "11111111-1111-4111-8111-111111111111", mimeType: "image/png" as const, base64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a54sAAAAASUVORK5CYII=" };
    const ai: StructuredAI = { async run(_task, schema, _metadata, images) {
      assert.equal(images![0].fileId, `chat-${photo.id}`);
      return schema.parse({ answer: "先看新发的图片。", spokenAnswer: "先看图片。", hint: null, followUpQuestion: null, sourceMaterialIds: [`chat-${photo.id}`], clarification: null });
    } };
    const result = await service.answer(ai, { studyDate: date, question: "请看看这张图片", photos: [photo], history: [] }, owner);
    assert.equal(result.photoReview.requested, false); assert.equal(reads, 0);
    const both = await service.answer({ async run(_task, schema, _metadata, images) {
      assert.equal(images!.length, 2);
      return schema.parse({ answer: "对照两张图片。", spokenAnswer: "对照图片。", hint: null, followUpQuestion: null, sourceMaterialIds: [], clarification: null });
    } }, { studyDate: date, question: "对照当天作业", photos: [photo], reviewPhotos: true, history: [] }, owner);
    assert.equal(both.photoReview.requested, true); assert.equal(reads, 1);
  } finally { f.cleanup(); }
});

test("direct memo correction saves without AI, is idempotent, preserves originals, and can be undone", async () => {
  const f = setup();
  try {
    const context = f.service.context(date, owner), original = f.store.upload(f.uploadId)!.result;
    const input = { requestId: "11111111-1111-4111-8111-111111111111", date, revision: context.revision, entryId: context.entries[1].entryId, entry: { subject: "语文" as const, title: "复习第19课", requirement: "复习语文第19课，原来的9是识别错误。", format: "reading" as const } };
    const receipt = f.service.editEntry(input, owner);
    assert.equal(f.service.context(date).entries[1].title, "复习第19课");
    assert.equal(f.store.upload(f.uploadId)!.result, original);
    assert.equal(f.service.editEntry(input, owner).id, receipt.id);
    assert.equal(f.store.db.prepare("SELECT COUNT(*) AS n FROM clarifications").get()!.n, 1);
    assert.throws(() => f.service.editEntry(input, other));
    assert.throws(() => f.service.editEntry({ ...input, entry: { ...input.entry, title: "其他改动" } }, owner));
    f.service.undo(receipt.id, owner);
    assert.equal(f.service.context(date).entries[1].title, context.entries[1].title);
    assert.throws(() => f.service.editEntry(input, owner));
    assert.equal(f.store.upload(f.uploadId)!.result, original);
  } finally { f.cleanup(); }
});

test("manual correction refuses stale revisions and foreign entries atomically", () => {
  const f = setup();
  try {
    const context = f.service.context(date, owner);
    const input = { requestId: "22222222-2222-4222-8222-222222222222", date, revision: context.revision, entryId: context.entries[0].entryId, entry: { subject: "数学" as const, title: "数学练习", requirement: "第74页", format: "written" as const } };
    assert.throws(() => f.service.editEntry({ ...input, revision: context.revision + 1 }, owner));
    assert.throws(() => f.service.editEntry({ ...input, entry: { ...input.entry, subject: null } }, owner));
    assert.throws(() => f.service.editEntry({ ...input, entryId: "other-memo:entry:0" }, owner));
    assert.equal(f.store.db.prepare("SELECT COUNT(*) AS n FROM clarification_drafts").get()!.n, 0);
    assert.equal(f.store.db.prepare("SELECT COUNT(*) AS n FROM clarifications").get()!.n, 0);
    f.service.editEntry(input, owner);
    assert.throws(() => f.service.editEntry({ ...input, requestId: "33333333-3333-4333-8333-333333333333" }, owner));
  } finally { f.cleanup(); }
});
