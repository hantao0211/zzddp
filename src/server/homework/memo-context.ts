import { createHash } from "node:crypto";
import { MemoRecognitionSchema } from "../../domain/ai-contracts";
import { ClarificationActionSchema, type ClarificationReceipt } from "../../domain/clarifications";
import type { DailyReport } from "../../domain/homework";
import type { HomeworkStore, UploadRow } from "./store";
export const sourceHash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export type NoteRow = { id: string; owner: string; date: string; memo_id: string; entry_index: number; source_hash: string; payload: string; created_at: string; undone_at: string | null };
export function effectiveMemo(store: HomeworkStore, upload: UploadRow, appliedIds?: ReadonlySet<string>) {
  const original = MemoRecognitionSchema.parse(JSON.parse(upload.result!));
  const result = structuredClone(original);
  const notes = (appliedIds === undefined
    ? store.db.prepare("SELECT * FROM clarifications WHERE memo_id=? AND undone_at IS NULL ORDER BY rowid").all(upload.id)
    : store.db.prepare("SELECT * FROM clarifications WHERE memo_id=? ORDER BY rowid").all(upload.id).filter(note => appliedIds.has(note.id as string))) as NoteRow[];
  const resolved = new Set<number>();
  const receipts: ClarificationReceipt[] = [];
  for (const note of notes) {
    const source = original.assignments[note.entry_index];
    if (!source || note.source_hash !== sourceHash(source)) { result.uncertainties.push("有一份家庭说明与当前识别版本不符，未自动采用。"); continue; }
    const payload = ClarificationActionSchema.parse(JSON.parse(note.payload));
    const assignment = result.assignments[note.entry_index];
    for (const field of ["subject", "title", "requirement", "format"] as const) {
      const change = payload.changes[field];
      if (change !== null) Object.assign(assignment, { [field]: change });
    }
    for (const index of payload.resolves) resolved.add(index);
    const entryId = `${upload.id}:entry:${note.entry_index}`;
    for (const receipt of receipts) if (receipt.entryId === entryId) receipt.current = false;
    receipts.push({ id: note.id, date: upload.date, entryId, current: true, requirement: assignment.requirement, userQuote: payload.userQuote, title: assignment.title, createdAt: note.created_at });
  }
  result.uncertainties = result.uncertainties.filter((_, i) => !resolved.has(i));
  return { original, result, receipts, unresolved: original.uncertainties.flatMap((text, index) => resolved.has(index) ? [] : [{ index, text }]) };
}

export function overlayMemoEdits(store: HomeworkStore, upload: UploadRow, report: DailyReport): string[] {
  const appliedIds = new Set(report.familyNotes.map(note => note.id));
  const effective = effectiveMemo(store, upload);
  report.familyNotes = effective.receipts;
  if (appliedIds.size === effective.receipts.length && effective.receipts.every(note => appliedIds.has(note.id))) return [];

  // Report task positions refer to the classified assignments at the time it was built.
  const applied = effectiveMemo(store, upload, appliedIds).result.assignments.flatMap((assignment, index) => assignment.subject ? [{ assignment, index }] : []);
  const revised: string[] = [];
  const fields = ["subject", "title", "requirement", "format"] as const;
  report.tasks = report.tasks.map((task, position) => {
    const source = applied[position];
    if (!source || task.id !== `${upload.id}:task:${position}` || fields.some(field => task[field] !== source.assignment[field])) return task;
    const { subject, title, requirement, format } = effective.result.assignments[source.index];
    if (!subject || (subject === task.subject && title === task.title && requirement === task.requirement && format === task.format)) return task;
    revised.push(task.id);
    const sameSubject = subject === task.subject;
    return { ...task, subject, title, requirement, format, evidence: sameSubject ? task.evidence : [], coverage: sameSubject ? task.coverage : "none", missing: [], writtenCompletion: null, reviewActivity: null, inferredMeaning: undefined, inferredScope: undefined, selectedSubmission: undefined };
  });
  return revised;
}
