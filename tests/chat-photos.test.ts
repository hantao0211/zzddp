import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ChatInputSchema, type ChatPhoto } from "../src/domain/assistant";
import { exportAssistantConversation } from "../src/domain/assistant-export";
import { chatPhotos } from "../src/server/assistant/photos";
import { HomeworkConversation } from "../src/server/homework/conversation";
import { HomeworkStore } from "../src/server/homework/store";
import { ReadingHTTP } from "../src/server/reading/http";
import { ReadingStore } from "../src/server/reading/store";
import { answerTutor } from "../src/server/ai/workflows";
import { VisionAI, type StructuredAI } from "../src/server/ai/provider";
const photo: ChatPhoto = { id: "11111111-1111-4111-8111-111111111111", mimeType: "image/png", base64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a54sAAAAASUVORK5CYII=" };
const input = { question: "这道题怎么想？", history: [], photos: [photo] };
const answer = { answer: "先看图片里的第一步。", spokenAnswer: "先看第一步。", hint: null, followUpQuestion: null, sourceMaterialIds: [`chat-${photo.id}`], clarification: null };

test("chat photos enforce count, byte format, base64 and unique IDs before using model", () => {
  assert.ok(ChatInputSchema.safeParse(input).success);
  assert.equal(chatPhotos(input).images[0].base64, photo.base64);
  for (const bad of [ { ...photo, mimeType: "image/jpeg" }, { ...photo, base64: "PHN2Zz5ub3QgYSByYXN0ZXIgcGhvdG88L3N2Zz4=" }, { ...photo, base64: photo.base64 + "!" } ]) assert.throws(() => chatPhotos({ photos: [bad as ChatPhoto] }));
  assert.throws(() => chatPhotos({ photos: [photo, photo] }));
  assert.ok(!ChatInputSchema.safeParse({ ...input, photos: Array(4).fill(photo) }).success);
  assert.ok(!ChatInputSchema.safeParse({ ...input, photos: [{ ...photo, base64: "a".repeat(600004) }] }).success);
  assert.ok(!ChatInputSchema.safeParse({ ...input, photos: [{ ...photo, url: "https://other.test/private" }] }).success);
});

test("tutor sends images to both vision transports, cites request photos and never embeds base64 in metadata", async () => {
  for (const provider of ["deepseek", "openai"] as const) {
    let called = false;
    const ai = new VisionAI({ provider, model: "test-model", apiKey: "synthetic-only" }, async (_url, init) => {
      called = true; const body = JSON.parse(String(init?.body));
      const content = provider === "deepseek" ? body.messages[1].content : body.input[0].content;
      assert.ok(!content[0].text.includes(photo.base64)); assert.ok(content[0].text.includes(`chat-${photo.id}`));
      assert.equal(provider === "deepseek" ? content[1].image_url.url : content[1].image_url, `data:image/png;base64,${photo.base64}`);
      return Response.json(provider === "deepseek" ? { choices: [{ finish_reason: "stop", message: { content: JSON.stringify(answer) } }] } : { status: "completed", output: [{ content: [{ type: "output_text", text: JSON.stringify(answer) }] }] });
    });
    assert.equal((await answerTutor(ai, { ...input, materials: [] })).answer, answer.answer); assert.ok(called);
  }
});

test("homework and reading questions receive current or previous chat photos without creating learning records", async () => {
  const root = mkdtempSync(join(tmpdir(), "xiaobu-chat-images-"));
  const homework = new HomeworkStore(join(root, "homework")), reading = new ReadingStore(join(root, "reading"));
  try {
    const before = readdirSync(root, { recursive: true }).sort();
    const seen: string[] = [];
    const ai: StructuredAI = { async run(task, schema, metadata, images) {
      seen.push(task); const data = metadata as { chatPhotos: { origin: string; pages: { fileId: string }[] } };
      assert.equal(data.chatPhotos.origin, "previous"); assert.equal(data.chatPhotos.pages[0].fileId, `chat-${photo.id}`);
      assert.equal(images![0].base64, photo.base64); assert.ok(!JSON.stringify(metadata).includes(photo.base64));
      return schema.parse(answer);
    } };
    const question = { ...input, photoOrigin: "previous" as const };
    await new HomeworkConversation(homework).answer(ai, question, "synthetic-owner");
    await new ReadingHTTP(reading).answer(ai, question, { id: "qa-child", username: "qa-child", name: "模拟孩子", role: "child" });
    assert.deepEqual(seen, ["homework_dialogue", "reading_dialogue"]);
    assert.equal(homework.uploads(new HomeworkConversation(homework).context().date).length, 0);
    assert.equal(reading.snapshot({ id: "qa-child", username: "qa-child", name: "模拟孩子", role: "child" }).logs.length, 0);
    assert.deepEqual(readdirSync(root, { recursive: true }).sort(), before);
    const bad: StructuredAI = { async run(_task, schema) { return schema.parse({ ...answer, sourceMaterialIds: ["foreign-photo"] }); } };
    await assert.rejects(new HomeworkConversation(homework).answer(bad, input, "synthetic-owner"));
    await assert.rejects(new ReadingHTTP(reading).answer(bad, input, { id: "qa-child", username: "qa-child", name: "模拟孩子", role: "child" }));
  } finally { homework.close(); reading.close(); rmSync(root, { recursive: true, force: true }); }
});

test("text export identifies photo messages and unsent photos without disclosing image bytes", () => {
  const text = exportAssistantConversation({ date: "2026-11-20", messages: [{ role: "user", content: input.question, photos: [photo] }], draft: "", pendingQuestion: "", error: "", draftPhotoCount: 1 });
  assert.match(text, /附带图片：1 张/); assert.match(text, /尚未发送的图片/); assert.ok(!text.includes(photo.base64));
});
