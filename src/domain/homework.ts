import type { GradingSummary } from "./grading";
import { z } from "zod";
import { ClarificationReceiptSchema } from "./clarifications";
import { EvidenceSchema, MemoRecognitionSchema, OrganizationSchema } from "./ai-contracts";
import { SubjectSchema } from "./contracts";
import { WrittenCompletionSchema } from "./written-completion";
import { StudyTraceSchema, ReviewActivitySchema, type ReviewPolicy } from "./review-policy";

import { DaySchema } from "./calendar";
export { DaySchema } from "./calendar";
export const UploadInputSchema = z.object({
  date: DaySchema, kind: z.enum(["memo", "homework"]),
  files: z.array(z.object({ name: z.string().min(1).max(200), size: z.number().int().min(1).max(20 * 1024 * 1024), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict()).min(1).max(20),
}).strict().refine((v) => v.files.reduce((n, f) => n + f.size, 0) <= 50 * 1024 * 1024, "一次文件总量不能超过50MB");
export const ExtractedHomeworkSchema = z.object({
  pages: z.array(z.object({
    fileId: z.string(), readable: z.boolean(), subject: SubjectSchema.nullable(),
    book: z.string().max(300).nullable(), printedPage: z.string().max(100).nullable(),
    content: z.string().max(7000), studyTrace: StudyTraceSchema.nullable().default(null), uncertainties: z.array(z.string().max(500)).max(15),
  })).min(1).max(10),
});
export const HomeworkTaskSchema = z.object({
  id: z.string(), subject: SubjectSchema, title: z.string(), requirement: z.string(),
  format: z.enum(["written", "oral", "reading", "other"]), memoEvidence: z.array(EvidenceSchema),
  coverage: z.enum(["none", "partial", "complete", "uncertain"]),
  evidence: z.array(EvidenceSchema), missing: z.array(z.string()), writtenCompletion: WrittenCompletionSchema.nullable().default(null), reviewActivity: ReviewActivitySchema.nullable().default(null),
});
export const DailyReportSchema = z.object({
  date: DaySchema, memoId: z.string().nullable(), tasks: z.array(HomeworkTaskSchema),
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
export type UploadView = {
  id: string; date: string; kind: "memo" | "homework"; createdAt: string; status: UploadStatus; note: string;
  subjects: z.infer<typeof SubjectSchema>[]; aiMs: number; issues: { pageId: string | null; message: string }[];
  files: { id: string; name: string; size: number; stored: boolean; pages: { id: string; number: number }[] }[];
};
export type HomeworkSnapshot = {
  homeworkReward?: import("./homework-reward").HomeworkRewardStatus;
  date: string; status: string; note: string; report: DailyReport | null; uploads: UploadView[];
  dates: string[]; grading?: GradingSummary; writtenCompletionEnabled?: boolean; reviewPolicy?: ReviewPolicy | null; quota: { calls: number; limit: number }; pending: boolean;
};
export const shanghaiDay = (time = Date.now()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(time));
