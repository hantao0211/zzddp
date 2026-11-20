// Paid end-to-end knowledge check. All conversations, images, and archives are synthetic.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { HomeworkStore } from "../../src/server/homework/store";
import { HomeworkConversation } from "../../src/server/homework/conversation";
import { LearnedMemories } from "../../src/server/homework/memory";
import { HomeworkWorker } from "../../src/server/homework/worker";
import { ServerImages } from "../../src/server/homework/images";
import { VisionAI, readAIConfiguration } from "../../src/server/ai/provider";
async function main() {
  const photo = process.env.MEMORY_SYNTHETIC_PHOTO || "";
  assert.ok(photo.endsWith("/synthetic-memory-memo.jpg"));
  const directory = mkdtempSync(join(tmpdir(), "xiaobu-synthetic-memory-smoke-"));
  let store = new HomeworkStore(directory);
  const ai = new VisionAI(readAIConfiguration());
  try {
    const teaching = "我们这里备忘录写预23，就是语文预习第23课；预后面的数字是课号，以后按这个意思理解。";
    const first = await new HomeworkConversation(store).answer(ai, { question: teaching, history: [] }, "a".repeat(64));
    console.log(JSON.stringify({ stage: "distill", saved: first.memoriesSaved.length, notices: first.memoryNotices }));
    assert.ok(first.memoriesSaved.some((m) => m.kind === "memo_abbreviation"));
    store.close(); store = new HomeworkStore(directory);
    const answer = await new HomeworkConversation(store).answer(ai, { question: "预27是什么意思？", history: [] }, "b".repeat(64));
    console.log(JSON.stringify({ stage: "recall", recalled: new LearnedMemories(store).recall("预27").length, answerHasPreview: answer.answer.includes("预习"), answerHas27: answer.answer.includes("27") }));
    assert.ok(answer.answer.includes("预习")); assert.ok(answer.answer.includes("27"));
    assert.equal(answer.changeStatus, "none");
    const bytes = readFileSync(photo), date = "2026-11-21";
    const upload = store.begin({ date, kind: "memo", files: [{ name: "synthetic-memory-memo.jpg", size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }] });
    writeFileSync(join(directory, "originals", upload.files[0].id), bytes, { mode: 0o600 }); store.stored(upload.files[0].id, "image/jpeg"); store.finalize(upload.id);
    const worker = new HomeworkWorker(store, () => ai, new ServerImages(store));
    await worker.tick();
    const record = store.upload(upload.id)!;
    console.log(JSON.stringify({ stage: "recognize", status: record.status, hasResult: !!record.result }));
    const result = JSON.parse(record.result!);
    assert.ok(result.assignments.some((a: { subject: string; requirement: string }) => a.subject === "语文" && a.requirement.includes("28") && a.requirement.includes("预习")));
    assert.equal(createHash("sha256").update(readFileSync(join(directory, "originals", upload.files[0].id))).digest("hex"), createHash("sha256").update(bytes).digest("hex"));
    const memories = new LearnedMemories(store); for (const memory of memories.list()) memories.revoke(memory.id);
    assert.equal(memories.forRecognition().rules.length, 0); worker.stop();
    console.log("ASSISTANT_MEMORY_AI_OK=true selective-distillation,persist,new-chat-recall,new-lesson-recognition,original-unchanged,revoke");
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
}
void main().catch((e) => { console.error("ASSISTANT_MEMORY_AI_FAILED", e instanceof assert.AssertionError ? "ASSERTION" : e?.code || "CHECK_ERROR"); process.exitCode = 1; });
