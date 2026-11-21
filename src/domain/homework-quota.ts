import { z } from "zod";
export const DEFAULT_HOMEWORK_DAILY_CALLS = 100;
export const HomeworkQuotaSettingsSchema = z.object({ dailyCalls: z.number().int().min(1).max(5000) }).strict();
export type HomeworkQuota = { day: string; calls: number; limit: number };
