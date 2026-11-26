import { z } from "zod";

export const MistakeSortSchema = z.enum(["newest", "oldest", "frequent", "leastFrequent"]);
export type MistakeSort = z.infer<typeof MistakeSortSchema>;
export const mistakeOrders = {
  date: { ascending: "oldest", descending: "newest" },
  occurrences: { ascending: "leastFrequent", descending: "frequent" },
} as const satisfies Record<string, Record<"ascending" | "descending", MistakeSort>>;

type SortableMistake = { id: string; lastDate: string; occurrences: number };
export function compareMistakes(a: SortableMistake, b: SortableMistake, order: MistakeSort) {
  if (order === "leastFrequent" && a.occurrences !== b.occurrences) return a.occurrences - b.occurrences;
  if (order === "frequent" && a.occurrences !== b.occurrences) return b.occurrences - a.occurrences;
  if (Boolean(a.lastDate) !== Boolean(b.lastDate)) return a.lastDate ? -1 : 1;
  const byDate = a.lastDate.localeCompare(b.lastDate);
  return (order === "oldest" ? byDate : -byDate) || a.id.localeCompare(b.id);
}
