import type { GradedQuestion } from "./grading";
/** Internal evidence identifiers are links, not readable explanations. Keep genuine problem numbers. */
export function gradingDisplayQuestion(question: GradedQuestion): GradedQuestion {
  const ids = [question.id, ...question.evidence.map(e => e.fileId)].filter(Boolean);
  const clean = (value: string) => {
    let text = value;
    for (const id of ids) text = text.split(id).join("");
    return text.replace(/[（(]\s*[)）]/g, "").replace(/ {2,}/g, " ").trim();
  };
  return { ...question, label: clean(question.label), question: clean(question.question), studentAnswer: clean(question.studentAnswer), expectedAnswer: clean(question.expectedAnswer), explanation: clean(question.explanation), knowledgePoints: question.knowledgePoints.map(clean), causeExplanation: clean(question.causeExplanation), nextStep: clean(question.nextStep) };
}
