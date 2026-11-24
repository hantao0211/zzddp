import { taskSubmission } from "./task-submission";
import type { HomeworkSnapshot } from "./homework";
import { z } from "zod";
import { homeworkTaskDetail } from "./homework-task-detail";
import { homeworkSummary } from "./homework-summary";
import { needsWrittenCompletionUpdate } from "./written-completion";
import { needsReviewTraceUpdate } from "./review-policy";

export const HOMEWORK_DAILY_STEPS = 1;
export const HomeworkRewardRulesSchema = z.object({ dailyPoints: z.number().int().min(0).max(100) }).strict();
export type HomeworkRewardRules = z.infer<typeof HomeworkRewardRulesSchema>;
export type HomeworkRewardStatus = { points: number; eligible: boolean; earned: boolean };
export function isHomeworkDayComplete(snapshot: HomeworkSnapshot): boolean {
  const report = snapshot.report;
  if (snapshot.pending || (snapshot.status !== "processed" && snapshot.status !== "needs_rescan") || !report?.memoId || report.date !== snapshot.date || !report.tasks.length || report.unclassified.length) return false;
  const memo = snapshot.uploads.find(upload => upload.kind === "memo");
  if (!memo || memo.id !== report.memoId || memo.status !== "processed") return false;
  if (report.tasks.some(task => taskSubmission(task) !== "self" && (needsWrittenCompletionUpdate(task, snapshot.writtenCompletionEnabled) || needsReviewTraceUpdate(task, snapshot.reviewPolicy)))) return false;
  // A superseded or optional upload can still need attention after every current task is done.
  if (snapshot.status === "needs_rescan") {
    if (snapshot.memoEdits?.length) return false;
    for (const task of report.tasks) {
      if (taskSubmission(task) === "self" && task.selfCompletion) continue;
      const evidence = homeworkTaskDetail(snapshot, task).homework;
      if (!evidence.photos.length || evidence.unavailable) return false;
    }
  }
  const rows = homeworkSummary(snapshot)?.rows;
  return !!rows?.length && rows.every(row => row.photo.tone === "good" && row.activity.tone === "good");
}
