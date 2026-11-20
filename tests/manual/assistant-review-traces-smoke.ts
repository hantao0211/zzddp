// Paid visual acceptance: generated pages and an invented archive only.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { HomeworkStore } from "../../src/server/homework/store";
import { HomeworkWorker } from "../../src/server/homework/worker";
import { VisionAI, readAIConfiguration } from "../../src/server/ai/provider";
import { readReviewPolicy } from "../../src/domain/review-policy";
async function main() {
  const photos = process.env.REVIEW_SYNTHETIC_PHOTOS || ""; assert.ok(photos.endsWith("/synthetic-review-photos"));
  const directory = mkdtempSync(join(tmpdir(), "xiaobu-synthetic-review-"));
  const store = new HomeworkStore(directory, Date.now, readReviewPolicy({ ASSISTANT_REVIEW_TRACE_POLICY: "1" })), date = "2026-11-16";
  let worker: HomeworkWorker | undefined;
  try {
    function record(kind: "memo" | "homework", label: string, result: (fileId: string) => unknown) {
      const bytes = kind === "homework" ? readFileSync(join(photos, label + ".png")) : Buffer.from("synthetic memo");
      const u = store.begin({ date, kind, files: [{ name: `synthetic-${label}.png`, size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }] });
      writeFileSync(join(directory, "originals", u.files[0].id), bytes); store.stored(u.files[0].id, "image/png");
      store.setPages(u.files[0].id, [{ id: u.files[0].id + "-p1", file_id: u.files[0].id, number: 1 }]); store.finalize(u.id);
      const job = store.claim()!; store.recognized(job, result(u.files[0].id + "-p1"), ["语文"], false, 0, "Synthetic trace fixture"); store.db.exec("UPDATE jobs SET status='done'"); return u;
    }
    const memo = record("memo", "memo", fileId => ({ date, readable: true, assignments: [
      { subject: "语文", title: "预习第7课", requirement: "预习第7课第10页，无额外书面要求", format: "reading", evidence: [{ fileId, page: 1, excerpt: "预7" }] },
      { subject: "语文", title: "复习第8课", requirement: "复习第8课第12页，无额外书面要求", format: "reading", evidence: [{ fileId, page: 1, excerpt: "复8" }] },
    ], uncertainties: [] }));
    const marked = record("homework", "marked", fileId => ({ pages: [{ fileId, readable: true, subject: "语文", book: "模拟语文书", printedPage: "10", content: "第7课海边晨光，第10页的完整课文。", uncertainties: [] }] }));
    const blank = record("homework", "blank", fileId => ({ pages: [{ fileId, readable: true, subject: "语文", book: "模拟语文书", printedPage: "12", content: "第8课林间小路，第12页的完整课文。", uncertainties: [] }] }));
    const originals = [memo, marked, blank].map(u => store.upload(u.id)!.result);
    const filePaths = new Map([[marked.files[0].id + "-p1", join(photos, "marked.png")], [blank.files[0].id + "-p1", join(photos, "blank.png")]]);
    worker = new HomeworkWorker(store, () => new VisionAI(readAIConfiguration()), { async convert() { return []; }, images(pages) { return pages.map(p => ({ fileId: p.id, mimeType: "image/png", base64: readFileSync(filePaths.get(p.id)!).toString("base64") })); } });
    store.bump(date); await worker.tick(); const day = store.snapshot(date);
    console.log(JSON.stringify({ stage: "visual-rule", status: day.status, tasks: day.report?.tasks.map(t => ({ coverage: t.coverage, activity: t.reviewActivity?.status })) }));
    assert.ok(day.report); const [first, second] = day.report.tasks;
    assert.equal(first.coverage, "complete"); assert.equal(first.reviewActivity?.status, "marked");
    assert.equal(second.coverage, "complete"); assert.equal(second.reviewActivity?.status, "blank");
    assert.ok(day.report.tasks.every(t => !t.missing.length));
    assert.ok(!day.report.uncertainties.some(s => /证明.*(?:阅读|复习).*完成/.test(s)));
    for (let i = 0; i < 3; i++) assert.equal(store.upload([memo, marked, blank][i].id)!.result, originals[i]);
    console.log("REVIEW_TRACES_AI_OK=true actual-visual-marks,blank-page,material-separate,reading-allowed,no-invented-extra-requirements,raw-records-unchanged");
  } finally { worker?.stop(); store.close(); rmSync(directory, { recursive: true, force: true }); }
}
void main().catch(e => { console.error("REVIEW_TRACES_AI_FAILED", e instanceof assert.AssertionError ? e.message : e?.code || "CHECK_ERROR"); process.exitCode = 1; });
