import { z } from "zod";

export const StudyTraceSchema = z.object({
  state: z.enum(["marked", "blank", "unclear"]),
  description: z.string().trim().min(1).max(700),
}).strict();
export const StudyTraceInspectionSchema = z.object({ pages: z.array(z.object({ fileId: z.string(), readable: z.boolean(), trace: StudyTraceSchema }).strict()).min(1).max(6) }).strict();
export const ReviewActivitySchema = z.object({ status: z.enum(["marked", "blank", "unclear", "missing"]), reason: z.string().max(1500) }).strict();
export type StudyTrace = z.infer<typeof StudyTraceSchema>;
export type ReviewPolicy = { version: "review-traces-v1"; description: string };
export function readReviewPolicy(env: Record<string, string | undefined> = process.env): ReviewPolicy | null {
  const flag = env.ASSISTANT_REVIEW_TRACE_POLICY;
  if (flag === undefined || flag === "0") return null;
  if (flag !== "1") throw new Error("Invalid review trace policy");
  return { version: "review-traces-v1", description: "家庭确认：没有额外书面要求的预习、复习，按对应页面上的圈画、批注或相关练习等学习痕迹判断。可见痕迹记为已做；对应页面清晰且范围完整、没有任何动笔痕迹记为未做。不额外要求笔记、朗读或背诵证明。看不清或未拍到不直接记为未做；老师明确布置的书面或口头要求仍需分别检查。该判断不代表已掌握或答案正确。" };
}
export function usesReviewTraces(task: { title: string; requirement: string }) {
  const text = `${task.title} ${task.requirement}`;
  if (!/预习|复习|温习|\bpreview\b|\breview\b/i.test(text)) return false;
  // An explicitly assigned written/oral deliverable has its own requirements.
  const assigned = text.replace(/(?:无需|不需要|没有要求|未要求|不要求|不用|不必|没要求|未布置)[^，。；;\n]*/gu, "");
  return !/抄写|默写|誊写|(?:记|写).{0,5}笔记|写.{0,5}预习单|练习册|作文|写作|完成.{0,18}(?:练习|习题|作业|第.{0,8}题)|做.{0,8}(?:题|页)|写.{0,8}(?:遍|字|句|段|篇)|(?:背诵|朗读).{0,8}(?:遍|次)/u.test(assigned);
}

export function obsoleteReadingProofConcern(text: string) {
  return /照片|纸面|图片|圈画|批注/.test(text) && /不能|无法|不足以|难以/.test(text) && /预习|复习|温习/.test(text) && !/朗读任务|背诵任务/.test(text) && /完成|过程|掌握/.test(text) && !/缺页|缺少|未拍到|看不清|模糊|抄写|默写|第.{0,8}题/.test(text);
}
export function needsReviewTraceUpdate(task: { title: string; requirement: string; reviewActivity?: unknown }, policy?: ReviewPolicy | null) {
  return !!policy && !task.reviewActivity && usesReviewTraces(task);
}
export function reviewActivityLabel(task: { coverage: string; reviewActivity?: { status: string } | null }) {
  if (!task.reviewActivity) return null;
  if (task.reviewActivity.status === "marked") return task.coverage === "complete" ? "已做（有痕迹）" : "有痕迹，待补页";
  if (task.reviewActivity.status === "blank") return "未做（无痕迹）";
  return task.reviewActivity.status === "missing" ? "未找到对应照片" : "AI没看清学习痕迹";
}
