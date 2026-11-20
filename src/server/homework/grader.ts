import { createHash } from "node:crypto";
import { GradingInspectionSchema, GradingVerificationSchema, GRADING_VERSION, reconcileQuestion, type GradingResult } from "../../domain/grading";
import { AIServiceError, type StructuredAI } from "../ai/provider";
import { HomeworkError, type HomeworkStore } from "./store";
import type { ImagePipeline } from "./images";
import type { GradingSource } from "./grading-store";
export class HomeworkGrader {
  constructor(private store: HomeworkStore, private ai: () => StructuredAI, private images: Pick<ImagePipeline, "images">) {}
  private async cached<T>(key: string, work: () => Promise<T>): Promise<T> {
    const existing = this.store.db.prepare("SELECT result FROM analysis_cache WHERE key=?").get(key) as { result: string } | undefined;
    if (existing) return JSON.parse(existing.result) as T;
    const value = await work(); this.store.db.prepare("INSERT OR REPLACE INTO analysis_cache(key,result) VALUES(?,?)").run(key, JSON.stringify(value)); return value;
  }
  async tick() {
    const run = this.store.grading.claim(); if (!run) return false;
    try {
      const source = JSON.parse(run.source) as GradingSource;
      const images = this.images.images(source.pages);
      const inputSource = { ...source, pages: source.pages.map(p => ({ fileId: p.id, page: p.number })) };
      const first = await this.cached(`grade-first:${GRADING_VERSION}:${run.id}`, async () => {
        this.store.reserve();
        const value = await this.ai().run("grade_homework", GradingInspectionSchema, inputSource, images);
        for (const q of value.questions) {
          if (!q.evidence.some(e => e.fileId === source.primaryPageId) || q.evidence.some(e => !source.pages.some(p => p.id === e.fileId && (e.page === null || e.page === p.number)))) throw new AIServiceError("INVALID_GRADING_EVIDENCE", true, "批改题目没有对应原图。");
        }
        if (new Set(value.questions.map(q => q.label)).size !== value.questions.length) throw new AIServiceError("DUPLICATE_GRADING_QUESTION", true, "批改题号重复。");
        return value;
      });
      const questions = first.questions.map(q => ({ ...q, id: createHash("sha256").update(run.id + ":" + q.label).digest("hex") }));
      let result: GradingResult = { version: GRADING_VERSION, scopeComplete: first.scopeComplete && !source.expectedLabels.length, note: first.note, questions: [] };
      if (questions.length) {
        const second = await this.cached(`grade-verify:${GRADING_VERSION}:${run.id}`, async () => {
          this.store.reserve();
          // No first verdict or proposed reference answer is sent to the second solver.
          const value = await this.ai().run("verify_homework_grading", GradingVerificationSchema, { source: inputSource, questions: questions.map(q => ({ questionId: q.id, label: q.label, question: q.question, studentAnswer: q.studentAnswer, evidence: q.evidence })) }, images);
          if (value.checks.length !== questions.length || new Set(value.checks.map(q => q.questionId)).size !== questions.length || value.checks.some(c => !questions.some(q => q.id === c.questionId))) throw new AIServiceError("INVALID_GRADING_VERIFICATION", true, "批改复核题目未完整对应。");
          return value;
        });
        result = { version: GRADING_VERSION, scopeComplete: first.scopeComplete && second.scopeComplete && !second.omittedLabels.length, note: [...new Set([first.note, ...second.omittedLabels.map(l => `尚未完整识别：${l}`)].filter(Boolean))].join("；"), questions: questions.map(q => reconcileQuestion(q.id, q, second.checks.find(c => c.questionId === q.id)!)) };
      }
      const pending = result.questions.filter(q => q.verdict === "uncertain");
      if (pending.length) {
        const focusInput = { source: { ...inputSource, focus: true }, questions: pending.map(q => ({ questionId: q.id, label: q.label, question: q.question, studentAnswer: q.studentAnswer, evidence: q.evidence })) };
        const recheck = async (stage: string) => this.cached(`grade-focus-${stage}:${GRADING_VERSION}:${run.id}`, async () => {
          this.store.reserve();
          const value = await this.ai().run("verify_homework_grading", GradingVerificationSchema, focusInput, images);
          if (value.checks.length !== pending.length || new Set(value.checks.map(q => q.questionId)).size !== pending.length || value.checks.some(c => !pending.some(q => q.id === c.questionId))) throw new AIServiceError("INVALID_GRADING_FOCUS", true, "自动复查未完整对应题目。");
          return value;
        });
        const one = await recheck("one"), two = await recheck("two");
        result.questions = result.questions.map(q => {
          if (q.verdict !== "uncertain") return q;
          const a = one.checks.find(c => c.questionId === q.id)!, b = two.checks.find(c => c.questionId === q.id)!;
          return reconcileQuestion(q.id, { ...q, ...a }, b);
        });
      }
      const covered = new Set(first.questions.flatMap(q => q.sourcePartLabels));
      const omitted = source.expectedLabels.filter(label => !covered.has(label));
      if (omitted.length) { result.scopeComplete = false; result.note += `${result.note ? "；" : ""}尚未完整覆盖的作答部分：${omitted.join("、")}`; }
      if (!source.assigned) result.questions = result.questions.map(q => q.verdict === "blank" ? { ...q, verdict: "uncertain", verification: "uncertain", explanation: "尚未明确布置范围，不将空白题认定为漏做。" } : q);
      this.store.grading.save(run, result);
    } catch (error) {
      const budget = error instanceof HomeworkError && error.status === 429;
      console.warn("Grading did not finish:", error instanceof AIServiceError ? error.code : budget ? "BUDGET_LIMIT" : "LOCAL_ERROR");
      this.store.grading.fail(run, error instanceof AIServiceError && error.retryable, budget);
    }
    return true;
  }
}
