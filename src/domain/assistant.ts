import { z } from "zod";
import { DaySchema } from "./calendar";
import type { ClarificationPreview, ClarificationReceipt } from "./clarifications";
import type { LearnedMemory } from "./memory";

// Three compressed photos plus the bounded dialogue fit the existing 2 MiB proxy limit.
export const CHAT_PHOTO_LIMIT = 3;
export const CHAT_PHOTO_BYTES = 450_000;
export const ChatPhotoSchema = z.object({
  id: z.string().uuid(),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  base64: z.string().min(32).max(600_000).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
}).strict();
export type ChatPhoto = z.infer<typeof ChatPhotoSchema>;
const GradingTopicBase = z.object({
  pageId: z.string().min(1).max(200),
  label: z.string().min(1).max(400), stem: z.string().max(600),
}).strict();
const GradingTopicSchema = z.union([
  GradingTopicBase.extend({ questionId: z.string().min(1).max(200) }),
  GradingTopicBase.extend({ batchId: z.string().min(1).max(200) }),
]);
export type GradingTopic = z.infer<typeof GradingTopicSchema>;
export const ChatInputSchema = z.object({
  studyDate: DaySchema.optional(),
  readingMode: z.boolean().optional(),
  readingLogId: z.string().uuid().optional(),
  gradingTopic: GradingTopicSchema.optional(),
  reviewPhotos: z.boolean().optional(),
  photos: z.array(ChatPhotoSchema).max(CHAT_PHOTO_LIMIT).optional(),
  photoOrigin: z.enum(["current", "previous"]).optional(),
  question: z.string().trim().min(1).max(1200),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(3000) }).strict()).max(8).default([]),
}).strict().refine((value) => value.history.reduce((size, item) => size + item.content.length, 0) <= 12000);
export type ChatInput = z.infer<typeof ChatInputSchema>;
export type PhotoReview = { requested: boolean; providedPages: number; totalAvailablePages: number; unavailablePages: number };
export type ChatMessage = { role: "user" | "assistant"; content: string; photos?: ChatPhoto[]; id?: string; spokenAnswer?: string; proposal?: ClarificationPreview; gradePreview?: import("./grade-review").GradePreview; proposalNotice?: string; receipt?: ClarificationReceipt; photoReview?: PhotoReview; memoriesSaved?: LearnedMemory[]; memoryNotices?: string[]; changeStatus?: "none" | "pending" | "confirmed" | "undone" };

export function validateRecording(bytes: Uint8Array) {
  if (bytes.byteLength < 44) throw new Error("录音内容不完整，请重新录制。");
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const label = (offset: number, size: number) => String.fromCharCode(...bytes.slice(offset, offset + size));
  if (label(0, 4) !== "RIFF" || label(8, 4) !== "WAVE" || label(12, 4) !== "fmt " || label(36, 4) !== "data" || data.getUint32(16, true) !== 16 || data.getUint16(20, true) !== 1 || data.getUint16(22, true) !== 1 || data.getUint16(34, true) !== 16 || data.getUint16(32, true) !== 2) throw new Error("录音格式不受支持，请重新录制。");
  const rate = data.getUint32(24, true);
  const length = data.getUint32(40, true);
  if (rate !== 16000 || length !== bytes.byteLength - 44 || length % 2 || data.getUint32(4, true) !== bytes.byteLength - 8 || data.getUint32(28, true) !== rate * 2 || length < rate * 0.4 * 2 || length > rate * 30 * 2) throw new Error("请录制0.4到30秒的问题。");
  return length / (rate * 2);
}
