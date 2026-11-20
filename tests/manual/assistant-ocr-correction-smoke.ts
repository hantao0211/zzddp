// Real-model acceptance with an invented archive; no family files or chats are read.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HomeworkStore } from "../../src/server/homework/store";
import { HomeworkConversation } from "../../src/server/homework/conversation";
import { VisionAI, readAIConfiguration } from "../../src/server/ai/provider";
async function main() {
  const directory = mkdtempSync(join(tmpdir(), "xiaobu-synthetic-ocr-"));
  const store = new HomeworkStore(directory), date = "2026-11-15", owner = "a".repeat(64);
  try {
    const memo = store.begin({ date, kind: "memo", files: [{ name: "synthetic.png", size: 1, sha256: "a".repeat(64) }] });
    store.stored(memo.files[0].id, "image/png"); store.finalize(memo.id);
    store.recognized(store.claim()!, { date, readable: true, assignments: [{ subject: "语文", title: "复7", requirement: "复7，含义未明", format: "other", evidence: [{ fileId: memo.files[0].id + "-p1", page: 1, excerpt: "复7" }] }], uncertainties: [] }, ["语文"], false, 0, "Synthetic OCR fixture");
    const original = store.upload(memo.id)!.result, service = new HomeworkConversation(store);
    const quote = "复七就是语文复习第27课。";
    service.confirm(service.propose(service.context(date), { entryId: memo.id + ":entry:0", changes: { subject: null, title: "复习第27课", requirement: "你说明复七就是语文复习第27课，图片对应第46—47页。", format: null }, userQuote: quote, resolves: [] }, owner, [quote]).id, owner);
    const ai = new VisionAI(readAIConfiguration());
    const question = "孩子写得有点潦草，被误识别成复7，实际上写的是复27。这是认错了字，不是复7代表第27课。";
    const first = await service.answer(ai, { studyDate: date, question, history: [] }, owner);
    assert.ok(first.proposal, "A corrected reading should update the misleading requirement");
    assert.equal(first.memoriesSaved.length, 0); assert.equal(first.followUpQuestion, null);
    assert.match(first.proposal.after.requirement, /复27/);
    assert.match(first.proposal.after.requirement, /误|漏|错/);
    assert.match(first.proposal.after.requirement, /46/);
    assert.ok(!/复7(?:表示|就是|代表)复习/.test(first.proposal.after.requirement));
    service.confirm(first.proposal.id, owner);
    const second = await service.answer(ai, { studyDate: date, question: "下次备忘录清楚写着复28，会不会还当成第27课？", history: [] }, owner);
    assert.equal(second.proposal, undefined); assert.equal(second.memoriesSaved.length, 0);
    assert.ok(/28|当前|本次/.test(second.answer)); assert.ok(/不会|不应|不能|不再/.test(second.answer));
    assert.equal(service.memories.forRecognition().rules.length, 0);
    assert.equal(service.memories.forRecognition().corrections.length, 1);
    assert.equal(service.context(date).familyNotes.filter(n => n.current !== false).length, 1);
    assert.equal(store.upload(memo.id)!.result, original);
    console.log("ASSISTANT_OCR_AI_OK=true preview,corrected-reading,no-number-alias,next-number-preserved,history-auditable,original-unchanged");
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
}
void main().catch(e => { console.error("ASSISTANT_OCR_AI_FAILED", e instanceof assert.AssertionError ? e.message : e?.code || "CHECK_ERROR"); process.exitCode = 1; });
