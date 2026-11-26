import { addDays, weekOf } from "./growth-economy";

export const recapPeriods = { week: "周", month: "月", term: "学期" } as const;
export type RecapPeriod = keyof typeof recapPeriods;

export function recapRange(period: RecapPeriod, day: string) {
  const year = Number(day.slice(0, 4)), month = Number(day.slice(5, 7));
  let start: string, next: string;
  if (period === "week") {
    start = weekOf(day);
    next = addDays(start, 7);
  } else if (period === "month") {
    start = day.slice(0, 7) + "-01";
    next = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
  } else if (month >= 9 || month === 1) {
    const autumnYear = year - Number(month === 1);
    start = autumnYear + "-09-01";
    next = (autumnYear + 1) + "-02-01";
  } else {
    start = year + "-02-01";
    next = year + "-09-01";
  }
  return { start, end: addDays(next, -1), previous: addDays(start, -1), next };
}

export type SubjectRecap = { subject: string; judged: number; correct: number; denominator: number; pending: number };
export type GrowthRecap = {
  subjects: SubjectRecap[];
  reading: { books: number; days: number; minutes: number; finished: number };
  steps: number;
};
