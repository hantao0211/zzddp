import type { AITask } from "../../domain/ai-contracts";
import { shanghaiDay } from "../../domain/homework";
import type { HomeworkCall, HomeworkPhase, HomeworkUsage } from "../../domain/homework-usage";
import { AIServiceError } from "../ai/provider";
import type { HomeworkStore, Job } from "./store";

export type CallContext = { date: string; title: string; runId?: string; pageId?: string; attempt?: number };
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
function phaseOf(task: AITask, metadata: unknown): HomeworkPhase {
  if (task === "recognize_memo" || task === "extract_homework") return "recognition";
  if (task === "organize_homework") return "organization";
  if (["inspect_study_traces", "assess_written_completion", "recheck_written_parts"].includes(task)) return "completion";
  if (task === "grade_homework") return "inspection";
  if (task === "verify_homework_grading") return record(record(metadata).source).focus ? "focus" : "verification";
  return "other";
}
export class HomeworkUsageLog {
  constructor(private store: HomeworkStore) {
    store.db.exec(`CREATE TABLE IF NOT EXISTS homework_ai_calls (
      id INTEGER PRIMARY KEY AUTOINCREMENT, day TEXT NOT NULL, task TEXT NOT NULL, phase TEXT NOT NULL,
      homework_date TEXT NOT NULL, title TEXT NOT NULL, run_id TEXT, page_id TEXT, attempt INTEGER NOT NULL,
      started_at TEXT NOT NULL, finished_at TEXT, status TEXT NOT NULL DEFAULT 'running', error_code TEXT NOT NULL DEFAULT '');
      CREATE INDEX IF NOT EXISTS homework_ai_calls_day ON homework_ai_calls(day,id);`);
    store.db.prepare("UPDATE homework_ai_calls SET status='interrupted',finished_at=? WHERE status='running'").run(new Date(store.now()).toISOString());
  }
  start(task: AITask, metadata: unknown, job?: Job, context?: CallContext): number {
    const data = record(metadata), date = context?.date || job?.date || "";
    const title = (context?.title || (typeof data.title === "string" ? data.title : "") || (task === "recognize_memo" ? "备忘录" : task === "extract_homework" ? "上传的作业照片" : "当天作业")).slice(0, 180);
    return this.store.transaction(() => {
      this.store.reserve();
      return Number(this.store.db.prepare("INSERT INTO homework_ai_calls(day,task,phase,homework_date,title,run_id,page_id,attempt,started_at) VALUES(?,?,?,?,?,?,?,?,?)")
        .run(shanghaiDay(this.store.now()), task, phaseOf(task, metadata), date, title, context?.runId || null, context?.pageId || null, context?.attempt || job?.attempts || 1, new Date(this.store.now()).toISOString()).lastInsertRowid);
    });
  }
  finish(id: number, error?: unknown) {
    // Never store raw replies or exception messages in the usage ledger.
    this.store.db.prepare("UPDATE homework_ai_calls SET status=?,error_code=?,finished_at=? WHERE id=?")
      .run(error === undefined ? "returned" : "failed", error instanceof AIServiceError ? error.code : error === undefined ? "" : "LOCAL_ERROR", new Date(this.store.now()).toISOString(), id);
  }
  summary(): HomeworkUsage {
    const quota = this.store.quota(), day = quota.day;
    const counts = this.store.db.prepare("SELECT count(*) tracked,COALESCE(SUM(status='returned'),0) returned,COALESCE(SUM(status='failed'),0) failed,COALESCE(SUM(status='running'),0) running,COALESCE(SUM(status='interrupted'),0) interrupted FROM homework_ai_calls WHERE day=?").get(day) as Pick<HomeworkUsage, "tracked" | "returned" | "failed" | "running" | "interrupted">;
    const phases = this.store.db.prepare("SELECT phase,count(*) calls FROM homework_ai_calls WHERE day=? GROUP BY phase ORDER BY calls DESC,phase").all(day) as HomeworkUsage["phases"];
    const assignments = this.store.db.prepare("SELECT homework_date date,title,count(*) calls,SUM(status='failed') failed FROM homework_ai_calls WHERE day=? GROUP BY homework_date,title ORDER BY calls DESC,date,title LIMIT 60").all(day) as HomeworkUsage["assignments"];
    const recent = (this.store.db.prepare("SELECT id,homework_date date,title,phase,attempt,started_at startedAt,status,error_code FROM homework_ai_calls WHERE day=? ORDER BY id DESC LIMIT 50").all(day) as unknown as (Omit<HomeworkCall, "reason"> & { error_code: string })[]).map(({ error_code, ...row }) => ({ ...row, reason: error_code === "INVALID_ENVELOPE" || error_code === "INVALID_RESULT" ? "AI返回格式无法使用" : error_code === "INCOMPLETE_RESPONSE" ? "AI回答未完整返回" : error_code ? "本次调用未完成" : "" }));
    return { day, total: quota.calls, ...counts, untracked: Math.max(0, quota.calls - counts.tracked), phases, assignments, recent };
  }
}
