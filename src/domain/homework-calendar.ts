import { z } from "zod";
import { DaySchema } from "./calendar";

export const HomeworkWeekdaysSchema = z.array(z.number().int().min(0).max(6)).max(7).refine(days => new Set(days).size === days.length, "日期不能重复");
export const HomeworkDayPlanInputSchema = z.object({
  date: DaySchema,
  noHomework: z.boolean().nullable().optional(),
  weekdays: HomeworkWeekdaysSchema.optional(),
}).strict().refine(value => value.noHomework !== undefined || value.weekdays !== undefined, "请选择安排");
export type HomeworkDayPlan = {
  noHomework: boolean;
  source: "date" | "weekly" | "work";
  weekdays: number[];
  override: boolean | null;
  hasWork: boolean;
};
export function resolveHomeworkDayPlan(date: string, weekdays: number[] = [1], override: boolean | null = null, hasWork = false): HomeworkDayPlan {
  DaySchema.parse(date);
  const weekday = new Date(date + "T00:00:00Z").getUTCDay();
  return {
    noHomework: !hasWork && (override ?? weekdays.includes(weekday)),
    source: hasWork ? "work" : override !== null ? "date" : "weekly",
    weekdays: [...weekdays], override, hasWork,
  };
}
