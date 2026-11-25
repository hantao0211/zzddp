import { sourceHash, effectiveMemo } from "./memo-context";
import type { HomeworkStore } from "./store";
import type { UploadTarget } from "../../domain/homework";

type SavedTarget = UploadTarget & { memoId: string; entryIndex: number; sourceHash: string; priorPageIds?: string[] };
// Keep the original memo identity: task array positions can change after a correction.
export function currentUploadTarget(store: HomeworkStore, date: string, taskId: string): SavedTarget | null {
  const memo = store.uploads(date).filter(u => u.kind === "memo").at(-1);
  if (!memo?.result) return null;
  const context = effectiveMemo(store, memo);
  const entries = context.result.assignments.flatMap((a, i) => a.subject ? [{ assignment: a, index: i }] : []);
  const selected = entries.find((_, i) => `${memo.id}:task:${i}` === taskId);
  if (!selected?.assignment.subject) return null;
  const a = selected.assignment;
  return { taskId, subject: a.subject!, title: a.title, requirement: a.requirement, format: a.format, memoId: memo.id, entryIndex: selected.index, sourceHash: sourceHash(context.original.assignments[selected.index]) };
}
export function readUploadTarget(store: HomeworkStore, uploadId: string): SavedTarget | null {
  const row = store.db.prepare("SELECT payload FROM upload_targets WHERE upload_id=?").get(uploadId) as { payload: string } | undefined;
  return row ? JSON.parse(row.payload) as SavedTarget : null;
}
export function resolveUploadTarget(store: HomeworkStore, uploadId: string): UploadTarget | null {
  const saved = readUploadTarget(store, uploadId), upload = store.upload(uploadId);
  if (!saved || !upload) return null;
  const memo = store.uploads(upload.date).filter(u => u.kind === "memo").at(-1);
  if (memo?.id !== saved.memoId || !memo.result) return null;
  const context = effectiveMemo(store, memo);
  if (!context.original.assignments[saved.entryIndex] || sourceHash(context.original.assignments[saved.entryIndex]) !== saved.sourceHash) return null;
  const indices = context.result.assignments.flatMap((a, i) => a.subject ? [i] : []);
  const index = indices.indexOf(saved.entryIndex);
  return index < 0 ? null : currentUploadTarget(store, upload.date, `${memo.id}:task:${index}`);
}
