export const HOMEWORK_PHASES = {
  curriculum: "课程资料整理", practice: "课内小练习", recognition: "照片识别", organization: "清单整理", completion: "完成检查",
  inspection: "初次批改", verification: "独立复核", focus: "疑题复核", other: "其他检查",
} as const;
export type HomeworkPhase = keyof typeof HOMEWORK_PHASES;
export type HomeworkCallStatus = "running" | "returned" | "failed" | "interrupted";
export type HomeworkCall = {
  id: number; date: string; title: string; phase: HomeworkPhase; attempt: number;
  startedAt: string; status: HomeworkCallStatus; reason: string;
};
export type HomeworkUsage = {
  day: string; total: number; tracked: number; untracked: number;
  returned: number; failed: number; running: number; interrupted: number;
  phases: { phase: HomeworkPhase; calls: number }[];
  assignments: { date: string; title: string; calls: number; failed: number }[];
  recent: HomeworkCall[];
};
/** Malformed replies get one automatic retry; transient network failures keep their existing cap. */
export function automaticAttemptLimit(code: string) {
  return code === "INVALID_ENVELOPE" || code === "INCOMPLETE_RESPONSE" || code === "INVALID_RESULT" ? 2 : 3;
}
