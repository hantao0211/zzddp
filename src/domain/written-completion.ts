import { isMemoTrackingPart } from "./memo-assignment";
import { z } from "zod";
import { taskSubmission } from "./task-submission";
import { EvidenceSchema } from "./ai-contracts";

export const WrittenPartSchema = z.object({
  label: z.string().min(1).max(200),
  status: z.enum(["answered", "blank", "unclear"]),
  evidence: EvidenceSchema,
}).strict();
export const WrittenRecheckSchema = z.object({ parts: z.array(WrittenPartSchema).min(1).max(160) }).strict();
export const WrittenInspectionSchema = z.object({
  scopeComplete: z.boolean(),
  reason: z.string().min(1).max(1500),
  parts: z.array(WrittenPartSchema).max(160),
}).strict();
export const WRITTEN_COMPLETION_VERSION = "written-v2" as const;
export const WrittenCompletionSchema = z.object({
  version: z.literal(WRITTEN_COMPLETION_VERSION).optional(),
  status: z.enum(["done", "incomplete", "unclear", "missing"]),
  reason: z.string().max(1500),
  parts: z.array(WrittenPartSchema).max(160),
}).strict();
export type WrittenCompletion = z.infer<typeof WrittenCompletionSchema>;
export function readWrittenCompletion(env: Record<string, string | undefined> = process.env) {
  if (env.ASSISTANT_WRITTEN_COMPLETION === undefined || env.ASSISTANT_WRITTEN_COMPLETION === "0") return false;
  if (env.ASSISTANT_WRITTEN_COMPLETION !== "1") throw new Error("Invalid written completion setting");
  return true;
}
export function isWrittenTask(task: { format: string; title?: string; requirement?: string }) { return task.format === "written" || (task.format === "other" && taskSubmission({title:task.title||"",requirement:task.requirement||"",format:task.format}) === "written"); }
export function needsWrittenCompletionUpdate(task: { format: string; title?: string; requirement?: string; writtenCompletion?: { version?: string } | null }, enabled?: boolean) { return !!enabled && isWrittenTask(task) && (!task.writtenCompletion || task.writtenCompletion.version !== WRITTEN_COMPLETION_VERSION); }
export function writtenCompletionLabel(value?: WrittenCompletion | null) {
  if (!value) return null;
  return value.status === "done" ? "已做完（未批改）" : value.status === "incomplete" ? value.parts.every(p => p.status === "blank") ? "未做" : "未做完" : value.status === "missing" ? "未找到对应照片" : "AI未判清";
}
export function evaluateWrittenInspection(value: z.infer<typeof WrittenInspectionSchema>, coverage: string, requirement = ""): WrittenCompletion {
  const parts = value.parts.filter(p => !isMemoTrackingPart(p.label, requirement));
  if (parts.length !== value.parts.length) {
    const blank = parts.filter(p => p.status === "blank");
    const reason = blank.length ? "尚有未填写的作答处：" + blank.map(p => p.label).join("、") :
      parts.some(p => p.status === "unclear") ? "部分作答看不清，具体位置见下方。" :
      !parts.length || !value.scopeComplete ? "现有记录不足以确认整项作业已做完。" :
      `作业照片中检查的${parts.length}处均已作答。`;
    value = { ...value, parts, reason: reason.slice(0, 1500) };
  }
  const status = value.parts.some(p => p.status === "blank") ? "incomplete" : !value.parts.length || !value.scopeComplete || coverage !== "complete" || value.parts.some(p => p.status === "unclear") ? "unclear" : "done";
  return { version: WRITTEN_COMPLETION_VERSION, parts: value.parts, status, reason: status === "unclear" && coverage !== "complete" ? "指定作业范围的照片还不完整，不能判断整项是否写完。" : value.reason };
}
