"use client";
import { LearningScopeSchema, PracticeSubjectSchema, scopeLabels, type LearningScope, type PracticeSubject } from "@/domain/practice";
import { HomeworkPhoto } from "./homework-photo";
import { pagePhotoUrl } from "@/services/homework-photo";
import { gradingDisplayQuestion } from "@/domain/grading-display";
import { GRADING_STAGE_LABELS } from "@/domain/grading-failure";
import { gradingProgressText } from "@/domain/grading-progress";
import { useEffect, useRef, useState } from "react";
import { homeworkPost, homeworkRequest } from "@/services/homework-gateway";
import type { GradedQuestion, GradingBatchView, GradingSummary, MistakeView } from "@/domain/grading";
import { Image, ChevronUp, MessageCircle, PencilLine, Lightbulb, CircleCheck, Check, CircleAlert, X } from "lucide-react";
import { StatusIndicator } from "./status-indicator";
const verdicts = { correct: "正确", wrong: "错误 · 已入错题本", blank: "未作答", uncertain: "AI尚未确认", feedback: "主观题点评" };
const filterLabels = { correct: "正确", wrong: "错误", blank: "未作答", uncertain: "未确认", feedback: "点评" };
type GradingFilter = "attention" | "all" | GradedQuestion["verdict"];
function Photo({ id, url }: { id: string; url?: string }) {
  const [open, setOpen] = useState(false);
  return <div className="grade-photo"><button className="text-button" onClick={() => setOpen(!open)}>{open ? <ChevronUp size={17} aria-hidden="true" /> : <Image size={17} aria-hidden="true" />}{open ? "收起原图" : "查看原题照片"}</button>{open && <>{url ? <img src={url} alt="这道题所在的小练习答卷" loading="lazy"/> : <HomeworkPhoto pageId={id} alt="这道题所在的作业原图" />}<div className="grade-photo-actions"><a className="text-button" href={url || pagePhotoUrl(id,"full")} target="_blank" rel="noopener noreferrer">查看高清大图</a><a className="text-button" href={url || pagePhotoUrl(id,"screen",true)}>下载图片</a></div></>}</div>;
}
function QuestionCard({ question, date, subject, title, pageId, imageUrl }: { question: GradedQuestion; date: string; subject: string; title: string; pageId: string; imageUrl?: string }) {
  const q = gradingDisplayQuestion(question);
  return <article className={`grade-question grade-verdict-${q.verdict}`}>
    <div className="grade-question-heading"><h3>{q.label}</h3><StatusIndicator kind={q.verdict} className="grade-verdict-badge">{verdicts[q.verdict]}</StatusIndicator></div>
    <p className="grade-source">{date} · {subject} · {title}</p><p className="grade-stem">{q.question}</p>
    <dl className="grade-answers"><div><dt><PencilLine aria-hidden="true" />{q.verdict === "uncertain" ? "作答待辨清" : "识别到的作答"}</dt><dd>{q.studentAnswer || "未填写或未识别清楚"}</dd></div>{q.expectedAnswer && q.verdict !== "uncertain" && <div><dt><Lightbulb aria-hidden="true" />{q.verdict === "feedback" ? "参考思路" : "参考答案"}</dt><dd>{q.expectedAnswer}</dd></div>}</dl>
    {q.verdict === "correct" ? <details className="grade-explanation"><summary><Lightbulb size={17} aria-hidden="true" />查看解题思路</summary><p>{q.explanation}</p>{!!q.knowledgePoints.length && <p className="grade-source">知识点：{q.knowledgePoints.join("、")}</p>}</details> : <p>{q.explanation}</p>}
    {q.verdict === "wrong" && <div className="grade-cause"><strong>可能的错因 · {q.cause}</strong><p>{q.causeExplanation || "仅凭这一次作答还不能确定原因。"}</p>{q.nextStep && <><strong>下一步怎么做</strong><p>{q.nextStep}</p></>}</div>}
    {q.verdict !== "correct" && !!q.knowledgePoints.length && <p className="grade-source">知识点：{q.knowledgePoints.join("、")}</p>}
    <div className="grade-question-actions"><Photo id={pageId} url={imageUrl} /><button className="text-button" onClick={() => window.dispatchEvent(new CustomEvent("xiaobu:ask-homework", { detail: { date, question: `我想讨论${subject}的${q.label}：${q.question.slice(0, 550)}。${q.verdict === "uncertain" ? "系统尚未辨清我的作答，不要把识读当成我实际写下的字。" : `系统识读到的作答是${q.studentAnswer.slice(0, 250)}。`}请结合批改记录，引导我弄懂这道题。` } }))}><MessageCircle size={17} aria-hidden="true" />让小步帮我弄懂</button></div>
  </article>;
}
export function GradingPanel({ date, canManage = true, focusFailures = false }: { date: string; canManage?: boolean; focusFailures?: boolean }) {
  const failureRegion = useRef<HTMLElement>(null);
  const [data, setData] = useState<{ summary: GradingSummary; batches: GradingBatchView[] } | null>(null), [error, setError] = useState("");
  const [filter, setFilter] = useState<GradingFilter>("attention"), [retrying, setRetrying] = useState(false);
  useEffect(() => {
    let live = true; setData(null); setError(""); setFilter("attention");
    const load = async () => { try { const next = await homeworkRequest<{ summary: GradingSummary; batches: GradingBatchView[] }>(`/grading?date=${date}`); if (live) { setData(next); setError(""); } } catch (e) { if (live) setError(e instanceof Error ? e.message : "批改记录暂未读取成功"); } };
    void load(); const timer = setInterval(() => { if (!document.hidden) void load(); }, 4000); return () => { live = false; clearInterval(timer); };
  }, [date]);
  const failures = data?.batches.filter(batch => batch.status === "failed") || [];
  const hasFailures = failures.length > 0;
  useEffect(() => { if (focusFailures && hasFailures) { failureRegion.current?.focus({ preventScroll: true }); failureRegion.current?.scrollIntoView({ block: "start", behavior: "instant" }); } }, [date, focusFailures, hasFailures]);
  const canRetry = failures.some(batch => batch.retryAllowed !== false);
  const isCategory = filter !== "all" && filter !== "attention";
  const matches = (q: GradedQuestion) => filter === "all" || (filter === "attention" ? q.verdict !== "correct" : q.verdict === filter);
  const shownCount = data?.batches.reduce((count, batch) => count + (batch.result?.questions.filter(matches).length ?? 0), 0) ?? 0;
  const progressText = data ? gradingProgressText(data.batches, data.summary.pending) : null;
  return <section className="card grade-panel" aria-label="批改结果"><h2>批改结果</h2><p className="grade-source">{date.replaceAll("-", "/")} · AI逐题检查，错题自动归档</p>
    {error && <p role="alert" className="form-error">{error}</p>}
    {!data ? <p>正在读取批改记录…</p> : !data.summary.enabled ? <p>自动批改尚未启用。</p> : <>
      <div className="grade-counts" role="group" aria-label="按批改结果筛选">{(Object.keys(filterLabels) as GradedQuestion["verdict"][]).map(kind => <button type="button" key={kind} className="grade-stat-filter" aria-pressed={filter === kind} aria-label={`${filterLabels[kind]} ${data.summary[kind]}题`} onClick={() => setFilter(kind)}><StatusIndicator kind={kind} className="grade-stat"><span>{filterLabels[kind]}<strong>{data.summary[kind]}</strong></span></StatusIndicator>{filter === kind && <Check className="grade-filter-check" size={16} aria-hidden="true" />}</button>)}</div>
      {progressText && <p className="grade-progress" role="status"><StatusIndicator kind="pending">{progressText}</StatusIndicator></p>}
      {!!data.summary.incomplete && <p>部分题目还没完整识别，下面只展示已经检查的题。</p>}
      {!!data.summary.failed && <section ref={failureRegion} tabIndex={-1} className="grade-progress grade-failures" aria-label="批改未完成原因"><h3><CircleAlert size={21} aria-hidden="true" />{data.summary.failed}页批改未完成</h3>{failures.map(batch => <article className="grade-failure" key={batch.id}><h4>{batch.subject} · {batch.title}</h4><p>{batch.failure?.reason || "这份旧批改记录没有保存具体原因，原件已保留。"}</p><p className="grade-source">{batch.failure?.nextStep || "不用重新上传，家长可以重试批改。"}</p>{batch.attempts !== undefined && <small>已尝试{batch.attempts}次{batch.failure && ` · ${GRADING_STAGE_LABELS[batch.failure.stage]}`}</small>}{batch.retryAllowed === false && <p className="grade-source">这页已达到重试上限，请让家长联系维护人员检查。</p>}<Photo id={batch.primaryPageId} /></article>)}{canManage && <button className="button secondary compact" disabled={retrying || !canRetry} onClick={async () => { setRetrying(true); try { await homeworkPost("/grading/retry", { date }); setError(""); } catch (e) { setError(e instanceof Error ? e.message : "暂时不能重试"); } finally { setRetrying(false); } }}>重试批改</button>}<small>{!canManage && "请家长处理重试，已有结果仍可查看。"}</small></section>}
      <div className="tabs grade-filters"><button aria-pressed={filter === "attention"} className={filter === "attention" ? "selected" : ""} onClick={() => setFilter("attention")}>先看需要留意的题</button><button aria-pressed={filter === "all"} className={filter === "all" ? "selected" : ""} onClick={() => setFilter("all")}>全部题目</button></div>
      {!data.batches.length && <div><p>还没有批改记录。新上传的书面作业会自动处理；已上传的作业可以直接开始，无需重新上传。</p>{canManage && <button className="button secondary" disabled={retrying} onClick={async () => { setRetrying(true); try { await homeworkPost("/grading/start", { date }); setError(""); } catch (e) { setError(e instanceof Error ? e.message : "暂时无法开始批改"); } finally { setRetrying(false); } }}>批改这一天的作业</button>}</div>}
      {!!data.batches.length && <p className="grade-filter-summary" role="status">{isCategory ? `只看${filterLabels[filter]} · ${shownCount}题` : filter === "all" ? `全部题目 · ${shownCount}题` : `需要留意 · ${shownCount}题`}</p>}
      {isCategory && shownCount === 0 && <p className="grade-filter-empty">{filter === "feedback" ? "暂无点评。" : `暂无${filterLabels[filter]}的题目。`}{data.summary.pending > 0 ? "新结果会自动更新。" : ""}</p>}
      {data.batches.filter(batch => batch.status !== "failed" && (!isCategory || batch.result?.questions.some(matches))).map(batch => <section key={batch.id} className="grade-batch"><h3>{batch.subject} · {batch.title}</h3>{(batch.note || batch.result?.note) && <details className="grade-batch-note" open={batch.status === "failed"}><summary>查看批改说明</summary>{batch.note && <p>{batch.note}</p>}{batch.result?.note && <p>{batch.result.note}</p>}</details>}{batch.result?.questions.filter(matches).map(q => <QuestionCard key={q.id} question={q} date={date} subject={batch.subject} title={batch.title} pageId={batch.primaryPageId} />)}{batch.status === "done" && batch.result && !batch.result.questions.length && <p>这页未发现需要逐题批改的作答。</p>}{batch.status === "done" && batch.result?.questions.length && batch.result.questions.every(q => q.verdict === "correct") && filter === "attention" ? <p className="grade-all-correct"><CircleCheck size={22} aria-hidden="true" />已检查的{batch.result.questions.length}题均正确，可切换“全部题目”查看。</p> : null}</section>)}
      <p className="grade-source">错题经过两次识别与解答核验后自动入本；有分歧的题不直接判错。错因是根据作答提出的分析，主观题给出点评。</p>
    </>}
  </section>;
}
type MistakePage = { total: number; items: MistakeView[] };
type MistakeFilters = { subject: PracticeSubject | ""; scope: LearningScope | "" };

function readMistakes(filters: MistakeFilters, offset: number, signal: AbortSignal) {
  const query = new URLSearchParams({ offset: String(offset) });
  if (filters.subject) query.set("subject", filters.subject);
  if (filters.scope) query.set("scope", filters.scope);
  return homeworkRequest<MistakePage>(`/mistakes?${query}`, { signal });
}

function MistakeScopeEditor({ item, close, saved }: {
  item: MistakeView; close: () => void; saved: () => void;
}) {
  const current = item.scope || "unknown";
  const [scope, setScope] = useState<LearningScope>(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const saving = useRef(false);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  async function save() {
    if (saving.current || current === scope) return;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      await homeworkRequest(`/practice/scopes/${encodeURIComponent(item.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope }),
      });
      saved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "归属暂未保存，请重试。");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  return <dialog ref={dialog} className="reading-dialog mistake-scope-dialog" aria-labelledby="mistake-scope-title"
    onCancel={event => { event.preventDefault(); if (!saving.current) close(); }}>
    <header>
      <h2 id="mistake-scope-title">更改本题归属</h2>
      <button type="button" className="icon-button" aria-label="关闭归属编辑" disabled={busy} onClick={close}><X aria-hidden="true" /></button>
    </header>
    <form className="reading-dialog-body" onSubmit={event => { event.preventDefault(); void save(); }}>
      <p><strong>{item.question.label}</strong></p>
      <p className="reading-muted">{item.date} · {item.subject} · {item.title}</p>
      <label>本题归属
        <select value={scope} disabled={busy} onChange={event => setScope(LearningScopeSchema.parse(event.target.value))}>
          {LearningScopeSchema.options.map(value => <option key={value} value={value}>{scopeLabels[value]}</option>)}
        </select>
      </label>
      <p className="reading-muted">这里只更改这一题，原作业和其他错题的归属保持原样。</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="reading-record-actions">
        <button type="button" className="button secondary" disabled={busy} onClick={close}>取消</button>
        <button type="submit" className="button primary" disabled={busy || scope === current}>{busy ? "正在保存…" : "保存归属"}</button>
      </div>
    </form>
  </dialog>;
}

export function MistakeBook({ canManage = false }: { canManage?: boolean }) {
  const [filters, setFilters] = useState<MistakeFilters>({ subject: "", scope: "" });
  const [data, setData] = useState<MistakePage | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [editing, setEditing] = useState<MistakeView | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const requests = useRef<AbortController>(null);
  const expanded = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    requests.current = controller;
    expanded.current = false;
    setLoadingMore(false);
    let loading = false;
    async function load() {
      if (loading) return;
      loading = true;
      try {
        const next = await readMistakes(filters, 0, signal);
        if (!signal.aborted && !expanded.current) {
          setData(next);
          setError("");
        }
      } catch (e) {
        if (!signal.aborted && !expanded.current) setError(e instanceof Error ? e.message : "错题本暂未读取成功。");
      } finally {
        loading = false;
      }
    }
    void load();
    const timer = setInterval(() => { if (!document.hidden && !expanded.current) void load(); }, 6000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [filters, revision]);

  function changeFilters(next: MistakeFilters) {
    if (next.subject === filters.subject && next.scope === filters.scope) return;
    requests.current?.abort();
    setData(null);
    setError("");
    setFilters(next);
  }

  async function loadMore() {
    const signal = requests.current?.signal;
    if (!data || !signal || signal.aborted || loadingMore) return;
    expanded.current = true;
    setLoadingMore(true);
    setError("");
    try {
      const next = await readMistakes(filters, data.items.length, signal);
      if (!signal.aborted) setData({ total: next.total, items: [...data.items, ...next.items] });
    } catch (e) {
      if (!signal.aborted) setError(e instanceof Error ? e.message : "暂未读取成功。");
    } finally {
      if (!signal.aborted) setLoadingMore(false);
    }
  }

  return <section className="card grade-panel mistake-book" aria-label="错题本">
    <h2>我的错题本{data ? ` · ${data.total}题` : ""}</h2>
    <p className="grade-source">已核验的错题会沿用原作业归属，可单独纠正个别题。</p>
    <div className="tabs grade-filters" role="group" aria-label="按科目筛选">
      {(["", ...PracticeSubjectSchema.options] as const).map(subject =>
        <button type="button" key={subject} aria-pressed={filters.subject === subject} className={filters.subject === subject ? "selected" : ""}
          onClick={() => changeFilters({ ...filters, subject })}>{subject || "全部科目"}</button>)}
    </div>
    <div className="tabs grade-filters" role="group" aria-label="按课内外筛选">
      {(["", ...LearningScopeSchema.options] as const).map(scope =>
        <button type="button" key={scope} aria-pressed={filters.scope === scope} className={filters.scope === scope ? "selected" : ""}
          onClick={() => changeFilters({ ...filters, scope })}>{scope ? scopeLabels[scope] : "全部归属"}</button>)}
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {!data && !error && <p role="status">正在打开错题本…</p>}
    {data?.total === 0 && <p>这个分类暂时没有已核验的错题。</p>}
    {data?.items.map(item => <section className="mistake-entry" key={item.id}>
      <div className="mistake-scope">
        <strong>{scopeLabels[item.scope || "unknown"]}</strong>
        <span>{item.origin === "practice" ? "来自小练习" : "来自作业"}</span>
        {canManage && <button type="button" className="text-button" onClick={() => setEditing(item)}>
          <PencilLine size={16} aria-hidden="true" />更改本题归属
        </button>}
      </div>
      {item.retest && <p className="mistake-retest">复测{item.retest.rounds}轮 · 已判定{item.retest.attempts}题 · 通过率{item.retest.passRate === null ? "暂无" : `${item.retest.passRate}%`}{item.retest.uncertain ? ` · ${item.retest.uncertain}题待确认` : ""}{item.retest.blank ? ` · ${item.retest.blank}题未作答` : ""}{item.retest.lastDate ? ` · 最近${item.retest.lastDate}` : ""}。通过率只统计已确认的对错。</p>}
      <QuestionCard question={item.question} date={item.date} subject={item.subject} title={item.title} pageId={item.pageId} imageUrl={item.imageUrl} />
    </section>)}
    {data && data.items.length < data.total && <button type="button" className="button secondary" disabled={loadingMore} onClick={() => void loadMore()}>
      {loadingMore ? "正在读取…" : "查看更多错题"}
    </button>}
    {canManage && editing && <MistakeScopeEditor item={editing} close={() => setEditing(null)} saved={() => {
      requests.current?.abort();
      setEditing(null);
      setData(null);
      setError("");
      setRevision(value => value + 1);
    }} />}
  </section>;
}
