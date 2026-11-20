import { z } from "zod";

export const SubjectSchema = z.enum(["数学", "英语", "语文"]);
export const MaterialKindSchema = z.enum(["备忘录", "每日作业", "试卷", "专项练习", "待识别"]);
export const TaskSchema = z.object({
  id: z.string(),
  subject: SubjectSchema,
  title: z.string(),
  description: z.string(),
  completed: z.boolean(),
  uploaded: z.boolean(),
  date: z.string().optional(),
  memoId: z.string().optional(),
  format: z.enum(["written", "oral", "reading", "other"]).optional(),
  coverage: z.enum(["none", "partial", "complete", "uncertain"]).optional(),
  evidenceIds: z.array(z.string()).optional(),
});
export const MaterialSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: MaterialKindSchema,
  subject: SubjectSchema.optional(),
  subjects: z.array(SubjectSchema).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  taskId: z.string().optional(),
  taskIds: z.array(z.string()).optional(),
  processing: z.enum(["waiting_for_ai", "queued", "recognizing", "matching", "processed", "needs_rescan", "failed"]).optional(),
  sample: z.boolean(),
  fileIds: z.array(z.string()),
  filenames: z.array(z.string()),
});
export const StateSchema = z.object({
  version: z.literal(1),
  tasks: z.array(TaskSchema),
  materials: z.array(MaterialSchema),
  reviewDone: z.array(z.string()),
  reflection: z.string().max(500),
  rewardRequests: z.array(z.string()),
});

export type Subject = z.infer<typeof SubjectSchema>;
export type MaterialKind = z.infer<typeof MaterialKindSchema>;
export type LearningTask = z.infer<typeof TaskSchema>;
export type Material = z.infer<typeof MaterialSchema>;
export type LearningState = z.infer<typeof StateSchema>;

export interface LearningGateway {
  load(): Promise<LearningState>;
  save(state: LearningState): Promise<void>;
  addMaterial(material: Material, files: File[]): Promise<void>;
  readFile(id: string): Promise<Blob | undefined>;
}
