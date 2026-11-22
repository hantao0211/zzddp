import { reviewConclusion } from "./review-conclusion";
import type { DailyReport, HomeworkSnapshot } from "./homework";
import type { z } from "zod";
import type { EvidenceSchema } from "./ai-contracts";

type Evidence = z.infer<typeof EvidenceSchema>;
export type TaskEvidencePhoto = { pageId: string; fileId: string; name: string; number: number; excerpts: string[]; issues: string[] };
/** Resolve only real pages from this date and the right kind of upload; never guess a photo by subject. */
export function homeworkTaskDetail(snapshot: HomeworkSnapshot, original: DailyReport["tasks"][number]) {
  const task = reviewConclusion(original, snapshot.reviewPolicy);
  function resolve(evidence: Evidence[], kind: "homework" | "memo") {
    const resolved = new Map<string, TaskEvidencePhoto>();
    const unavailable = new Set<string>();
    for (const ev of evidence) {
      const owner = snapshot.uploads.filter(u => u.date === snapshot.date && u.kind === kind && (kind !== "memo" || u.id === snapshot.report?.memoId)).flatMap(u => u.files.filter(f => f.stored).flatMap(f => f.pages.map(p => ({ upload: u, file: f, page: p })))).find(p => p.page.id === ev.fileId);
      if (!owner) { unavailable.add(ev.fileId); continue; }
      const photo = resolved.get(ev.fileId) || { pageId: owner.page.id, fileId: owner.file.id, name: owner.file.name, number: owner.page.number, excerpts: [], issues: owner.upload.issues.filter(i => i.pageId === ev.fileId).map(i => i.message) };
      if (!photo.excerpts.includes(ev.excerpt)) photo.excerpts.push(ev.excerpt);
      resolved.set(ev.fileId, photo);
    }
    return { photos: [...resolved.values()], unavailable: unavailable.size };
  }
  return { requirement: task.requirement, concerns: [...new Set(task.missing.filter(s => s.trim()))], homework: resolve(task.evidence, "homework"), memo: resolve(task.memoEvidence, "memo"), parts: task.writtenCompletion?.parts.filter(p => p.status !== "answered") || [] };
}
