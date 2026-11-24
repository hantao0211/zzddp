import type { HomeworkScope, HomeworkScopeRef, HomeworkScopeSource } from "../../domain/homework-scope";
import type { DailyReport } from "../../domain/homework";
import { inferLearningScope, type LearningScope } from "../../domain/practice";
import { effectiveMemo, sourceHash } from "./memo-context";
import { HomeworkError, type HomeworkStore, type UploadRow } from "./store";
import { readUploadTarget } from "./upload-target";

type Task = DailyReport["tasks"][number];
type MistakeOrigin = { id: string; first_date: string; page_id: string; subject: string };

export class HomeworkScopes {
  constructor(private readonly store: HomeworkStore) {
    store.db.exec(`CREATE TABLE IF NOT EXISTS homework_source_scopes(
      source_kind TEXT NOT NULL, source_id TEXT NOT NULL, scope TEXT NOT NULL CHECK(scope IN ('curricular','extracurricular')),
      updated_at TEXT NOT NULL, PRIMARY KEY(source_kind,source_id));`);
  }

  private source(ref: HomeworkScopeRef, title: string, fallback: LearningScope = "unknown"): HomeworkScopeSource {
    const saved = this.store.db.prepare("SELECT scope FROM homework_source_scopes WHERE source_kind=? AND source_id=?")
      .get(ref.kind, ref.id) as { scope: HomeworkScope } | undefined;
    return { ...ref, title, scope: saved?.scope ?? inferLearningScope(title, fallback), confirmed: !!saved };
  }

  private entrySources(memo: UploadRow, data = effectiveMemo(this.store, memo)) {
    const hasDefault = this.store.db.prepare("SELECT 1 FROM homework_source_scopes WHERE source_kind='memo-default' AND source_id=?").get(memo.id);
    return data.result.assignments.map((entry, index) => this.source({
      kind: "entry", date: memo.date, id: `${memo.id}:entry:${index}:${sourceHash(data.original.assignments[index])}`,
    }, entry.title, hasDefault ? "curricular" : "unknown"));
  }

  entries(memo: UploadRow) { return this.entrySources(memo); }

  tasks(date: string, tasks: Task[]) {
    const result = new Map<string, HomeworkScopeSource>();
    const memoTasks = new Map<string, { source: HomeworkScopeSource; subject: string | null; originalTitle: string }[]>();
    for (const task of tasks) {
      const match = /^(.*):task:(\d+)$/.exec(task.id);
      if (match && !memoTasks.has(match[1])) {
        const memo = this.store.upload(match[1]);
        const data = memo?.kind === "memo" && memo.date === date && memo.result ? effectiveMemo(this.store, memo) : undefined;
        const sources = memo && data ? this.entrySources(memo, data).flatMap((source, index) => {
          const entry = data.result.assignments[index];
          return entry.subject ? [{ source, subject: entry.subject, originalTitle: data.original.assignments[index].title }] : [];
        }) : [];
        memoTasks.set(match[1], sources);
      }
      const entry = match ? memoTasks.get(match[1])?.[Number(match[2])] : undefined;
      const matches = entry && entry.subject === task.subject && (entry.source.title === task.title || entry.originalTitle === task.title);
      result.set(task.id, matches ? entry.source : this.source({ kind: "task", date, id: JSON.stringify([date, task.id]) }, task.title));
    }
    return result;
  }

  private reportTasks(date: string): Task[] {
    const row = this.store.db.prepare("SELECT report FROM days WHERE date=?").get(date) as { report: string | null } | undefined;
    return row?.report ? (JSON.parse(row.report) as DailyReport).tasks : [];
  }

  uploadSource(upload: UploadRow): HomeworkScopeSource {
    return this.source({ kind: "upload", date: upload.date, id: upload.id }, "作业照片／扫描件");
  }

  private uploadTaskSource(upload: UploadRow) {
    const target = readUploadTarget(this.store, upload.id);
    const memo = target ? this.store.upload(target.memoId) : undefined;
    if (!target || memo?.kind !== "memo" || memo.date !== upload.date || !memo.result) return undefined;
    const entry = this.entrySources(memo)[target.entryIndex];
    return entry?.id.endsWith(`:${target.sourceHash}`) ? { source: entry, subject: target.subject } : undefined;
  }

  sourceForUpload(upload: UploadRow) {
    return this.uploadTaskSource(upload)?.source ?? this.uploadSource(upload);
  }

  private save(source: HomeworkScopeSource, scope: HomeworkScope) {
    this.store.db.prepare(`INSERT INTO homework_source_scopes VALUES(?,?,?,?)
      ON CONFLICT(source_kind,source_id) DO UPDATE SET scope=excluded.scope,updated_at=excluded.updated_at
      WHERE scope<>excluded.scope`).run(source.kind, source.id, scope, new Date(this.store.now()).toISOString());
    return { ...source, scope, confirmed: true };
  }

  markNewMemo(uploadId: string) {
    this.store.db.prepare("INSERT INTO homework_source_scopes VALUES('memo-default',?,'curricular',?)")
      .run(uploadId, new Date(this.store.now()).toISOString());
  }

  confirmNewUpload(upload: UploadRow, scope?: HomeworkScope) {
    const source = this.sourceForUpload(upload);
    if (!scope) scope = source.scope === "unknown" ? "curricular" : source.scope;
    if (source.scope === scope && source.confirmed) return;
    if (source.confirmed && source.scope !== scope) {
      throw new HomeworkError(409, "这份作业已有归属。请从原作业或历史资料调整归属，再提交照片。");
    }
    this.save(source, scope);
  }

  set(ref: HomeworkScopeRef, scope: HomeworkScope) {
    let source: HomeworkScopeSource | undefined;
    if (ref.kind === "upload") {
      const upload = this.store.upload(ref.id);
      if (upload?.date === ref.date && upload.kind === "homework") source = this.sourceForUpload(upload);
    } else if (ref.kind === "entry") {
      const match = /^([^:]+):entry:(\d+):[a-f0-9]{64}$/.exec(ref.id);
      const memo = match ? this.store.upload(match[1]) : undefined;
      if (match && memo?.date === ref.date && memo.kind === "memo" && memo.result) source = this.entrySources(memo)[Number(match[2])];
    } else {
      const tasks = this.reportTasks(ref.date);
      source = [...this.tasks(ref.date, tasks).values()].find(value => value.id === ref.id);
    }
    if (source?.id !== ref.id || source.kind !== ref.kind) throw new HomeworkError(409, "作业来源已更新，请重新打开这份作业。");
    return this.save(source, scope);
  }

  forMistakes(rows: MistakeOrigin[]) {
    const days = new Map<string, Map<string, { subject: string; source: HomeworkScopeSource }[]>>();
    const uploadCache = new Map<string, { target?: ReturnType<HomeworkScopes["uploadTaskSource"]>; upload?: HomeworkScopeSource }>();
    const pageOwner = this.store.db.prepare("SELECT u.* FROM pages p JOIN files f ON f.id=p.file_id JOIN uploads u ON u.id=f.upload_id WHERE p.id=? AND u.kind='homework'");
    const result = new Map<string, { task?: HomeworkScopeSource; upload?: HomeworkScopeSource }>();
    for (const row of rows) {
      if (!days.has(row.first_date)) {
        const tasks = this.reportTasks(row.first_date);
        const sources = this.tasks(row.first_date, tasks);
        const pages = new Map<string, { subject: string; source: HomeworkScopeSource }[]>();
        for (const task of tasks) {
          for (const page of new Set((task.evidence ?? []).map(evidence => evidence.fileId))) {
            const matches = pages.get(page) ?? [];
            matches.push({ subject: task.subject, source: sources.get(task.id)! });
            pages.set(page, matches);
          }
        }
        days.set(row.first_date, pages);
      }
      if (!uploadCache.has(row.page_id)) {
        const upload = pageOwner.get(row.page_id) as UploadRow | undefined;
        uploadCache.set(row.page_id, upload ? { target: this.uploadTaskSource(upload), upload: this.uploadSource(upload) } : {});
      }
      const owner = uploadCache.get(row.page_id)!;
      const matches = days.get(row.first_date)?.get(row.page_id)?.filter(task => task.subject === row.subject) ?? [];
      const target = owner.target?.subject === row.subject && owner.target.source.date === row.first_date ? owner.target.source : undefined;
      const task = matches.length === 1 ? matches[0].source : matches.length === 0 || matches.some(match => match.source.id === target?.id) ? target : undefined;
      result.set(row.id, { task, upload: owner.upload });
    }
    return result;
  }
}
