import type { DailyReport } from "./homework";
import { usesReviewTraces, type ReviewPolicy } from "./review-policy";

/** A named unit/lesson is a scope. Its page list and the child's review method are not extra deliverables. */
export function obsoleteReviewScopeConcern(text: string) {
  return /未(?:写明|说明|注明|明确|指定)|没有(?:说明|明确|指定)|不详/u.test(text)
    && /页码|课文|范围|方式/u.test(text)
    && !/缺少|缺页|漏拍|未拍|没拍|裁切|截断|遮挡|模糊|看不清|抄写|默写|笔记|(?:朗读|背诵).{0,8}(?:遍|次)/u.test(text);
}
export function reviewConclusion(task: DailyReport["tasks"][number], policy?: ReviewPolicy | null): DailyReport["tasks"][number] {
  if (!policy || !usesReviewTraces(task) || task.writtenCompletion || task.reviewActivity?.status !== "marked" || !task.evidence.length) return task;
  const numbers = "[一二三四五六七八九十百〇零两0-9]+";
  const namedScope = new RegExp(`(?:第\\s*${numbers}\\s*(?:课|单元)|单元\\s*${numbers}|语文园地)`, "u").test(`${task.title} ${task.requirement}`);
  if (!namedScope) return task;
  const missing = task.missing.filter(text => !obsoleteReviewScopeConcern(text));
  // A specific missing page or unclear photo still blocks full coverage. Never invent completeness from marks alone.
  if (missing.length === task.missing.length) return task;
  return { ...task, missing, coverage: missing.length ? task.coverage : "complete" };
}
export function reviewReportConclusion(report: DailyReport, policy?: ReviewPolicy | null): DailyReport {
  const tasks = report.tasks.map(task => reviewConclusion(task, policy));
  const resolved = new Set(report.tasks.flatMap((task, i) => task.missing.filter(text => !tasks[i].missing.includes(text))));
  return { ...report, tasks, uncertainties: report.uncertainties.filter(text => !resolved.has(text)) };
}
