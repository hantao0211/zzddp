import type { GradingSummary } from "./grading";
import { z } from "zod";
import { ClarificationReceiptSchema } from "./clarifications";
import { EvidenceSchema, MemoRecognitionSchema, OrganizationSchema } from "./ai-contracts";
import { SubjectSchema } from "./contracts";
import { WrittenCompletionSchema } from "./written-completion";
import { StudyTraceSchema, ReviewActivitySchema, type ReviewPolicy } from "./review-policy";

import { DaySchema } from "./calendar";
import { HomeworkScopeSchema, type HomeworkScopeSource } from "./homework-scope";
export { DaySchema } from "./calendar";
export const UploadInputSchema = z.object({
  date: DaySchema, kind: z.enum(["memo", "homework"]),
  targetTaskId: z.string().min(1).max(180).optional(),
  scope: HomeworkScopeSchema.optional(),
  files: z.array(z.object({ name: z.string().min(1).max(200), size: z.number().int().min(1).max(20 * 1024 * 1024), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict()).min(1).max(20),
}).strict().refine(v => v.kind === "homework" || (!v.targetTaskId && !v.scope), "请按备忘录中的每项作业分别设置归属").refine((v) => v.files.reduce((n, f) => n + f.size, 0) <= 50 * 1024 * 1024, "一次文件总量不能超过50MB");
export const ExtractedHomeworkSchema = z.object({
  pages: z.array(z.object({
    fileId: z.string(), readable: z.boolean(), subject: SubjectSchema.nullable(),
    book: z.string().max(300).nullable(), printedPage: z.string().max(100).nullable(),
    content: z.string().max(7000), studyTrace: StudyTraceSchema.nullable().default(null), uncertainties: z.array(z.string().max(500)).max(15),
  })).min(1).max(10),
});
export const HomeworkTaskSchema = z.object({
  referencedChecks: z.array(z.string().max(180)).max(4).optional(),
  feedbackFinding: z.string().max(1500).optional(),
  reviewedFeedbackId: z.string().uuid().optional(),
  selectedSubmission:z.object({version:z.literal("selected-destination-v1"),pageIds:z.array(z.string()).max(120),note:z.string().max(1000)}).optional(),
  inferredMeaning:z.object({version:z.literal("lesson-heading-v1"),abbreviation:z.string().max(30),number:z.number().int().min(1).max(999),title:z.string().max(80),displayTitle:z.string().max(200),description:z.string().max(500),evidence:z.array(EvidenceSchema).min(1).max(12)}).optional(),
  inferredScope: z.object({version:z.literal("submitted-work-v1"),description:z.string().max(1500),note:z.string().max(1500),pageIds:z.array(z.string()).max(120)}).optional(),
  completionToken: z.string().optional(), selfCompletion: z.object({ confirmedAt: z.string(), confirmedBy: z.string(), role: z.enum(["admin", "parent", "child"]) }).optional(),
  id: z.string(), subject: SubjectSchema, title: z.string(), requirement: z.string(),
  format: z.enum(["written", "oral", "reading", "other"]), memoEvidence: z.array(EvidenceSchema),
  coverage: z.enum(["none", "partial", "complete", "uncertain"]),
  evidence: z.array(EvidenceSchema), missing: z.array(z.string()), writtenCompletion: WrittenCompletionSchema.nullable().default(null), reviewActivity: ReviewActivitySchema.nullable().default(null),
});
export const DailyReportSchema = z.object({
  date: DaySchema, memoId: z.string().nullable(), tasks: z.array(HomeworkTaskSchema),
  organizedUploadIds: z.array(z.string()).optional(),
  familyNotes: z.array(ClarificationReceiptSchema).default([]),
  unclassified: z.array(z.object({ title: z.string(), requirement: z.string(), evidence: z.array(EvidenceSchema) })).default([]),
  uncertainties: z.array(z.string()), unassigned: OrganizationSchema.shape.unassigned,
  updatedAt: z.string(),
});
export type UploadInput = z.infer<typeof UploadInputSchema>;
export type ExtractedHomework = z.infer<typeof ExtractedHomeworkSchema>;
export type DailyReport = z.infer<typeof DailyReportSchema>;
export type RecognizedMemo = z.infer<typeof MemoRecognitionSchema>;
export type UploadStatus = "uploading" | "queued" | "converting" | "recognizing" | "retrying" | "processed" | "needs_rescan" | "failed";
export type UploadTarget = Pick<DailyReport["tasks"][number], "subject" | "title" | "requirement" | "format"> & { taskId: string; scopeSource?: HomeworkScopeSource };
export type UploadView = {
  scopeSource?: HomeworkScopeSource;
  target?: UploadTarget | null;
  id: string; date: string; kind: "memo" | "homework"; createdAt: string; status: UploadStatus; note: string;
  subjects: z.infer<typeof SubjectSchema>[]; aiMs: number; issues: { pageId: string | null; message: string }[];
  files: { id: string; name: string; size: number; stored: boolean; pages: { id: string; number: number }[] }[];
};
export type GardenProgress = { homeworkComplete: boolean; readingLogged: boolean; earnedSteps: number };
export type HomeworkSnapshot = {
  completionFeedback?: Record<string, import("./completion-feedback").CompletionFeedback>;
  gardenProgress?: GardenProgress;
  taskScopeSources?: Record<string, HomeworkScopeSource>;
  dayPlan?: import("./homework-calendar").HomeworkDayPlan;
  memoEdits?: string[];
  processing?: { taskIds?: string[]; subjects: z.infer<typeof SubjectSchema>[]; memo: boolean; unclassified: boolean; retrying: boolean };
  homeworkReward?: import("./homework-reward").HomeworkRewardStatus;
  date: string; status: string; note: string; report: DailyReport | null; uploads: UploadView[];
  dates: string[]; grading?: GradingSummary; writtenCompletionEnabled?: boolean; reviewPolicy?: ReviewPolicy | null; quota: { calls: number; limit: number }; pending: boolean;
};
export const shanghaiDay = (time = Date.now()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(time));
