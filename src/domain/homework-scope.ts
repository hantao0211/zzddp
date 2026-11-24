import { z } from "zod";
import { DaySchema } from "./calendar";
import type { LearningScope } from "./practice";

export const HomeworkScopeSchema = z.enum(["curricular", "extracurricular"]);
export type HomeworkScope = z.infer<typeof HomeworkScopeSchema>;
export const HomeworkScopeRefSchema = z.object({
  kind: z.enum(["entry", "task", "upload"]),
  id: z.string().min(1).max(260),
  date: DaySchema,
}).strict();
export type HomeworkScopeRef = z.infer<typeof HomeworkScopeRefSchema>;
export type HomeworkScopeSource = HomeworkScopeRef & { title: string; scope: LearningScope; confirmed: boolean };
