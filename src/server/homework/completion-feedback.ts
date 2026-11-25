import { FeedbackLessons } from "./feedback-lessons";
import { LearnedMemories } from "./memory";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { isParent, type Viewer } from "../../domain/accounts";
import { DaySchema, type DailyReport } from "../../domain/homework";
import { feedbackReasons, type CompletionFeedback, type FeedbackReason } from "../../domain/completion-feedback";
import { isWrittenTask } from "../../domain/written-completion";
import { HomeworkError, type HomeworkStore } from "./store";

type Task = DailyReport["tasks"][number];
type RecordRow = {id:string; reason:FeedbackReason; note:string; confirmed:number};
export const FeedbackInput = z.object({
  date: DaySchema, taskId:z.string().min(1).max(200), token:z.string().length(64),
  reason:z.enum(["numbering","correction","writing","other"]), note:z.string().trim().max(240).default(""),
  confirm:z.boolean().default(false), previousId:z.string().uuid().nullable(),
}).strict().refine(v => v.reason !== "other" || !!v.note, "写一句需要核对的地方。");

export const ConventionInput = z.object({
  date:DaySchema, taskId:z.string().min(1).max(200), token:z.string().length(64),
  trigger:z.string().trim().min(1).max(80), quote:z.string().trim().min(8).max(240),
}).strict();

export class CompletionFeedbackStore {
  readonly lessons: FeedbackLessons;
  constructor(private store:HomeworkStore) {
    store.db.exec("CREATE TABLE IF NOT EXISTS completion_feedback(id TEXT PRIMARY KEY, token TEXT NOT NULL, date TEXT NOT NULL, task_id TEXT NOT NULL, reason TEXT NOT NULL, note TEXT NOT NULL, confirmed INTEGER NOT NULL, actor_id TEXT NOT NULL, created_at TEXT NOT NULL); CREATE INDEX IF NOT EXISTS feedback_by_source ON completion_feedback(token)");
    this.lessons = new FeedbackLessons(store.db);
  }
  token(date:string, task:Task) {
    const pages = [...new Set(task.evidence.map(e => e.fileId))].sort();
    return createHash("sha256").update(JSON.stringify([date,task.id,task.title,task.subject,task.format,task.requirement,pages])).digest("hex");
  }
  latest(token:string) {
    return this.store.db.prepare("SELECT id,reason,note,confirmed FROM completion_feedback WHERE token=? ORDER BY rowid DESC LIMIT 1").get(token) as RecordRow | undefined;
  }
  view(date:string, task:Task, pending:boolean):CompletionFeedback | undefined {
    if (!this.store.writtenCompletionEnabled || !isWrittenTask(task) || !task.evidence.length || !task.writtenCompletion) return;
    const token = this.token(date, task), row = this.latest(token);
    if (!row) return {token};
    const status = row.confirmed ? "confirmed" : task.reviewedFeedbackId === row.id ? "reviewed" : pending ? "pending" : "interrupted";
    return {token, latest:{id:row.id,reason:row.reason,note:row.note,status,...(status === "reviewed" ? {learned:this.lessons.learned(row.id)} : {})}};
  }
  submit(input:z.infer<typeof FeedbackInput>, viewer:Viewer) {
    if (input.confirm && !isParent(viewer)) throw new HomeworkError(403,"请家长确认这项作业的完成情况。");
    return this.store.transaction(() => {
      const snapshot = this.store.snapshot(input.date);
      const task = snapshot.report?.tasks.find(t => t.id === input.taskId);
      const feedback = snapshot.completionFeedback?.[input.taskId];
      if (!task || !feedback || feedback.token !== input.token || snapshot.memoEdits?.includes(task.id))
        throw new HomeworkError(409,"作业或照片有更新，请重新打开这项作业。");
      const prior = feedback.latest;
      const identical = prior?.reason === input.reason && prior.note === input.note && (prior.status === "confirmed") === input.confirm;
      if (identical && prior?.status !== "interrupted") return {id:prior!.id};
      if (snapshot.pending || (prior?.id ?? null) !== input.previousId) throw new HomeworkError(409,"这项作业正在更新，请刷新后再试。");
      if (!input.confirm && new Set(task.evidence.map(e=>e.fileId)).size > 6) throw new HomeworkError(422,"这项照片超过六页，暂时无法一起复查。可请家长核对原图后确认。");
      const id = randomUUID();
      this.store.db.prepare("INSERT INTO completion_feedback(id,token,date,task_id,reason,note,confirmed,actor_id,created_at) VALUES(?,?,?,?,?,?,?,?,?)")
        .run(id,input.token,input.date,task.id,input.reason,input.note,Number(input.confirm),viewer.id,new Date(this.store.now()).toISOString());
      if (!input.confirm) { this.lessons.retire(input.token); this.store.bump(input.date); }
      else this.store.db.prepare("INSERT INTO task_completion_versions(date,revision) VALUES(?,1) ON CONFLICT(date) DO UPDATE SET revision=revision+1").run(input.date);
      return {id};
    });
  }
  teach(input:z.infer<typeof ConventionInput>, viewer:Viewer) {
    if (!isParent(viewer)) throw new HomeworkError(403,"请家长保存家庭约定。");
    const snapshot = this.store.snapshot(input.date);
    const task = snapshot.report?.tasks.find(t=>t.id === input.taskId);
    if (!task || snapshot.completionFeedback?.[task.id]?.token !== input.token) throw new HomeworkError(409,"作业已更新，请重新打开。");
    const memories = new LearnedMemories(this.store);
    const result = memories.remember([{kind:"homework_completion",subject:task.subject,trigger:input.trigger,summary:input.quote,
      evidenceQuote:input.quote,confirmationQuote:null,replacesMemoryId:null}],input.quote,input.date,[],true);
    if (!result.saved.length && !memories.list().some(m=>m.kind==="homework_completion" && m.subject===task.subject && m.summary===input.quote && m.trigger===input.trigger))
      throw new HomeworkError(422,result.notices[0] || "请用一句话说明今后同类作业的通用约定。");
    return {saved:true};
  }
  clue(row:RecordRow) { return {reason:feedbackReasons[row.reason], note:row.note}; }
}
