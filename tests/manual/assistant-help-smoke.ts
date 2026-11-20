// Paid acceptance check with an empty synthetic archive and generic help questions only.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HomeworkStore } from "../../src/server/homework/store";
import { HomeworkConversation } from "../../src/server/homework/conversation";
import { VisionAI, readAIConfiguration } from "../../src/server/ai/provider";
async function main() {
  const directory = mkdtempSync(join(tmpdir(), "xiaobu-empty-help-smoke-")), store = new HomeworkStore(directory);
  try {
    const conversation = new HomeworkConversation(store), ai = new VisionAI(readAIConfiguration());
    const help = await conversation.answer(ai, { question: "我不知道怎么上传今天的备忘录和作业，你一步一步教我。", history: [] }, "a".repeat(64));
    assert.equal(help.changeStatus, "none"); assert.ok(help.answer.includes("拍备忘录")); assert.ok(help.answer.includes("交作业"));
    const grading = await conversation.answer(ai, { question: "你能直接帮我批改整份作业，并保存每道题的对错吗？", history: [] }, "a".repeat(64));
    assert.equal(grading.changeStatus, "none"); assert.ok(!grading.answer.includes("系统边界"));
    assert.match(grading.answer, /尚未|还没|暂时|未接通|未上线|未开放|没有接通/);
    assert.deepEqual(grading.sourceMaterialIds, []);
    console.log("ASSISTANT_HELP_AI_OK=true real-controls,clear-grading-status,no-fake-action");
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
}
void main().catch(() => { console.error("ASSISTANT_HELP_AI_CHECK_FAILED"); process.exitCode = 1; });
