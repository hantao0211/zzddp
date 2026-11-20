import { z } from "zod";
export const DaySchema = z.string().regex(/^20\d{2}-\d{2}-\d{2}$/).refine((s) => { const d = new Date(s + "T00:00:00Z"); return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s; }, "日期无效");
