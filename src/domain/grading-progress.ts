import type { GradingBatchView } from "./grading";

/** A queued page may be paused for quota; it is not an active AI request. */
export function gradingProgressText(batches: Pick<GradingBatchView, "status" | "note">[], pending: number): string | null {
  if (!pending) return null;
  const quota = batches.filter(batch => batch.status === "queued" && batch.note.includes("今天的AI额度已用完")).length;
  const running = batches.filter(batch => batch.status === "running").length;
  const queued = batches.filter(batch => batch.status === "queued").length - quota;
  const parts: string[] = [];
  if (quota) parts.push(`${quota}页因AI额度用完而暂停，额度恢复后自动继续`);
  if (running) parts.push(`${running}页正在批改或复核`);
  if (queued) parts.push(`${queued}页排队或等待重试`);
  if (!parts.length) return `还有${pending}页等待处理，完成后会自动更新。`;
  return `${parts.join("；")}。${quota ? "原件已保存，不用重新上传。" : "完成后会自动更新。"}`;
}
