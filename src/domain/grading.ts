import type { GradingFailure } from "./grading-failure";
import { z } from "zod";
import { EvidenceSchema } from "./ai-contracts";
export const GRADING_VERSION = "grading-v2";
export const CauseSchema = z.enum(["计算错误", "概念理解", "审题偏差", "方法步骤", "书写或单位", "原因待确认"]);
const JudgmentSchema = z.enum(["correct", "wrong", "blank", "uncertain", "feedback"]);
const AnswerSchema = z.object({
  kind: z.enum(["objective", "subjective"]), studentAnswer: z.string().max(3000), expectedAnswer: z.string().max(3000),
  verdict: JudgmentSchema, confidence: z.enum(["high", "medium", "low"]), explanation: z.string().max(1800),
  knowledgePoints: z.array(z.string().max(100)).max(8), cause: CauseSchema, causeExplanation: z.string().max(900), nextStep: z.string().max(900),
});
export const GradingQuestionSchema = AnswerSchema.extend({ sourcePartLabels: z.array(z.string().max(200)).max(160).default([]), label: z.string().min(1).max(180), question: z.string().min(1).max(5000), evidence: z.array(EvidenceSchema).min(1).max(4) });
export const GradingInspectionSchema = z.object({ scopeComplete: z.boolean(), note: z.string().max(1200), questions: z.array(GradingQuestionSchema).max(80) });
export const GradingVerificationSchema = z.object({ scopeComplete: z.boolean(), omittedLabels: z.array(z.string().max(180)).max(80), checks: z.array(AnswerSchema.extend({ questionId: z.string().min(1).max(100) })).max(80) });
export const GradedQuestionSchema = GradingQuestionSchema.extend({ id: z.string(), verification: z.enum(["agreed", "uncertain", "subjective"]) });
export type GradedQuestion = z.infer<typeof GradedQuestionSchema>;
export const GradingResultSchema = z.object({ version: z.enum(["grading-v1", "grading-v2"]), scopeComplete: z.boolean(), note: z.string(), questions: z.array(GradedQuestionSchema).max(80) });
export type GradingResult = z.infer<typeof GradingResultSchema>;
export type GradingCounts = { correct: number; wrong: number; blank: number; uncertain: number; feedback: number };
export type GradingSummary = GradingCounts & { enabled: boolean; pending: number; failed: number; pages: number; finished: number; incomplete: number; tasks: Record<string, GradingCounts & { pending: number; failed: number; incomplete: number }> };
export type GradingReading = Pick<GradedQuestion, "studentAnswer" | "expectedAnswer" | "confidence" | "verdict" | "explanation"> & { stage: "verification" | "focusOne" | "focusTwo" };
export type GradingBatchView = { readings?: Record<string, GradingReading[]>; failure?: GradingFailure | null; attempts?: number; retryAllowed?: boolean; id: string; title: string; subject: string; status: string; note: string; primaryPageId: string; result: GradingResult | null };
export type MistakeProvenance =
  | { kind: "assignment" | "practice" | "exam"; title: string }
  | { kind: "unmatched"; title?: string };
export type MistakeView = { scope?:import("./practice").LearningScope;scopeSource?:import("./homework-scope").HomeworkScopeSource;provenance?:MistakeProvenance;retest?:import("./practice").RetestStats;origin?:"homework"|"practice"|"exam";tags?:import("./assessment").Tags;tagRevision?:number;manualTags?:Partial<import("./assessment").Tags>;imageUrl?:string; id: string; date: string; lastDate: string; subject: string; title: string; pageId: string; occurrences: number; question: GradedQuestion };
export function readAutoGrading(env: Record<string, string | undefined> = process.env) {
  if (env.ASSISTANT_AUTO_GRADING === undefined || env.ASSISTANT_AUTO_GRADING === "0") return false;
  if (env.ASSISTANT_AUTO_GRADING !== "1") throw new Error("Invalid auto grading setting");
  return true;
}
export const emptyCounts = (): GradingCounts => ({ correct: 0, wrong: 0, blank: 0, uncertain: 0, feedback: 0 });
function normalized(value: string) { return value.normalize("NFKC").toLowerCase().replace(/\\(?:d?frac)\{([^{}]+)\}\{([^{}]+)\}/g, "$1/$2").replace(/[\s$\\,，。；;]/g, "").replace(/^(?:答案[:：]?|选项[:：]?)/, ""); }
export function equivalentAnswer(a: string, b: string) {
  const x = normalized(a), y = normalized(b); if (!x || !y) return false; if (x === y) return true;
  const fraction = (v: string) => /^[-+]?\d{1,30}(?:\/\d{1,30})?$/.test(v) ? v.split("/").map(BigInt) : null;
  const p = fraction(x), q = fraction(y); return !!p && !!q && (p[1] ?? 1n) !== 0n && (q[1] ?? 1n) !== 0n && p[0] * (q[1] ?? 1n) === q[0] * (p[1] ?? 1n);
}
export function reconcileQuestion(id: string, first: z.infer<typeof GradingQuestionSchema>, second: z.infer<typeof GradingVerificationSchema>["checks"][number]): GradedQuestion {
  if (first.kind === "subjective" || second.kind === "subjective") return { ...first, id, verdict: "feedback", confidence: "medium", explanation: second.explanation || first.explanation, verification: "subjective", cause: "原因待确认" };
  const sameStudent = normalized(first.studentAnswer) === normalized(second.studentAnswer) || equivalentAnswer(first.studentAnswer, second.studentAnswer);
  const visualFraction = (s: string) => {
    if (/厘米|毫米|千米|平方米|平方厘米|千克|公斤|(?:cm|mm|km|kg|m2|m²)\b/i.test(s)) return null;
    const values = s.normalize("NFKC").replace(/\\(?:d?frac)\{([^{}]+)\}\{([^{}]+)\}/g, "$1/$2").replace(/\s*\/\s*/g, "/").match(/[-+]?\d{1,30}\/\d{1,30}/g);
    return values?.length && values.every(v => equivalentAnswer(v, values[0])) ? values[0] : null;
  };
  const visualA = /涂色|阴影|涂一涂/.test(`${first.label} ${first.question}`) ? visualFraction(first.expectedAnswer) : null;
  const visualB = visualA ? visualFraction(second.expectedAnswer) : null;
  const sameReference = equivalentAnswer(first.expectedAnswer, second.expectedAnswer) || !!visualA && !!visualB && equivalentAnswer(visualA, visualB);
  const numeric = (s: string) => !/[，,;；\n]/.test(s) && !/\d\s+\d/.test(s) && /^[-+]?\d{1,30}(?:\/\d{1,30})?$/.test(normalized(s));
  const consistent = [first, second].every(q => q.verdict !== "correct" || !numeric(q.studentAnswer) || !numeric(q.expectedAnswer) || equivalentAnswer(q.studentAnswer, q.expectedAnswer));
  const agreed = consistent && first.confidence === "high" && second.confidence === "high" && first.verdict === second.verdict && (first.verdict === "correct" ? sameStudent || sameReference : first.verdict === "blank" ? true : sameStudent && sameReference);
  if (!agreed || !["correct", "wrong", "blank"].includes(first.verdict)) return { ...first, id, verdict: "uncertain", confidence: "low", verification: "uncertain", explanation: "两次识别或独立解答未取得一致结果，尚未判对错。" };
  return { ...first, ...second, id, verification: "agreed", cause: first.cause === second.cause ? second.cause : "原因待确认", causeExplanation: first.cause === second.cause ? second.causeExplanation : "已确认答案有误，但仅凭这次作答还不能确定错因。" };
}

export function taskGradingLabel(t?: GradingCounts & { pending: number; failed: number; incomplete: number }) {
  if (!t) return null;
  if (t.pending) return "批改中";
  if (t.failed) return "批改未完成";
  if (t.wrong) return `${t.wrong}道错题`;
  if (t.uncertain) return `${t.uncertain}题尚未确认`;
  if (t.blank) return `${t.blank}题未作答`;
  if (t.incomplete) return "部分题未完整识别";
  if (t.feedback) return "已给出点评";
  return t.correct ? "已批改，均正确" : "未发现需批改的题";
}
