import type { GrowthRecap, SubjectRecap } from "../../domain/growth-recap";
import { isSignatureRecord } from "../../domain/grading-signature";
import type { PracticeStore } from "./store";

export function growthRecap(store: PracticeStore, start: string, end: string): GrowthRecap {
  const subjects = new Map<string, SubjectRecap>();
  function count(subject: string, verdict: string, complete: boolean) {
    const judged = verdict === "correct" || verdict === "wrong";
    if (!judged && verdict !== "uncertain" && verdict !== "passedWithNote") return;
    const row = subjects.get(subject) ?? { subject, judged: 0, correct: 0, denominator: 0, pending: 0 };
    if (judged) {
      row.judged++;
      if (complete) {
        row.denominator++;
        if (verdict === "correct") row.correct++;
      }
    } else row.pending++;
    subjects.set(subject, row);
  }
  // Active grading runs and current per-question results already contain confirmed parent edits.
  const homework = store.db.prepare(`SELECT json_extract(r.source,'$.subject') subject,
    json_extract(r.result,'$.scopeComplete') complete, q.value item
    FROM grading_runs r, json_each(r.result,'$.questions') q
    WHERE r.active=1 AND r.status='done' AND r.date BETWEEN ? AND ?`).iterate(start,end);
  for (const row of homework) {
    const q = JSON.parse(String(row.item));
    if (q.kind !== "subjective" && !isSignatureRecord(q)) count(String(row.subject || "待分科"),q.verdict,!!row.complete);
  }
  const exams = store.db.prepare(`SELECT json_extract(e.metadata,'$.subject') subject, q.verdict, q.payload,
    NOT EXISTS (SELECT 1 FROM exam_pages other WHERE other.exam_id=e.id AND (other.status!='done' OR other.coverage!='complete')) complete
    FROM exams e JOIN exam_pages p ON p.exam_id=e.id JOIN exam_questions q ON q.page_id=p.id
    WHERE json_extract(e.metadata,'$.date') BETWEEN ? AND ?`).iterate(start,end);
  for (const row of exams) {
    if (!isSignatureRecord(JSON.parse(String(row.payload)))) count(String(row.subject || "待分科"),String(row.verdict),!!row.complete);
  }
  const practice = store.db.prepare(`SELECT r.subject,json_extract(r.result,'$.verdict') verdict,
    json_extract(t.result,'$.scopeComplete') complete FROM practice_results r
    JOIN practice_tasks t ON r.practice_id=t.id AND r.version=t.version
    WHERE t.status='graded' AND r.date BETWEEN ? AND ?`).iterate(start,end);
  for (const row of practice) count(String(row.subject),String(row.verdict),!!row.complete);

  const reading = store.reading.db.prepare(`SELECT COUNT(DISTINCT book_id) books, COUNT(DISTINCT date) days,
    COALESCE(SUM(minutes),0) minutes FROM active_reading_logs WHERE date BETWEEN ? AND ?`).get(start,end) as Omit<GrowthRecap["reading"],"finished">;
  const marks = store.reading.db.prepare(`SELECT COUNT(DISTINCT target) n FROM audit
    WHERE action IN ('book-finished:true','book-status:finished') AND date(created_at,'+8 hours') BETWEEN ? AND ?`).get(start,end);
  return { subjects: [...subjects.values()].sort((a,b)=>b.judged-a.judged || a.subject.localeCompare(b.subject,"zh")),
    reading: {...reading, finished: Number(marks?.n)}, steps: store.reading.earnedSteps(start,end) };
}
