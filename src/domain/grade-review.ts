import { z } from "zod";

export const GradeReviewSchema = z.object({
  verdict: z.enum(["wrong", "correct", "record"]),
  original: z.string().trim().max(600),
  expected: z.string().trim().max(600),
  correction: z.string().trim().max(600),
  evidence: z.string().trim().min(1).max(600),
});
export type GradeReview = z.infer<typeof GradeReviewSchema>;
export type GradePreview = GradeReview & { id: string; label: string; applied: boolean };
