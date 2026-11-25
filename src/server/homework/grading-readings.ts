import type { DatabaseSync } from "node:sqlite";
import { GradingVerificationSchema, type GradingReading, type GradingResult } from "../../domain/grading";

export function reviewReadings(db: DatabaseSync, runId: string, result: GradingResult | null) {
  const pending = new Set(result?.questions.filter(q => q.verdict === "uncertain" || q.verdict === "passedWithNote").map(q => q.id));
  if (!pending.size || !result) return undefined;
  const stages = {
    verification: "grade-verify-blind-v2", focusOne: "grade-focus-blind-v2-one", focusTwo: "grade-focus-blind-v2-two",
  } as const;
  const readings: Record<string, GradingReading[]> = {};
  const lookup = db.prepare("SELECT result FROM analysis_cache WHERE key=?");
  for (const stage of Object.keys(stages) as (keyof typeof stages)[]) {
    const row = lookup.get(`${stages[stage]}:${result.version}:${runId}`) as { result: string } | undefined;
    if (!row) continue;
    const cached = GradingVerificationSchema.safeParse(JSON.parse(row.result));
    if (!cached.success) continue;
    for (const { questionId, studentAnswer, expectedAnswer, verdict, confidence, explanation } of cached.data.checks) {
      if (pending.has(questionId)) (readings[questionId] ??= []).push({ stage, studentAnswer, expectedAnswer, verdict, confidence, explanation });
    }
  }
  return readings;
}
