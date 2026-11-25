import { z } from "zod";
import { SubjectSchema } from "./contracts";

export const homeworkRuleLabels = {
  homework_matching: "作业匹配",
  homework_completion: "完成检查",
  homework_grading: "作业批改",
} as const;
export type HomeworkRuleKind = keyof typeof homeworkRuleLabels;
export function isHomeworkRule(kind: string): kind is HomeworkRuleKind {
  return Object.prototype.hasOwnProperty.call(homeworkRuleLabels, kind);
}
export type HomeworkRule = { subject: string | null; convention: string };

export const MemoryCandidateSchema = z.object({
  kind: z.enum(["memo_abbreviation", "learning_preference", "usage_preference", "homework_matching", "homework_completion", "homework_grading"]),
  trigger: z.string().trim().min(1).max(80).describe("简称或检索关键词，简称不要带例子数字；不是正则表达式"),
  summary: z.string().trim().min(8).max(600).describe("从用户明确说明提炼的可复用知识，注明场景；数字变化时不能固定套用例子中的课号"),
  subject: SubjectSchema.nullable(),
  evidenceQuote: z.string().trim().min(4).max(600).describe("逐字引用用户明确提供的说明；若引用前文中聊清楚的解释，必须同时提供本次用户确认的原话"),
  confirmationQuote: z.string().trim().min(1).max(300).nullable().default(null),
  replacesMemoryId: z.string().uuid().nullable().default(null),
}).strict();
export type MemoryCandidate = z.infer<typeof MemoryCandidateSchema>;
export type LearnedMemory = {
  id: string; kind: MemoryCandidate["kind"]; trigger: string; summary: string; subject: MemoryCandidate["subject"];
  sourceQuote: string; sourceDate: string; createdAt: string;
};
export type ConfirmedKnowledgeExample = {
  id: string; sourceDate: string;
  original: { subject: string | null; title: string; requirement: string; format: string };
  corrected: { subject: string | null; title: string; requirement: string; format: string };
  explanation: string;
};
export type MemoryHistory = LearnedMemory & { status: "revoked" | "superseded" | "excluded"; reason: string };
export type KnowledgeCatalog = { rules: LearnedMemory[]; corrections: ConfirmedKnowledgeExample[]; history: MemoryHistory[] };
