import type { HomeworkSnapshot } from "./homework";
import { homeworkSummary } from "./homework-summary";
import { needsWrittenCompletionUpdate } from "./written-completion";
import { needsReviewTraceUpdate } from "./review-policy";

export const HOMEWORK_DAILY_STEPS = 1;
export type HomeworkRewardStatus = { points: number; eligible: boolean; earned: boolean };
export function isHomeworkDayComplete(snapshot: HomeworkSnapshot): boolean {
  const report = snapshot.report;
  if (snapshot.pending || snapshot.status !== "processed" || !report?.memoId || report.date !== snapshot.date || !report.tasks.length || report.unclassified.length) return false;
  const memo = snapshot.uploads.find(upload => upload.kind === "memo");
  if (!memo || memo.id !== report.memoId || memo.status !== "processed") return false;
  if (report.tasks.some(task => needsWrittenCompletionUpdate(task, snapshot.writtenCompletionEnabled) || needsReviewTraceUpdate(task, snapshot.reviewPolicy))) return false;
  const rows = homeworkSummary(snapshot)?.rows;
  return !!rows?.length && rows.every(row => row.photo.tone === "good" && row.activity.tone === "good");
}
