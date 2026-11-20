// Paid acceptance uses generated arithmetic pages in an isolated archive only.
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { HomeworkStore } from "../../src/server/homework/store";
import { HomeworkGrader } from "../../src/server/homework/grader";
import { DailyReportSchema } from "../../src/domain/homework";
import { VisionAI, readAIConfiguration } from "../../src/server/ai/provider";
async function main() {
  const photos = process.env.GRADING_SYNTHETIC_PHOTOS || ""; assert.ok(photos.endsWith("/synthetic-written-photos"));
  const directory = mkdtempSync(join(tmpdir(), "xiaobu-synthetic-grade-")), store = new HomeworkStore(directory, Date.now, null, false, true);
  const paths = new Map<string, string>();
  try {
    for (const [date, label] of [["2026-11-16", "done"], ["2026-11-17", "incomplete"]]) {
      const bytes = readFileSync(join(photos, label + ".png"));
      const u = store.begin({ date, kind: "homework", files: [{ name: `synthetic-${label}.png`, size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }] });
      const file = u.files[0].id, id = file + "-p1"; store.stored(file, "image/png"); store.setPages(file, [{ id, file_id: file, number: 1 }]); store.finalize(u.id); const job = store.claim()!;
      store.recognized(job, { pages: [{ fileId: id, subject: "数学", readable: true, book: "模拟数学练习", printedPage: "12", content: "第1、2题算式", uncertainties: [] }] }, ["数学"], false, 0, "Synthetic"); store.db.exec("UPDATE jobs SET status='done'"); paths.set(id, join(photos, label + ".png"));
      const report = DailyReportSchema.parse({ date, memoId: null, updatedAt: "", uncertainties: [], unassigned: [], tasks: [{ id: `synthetic-${label}`, subject: "数学", title: "数学第12页", requirement: "完成第12页第1、2题", format: "written", memoEvidence: [], evidence: [{ fileId: id, page: 1, excerpt: "模拟作答" }], coverage: "complete", missing: [] }] });
      store.transaction(() => store.grading.queueDay(date, report));
    }
    const originals = store.db.prepare("SELECT result FROM uploads ORDER BY rowid").all();
    const grader = new HomeworkGrader(store, () => ({ async run(task, schema, metadata, images) { const value = await new VisionAI(readAIConfiguration()).run(task, schema, metadata, images); if (task === "grade_homework") console.log(JSON.stringify({ stage: "synthetic-evidence", pages: (value as { questions: { evidence: unknown }[] }).questions.map(q => q.evidence) })); return value; } }), { images(pages) { return pages.map(p => ({ fileId: p.id, mimeType: "image/png", base64: readFileSync(paths.get(p.id)!).toString("base64") })); } });
    await Promise.all([grader.tick(), grader.tick()]);
    const wrong = store.grading.summary("2026-11-16"), blank = store.grading.summary("2026-11-17");
    console.log(JSON.stringify({ stage: "synthetic-grading", wrong, blank }));
    assert.equal(wrong.wrong, 1); assert.equal(wrong.correct, 1); assert.equal(wrong.failed, 0); assert.equal(wrong.pending, 0);
    assert.equal(blank.correct, 1); assert.equal(blank.blank, 1); assert.equal(blank.wrong, 0); assert.equal(blank.pending, 0);
    const book = store.grading.mistakes("数学"); assert.equal(book.total, 1); assert.equal(book.items[0].question.studentAnswer, "6"); assert.equal(book.items[0].question.expectedAnswer, "5");
    assert.ok(book.items[0].question.causeExplanation); assert.ok(book.items[0].question.nextStep);
    assert.deepEqual(store.db.prepare("SELECT result FROM uploads ORDER BY rowid").all(), originals);
    console.log("GRADING_AI_OK=true correct,wrong,blank,blind-independent-solve,automatic-book,cause,next-step,raw-unchanged,synthetic-only");
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
}
void main().catch(error => { console.error("GRADING_AI_FAILED", error instanceof assert.AssertionError ? error.message : error?.code || "CHECK_ERROR"); process.exitCode = 1; });
