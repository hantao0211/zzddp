import { createHash } from "node:crypto";
import { WrittenInspectionSchema, type WrittenCompletion } from "../../domain/written-completion";
import { isCorrectionSignTask } from "../../domain/submission-policy";
import type { DailyReport } from "../../domain/homework";
import type { HomeworkStore } from "./store";
type Task = DailyReport["tasks"][number];
export type WrittenPageInput = { fileId: string; page: number; printedPage: string | null };
/** Same immutable task/page inputs as the worker; no AI or database writes on reads. */
export function existingWrittenInspection(store: HomeworkStore, task: Task, pages: WrittenPageInput[]) {
  if (!pages.length || pages.length > 6 || new Set(pages.map(p => p.fileId)).size !== pages.length) return null;
  const read = (batch: WrittenPageInput[], single = false) => {
    const prefix = single ? "written-completion:single-page-v1:" : isCorrectionSignTask(task) ? "written-completion:correction-sign-v1:" : "written-completion:v2:";
    const key = prefix + createHash("sha256").update(JSON.stringify({title:task.title,requirement:task.requirement,subject:task.subject,pages:batch})).digest("hex");
    const row = store.db.prepare("SELECT result FROM analysis_cache WHERE key=?").get(key) as {result:string} | undefined;
    if (!row) return null;
    let value;
    try { value = WrittenInspectionSchema.safeParse(JSON.parse(row.result)); } catch { return null; }
    if (!value.success) return null;
    const parts = value.data.parts;
    if (parts.some(p => !batch.some(page => page.fileId === p.evidence.fileId && (p.evidence.page === null || p.evidence.page === page.page))) || new Set(parts.map(p => `${p.evidence.fileId}:${p.label}`)).size !== parts.length) return null;
    return value.data;
  };
  const full = read(pages);
  if (full) return full;
  const single = pages.map(p => read([p], true));
  if (single.some(value => !value)) return null;
  const results = single.filter((value): value is NonNullable<typeof value> => !!value);
  const parts: WrittenCompletion["parts"] = results.flatMap(value => value.parts);
  if (parts.length > 160) return null;
  return {scopeComplete:results.every(value => value.scopeComplete),parts,reason:results.filter(value => value.parts.length || !value.scopeComplete).map(value => value.reason).join("；").slice(0,1500) || "照片中暂未找到本次要求作答的题目。"};
}
