// Explicit paid smoke test. Uses synthetic records only; never opens the family archive.
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { HomeworkStore } from "../../src/server/homework/store";
import { HomeworkConversation } from "../../src/server/homework/conversation";
import { VisionAI, readAIConfiguration, AIServiceError } from "../../src/server/ai/provider";
import { HomeworkDialogueSchema } from "../../src/domain/ai-contracts";
async function main() {
const directory = mkdtempSync(join(tmpdir(), "xiaobu-dialogue-probe-"));
const store = new HomeworkStore(directory), date = "2026-11-18";
let wire: any;
const ai = new VisionAI(readAIConfiguration(), async (url, init) => {
  const response = await fetch(url, init);
  wire = await response.clone().json().catch(() => null);
  return response;
});
function record(kind: "memo" | "homework", label: string, result: (pageId: string) => unknown) {
  const u = store.begin({ date, kind, files: [{ name: `synthetic-${label}.png`, size: 10, sha256: createHash("sha256").update(label).digest("hex") }] });
  store.stored(u.files[0].id, "image/png");
  const page = { id: `${u.files[0].id}-p1`, file_id: u.files[0].id, number: 1 };
  store.setPages(u.files[0].id, [page]); store.finalize(u.id);
  const job = store.claim()!;
  store.recognized(job, result(page.id), [], false, 0, "Synthetic dialogue test");
  // This fixture tests dialogue, not the recognition/aggregation worker.
  store.db.exec("UPDATE jobs SET status='done'");
  return u.id;
}
try {
  const memo = record("memo", "memo", (pageId) => ({ date, readable: true, assignments: [
    { subject: "语文", title: "语文复习", requirement: "完成练习；复习内容不确定", format: "written", evidence: [{ fileId: pageId, page: 1, excerpt: "语文练习，复19" }] },
    { subject: "数学", title: "数学练习", requirement: "练习册第32页", format: "written", evidence: [{ fileId: pageId, page: 1, excerpt: "数学32页" }] },
  ], uncertainties: ["19是第19课还是第19页不确定"] }));
  const homework = record("homework", "homework", (fileId) => ({ pages: [{ fileId, page: 1, subject: "语文", readable: true, title: "语文练习", content: "课文第19课配套练习，学生已写部分题。", printedPage: "19", uncertainties: [] }] }));
  const photoDirectory = process.env.DIALOGUE_SYNTHETIC_IMAGE_DIRECTORY;
  if (photoDirectory && !photoDirectory.endsWith("/synthetic-dialogue-photos")) throw new Error("Only synthetic fixture images allowed");
  const conversation = new HomeworkConversation(store, photoDirectory ? { images(pages) { return pages.map((page) => ({ fileId: page.id, mimeType: "image/png", base64: readFileSync(join(photoDirectory, page.file_id === store.files(memo)[0].id ? "memo.png" : "homework.png")).toString("base64") })); } } : undefined);
  const originalMemo = store.upload(memo)!.result, originalHomework = store.upload(homework)!.result;
  const history = [{ role: "user" as const, content: "系统对语文作业有什么疑问？" }, { role: "assistant" as const, content: "识别记录里有复19，但19的含义还不确定。" }];
  for (const question of ["你你看作业就知道了，作业里面有19。", "你看看上传的作业，里面的19能确定是第19课吗？"]) {
    try {
      const reply = await conversation.answer(ai, { question, history, studyDate: date }, "a".repeat(64));
      console.log(JSON.stringify({ ok: true, changeStatus: reply.changeStatus, cites: reply.sourceMaterialIds.length, reviewPages: reply.photoReview.providedPages, mentions19: reply.answer.includes("19"), rawRecordUnchanged: store.upload(memo)!.result === originalMemo && store.upload(homework)!.result === originalHomework }));
    } catch (error) {
      let result: any; try { result = JSON.parse(wire?.choices?.[0]?.message?.content || ""); } catch {}
      const parsed = HomeworkDialogueSchema.safeParse(result);
      console.log(JSON.stringify({ ok: false, code: error instanceof AIServiceError ? error.code : "LOCAL_ERROR", schemaIssues: parsed.success ? [] : parsed.error.issues.map((i) => ({ path: i.path.join("."), code: i.code })), citationKinds: result?.sourceMaterialIds?.map((id: string) => id === memo || id === homework ? "upload" : store.db.prepare("SELECT id FROM pages WHERE id=?").get(id) ? "page" : "unknown") }));
    }
  }
} finally { store.close(); rmSync(directory, { recursive: true, force: true }); }

}
void main().catch(() => { console.error("SYNTHETIC_PROBE_FAILED"); process.exitCode = 1; });
