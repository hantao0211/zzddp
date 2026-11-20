import { GeneratedPracticeSchema, MemoRecognitionSchema, OrganizationSchema, PracticeVerificationSchema, TutorAnswerSchema } from "@/domain/ai-contracts";
import type { LearningState, Subject } from "@/domain/contracts";
import { applyHomeworkOrganization, applyMemoRecognition } from "@/domain/ai-results";
import type { AIImage, StructuredAI } from "./provider";

export async function recognizeMemo(ai: StructuredAI, state: LearningState, materialId: string, images: AIImage[]) {
  const result = await ai.run("recognize_memo", MemoRecognitionSchema, { materialId }, images);
  return applyMemoRecognition(state, materialId, result);
}

export async function organizeHomework(ai: StructuredAI, state: LearningState, materialId: string, images: AIImage[]) {
  const material = state.materials.find((item) => item.id === materialId);
  if (!material) throw new Error("待处理原件不存在。");
  const candidates = state.tasks.filter((task) => task.date === material.date);
  if (!candidates.length) return { ...state, materials: state.materials.map((m) => m.id === materialId ? { ...m, processing: "queued" as const } : m) };
  const result = await ai.run("organize_homework", OrganizationSchema, { materialId, date: material.date, candidates }, images);
  return applyHomeworkOrganization(state, materialId, result);
}

export async function preparePractice(ai: StructuredAI, input: { subject: Subject; grade: number; count: number; mistakes: { id: string; question: string; answer: string; knowledgePoint: string }[] }) {
  if (input.count < 1 || input.count > 12 || !input.mistakes.length) throw new Error("练习需要真实错题来源及合理题量。");
  const draft = await ai.run("generate_practice", GeneratedPracticeSchema, input);
  const sourceIds = new Set(input.mistakes.map((item) => item.id));
  const ids = new Set(draft.questions.map((question) => question.id));
  if (draft.subject !== input.subject || draft.questions.length !== input.count || ids.size !== draft.questions.length || draft.questions.some((question) => question.sourceMistakeIds.some((id) => !sourceIds.has(id)))) throw new Error("生成练习的科目、数量、题号或错题来源不符合要求，未发布。");
  const verification = await ai.run("verify_practice", PracticeVerificationSchema, { input, draft });
  if (!verification.approved || verification.checks.length !== draft.questions.length || new Set(verification.checks.map((check) => check.questionId)).size !== ids.size || verification.checks.some((check) => !check.correct || !ids.has(check.questionId))) throw new Error("练习校验未通过，未进入可打印题库。");
  return { ...draft, verification, status: "verified" as const };
}

export async function answerTutor(ai: StructuredAI, input: { question: string; materials: { id: string; text: string }[]; history?: { role: "user" | "assistant"; content: string }[] }) {
  if (!input.question.trim() || input.question.length > 2000) throw new Error("问题为空或过长。");
  const result = await ai.run("tutor_answer", TutorAnswerSchema, input);
  const allowed = new Set(input.materials.map((material) => material.id));
  if (result.sourceMaterialIds.some((id) => !allowed.has(id))) throw new Error("助手引用了当前孩子不可访问或未提供的资料。");
  return result;
}
