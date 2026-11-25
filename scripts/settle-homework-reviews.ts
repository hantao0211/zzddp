// Run once after deploying the new grading policy. Without --apply this only reports counts.
import { DatabaseSync } from "node:sqlite";
import { GradingResultSchema, type GradingResult } from "../src/domain/grading";
import { settleReviewedQuestion } from "../src/domain/grading-decision";
import { reviewReadings } from "../src/server/homework/grading-readings";

const [path, flag] = process.argv.slice(2);
if (!path || (flag && flag !== "--apply")) throw new Error("Usage: settle-homework-reviews <database> [--apply]");
const apply = flag === "--apply";
const db = new DatabaseSync(path, { readOnly: !apply });
try {
  db.exec(apply ? "BEGIN IMMEDIATE" : "BEGIN");
  const byDate: Record<string, { correct: number; passedWithNote: number; clarified: number }> = {};
  for (const row of db.prepare("SELECT id,date,result FROM grading_runs WHERE active=1 AND status='done' AND result IS NOT NULL").all()) {
    const id = String(row.id), result = JSON.parse(String(row.result)) as GradingResult;
    const readings = reviewReadings(db, id, result);
    if (!readings) continue;
    const protectedIds = new Set(db.prepare("SELECT question_id FROM grading_reviews WHERE run_id=?").all(id).map(r => r.question_id));
    let changed = false;
    result.questions = result.questions.map(q => {
      if (q.verdict !== "uncertain" || protectedIds.has(q.id)) return q;
      const next = settleReviewedQuestion(q, readings[q.id] || []);
      if (next.verdict === q.verdict && next.explanation === q.explanation) return q;
      const category = next.verdict === "uncertain" ? "clarified" : next.verdict;
      if (category !== "correct" && category !== "passedWithNote" && category !== "clarified") return q;
      (byDate[String(row.date)] ??= { correct: 0, passedWithNote: 0, clarified: 0 })[category]++;
      changed = true;
      return next;
    });
    if (changed && apply) {
      GradingResultSchema.parse(result);
      db.prepare("UPDATE grading_runs SET result=? WHERE id=?").run(JSON.stringify(result), id);
    }
  }
  db.exec(apply ? "COMMIT" : "ROLLBACK");
  console.log(JSON.stringify({ apply, byDate }));
} finally { db.close(); }
