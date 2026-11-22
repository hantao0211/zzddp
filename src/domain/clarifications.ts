import { z } from "zod";
import { SubjectSchema } from "./contracts";
import { DaySchema } from "./calendar";

export const ClarificationChangesSchema = z.object({
  subject: SubjectSchema.nullable(), title: z.string().trim().min(1).max(150).nullable(),
  requirement: z.string().trim().min(1).max(2000).nullable(),
  format: z.enum(["written", "oral", "reading", "other"]).nullable(),
}).strict();
export const ClarificationActionSchema = z.object({
  entryId: z.string().min(1).max(180), changes: ClarificationChangesSchema,
  userQuote: z.string().min(4).max(800),
  resolves: z.array(z.number().int().nonnegative()).max(30),
}).strict();
export type ClarificationAction = z.infer<typeof ClarificationActionSchema>;
export type MemoEntry = { subject: z.infer<typeof SubjectSchema> | null; title: string; requirement: string; format: "written" | "oral" | "reading" | "other" };
export const MemoEditSchema = z.object({
  requestId: z.string().uuid(), date: DaySchema, revision: z.number().int().nonnegative(),
  entryId: z.string().min(1).max(180),
  entry: z.object({ subject: SubjectSchema.nullable(), title: z.string().trim().min(1).max(150), requirement: z.string().trim().min(1).max(2000), format: z.enum(["written", "oral", "reading", "other"]) }).strict(),
}).strict();
export type MemoEdit = z.infer<typeof MemoEditSchema>;
export type ClarificationPreview = { id: string; date: string; entryId: string; before: MemoEntry; after: MemoEntry; userQuote: string; resolves: string[]; expiresAt: number };
export const ClarificationReceiptSchema = z.object({
  id: z.string(), date: z.string(), userQuote: z.string(), title: z.string(), createdAt: z.string(),
  entryId: z.string().optional(), requirement: z.string().optional(), current: z.boolean().optional(), canUndo: z.boolean().optional(),
});
export type ClarificationReceipt = z.infer<typeof ClarificationReceiptSchema>;
export type HomeworkChatContext = { requirementOptions?: MemoEntry[]; date: string; revision: number; availableDates: string[]; hasMaterials: boolean; pending: boolean; status: string; note: string; taskCount: number; unclassifiedCount: number; entries: (MemoEntry & { entryId: string })[]; uncertainties: { index: number; text: string }[]; familyNotes: ClarificationReceipt[] };
export const ContextQuerySchema = z.object({ studyDate: DaySchema.optional() });
