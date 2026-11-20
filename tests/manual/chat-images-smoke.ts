// Uses only a generated arithmetic picture and fresh temporary state, never child records.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { HomeworkConversation } from "../../src/server/homework/conversation";
import { HomeworkStore } from "../../src/server/homework/store";
import { VisionAI, readAIConfiguration } from "../../src/server/ai/provider";
async function main() {
const directory = mkdtempSync(join(tmpdir(), "xiaobu-chat-photo-smoke-"));
const store = new HomeworkStore(directory), service = new HomeworkConversation(store);
try {
 const photo = { id: randomUUID(), mimeType: "image/png" as const, base64: readFileSync(process.env.CHAT_SMOKE_PHOTO!).toString("base64") };
 const ai = new VisionAI(readAIConfiguration());
 const first = await service.answer(ai, { question: "请看这张图片，读出算式并检查结果。只用一句话回答。", history: [], photos: [photo] }, "synthetic-only");
 assert.match(first.answer, /7/); assert.match(first.answer, /5/); assert.match(first.answer, /12/);
 const second = await service.answer(ai, { question: "把第二个数改成6，结果呢？", photos: [photo], photoOrigin: "previous", history: [{ role: "user", content: "请读出图片中的算式并检查。" }, { role: "assistant", content: first.answer }] }, "synthetic-only");
 assert.match(second.answer, /13/);
 assert.equal(store.uploads(service.context().date).length, 0);
 console.log("REAL_CHAT_VISION_OK=true synthetic-image,configured-provider,follow-up,no-child-records");
} finally { store.close(); rmSync(directory, { recursive: true, force: true }); }

}
main().catch(() => { console.error("REAL_CHAT_VISION_FAILED=true"); process.exitCode = 1; });
