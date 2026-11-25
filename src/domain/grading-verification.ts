import type { GradedQuestion } from "./grading";
import { reconcileQuestion, type GradingQuestionSchema, type GradingVerificationSchema } from "./grading";
import type { z } from "zod";
type Question = z.infer<typeof GradingQuestionSchema> & { id: string };
type Check = z.infer<typeof GradingVerificationSchema>["checks"][number];
/** Only location hints cross the boundary. OCR answers, answer-bearing titles and excerpts must not. */
export function blindGradingQuestions(questions: Question[], selected: Pick<Question, "id" | "label" | "evidence">[] = questions) {
  return selected.map(q => ({ questionId: q.id, locator: {
    order: questions.findIndex(item => item.id === q.id) + 1,
    numbers: q.label.match(/\d+/g)?.slice(0, 5) || [],
    part: q.label.match(/涂色|画图|填空|选择|计算|判断|默写|听写|抄写|作文/)?.[0] || null,
    pages: q.evidence.map(e => ({ fileId: e.fileId, page: e.page })),
  } }));
}
export function reconcileFocusedQuestion(original: Question, one: Check, two: Check, subject: string): GradedQuestion {
  const result = reconcileQuestion(original.id, { ...original, ...one }, two);
  // Repeating the same full-page OCR does not supply new evidence of a disputed extra stroke.
  const disputedGlyph = subject === "语文" && original.kind === "objective" && original.confidence !== "high" && (original.cause === "书写或单位" || /默写|听写|词语|生字|字形|形近字/.test([original.label, original.question, ...original.knowledgePoints].join(" ")));
  if (result.verdict === "wrong" && disputedGlyph) return { ...original, verdict: "uncertain", confidence: "low", verification: "uncertain", studentAnswer: "手写字暂未辨清", explanation: "这处手写字的辨认仍有疑点，重复识读得到相同文字不足以确认写错，暂不判错。", cause: "原因待确认", causeExplanation: "", nextStep: "暂不要求订正；需要更清楚的字形依据后再判断。" };
  return result;
}
