import { reviewReadings } from "./grading-readings";
import { settleReviewedQuestion } from "../../domain/grading-decision";
import { isWrittenTask } from "../../domain/written-completion";
import { automaticAttemptLimit } from "../../domain/homework-usage";
import { selectedSubmissionReport } from "./selected-submission";
import { gradingFailureText, type GradingFailure, type GradingStage } from "../../domain/grading-failure";
import { resolveUploadTarget } from "./upload-target";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { GRADING_VERSION, GradingResultSchema, emptyCounts, type GradingResult, type GradingSummary, type GradingBatchView, type MistakeView } from "../../domain/grading";
import type { HomeworkStore } from "./store";
import type { DailyReport } from "../../domain/homework";
export type GradingSource = { date: string; title: string; subject: string; assigned: boolean; requirements: string[]; taskIds: string[]; primaryPageId: string; pages: { id: string; file_id: string; number: number }[]; expectedLabels: string[] };
export type GradingRun = { id: string; primary_page_id?: string; source: string; status: string; attempts: number; result: string | null; note: string };
const digest = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
export class GradingStore {
  private pageHashes = new Map<string, { stamp: string; hash: string }>();
  constructor(readonly store: HomeworkStore) {
    store.db.exec(`CREATE TABLE IF NOT EXISTS grading_runs(id TEXT PRIMARY KEY,date TEXT NOT NULL,primary_page_id TEXT NOT NULL,source TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,status TEXT NOT NULL DEFAULT 'queued',attempts INTEGER NOT NULL DEFAULT 0,next_at INTEGER NOT NULL DEFAULT 0,result TEXT,note TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS grading_diagnostics(run_id TEXT PRIMARY KEY REFERENCES grading_runs(id),code TEXT NOT NULL,stage TEXT NOT NULL,attempts INTEGER NOT NULL,failed_at TEXT NOT NULL,source TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS grading_reviews(id TEXT PRIMARY KEY,run_id TEXT NOT NULL REFERENCES grading_runs(id),question_id TEXT NOT NULL,previous_question TEXT NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS grading_by_date ON grading_runs(date,active);
      CREATE INDEX IF NOT EXISTS grading_queue ON grading_runs(active,status,next_at);
      CREATE TABLE IF NOT EXISTS grading_mistakes(id TEXT PRIMARY KEY,first_date TEXT NOT NULL,last_date TEXT NOT NULL,subject TEXT NOT NULL,title TEXT NOT NULL,page_id TEXT NOT NULL,payload TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'verified');
      CREATE TABLE IF NOT EXISTS grading_occurrences(mistake_id TEXT NOT NULL REFERENCES grading_mistakes(id),run_id TEXT NOT NULL REFERENCES grading_runs(id),question_id TEXT NOT NULL,PRIMARY KEY(mistake_id,run_id,question_id));`);
    store.db.exec("UPDATE grading_runs SET status='queued' WHERE status='running'");
    for (const row of store.db.prepare("SELECT DISTINCT date FROM grading_runs WHERE active=1").all() as { date: string }[]) this.deduplicate(row.date);
  }
  private pageKey(page: GradingSource["pages"][number]): string {
    const path = join(this.store.directory, "pages", page.id + ".jpg");
    try {
      const stat = statSync(path), stamp = `${stat.size}:${stat.mtimeMs}`;
      let saved = this.pageHashes.get(page.id);
      if (!saved || saved.stamp !== stamp) { saved = { stamp, hash: createHash("sha256").update(readFileSync(path)).digest("hex") }; this.pageHashes.set(page.id, saved); }
      return `rendered:${saved.hash}:${page.number}`;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const file = this.store.file(page.file_id);
      return file ? `original:${file.sha256}:${page.number}` : `unknown:${page.id}`;
    }
  }
  private contentKey(source: GradingSource, fallback = "unknown"): string {
    if (!source.pages?.some(page => page.id === source.primaryPageId)) return `unresolved:${source.primaryPageId || fallback}`;
    const normalize = (text: string) => text.normalize("NFKC").replace(/\s+/g, " ").trim();
    return digest({ version: GRADING_VERSION, subject: source.subject, title: normalize(source.title), assigned: source.assigned,
      requirements: source.requirements.map(normalize).sort(),
      primary: source.pages.filter(p => p.id === source.primaryPageId).map(p => this.pageKey(p)), pages: source.pages.map(p => this.pageKey(p)) });
  }
  /** Keep history and originals; only equivalent active work is folded into one run. */
  private deduplicate(date: string) {
    this.store.db.exec("SAVEPOINT grading_deduplicate");
    try {
      const groups = new Map<string, (GradingRun & { active: number })[]>();
      for (const run of this.store.db.prepare("SELECT * FROM grading_runs WHERE date=? AND active=1 ORDER BY rowid").all(date) as (GradingRun & { active: number })[]) {
        const source = JSON.parse(run.source) as GradingSource;
        if (!source.pages?.some(p => p.id === source.primaryPageId)) continue;
        const key = this.contentKey(source), group = groups.get(key) || []; group.push(run); groups.set(key, group);
      }
      const rank = (run: GradingRun) => run.status === "done" && run.result && JSON.parse(run.result).version === GRADING_VERSION ? 0 : run.status === "running" ? 1 : run.status === "failed" ? 2 : run.status === "queued" ? 3 : 4;
      const quality = (run: GradingRun) => { const result = run.result ? JSON.parse(run.result) as GradingResult : null; return result ? (result.scopeComplete ? 1000 : 0) + result.questions.length : 0; };
      for (const group of groups.values()) {
        const active = group.filter(run => run.active); if (!active.length || group.length < 2) continue;
        const keep = [...group].sort((a, b) => rank(a) - rank(b) || quality(b) - quality(a))[0];
        const source = JSON.parse(keep.source) as GradingSource;
        source.taskIds = [...new Set(active.flatMap(run => (JSON.parse(run.source) as GradingSource).taskIds))];
        this.store.db.prepare("UPDATE grading_runs SET active=1,source=? WHERE id=?").run(JSON.stringify(source), keep.id);
        for (const run of active) if (run.id !== keep.id) {
          this.store.db.prepare("UPDATE grading_runs SET active=0 WHERE id=?").run(run.id);
          if (keep.status === "done" && keep.result && JSON.parse(keep.result).scopeComplete) this.store.db.prepare("UPDATE grading_mistakes SET status='duplicate' WHERE id IN (SELECT mistake_id FROM grading_occurrences WHERE run_id=?) AND NOT EXISTS (SELECT 1 FROM grading_occurrences o JOIN grading_runs r ON r.id=o.run_id WHERE o.mistake_id=grading_mistakes.id AND r.active=1)").run(run.id);
        }
      }
      this.store.db.exec("RELEASE grading_deduplicate");
    } catch (error) {
      this.store.db.exec("ROLLBACK TO grading_deduplicate; RELEASE grading_deduplicate");
      throw error;
    }
  }
  reuseCompleted(run: GradingRun): GradingResult | null {
    const source = JSON.parse(run.source) as GradingSource;
    if (!source.pages?.some(page => page.id === source.primaryPageId)) return null;
    const key = this.contentKey(source);
    for (const saved of this.store.db.prepare("SELECT source,result FROM grading_runs WHERE active=1 AND status='done' AND result IS NOT NULL ORDER BY rowid DESC").all() as { source: string; result: string }[]) {
      const previous = JSON.parse(saved.source) as GradingSource; if (this.contentKey(previous) !== key) continue;
      const result = GradingResultSchema.parse(JSON.parse(saved.result)); if (result.version !== GRADING_VERSION) continue;
      const remap = new Map(previous.pages.map((page, i) => [page.id, source.pages[i]]));
      if (result.questions.some(q => q.evidence.some(e => !remap.has(e.fileId)))) continue;
      return { ...result, questions: result.questions.map(q => ({ ...q, id: createHash("sha256").update(run.id + ":" + q.label).digest("hex"), evidence: q.evidence.map(e => ({ ...e, fileId: remap.get(e.fileId)!.id, page: e.page === null ? null : remap.get(e.fileId)!.number })) })) };
    }
    return null;
  }
  private selectedScope(report: DailyReport | null) {
    const projected = report ? selectedSubmissionReport(this.store, report) : null;
    const excluded = new Set<string>();
    for (const task of projected?.tasks || []) {
      if (!task.selectedSubmission) continue;
      const kept = new Set(task.evidence.map(e => e.fileId));
      for (const evidence of report!.tasks.find(t => t.id === task.id)?.evidence || []) if (!kept.has(evidence.fileId)) excluded.add(evidence.fileId);
    }
    // A page legitimately used by another assignment remains eligible there.
    for (const task of projected?.tasks || []) for (const evidence of task.evidence) excluded.delete(evidence.fileId);
    return { report: projected, excluded };
  }
  /** Retire only stale associations. Preserve originals, results, attempts and all still-current work. */
  reconcileSelectedScope(date: string) {
    const day = this.store.db.prepare("SELECT report FROM days WHERE date=?").get(date) as { report: string | null } | undefined;
    const { excluded } = this.selectedScope(day?.report ? JSON.parse(day.report) : null);
    return this.store.transaction(() => {
      let retired = 0;
      for (const row of this.store.db.prepare("SELECT id,primary_page_id FROM grading_runs WHERE date=? AND active=1").all(date) as { id: string; primary_page_id: string }[]) {
        if (excluded.has(row.primary_page_id)) retired += Number(this.store.db.prepare("UPDATE grading_runs SET active=0 WHERE id=?").run(row.id).changes);
      }
      return retired;
    });
  }
  queueDay(date: string, report: DailyReport | null) {
    if (!this.store.autoGradingEnabled) return;
    const scoped = this.selectedScope(report); report = scoped.report;
    const pages = this.store.uploads(date).filter(u => u.kind === "homework" && u.result).flatMap(u => (JSON.parse(u.result!).pages as { fileId: string; subject: string | null; book: string | null }[]).map(p => {
      const target = resolveUploadTarget(this.store, u.id);
      const assigned = target && report?.tasks.some(t => t.id === target.taskId && t.evidence.some(e => e.fileId === p.fileId));
      return { ...p, subject: p.subject || (assigned ? target.subject : null), page: this.store.page(p.fileId) };
    }));
    // Inferred labels and task IDs may change without changing the work to grade.
    const previous = this.store.db.prepare("SELECT * FROM grading_runs WHERE date=? AND active=1 ORDER BY rowid").all(date) as (GradingRun & { primary_page_id: string })[];
    const byContent = new Map(previous.filter(run => {
      const source = JSON.parse(run.source) as GradingSource;
      if (run.status === "done" && run.result && JSON.parse(run.result).version !== GRADING_VERSION) return false;
      return source.pages?.some(p => p.id === source.primaryPageId);
    }).map(run => [this.contentKey(JSON.parse(run.source)), run]));
    this.store.db.prepare("UPDATE grading_runs SET active=0 WHERE date=?").run(date);
    const time = new Date(this.store.now()).toISOString();
    for (let index = 0; index < pages.length; index++) {
      const primary = pages[index]; if (!primary.page || !primary.subject) continue;
      if (scoped.excluded.has(primary.fileId)) continue;
      const related = report?.tasks.filter(t => t.evidence.some(e => e.fileId === primary.fileId)) || [];
      const written = related.filter(isWrittenTask);
      if (related.length && !written.length) continue;
      const context = [pages[index - 1], primary, pages[index + 1]].filter(p => p?.page && p.subject === primary.subject && (p === primary || p.page!.file_id === primary.page!.file_id));
      const source: GradingSource = { date, title: written.map(t => t.title).join("、") || primary.book || "已上传作业", subject: primary.subject, assigned: !!written.length, requirements: written.map(t => t.inferredScope ? `${t.requirement}；${t.inferredMeaning?.description||""}检查范围根据已传作业推断：${t.inferredScope.description}；${t.inferredScope.note}` : t.requirement), taskIds: written.map(t => t.id), primaryPageId: primary.fileId, pages: context.map(p => p.page!), expectedLabels: written.flatMap(t => t.writtenCompletion?.parts.filter(p => p.evidence.fileId === primary.fileId).map(p => p.label) || []) };
      const id = digest({ version: GRADING_VERSION, source });
      const existing = byContent.get(this.contentKey(source));
      if (existing && existing.primary_page_id === source.primaryPageId) {
        this.store.db.prepare("UPDATE grading_runs SET active=1,source=? WHERE id=?").run(JSON.stringify(source), existing.id);
        continue;
      }
      this.store.db.prepare("INSERT INTO grading_runs(id,date,primary_page_id,source,created_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET active=1").run(id, date, primary.fileId, JSON.stringify(source), time, time);
    }
    this.deduplicate(date);
  }
  claim(): GradingRun | undefined {
    if (!this.store.autoGradingEnabled) return;
    return this.store.transaction(() => {
      const busy = new Set((this.store.db.prepare("SELECT source,primary_page_id FROM grading_runs WHERE status='running'").all() as { source: string; primary_page_id: string }[]).map(row => this.contentKey(JSON.parse(row.source), row.primary_page_id)));
      const run = (this.store.db.prepare("SELECT g.* FROM grading_runs g WHERE g.active=1 AND g.status='queued' AND g.next_at<=? AND NOT EXISTS (SELECT 1 FROM grading_runs busy WHERE busy.primary_page_id=g.primary_page_id AND busy.status='running') ORDER BY g.created_at,g.rowid").all(this.store.now()) as GradingRun[]).find(candidate => !busy.has(this.contentKey(JSON.parse(candidate.source), candidate.primary_page_id || candidate.id)));
      if (!run) return;
      this.store.db.prepare("UPDATE grading_runs SET status='running',attempts=attempts+1,updated_at=? WHERE id=?").run(new Date(this.store.now()).toISOString(), run.id);
      return { ...run, attempts: run.attempts + 1 };
    });
  }
  save(run: GradingRun, result: GradingResult) {
    this.store.transaction(() => {
      const source = JSON.parse(run.source) as GradingSource;
      const reviews = reviewReadings(this.store.db, run.id, result);
      if (reviews) result = { ...result, questions: result.questions.map(q => settleReviewedQuestion(q, reviews[q.id] || [])) };
      const active = this.store.db.prepare("SELECT active FROM grading_runs WHERE id=?").get(run.id) as { active: number };
      this.store.db.prepare("UPDATE grading_runs SET status='done',result=?,note='',updated_at=? WHERE id=?").run(JSON.stringify(GradingResultSchema.parse(result)), new Date(this.store.now()).toISOString(), run.id);
      if (!active.active) return;
      for (const question of result.questions) {
        const primaryEvidence = question.evidence.find(e => e.fileId === source.primaryPageId)!;
        const page = this.store.page(primaryEvidence.fileId)!, file = this.store.file(page.file_id)!;
        const id = digest({ file: file.sha256, page: page.number, subject: source.subject, label: question.label.normalize("NFKC").replace(/\s/g, "") });
        if (question.verdict === "wrong" && question.verification === "agreed") {
          this.store.db.prepare("INSERT INTO grading_mistakes(id,first_date,last_date,subject,title,page_id,payload) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET last_date=MAX(last_date,excluded.last_date),payload=excluded.payload,status='verified'").run(id, source.date, source.date, source.subject, source.title, source.primaryPageId, JSON.stringify(question));
          this.store.db.prepare("INSERT OR IGNORE INTO grading_occurrences(mistake_id,run_id,question_id) VALUES(?,?,?)").run(id, run.id, question.id);
        } else if (question.verdict === "correct" && question.verification === "agreed") this.store.db.prepare("UPDATE grading_mistakes SET status='withdrawn' WHERE id=?").run(id);
        else if (question.verdict === "uncertain" || question.verdict === "passedWithNote") this.store.db.prepare("UPDATE grading_mistakes SET status='needs_review' WHERE id=?").run(id);
      }
    });
  }
  fail(run: GradingRun, retry: boolean, budget: boolean, diagnostic?: { code: string; stage: GradingStage }) {
    const again = budget || (retry && run.attempts < automaticAttemptLimit(diagnostic?.code || ""));
    const next = budget ? Date.parse(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(this.store.now())) + "T00:00:00+08:00") + 86400000 : this.store.now() + (run.attempts === 1 ? 15000 : 60000);
    const failedAt = new Date(this.store.now()).toISOString();
    const info = diagnostic || { code: budget ? "BUDGET_LIMIT" : "UNKNOWN", stage: "unknown" as const };
    this.store.transaction(() => {
      this.store.db.prepare("UPDATE grading_runs SET status=?,next_at=?,attempts=?,note=?,updated_at=? WHERE id=?").run(again ? "queued" : "failed", next, budget ? Math.max(0, run.attempts - 1) : run.attempts, budget ? "今天的AI额度已用完，批改会在明天继续，原件已保存。" : again ? "批改暂未完成，后台会自动重试。" : "批改未完成，原件已保存，可以稍后重试。", failedAt, run.id);
      this.store.db.prepare("INSERT INTO grading_diagnostics(run_id,code,stage,attempts,failed_at,source) VALUES(?,?,?,?,?,'runtime') ON CONFLICT(run_id) DO UPDATE SET code=excluded.code,stage=excluded.stage,attempts=excluded.attempts,failed_at=excluded.failed_at,source=excluded.source").run(run.id, info.code, info.stage, run.attempts, failedAt);
    });
  }
  retry(date: string) {
    if (!this.store.autoGradingEnabled) return 0;
    this.reconcileSelectedScope(date);
    return Number(this.store.db.prepare("UPDATE grading_runs SET status='queued',next_at=0,note='' WHERE active=1 AND date=? AND status='failed' AND attempts<6").run(date).changes);
  }
  summary(date: string): GradingSummary {
    const summary: GradingSummary = { ...emptyCounts(), enabled: this.store.autoGradingEnabled, pending: 0, failed: 0, pages: 0, finished: 0, incomplete: 0, tasks: {} };
    if (!summary.enabled) return summary;
    for (const run of this.store.db.prepare("SELECT * FROM grading_runs WHERE date=? AND active=1 ORDER BY rowid").all(date) as (GradingRun & { active: number })[]) {
      const source = JSON.parse(run.source) as GradingSource; summary.pages++;
      const counts = emptyCounts(); let pending = 0, failed = 0, incomplete = 0;
      if (run.status === "done" && run.result) { summary.finished++; const result = GradingResultSchema.parse(JSON.parse(run.result)); for (const q of result.questions) counts[q.verdict]++; incomplete = result.scopeComplete ? 0 : 1; }
      else if (run.status === "failed") failed++; else pending++;
      for (const key of Object.keys(counts) as (keyof typeof counts)[]) summary[key] = (summary[key] ?? 0) + counts[key];
      summary.pending += pending; summary.failed += failed; summary.incomplete += incomplete;
      for (const id of source.taskIds) {
        const t = summary.tasks[id] ||= { ...emptyCounts(), pending: 0, failed: 0, incomplete: 0 };
        for (const key of Object.keys(counts) as (keyof typeof counts)[]) t[key] = (t[key] ?? 0) + counts[key];
        t.pending += pending; t.failed += failed; t.incomplete += incomplete;
      }
    }
    return summary;
  }
  results(date: string): { summary: GradingSummary; batches: GradingBatchView[] } {
    return { summary: this.summary(date), batches: (this.store.db.prepare("SELECT * FROM grading_runs WHERE date=? AND active=1 ORDER BY rowid").all(date) as (GradingRun & { primary_page_id: string })[]).map(run => { const source = JSON.parse(run.source) as GradingSource;
      const result = run.result ? GradingResultSchema.parse(JSON.parse(run.result)) : null;
      return { readings: reviewReadings(this.store.db, run.id, result), attempts: run.attempts, retryAllowed: run.status === "failed" && run.attempts < 6, failure: run.status === "done" ? null : this.failure(run.id), id: run.id, subject: source.subject, title: source.title, status: run.status, note: run.note, primaryPageId: run.primary_page_id, result }; }) };
  }
  private failure(runId: string): GradingFailure | null {
    const row = this.store.db.prepare("SELECT code,stage,failed_at,source FROM grading_diagnostics WHERE run_id=?").get(runId) as { code: string; stage: GradingStage; failed_at: string; source: GradingFailure["source"] } | undefined;
    return row ? { code: row.code, stage: row.stage, failedAt: row.failed_at, source: row.source, ...gradingFailureText(row.code) } : null;
  }
  mistakes(subject: string | null, offset = 0, limit = 30): { total: number; items: MistakeView[] } {
    const where = "status='verified'" + (subject ? " AND subject=?" : ""); const args = subject ? [subject] : [];
    const total = (this.store.db.prepare(`SELECT COUNT(*) AS n FROM grading_mistakes WHERE ${where}`).get(...args) as { n: number }).n;
    const rows = this.store.db.prepare(`SELECT *, (SELECT COUNT(*) FROM grading_occurrences WHERE mistake_id=grading_mistakes.id) AS occurrences FROM grading_mistakes WHERE ${where} ORDER BY last_date DESC,rowid DESC LIMIT ? OFFSET ?`).all(...args, limit, offset) as { id: string; first_date: string; last_date: string; subject: string; title: string; page_id: string; payload: string; occurrences: number }[];
    return { total, items: rows.map(r => ({ id: r.id, date: r.first_date, lastDate: r.last_date, subject: r.subject, title: r.title, pageId: r.page_id, occurrences: r.occurrences, question: JSON.parse(r.payload) })) };
  }
}
