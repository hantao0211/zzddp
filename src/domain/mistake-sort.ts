import { z } from "zod";

export const MistakeSortSchema = z.enum(["newest", "oldest", "frequent"]);
export type MistakeSort = z.infer<typeof MistakeSortSchema>;
export const mistakeSortLabels: Record<MistakeSort, string> = {
  newest: "最近优先", oldest: "最早优先", frequent: "次数最多",
};

type SortableMistake = { id: string; lastDate: string; occurrences: number };
export function compareMistakes(a: SortableMistake, b: SortableMistake, order: MistakeSort) {
  if (order === "frequent" && a.occurrences !== b.occurrences) return b.occurrences - a.occurrences;
  if (Boolean(a.lastDate) !== Boolean(b.lastDate)) return a.lastDate ? -1 : 1;
  const byDate = a.lastDate.localeCompare(b.lastDate);
  return (order === "oldest" ? byDate : -byDate) || a.id.localeCompare(b.id);
}
