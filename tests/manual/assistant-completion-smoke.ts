// Actual model, isolated invented homework only. No family archive or conversation is read.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HomeworkStore } from "../../src/server/homework/store";
import { HomeworkConversation } from "../../src/server/homework/conversation";
import { VisionAI, readAIConfiguration } from "../../src/server/ai/provider";
async function main() {
  const directory = mkdtempSync(join(tmpdir(), "xiaobu-synthetic-completion-"));
  const store = new HomeworkStore(directory), date = "2026-11-17";
  try {
    const upload = store.begin({ date, kind: "memo", files: [{ name: "synthetic-memo.png", size: 10, sha256: "a".repeat(64) }] });
    store.stored(upload.files[0].id, "image/png"); store.finalize(upload.id); const job = store.claim()!;
    store.recognized(job, { date, readable: true, assignments: [{ subject: "语文", title: "复习第8课", requirement: "复习语文第8课，备忘录旁有勾选标记。", format: "reading", evidence: [{ fileId: upload.files[0].id + "-p1", page: 1, excerpt: "语文：复习8（√）" }] }], uncertainties: ["复习内容已明确，但照片和勾选无法证明口头复习是否完成。"] }, ["语文"], false, 0, "Synthetic completion fixture");
    const reply = await new HomeworkConversation(store).answer(new VisionAI(readAIConfiguration()), { studyDate: date, history: [], question: "复习第8课，还不能确定是为什么？" }, "a".repeat(64));
    assert.match(reply.answer, /照片|勾选|标记/);
    assert.match(reply.answer, /不能|无法|不代表|不等于|还不能|没法/);
    assert.ok(!/照片(?:只)?(?:表示|证明|说明)(?:你)?(?:已经|已)?复习完/.test(reply.answer));
    assert.ok(!/担心.*(?:复习|掌握).*(?:到位|不好)/.test(reply.answer));
    assert.equal(reply.proposal, undefined);
    console.log("ASSISTANT_COMPLETION_AI_OK=true explains-system-uncertainty,no-photo-completion-claim,no-fabricated-learning-concern");
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
}
void main().catch(e => { console.error("ASSISTANT_COMPLETION_AI_FAILED", e instanceof assert.AssertionError ? "ASSERTION" : e?.code || "CHECK_ERROR"); process.exitCode = 1; });
