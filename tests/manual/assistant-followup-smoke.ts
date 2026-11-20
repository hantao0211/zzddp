// Paid conversational acceptance, using an isolated invented archive only.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { HomeworkStore } from "../../src/server/homework/store";
import { HomeworkConversation } from "../../src/server/homework/conversation";
import { VisionAI, readAIConfiguration } from "../../src/server/ai/provider";
import type { ChatInput } from "../../src/domain/assistant";
async function main() {
  const directory = mkdtempSync(join(tmpdir(), "xiaobu-synthetic-followup-"));
  const store = new HomeworkStore(directory), date = "2026-11-17", owner = "a".repeat(64);
  const ai = new VisionAI(readAIConfiguration());
  function record(kind: "memo" | "homework", label: string, result: (pageId: string) => unknown) {
    const u = store.begin({ date, kind, files: [{ name: `synthetic-${label}.png`, size: 10, sha256: createHash("sha256").update(label).digest("hex") }] });
    store.stored(u.files[0].id, "image/png"); const page = { id: u.files[0].id + "-p1", file_id: u.files[0].id, number: 1 };
    store.setPages(u.files[0].id, [page]); store.finalize(u.id); const job = store.claim()!;
    store.recognized(job, result(page.id), ["语文"], false, 0, "Synthetic follow-up fixture");
    store.db.exec("UPDATE jobs SET status='done'"); return u.id;
  }
  try {
    const memo = record("memo", "memo", (fileId) => ({ date, readable: true, assignments: [{ subject: "语文", title: "语文预习", requirement: "备忘录写语：预习，未写具体篇目或页码。", format: "other", evidence: [{ fileId, page: 1, excerpt: "语：预习" }] }], uncertainties: ["语文预习具体是哪一课、哪几页不清楚"] }));
    record("homework", "chapter", (fileId) => ({ pages: [{ fileId, page: 1, subject: "语文", readable: true, title: "第6课：山中小记", content: "第6课山中小记，52—53页，有学生批注。", printedPage: "52—53", uncertainties: [] }] }));
    record("homework", "reading", (fileId) => ({ pages: [{ fileId, page: 1, subject: "语文", readable: true, title: "阅读园地", content: "阅读园地第60—61页，展示阅读短文和阅读提示。", printedPage: "60—61", uncertainties: [] }] }));
    const original = store.upload(memo)!.result;
    const conversation = new HomeworkConversation(store);
    const history: ChatInput["history"] = [
      { role: "user", content: "备忘录写预园，就是预习阅读园地，我拍照上传的那一张。" },
      { role: "assistant", content: "整理记录里有阅读园地第60—61页。它算语文预习这一项，还是另外一项作业？" },
    ];
    const question = "是语文预习的作业。";
    const first = await conversation.answer(ai, { studyDate: date, history, question }, owner);
    console.log(JSON.stringify({ stage: "short-confirmation", proposal: !!first.proposal, savedMemories: first.memoriesSaved.length, length: first.answer.length }));
    assert.ok(first.proposal, "Short confirmation must produce a preview in this unambiguous fixture");
    assert.match(first.proposal.after.requirement, /阅读园地/); assert.match(first.proposal.after.requirement, /60/);
    assert.ok(!/山中小记|52|哪一课|批改|等一会/.test(first.answer));
    assert.equal(first.followUpQuestion, null); assert.equal(first.memoriesSaved.length, 0);
    assert.equal(store.db.prepare("SELECT COUNT(*) AS n FROM clarifications").get()!.n, 0);
    const receipt = conversation.confirm(first.proposal.id, owner);
    history.push({ role: "user", content: question }, { role: "assistant", content: first.answer });
    const second = await conversation.answer(ai, { studyDate: date, history, question: "现在这项还不清楚吗？" }, owner);
    console.log(JSON.stringify({ stage: "already-clear", duplicateProposal: !!second.proposal, repeatedQuestion: !!second.followUpQuestion, length: second.answer.length }));
    assert.equal(second.proposal, undefined); assert.equal(second.followUpQuestion, null);
    assert.ok(!/批改|是不是第6课|哪一课|补充.*页码/.test(second.answer));
    assert.ok(/已|清楚|明确|不需要/.test(second.answer)); assert.ok(second.answer.length < 380);
    conversation.undo(receipt.id, owner);
    const pointer = await conversation.answer(ai, { studyDate: date, history: history.slice(0, 2), question: "预习的就是阅读园地那张图里拍的内容。" }, owner);
    console.log(JSON.stringify({ stage: "photo-pointer", proposal: !!pointer.proposal, savedMemories: pointer.memoriesSaved.length }));
    assert.ok(pointer.proposal); assert.match(pointer.proposal.after.requirement, /阅读园地/);
    assert.equal(pointer.memoriesSaved.length, 0);
    assert.equal(store.upload(memo)!.result, original);
    const teaching = "以后备忘录里的读加数字，就是阅读对应课文，后面的数字是课号。";
    const learned = await conversation.answer(ai, { studyDate: date, history: [], question: teaching }, owner);
    assert.ok(learned.memoriesSaved.some((m) => m.kind === "memo_abbreviation"));
    console.log("ASSISTANT_FOLLOWUP_AI_OK=true short-confirmation,immediate-preview,no-unrelated-grading,no-repeated-question,no-task-memory,reusable-rule-retained,original-unchanged");
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
}
void main().catch((e) => { console.error("ASSISTANT_FOLLOWUP_AI_FAILED", e instanceof assert.AssertionError ? e.message : e?.code || "CHECK_ERROR"); process.exitCode = 1; });
