import { reviewReportConclusion } from "../../domain/review-conclusion";
import { DEFAULT_HOMEWORK_DAILY_CALLS, HomeworkQuotaSettingsSchema, type HomeworkQuota } from "../../domain/homework-quota";
import { currentUploadTarget, readUploadTarget, resolveUploadTarget } from "./upload-target";
import { GradingStore } from "./grading-store";
import { needsWrittenCompletionUpdate } from "../../domain/written-completion";
import { needsReviewTraceUpdate, type ReviewPolicy } from "../../domain/review-policy";
import { effectiveMemo } from "./memo-context";
import { DatabaseSync } from "node:sqlite";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DailyReportSchema, shanghaiDay, type DailyReport, type HomeworkSnapshot, type UploadInput, type UploadView } from "../../domain/homework";

export class HomeworkError extends Error { constructor(public status: number, message: string) { super(message); } }
export type UploadRow = { id: string; date: string; kind: "memo" | "homework"; created_at: string; status: UploadView["status"]; note: string; result: string | null; subjects: string; ai_ms: number };
export type FileRow = { id: string; upload_id: string; name: string; size: number; sha256: string; stored: number; mime: string | null };
export type PageRow = { id: string; file_id: string; number: number };
export type Job = { id: number; kind: "recognize" | "organize"; upload_id: string | null; date: string; revision: number; attempts: number };
const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
export class HomeworkStore {
  readonly db: DatabaseSync;
  readonly grading: GradingStore;
  constructor(readonly directory: string, readonly now = Date.now, readonly reviewPolicy: ReviewPolicy | null = null, readonly writtenCompletionEnabled = false, readonly autoGradingEnabled = false) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    for (const part of ["originals", "pages", "incoming"]) mkdirSync(join(directory, part), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(join(directory, "homework.sqlite"));
    const version = (this.db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
    if (version !== 0 && version !== 1) throw new Error("Unsupported homework database version");
    const hasQuotaWaits = !!this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='homework_quota_waits'").get();
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS uploads (id TEXT PRIMARY KEY, fingerprint TEXT UNIQUE NOT NULL, date TEXT NOT NULL, kind TEXT NOT NULL, created_at TEXT NOT NULL, status TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', result TEXT, subjects TEXT NOT NULL DEFAULT '[]', ai_ms INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY, upload_id TEXT NOT NULL REFERENCES uploads(id), name TEXT NOT NULL, size INTEGER NOT NULL, sha256 TEXT NOT NULL, stored INTEGER NOT NULL DEFAULT 0, mime TEXT);
      CREATE TABLE IF NOT EXISTS pages (id TEXT PRIMARY KEY, file_id TEXT NOT NULL REFERENCES files(id), number INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS days (date TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 0, report TEXT, status TEXT NOT NULL DEFAULT 'queued', note TEXT NOT NULL DEFAULT '');
      CREATE TABLE IF NOT EXISTS jobs (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT UNIQUE NOT NULL, kind TEXT NOT NULL, upload_id TEXT, date TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'queued', attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS clarification_drafts (id TEXT PRIMARY KEY, owner TEXT NOT NULL, date TEXT NOT NULL, memo_id TEXT NOT NULL, entry_index INTEGER NOT NULL, revision INTEGER NOT NULL, source_hash TEXT NOT NULL, payload TEXT NOT NULL, expires_at INTEGER NOT NULL, confirmed_id TEXT);
      CREATE TABLE IF NOT EXISTS clarifications (id TEXT PRIMARY KEY, owner TEXT NOT NULL, date TEXT NOT NULL, memo_id TEXT NOT NULL, entry_index INTEGER NOT NULL, source_hash TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL, undone_at TEXT);
      CREATE INDEX IF NOT EXISTS clarification_memo ON clarifications(memo_id,entry_index);
      CREATE TABLE IF NOT EXISTS learned_memories (id TEXT PRIMARY KEY, kind TEXT NOT NULL, trigger_text TEXT NOT NULL, trigger_key TEXT NOT NULL, subject TEXT, summary TEXT NOT NULL, source_quote TEXT NOT NULL, source_date TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', replaces_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS learned_memory_status ON learned_memories(status,kind,trigger_key);
      CREATE TABLE IF NOT EXISTS upload_targets (upload_id TEXT PRIMARY KEY REFERENCES uploads(id), payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS analysis_cache (key TEXT PRIMARY KEY, result TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS homework_quota_waits (job_id INTEGER PRIMARY KEY REFERENCES jobs(id));
      CREATE TABLE IF NOT EXISTS homework_quota (id INTEGER PRIMARY KEY CHECK(id=1), daily_calls INTEGER NOT NULL CHECK(daily_calls BETWEEN 1 AND 5000), updated_by TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS budget (day TEXT PRIMARY KEY, calls INTEGER NOT NULL DEFAULT 0, batches INTEGER NOT NULL DEFAULT 0, bytes INTEGER NOT NULL DEFAULT 0);
      CREATE INDEX IF NOT EXISTS jobs_queue ON jobs(status,next_at,id); CREATE INDEX IF NOT EXISTS uploads_date ON uploads(date);
      PRAGMA user_version=1;`);
    this.grading = new GradingStore(this);
    // Restart recovers interrupted work, without erasing attempts, quotas or originals.
    this.db.exec("UPDATE jobs SET status='queued' WHERE status='running'; UPDATE uploads SET status='queued', note='后台已恢复，等待继续整理。' WHERE status IN ('converting','recognizing');");
    if (!hasQuotaWaits) this.db.prepare("INSERT OR IGNORE INTO homework_quota_waits(job_id) SELECT id FROM jobs WHERE status='queued' AND next_at%86400000=57600000 AND (date IN (SELECT date FROM days WHERE note=?) OR upload_id IN (SELECT id FROM uploads WHERE note=?))").run("今天的AI整理限额已到，原件已保存，明天自动继续。", "今天的AI整理限额已到，原件已保存，明天自动继续。");
    this.resumeQuotaWork();
  }
  transaction<T>(fn: () => T): T { this.db.exec("BEGIN IMMEDIATE"); try { const result = fn(); this.db.exec("COMMIT"); return result; } catch (e) { this.db.exec("ROLLBACK"); throw e; } }
  upload(id: string) { return this.db.prepare("SELECT * FROM uploads WHERE id=?").get(id) as UploadRow | undefined; }
  files(id: string) { return this.db.prepare("SELECT * FROM files WHERE upload_id=? ORDER BY rowid").all(id) as FileRow[]; }
  file(id: string) { return this.db.prepare("SELECT * FROM files WHERE id=?").get(id) as FileRow | undefined; }
  pages(fileId: string) { return this.db.prepare("SELECT * FROM pages WHERE file_id=? ORDER BY number").all(fileId) as PageRow[]; }
  page(id: string) { return this.db.prepare("SELECT * FROM pages WHERE id=?").get(id) as PageRow | undefined; }
  view(id: string): UploadView {
    const u = this.upload(id); if (!u) throw new HomeworkError(404, "没有找到这份资料。");
    const result = u.result ? u.kind === "memo" ? effectiveMemo(this, u).result : JSON.parse(u.result) : null;
    const issues: UploadView["issues"] = result ? u.kind === "memo" ? result.uncertainties.map((message: string) => ({ pageId: null, message })) : result.pages.flatMap((p: { fileId: string; readable: boolean; subject: string | null; uncertainties: string[] }) => [...(!p.readable ? ["这一页关键内容看不清，请对准整页补拍。"] : []), ...(!p.subject ? ["这一页暂不能确定科目。"] : []), ...p.uncertainties].map((message) => ({ pageId: p.fileId, message }))) : [];
    return { ...(readUploadTarget(this, u.id) ? { target: readUploadTarget(this, u.id) } : {}), id: u.id, date: u.date, kind: u.kind, createdAt: u.created_at, status: u.status, note: u.status === "processed" ? u.note.replace("正在对照已上传作业", "可在当天作业查看查缺结果").replace("正在对照当天备忘录查缺", "可在当天作业查看查缺结果") : u.note, subjects: JSON.parse(u.subjects), aiMs: u.ai_ms, issues, files: this.files(id).map((f) => ({ id: f.id, name: f.name, size: f.size, stored: !!f.stored, pages: this.pages(f.id).map((p) => ({ id: p.id, number: p.number })) })) };
  }
  begin(input: UploadInput) {
    if (input.targetTaskId && input.kind !== "homework") throw new HomeworkError(400, "备忘录不能指定作业。");
    const target = input.targetTaskId ? currentUploadTarget(this, input.date, input.targetTaskId) : null;
    const shown = input.targetTaskId ? this.snapshot(input.date).report?.tasks.find(t => t.id === input.targetTaskId) : null;
    if (input.targetTaskId && (!target || !shown || shown.subject !== target.subject || shown.title !== target.title || shown.requirement !== target.requirement)) throw new HomeworkError(409, "作业清单已更新，请刷新后从对应作业上传。照片尚未提交。");
    const fingerprint = hash({ date: input.date, kind: input.kind, files: input.files.map(({ size, sha256 }) => ({ size, sha256 })) });
    const old = this.db.prepare("SELECT id FROM uploads WHERE fingerprint=?").get(fingerprint) as { id: string } | undefined;
    if (old) {
      if (target) this.transaction(() => {
        const saved = readUploadTarget(this, old.id);
        if (saved && (saved.memoId !== target.memoId || saved.entryIndex !== target.entryIndex || saved.sourceHash !== target.sourceHash)) throw new HomeworkError(409, "这批照片已交给另一项作业，不能重复归到本项。请检查所选照片。");
        if (!saved) {
          this.db.prepare("INSERT INTO upload_targets(upload_id,payload) VALUES(?,?)").run(old.id, JSON.stringify(target));
          if (this.upload(old.id)!.status !== "uploading") this.bump(input.date);
        }
      });
      return this.view(old.id);
    }
    return this.transaction(() => {
      const size = input.files.reduce((n, f) => n + f.size, 0);
      const day = shanghaiDay(this.now()); this.db.prepare("INSERT OR IGNORE INTO budget(day) VALUES(?)").run(day);
      const budget = this.db.prepare("SELECT * FROM budget WHERE day=?").get(day) as { batches: number; bytes: number };
      const total = this.db.prepare("SELECT COALESCE(SUM(size),0) AS bytes FROM files").get() as { bytes: number };
      if (budget.batches >= 40 || budget.bytes + size > 200 * 1024 * 1024) throw new HomeworkError(429, "今天的上传限额已用完，明天可以继续。已保存资料不受影响。");
      if (total.bytes + size > 5 * 1024 ** 3) throw new HomeworkError(507, "家庭存储空间需要扩容，请联系家长。已有资料仍保留。");
      this.db.prepare("UPDATE budget SET batches=batches+1, bytes=bytes+? WHERE day=?").run(size, day);
      const id = randomUUID();
      this.db.prepare("INSERT INTO uploads(id,fingerprint,date,kind,created_at,status) VALUES(?,?,?,?,?,'uploading')").run(id, fingerprint, input.date, input.kind, new Date(this.now()).toISOString());
      if (target) this.db.prepare("INSERT INTO upload_targets(upload_id,payload) VALUES(?,?)").run(id, JSON.stringify(target));
      for (const f of input.files) this.db.prepare("INSERT INTO files(id,upload_id,name,size,sha256) VALUES(?,?,?,?,?)").run(randomUUID(), id, f.name, f.size, f.sha256);
      return this.view(id);
    });
  }
  stored(id: string, mime: string) { this.db.prepare("UPDATE files SET stored=1,mime=? WHERE id=?").run(mime, id); }
  bump(date: string) {
    this.db.prepare("INSERT INTO days(date,revision,status,note) VALUES(?,1,'queued','正在整理当天资料。') ON CONFLICT(date) DO UPDATE SET revision=revision+1,status='queued',note='正在整理当天资料。'").run(date);
    const revision = this.revision(date);
    this.db.prepare("UPDATE jobs SET status='done' WHERE date=? AND kind='organize' AND status='queued' AND revision<?").run(date,revision);
    this.db.prepare("INSERT OR IGNORE INTO jobs(key,kind,date,revision) VALUES(?,'organize',?,?)").run(`day:${date}:${revision}`, date, revision);
  }
  revision(date: string) { return (this.db.prepare("SELECT revision FROM days WHERE date=?").get(date) as { revision: number } | undefined)?.revision || 0; }
  finalize(id: string) {
    return this.transaction(() => {
      const u = this.upload(id); if (!u) throw new HomeworkError(404, "资料不存在。");
      if (u.status !== "uploading") return this.view(id);
      if (this.files(id).some((f) => !f.stored)) throw new HomeworkError(409, "还有文件没有上传成功，请重新上传这批资料以继续。");
      this.db.prepare("UPDATE uploads SET status='queued',note='原件已保存，等待AI整理。' WHERE id=?").run(id);
      this.db.prepare("INSERT OR IGNORE INTO jobs(key,kind,upload_id,date) VALUES(?,'recognize',?,?)").run(`upload:${id}`, id, u.date);
      this.bump(u.date); return this.view(id);
    });
  }
  setStatus(id: string, status: UploadView["status"], note: string) { this.db.prepare("UPDATE uploads SET status=?,note=? WHERE id=?").run(status, note, id); }
  setPages(fileId: string, pages: PageRow[]) {
    this.transaction(() => { this.db.prepare("DELETE FROM pages WHERE file_id=?").run(fileId); for (const p of pages) this.db.prepare("INSERT INTO pages(id,file_id,number) VALUES(?,?,?)").run(p.id, fileId, p.number); });
  }
  recognized(job: Job, result: unknown, subjects: string[], needsRescan: boolean, aiMs: number, note: string) {
    this.transaction(() => {
      this.db.prepare("UPDATE uploads SET status=?,result=?,subjects=?,ai_ms=ai_ms+?,note=? WHERE id=?").run(needsRescan ? "needs_rescan" : "processed", JSON.stringify(result), JSON.stringify(subjects), aiMs, note, job.upload_id!);
      this.done(job); this.bump(job.date);
    });
  }
  uploads(date: string) { return this.db.prepare("SELECT * FROM uploads WHERE date=? AND status!='uploading' ORDER BY created_at,rowid").all(date) as UploadRow[]; }
  busy(date: string) { return !!this.db.prepare("SELECT id FROM jobs WHERE date=? AND kind='recognize' AND status IN ('queued','running') LIMIT 1").get(date); }
  claim(): Job | undefined {
    return this.transaction(() => {
      this.db.exec("UPDATE jobs SET status='done' WHERE kind='organize' AND status='queued' AND revision < (SELECT revision FROM days WHERE days.date=jobs.date)");
      const job = this.db.prepare("SELECT j.* FROM jobs j WHERE j.status='queued' AND j.next_at<=? AND (j.kind='recognize' OR NOT EXISTS (SELECT 1 FROM jobs busy WHERE busy.date=j.date AND busy.status IN ('queued','running') AND (busy.kind='recognize' OR (busy.kind='organize' AND busy.status='running')))) ORDER BY CASE j.kind WHEN 'recognize' THEN 0 ELSE 1 END,j.id LIMIT 1").get(this.now()) as Job | undefined;
      if (!job) return;
      this.db.prepare("UPDATE jobs SET status='running', attempts=attempts+1 WHERE id=?").run(job.id);
      this.db.prepare("DELETE FROM homework_quota_waits WHERE job_id=?").run(job.id);
      return { ...job, attempts: job.attempts + 1 };
    });
  }
  done(job: Job) { this.db.prepare("UPDATE jobs SET status='done' WHERE id=?").run(job.id); }
  publish(job: Job, report: DailyReport | null, status: string, note: string) {
    this.transaction(() => {
      if (this.revision(job.date) === job.revision) this.db.prepare("UPDATE days SET report=?,status=?,note=? WHERE date=?").run(report ? JSON.stringify(DailyReportSchema.parse(report)) : null, status, note, job.date);
      if (this.revision(job.date) === job.revision) this.grading.queueDay(job.date, report);
      this.done(job);
    });
  }
  dailyCallLimit() {
    const row = this.db.prepare("SELECT daily_calls FROM homework_quota WHERE id=1").get() as { daily_calls: number } | undefined;
    return row ? HomeworkQuotaSettingsSchema.parse({ dailyCalls: row.daily_calls }).dailyCalls : DEFAULT_HOMEWORK_DAILY_CALLS;
  }
  quota(): HomeworkQuota {
    const day = shanghaiDay(this.now());
    const usage = this.db.prepare("SELECT calls FROM budget WHERE day=?").get(day) as { calls: number } | undefined;
    return { day, calls: usage?.calls || 0, limit: this.dailyCallLimit() };
  }
  setQuota(value: unknown, actor: string) {
    const settings = HomeworkQuotaSettingsSchema.parse(value);
    return this.transaction(() => {
      this.db.prepare("INSERT INTO homework_quota(id,daily_calls,updated_by,updated_at) VALUES(1,?,?,?) ON CONFLICT(id) DO UPDATE SET daily_calls=excluded.daily_calls,updated_by=excluded.updated_by,updated_at=excluded.updated_at").run(settings.dailyCalls, actor, new Date(this.now()).toISOString());
      this.resumeQuotaWork();
      return this.quota();
    });
  }
  private resumeQuotaWork() {
    const quota = this.quota();
    if (quota.calls >= quota.limit) return;
    // Wake quota waits only. Network backoff and exhausted failure retries remain intact.
    const reason = "今天的AI整理限额已到，原件已保存，明天自动继续。";
    this.db.prepare("UPDATE jobs SET next_at=0 WHERE status='queued' AND id IN (SELECT job_id FROM homework_quota_waits)").run();
    this.db.prepare("UPDATE uploads SET status='queued',note='额度已可用，等待继续整理。' WHERE status='retrying' AND note=? AND id IN (SELECT upload_id FROM jobs WHERE status='queued' AND next_at=0)").run(reason);
    this.db.prepare("UPDATE days SET status='queued',note='额度已可用，正在继续整理。' WHERE status='retrying' AND note=? AND date IN (SELECT date FROM jobs WHERE status='queued' AND next_at=0)").run(reason);
    this.db.prepare("DELETE FROM homework_quota_waits WHERE job_id IN (SELECT id FROM jobs WHERE status!='queued' OR next_at=0)").run();
    this.db.prepare("UPDATE grading_runs SET next_at=0,note='' WHERE active=1 AND status='queued' AND note='今天的AI额度已用完，批改会在明天继续，原件已保存。'").run();
  }
  reserve() {
    const day = shanghaiDay(this.now()); this.db.prepare("INSERT OR IGNORE INTO budget(day) VALUES(?)").run(day);
    const usage = this.db.prepare("SELECT calls FROM budget WHERE day=?").get(day) as { calls: number };
    if (usage.calls >= this.dailyCallLimit()) throw new HomeworkError(429, "今天的AI整理限额已到，原件已保存，明天自动继续。");
    this.db.prepare("UPDATE budget SET calls=calls+1 WHERE day=?").run(day);
  }
  fail(job: Job, note: string, retry: boolean, budget = false) {
    this.transaction(() => {
      if (budget) this.db.prepare("INSERT OR IGNORE INTO homework_quota_waits(job_id) VALUES(?)").run(job.id);
      else this.db.prepare("DELETE FROM homework_quota_waits WHERE job_id=?").run(job.id);
      const again = budget || (retry && job.attempts < 3);
      const nextAt = budget ? new Date(shanghaiDay(this.now()) + "T00:00:00+08:00").getTime() + 86400_000 : this.now() + (job.attempts === 1 ? 15000 : 60000);
      this.db.prepare("UPDATE jobs SET status=?,next_at=?,attempts=? WHERE id=?").run(again ? "queued" : "failed", nextAt, budget ? Math.max(0, job.attempts - 1) : job.attempts, job.id);
      if (!again && retry) note = "多次尝试仍未完成，原件已保留。可稍后重试，或补拍清晰照片。";
      if (job.upload_id) this.setStatus(job.upload_id, again ? "retrying" : "failed", note);
      this.db.prepare("UPDATE days SET status=?,note=? WHERE date=?").run(again ? "retrying" : "failed", note, job.date);
    });
  }
  retry(id: string) {
    const u = this.upload(id); if (!u) throw new HomeworkError(404, "资料不存在。");
    if (u.status !== "failed") throw new HomeworkError(409, "这份资料正在处理或已经整理，无需重复提交。");
    const job = this.db.prepare("SELECT attempts FROM jobs WHERE upload_id=?").get(id) as { attempts: number };
    if (job.attempts >= 6) throw new HomeworkError(429, "这份资料多次未能处理，请补拍清晰照片后上传。");
    this.db.prepare("UPDATE jobs SET status='queued',next_at=0 WHERE upload_id=?").run(id);
    this.setStatus(id, "queued", "已重新排队，等待AI整理。");
  }
  changeDate(id: string, date: string) {
    const u = this.upload(id); if (!u) throw new HomeworkError(404, "资料不存在。");
    if (["queued", "converting", "recognizing", "retrying", "uploading"].includes(u.status)) throw new HomeworkError(409, "请等待当前上传或整理结束后再调整日期。");
    if (u.date === date) return;
    this.transaction(() => {
      // A recognized memo keeps its literal date; correcting the selected date needs no new vision call.
      const fingerprint = hash({ date, kind: u.kind, files: this.files(id).map(({ size, sha256 }) => ({ size, sha256 })) });
      if (this.db.prepare("SELECT id FROM uploads WHERE fingerprint=? AND id!=?").get(fingerprint, id)) throw new HomeworkError(409, "目标日期已有相同资料，无需重复迁移。");
      this.db.prepare("UPDATE uploads SET date=?,fingerprint=? WHERE id=?").run(date, fingerprint, id);
      this.db.prepare("UPDATE jobs SET date=? WHERE upload_id=?").run(date, id);
      if (u.kind === "memo" && u.result) {
        const r = effectiveMemo(this, this.upload(id)!).result;
        const uncertain = !r.readable || !r.assignments.length || r.assignments.some((a: { subject: string | null }) => !a.subject) || (r.date && r.date !== date);
        this.setStatus(id, uncertain ? "needs_rescan" : "processed", uncertain ? "日期已调整，部分备忘录内容仍需补拍或检查日期。" : "日期已调整，正在重新对照当天资料。");
      }
      this.bump(u.date); this.bump(date);
    });
  }
  retryDay(date: string) {
    this.transaction(() => {
      const snapshot = this.snapshot(date);
      if (snapshot.pending) throw new HomeworkError(409, "AI正在整理，无需重复操作。");
      const outdated = snapshot.report?.tasks.some((task) => needsReviewTraceUpdate(task, this.reviewPolicy) || needsWrittenCompletionUpdate(task, this.writtenCompletionEnabled));
      if (snapshot.status !== "failed" && !outdated) throw new HomeworkError(409, "当天资料已按当前规则整理，无需重复操作。");
      this.bump(date);
    });
  }
  snapshot(date: string): HomeworkSnapshot {
    const day = this.db.prepare("SELECT * FROM days WHERE date=?").get(date) as { status: string; note: string; report: string | null } | undefined;
    const all = this.db.prepare("SELECT id FROM uploads WHERE date=? ORDER BY created_at DESC,rowid DESC").all(date) as { id: string }[];
    const dates = (this.db.prepare("SELECT DISTINCT date FROM uploads ORDER BY date DESC").all() as { date: string }[]).map((r) => r.date);
    const pending = !!this.db.prepare("SELECT id FROM jobs WHERE date=? AND status IN ('queued','running') AND (kind='recognize' OR revision=(SELECT revision FROM days WHERE date=jobs.date)) LIMIT 1").get(date);
    const report = day?.report ? reviewReportConclusion(DailyReportSchema.parse(JSON.parse(day.report)), this.reviewPolicy) : null;
    // Read current explanations even before reorganization, without rewriting the saved report.
    const memo = report?.memoId ? this.upload(report.memoId) : undefined;
    if (report && memo?.result) report.familyNotes = effectiveMemo(this, memo).receipts;
    const pendingUploads=pending?all.map(u=>this.upload(u.id)!).filter(u=>{
      const active=["queued","converting","recognizing","retrying"].includes(u.status);
      const unorganized=!!u.result&&(report?.organizedUploadIds?!report.organizedUploadIds.includes(u.id):!report?.updatedAt||u.created_at>report.updatedAt);
      return active||unorganized;
    }):[];
    const scoped=pendingUploads.filter(u=>u.kind==="homework").map(u=>({upload:u,target:resolveUploadTarget(this,u.id)}));
    const processing=pending?{taskIds:[...new Set(scoped.flatMap(s=>s.target?[s.target.taskId]:[]))],memo:pendingUploads.some(u=>u.kind==="memo"),subjects:[...new Set(scoped.filter(s=>!s.target).flatMap(s=>JSON.parse(s.upload.subjects)))],unclassified:scoped.some(s=>!s.target&&(!s.upload.result||!JSON.parse(s.upload.subjects).length)),retrying:day?.status==="retrying"}:undefined;
    return { date, processing, grading: this.grading.summary(date), writtenCompletionEnabled: this.writtenCompletionEnabled, reviewPolicy: this.reviewPolicy, status: day?.status || "empty", note: day?.note || "先上传当天的作业备忘录，再把作业照片交给AI整理。", report, uploads: all.map((u) => this.view(u.id)), dates, quota: this.quota(), pending };
  }
  close() { this.db.close(); }
}
