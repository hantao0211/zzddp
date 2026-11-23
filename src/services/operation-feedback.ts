/** Foreground writes only: polling, searches and AI previews must stay quiet. */
export type OperationLabels = {pending: string; success: string};
export type OperationFeedback = {id: number; phase: "pending" | "success" | "error"; message: string};
const listeners = new Set<(event: OperationFeedback | null) => void>();
let sequence = 0, epoch = 0, listening = false;
const emit = (event: OperationFeedback | null) => listeners.forEach(listener => listener(event));
export function resetOperationFeedback() { epoch++; emit(null); }
function listenForSession() {
  if (!listening && typeof window !== "undefined") {
    listening = true; window.addEventListener("xiaobu:session-changed", resetOperationFeedback);
  }
}
export function subscribeOperationFeedback(listener: (event: OperationFeedback | null) => void) {
  listenForSession(); listeners.add(listener); return () => { listeners.delete(listener); };
}
export function operationLabels(path: string, method: string): OperationLabels | null {
  if (["GET", "HEAD"].includes(method.toUpperCase())) return null;
  const p = path.replace(/^\/assistant-api\//, "").split("?")[0];
  if (/^reading\/logs\/[^/]+$/.test(p) && method.toUpperCase() === "DELETE") return {pending: "正在删除阅读记录…", success: "阅读记录已删除，阅读进度已更新。"};
  if (/^reading\/rewards\/[^/]+$/.test(p) && method.toUpperCase() === "DELETE") return {pending: "正在删除商品…", success: "商品已删除，已有兑换记录和约定保留。"};
  if (p === "reading/logs") return {pending: "正在保存阅读，请稍候…", success: "阅读已保存，AI评价在后台进行。"};
  if (/^reading\/logs\/[^/]+\/retry$/.test(p)) return {pending: "正在提交评价重试…", success: "已提交重试，打卡记录仍保留。"};
  if (/^reading\/books(?:\/[^/]+(?:\/finished)?)?$/.test(p)) return {pending: "正在保存书籍…", success: "书籍信息已保存。"};
  if (/^reading\/activities(?:\/[^/]+)?$/.test(p)) return {pending: "正在提交活动记录…", success: "活动记录已更新，可在成长页查看。"};
  if (/^reading\/redemptions(?:\/[^/]+)?$/.test(p)) return {pending: "正在提交兑换操作，请勿重复点击…", success: "兑换记录已更新，请查看申请状态。"};
  if (/^reading\/(?:wishes|rewards)(?:\/[^/]+(?:\/(?:icon|withdraw))?)?$/.test(p)) return {pending: "正在保存心愿商城信息…", success: "心愿商城信息已保存。"};
  if (/^reading\/(?:rules|homework-rules|activity-rules|student-profile)$/.test(p)) return {pending: "正在保存设置…", success: "设置已保存。"};
  if (/^learning\/(?:day-plan|day-plan-rules|task-completion|tasks\/[^/]+(?:\/[^/]+)?|reports\/[^/]+|grading\/[^/]+(?:\/[^/]+)?)$/.test(p)) return {pending: "正在处理作业操作…", success: "操作已保存，作业状态会自动更新。"};
  // Generation and grading acknowledge a queued job, not finished AI work.
  if (/^learning\/practice\/(?:materials|files|index-jobs)(?:\/[^/]+)*$/.test(p)) return {pending: "正在保存课程资料操作…", success: "课程资料操作已提交，可查看整理进度。"};
  if (/^learning\/practice\/(?:generate|items|scopes)(?:\/[^/]+)*$/.test(p)) return {pending: "正在提交练习操作…", success: "练习操作已提交，可在练习中查看进度。"};
  if (/^learning\/(?:retry-day|uploads\/[^/]+\/(?:date|retry|retry-grading))$/.test(p)) return {pending: "正在提交资料更新…", success: "资料操作已提交，后台会继续处理。"};
  if (/^clarifications(?:\/[^/]+\/undo)?$/.test(p)) return {pending: "正在保存作业说明…", success: "作业说明已保存，小步会重新整理。"};
  if (p === "memo-entries/update") return {pending: "正在保存作业清单…", success: "作业清单已保存，小步会重新整理。"};
  if (p === "profile/avatar") return {pending: "正在保存表情…", success: "新表情已保存。"};
  if (/^(?:admin\/(?:accounts(?:\/[^/]+)?|password|homework-quota|limits|legacy-access)|memories\/[^/]+\/revoke)$/.test(p)) return {pending: "正在保存家庭设置…", success: "家庭设置已保存。"};
  return null;
}
export async function withOperationFeedback<T>(labels: OperationLabels | null, work: () => Promise<T>): Promise<T> {
  if (!labels) return work();
  listenForSession(); const id = ++sequence, startedEpoch = epoch;
  emit({id, phase: "pending", message: labels.pending});
  try {
    const result = await work();
    if (startedEpoch === epoch) emit({id, phase: "success", message: labels.success});
    return result;
  } catch (error) {
    if (startedEpoch === epoch) emit({id, phase: "error", message: error instanceof Error ? error.message : "操作未完成，请稍后重试。"});
    throw error;
  }
}
