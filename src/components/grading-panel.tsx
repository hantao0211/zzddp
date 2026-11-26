"use client";
import { LearningScopeSchema, PracticeSubjectSchema, scopeLabels, type LearningScope, type PracticeSubject } from "@/domain/practice";
import {MistakeInsights,QuestionTags,type Selections} from "./mistake-insights";
import {dimensions,type Dimension,type Analysis} from "@/domain/assessment";
import { FamilyGradeReview, GradeReviewPreview } from "./grade-review-preview";
import type { GradePreview } from "@/domain/grade-review";
import { HomeworkPhoto } from "./homework-photo";
import { PhotoPreviewButton } from "./photo-preview";
import { pagePhotoUrl } from "@/services/homework-photo";
import { gradingDisplayQuestion, gradingTakeaway, mistakeQuestionSummary } from "@/domain/grading-display";
import { GRADING_STAGE_LABELS } from "@/domain/grading-failure";
import { gradingProgressText } from "@/domain/grading-progress";
import { useEffect, useRef, useState } from "react";
import { homeworkPost, homeworkRequest } from "@/services/homework-gateway";
import type { GradedQuestion, GradingReading, GradingBatchView, GradingSummary, MistakeView } from "@/domain/grading";
import { Image, ChevronLeft, ChevronRight, ChevronUp, MessageCircle, PencilLine, Lightbulb, X } from "lucide-react";
import { mistakeOrders, type MistakeSort } from "@/domain/mistake-sort";
import { isSignatureRecord } from "@/domain/grading-signature";
import { MistakeFilterMenu } from "./mistake-filter-menu";
import { GradingFilters, filterLabels, type GradingFilter } from "./grading-filters";
import { StatusIndicator } from "./status-indicator";
const verdicts = { passedWithNote: "通过但存疑", correct: "正确", wrong: "错误 · 已入错题本", blank: "未作答", uncertain: "AI尚未确认", feedback: "主观题点评" };
function Photo({ id, url, alwaysOpen = false }: { id: string; url?: string; alwaysOpen?: boolean }) {
  const [open, setOpen] = useState(false);
  const alt = url ? "这道题所在的原卷" : "这道题所在的作业原图";
  return <div className="grade-photo">
    {!alwaysOpen && <button type="button" className="text-button" onClick={() => setOpen(!open)}>
      {open ? <ChevronUp size={17} aria-hidden="true" /> : <Image size={17} aria-hidden="true" />}
      {open ? "收起原图" : "查看原题照片"}
    </button>}
    {(open || alwaysOpen) && <>
      {url ? <img src={url} alt={alt} loading="lazy" /> : <HomeworkPhoto pageId={id} alt={alt} />}
      <div className="grade-photo-actions">
        <PhotoPreviewButton src={url || pagePhotoUrl(id, "full")} alt={alt}>查看高清大图</PhotoPreviewButton>
        <a className="text-button" href={url || pagePhotoUrl(id, "screen", true)} download>下载图片</a>
      </div>
    </>}
  </div>;
}
function Explanation({detailMode,label,children}: {detailMode:boolean;label:string;children:React.ReactNode}) {
  return detailMode ? <div className="grade-explanation">{children}</div> : <details className="grade-explanation"><summary>{label}</summary>{children}</details>;
}
function QuestionCard({ question, date, subject, title, pageId, imageUrl, displayLabel, preview, runId, version, canConfirm = false, detailMode = false, readings = [] }: { detailMode?: boolean; runId?: string; version?: string; preview?: GradePreview; canConfirm?: boolean; readings?: GradingReading[]; question: GradedQuestion; date: string; subject: string; title?: string; pageId: string; imageUrl?: string; displayLabel?: string }) {
  const q = gradingDisplayQuestion(question);
  const signature = isSignatureRecord(q);
  const takeaway = signature ? "" : gradingTakeaway(q, readings);
  const [tab,setTab] = useState<"result"|"photo"|"review">("result");
  const chat = <button className="text-button" onClick={() => window.dispatchEvent(new CustomEvent("xiaobu:ask-homework", { detail: { date, gradingTopic: { pageId, questionId: question.id, label: `${subject} · ${displayLabel || q.label}`.slice(0,400), stem: q.question.slice(0,600) } } }))}><MessageCircle size={17} aria-hidden="true" />和小步聊这题</button>;
  return <article className={`grade-question grade-verdict-${q.verdict}`}>
    <div className="grade-question-heading"><h3>{displayLabel || q.label}</h3><StatusIndicator kind={q.verdict === "passedWithNote" ? "correct" : q.verdict} className="grade-verdict-badge">{signature ? "签名记录" : verdicts[q.verdict]}</StatusIndicator></div>
    {takeaway && <p className="grade-takeaway">{q.verdict === "passedWithNote" && "疑点 · "}{takeaway}</p>}
    {q.familyReview && <p className="grade-source">家长已核对{q.familyReview.correction && ` · 已订正为「${q.familyReview.correction}」`}</p>}
    {detailMode && <div className="grade-detail-tabs" role="group" aria-label="本题内容">
      <button type="button" aria-pressed={tab === "result"} onClick={() => setTab("result")}>批改依据</button>
      <button type="button" aria-pressed={tab === "photo"} onClick={() => setTab("photo")}>原题照片</button>
      {(preview || (canConfirm && version)) && <button type="button" aria-pressed={tab === "review"} onClick={() => setTab("review")}>{preview ? "更正建议" : "家长核对"}</button>}
    </div>}
    {preview && (!detailMode || tab === "review") && <GradeReviewPreview key={preview.id} preview={preview} canConfirm={canConfirm} />}
    {(!detailMode || tab === "result") && <Explanation detailMode={detailMode} label={(q.verdict === "uncertain" || q.verdict === "passedWithNote") && readings.length ? "查看复核记录" : "查看详情"}>
      {!detailMode && <p className="grade-source">{date} · {subject}{title && ` · ${title}`}</p>}
      <p className="grade-stem">{q.question}</p>
      <dl className="grade-answers">
        <div><dt><PencilLine aria-hidden="true" />{signature ? "签名及日期" : q.verdict === "uncertain" ? "AI 读到的作答" : "识别到的作答"}</dt><dd>{q.studentAnswer || "未填写或未识别清楚"}</dd></div>
        {q.expectedAnswer && q.verdict !== "uncertain" && q.verdict !== "passedWithNote" && <div><dt><Lightbulb aria-hidden="true" />{q.verdict === "feedback" ? "参考思路" : "参考答案"}</dt><dd>{q.expectedAnswer}</dd></div>}
      </dl>
      {readings.map(r => <div key={r.stage} className="grade-reading"><strong>{{ verification: "独立核对", focusOne: "复查一", focusTwo: "复查二" }[r.stage]}</strong>
        <p>AI 读到：{r.studentAnswer || "未辨清"} · {filterLabels[r.verdict]} · 把握{{ high: "高", medium: "中", low: "低" }[r.confidence]}</p>
        {r.explanation && <p>{r.explanation}</p>}
      </div>)}
      {q.explanation && q.explanation !== takeaway && !(q.verdict === "uncertain" && q.explanation === "两次识别或独立解答未取得一致结果，尚未判对错。") && <p>{q.explanation}</p>}
      {q.verdict === "wrong" && <div className="grade-cause"><strong>可能的错因 · {q.cause}</strong><p>{q.causeExplanation || "仅凭这一次作答还不能确定原因。"}</p>{q.nextStep && <><strong>下一步怎么做</strong><p>{q.nextStep}</p></>}</div>}
      {!!q.knowledgePoints.length && <p className="grade-source">知识点：{q.knowledgePoints.join("、")}</p>}
    </Explanation>}
    {detailMode ? <>{tab === "photo" && <Photo id={pageId} url={imageUrl} alwaysOpen />}{tab === "result" && chat}</> :
      <div className="grade-question-actions"><Photo id={pageId} url={imageUrl} />{chat}</div>}
    {canConfirm && version && runId && <div hidden={detailMode && tab !== "review"}><FamilyGradeReview signature={signature} initiallyOpen={detailMode && !preview} key={version + (preview?.id || "")} runId={runId} questionId={question.id} version={version} initial={{original:q.studentAnswer,expected:q.expectedAnswer,correction:q.familyReview?.correction || ""}} /></div>}
  </article>;
}
function pageStatus(batch: GradingBatchView) {
  if (batch.status === "failed") return "批改未完成";
  if (batch.status === "running") return "正在批改";
  if (batch.status === "done") return batch.result?.scopeComplete ? "已批改" : "部分已批";
  return "等待批改";
}

function GradeDetail({close, position, count, move, itemKey, children, label = "批改详情"}: {
  label?: string;
  close: () => void; position: number; count: number; move: (index: number) => void; itemKey: string; children: React.ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  useEffect(() => { if (body.current) body.current.scrollTop = 0; },[itemKey]);
  return <dialog ref={dialog} className="dialog grade-detail-dialog" aria-label={label} onCancel={e => { e.preventDefault(); close(); }}>
    <header className="grade-detail-nav">
      <button type="button" onClick={close}><ChevronLeft size={17} aria-hidden="true" />返回列表</button>
      <div><button type="button" aria-label="上一条" disabled={position <= 0} onClick={() => move(position - 1)}><ChevronLeft size={18} /></button>
        {position >= 0 && <span>{position + 1} / {count}</span>}
        <button type="button" aria-label="下一条" disabled={position < 0 || position + 1 >= count} onClick={() => move(position + 1)}><ChevronRight size={18} /></button></div>
    </header>
    <div ref={body} className="grade-detail-body">{children}</div>
  </dialog>;
}
export function GradingPanel({ date, canManage = true, focusFailures = false }: { date: string; canManage?: boolean; focusFailures?: boolean }) {
  const listHeading = useRef<HTMLHeadingElement>(null);
  const [page, setPage] = useState(0);
  type RowId = { batchId: string; questionId?: string };
  const [selected, setSelected] = useState<RowId | null>(null);
  const navigation = useRef<RowId[]>([]);
  const opener = useRef<HTMLButtonElement | null>(null);
  const [data, setData] = useState<{ summary: GradingSummary; batches: GradingBatchView[] } | null>(null), [error, setError] = useState("");
  const [filter, setFilter] = useState<GradingFilter>(focusFailures ? "ungraded" : "attention"), [retrying, setRetrying] = useState(false);
  useEffect(() => {
    let live = true; setData(null); setError("");
    const load = async () => { try { const next = await homeworkRequest<{ summary: GradingSummary; batches: GradingBatchView[] }>(`/grading?date=${date}`); if (live) { setData(next); setError(""); } } catch (e) { if (live) setError(e instanceof Error ? e.message : "批改记录暂未读取成功"); } };
    void load(); const timer = setInterval(() => { if (!document.hidden) void load(); }, 4000); return () => { live = false; clearInterval(timer); };
  }, [date]);
  useEffect(() => {
    setSelected(null);
    setPage(0);
    setFilter(focusFailures ? "ungraded" : "attention");
  }, [date, focusFailures]);
  function chooseFilter(next: GradingFilter) {
    setFilter(current => current === next ? "all" : next);
    setPage(0);
  }
  const batches = data?.batches ?? [];
  const ungradedPages = batches.filter(batch => batch.status !== "done" || !batch.result?.scopeComplete);
  const isCategory = filter !== "all" && filter !== "attention" && filter !== "ungraded";
  type Row = { batch: GradingBatchView; question?: GradedQuestion };
  const rows: Row[] = [];
  let shownCount = 0;
  for (const batch of batches) {
    if (!isCategory && (batch.status !== "done" || !batch.result?.scopeComplete)) rows.push({batch});
    if (filter === "ungraded" || batch.status !== "done") continue;
    if (filter === "all" && batch.result?.scopeComplete && !batch.result.questions.length) rows.push({batch});
    for (const q of batch.result?.questions || []) {
      if (filter === "all" || filter === q.verdict || (filter === "attention" && (batch.previews?.[q.id] || (!isSignatureRecord(q) && q.verdict !== "correct" && q.verdict !== "passedWithNote")))) {
        rows.push({batch,question:q});
        shownCount++;
      }
    }
  }
  const pageSize = 10;
  const pageCount = Math.ceil(rows.length / pageSize);
  const currentPage = Math.min(page, Math.max(0,pageCount - 1));
  const start = currentPage * pageSize;
  const visible = rows.slice(start, start + pageSize);
  const selectedBatch = batches.find(batch => batch.id === selected?.batchId);
  const selectedQuestion = selectedBatch?.result?.questions.find(q => q.id === selected?.questionId);
  const selectedIndex = navigation.current.findIndex(row => row.batchId === selected?.batchId && row.questionId === selected?.questionId);
  function openRow(row: Row, button: HTMLButtonElement) {
    opener.current = button;
    navigation.current = rows.map(({batch,question}) => ({batchId:batch.id,questionId:question?.id}));
    setSelected({batchId:row.batch.id,questionId:row.question?.id});
  }
  function turnPage(next: number) {
    setPage(next);
    listHeading.current?.focus({preventScroll:true});
    listHeading.current?.scrollIntoView({block:"nearest"});
  }
  const progressText = data ? gradingProgressText(data.batches, data.summary.pending) : null;
  return <section className="card grade-panel" aria-label="批改结果"><h2>批改结果</h2>
    {error && <p role="alert" className="form-error">{error}</p>}
    {!data ? <p>正在读取批改记录…</p> : !data.summary.enabled ? <p>自动批改尚未启用。</p> : <>
      <GradingFilters value={filter} onChange={chooseFilter} summary={data.summary} ungraded={ungradedPages.length} />
      {!data.batches.length && <div><p>还没有批改记录。新上传的书面作业会自动处理；已上传的作业可以直接开始，无需重新上传。</p>{canManage && <button className="button primary" disabled={retrying} onClick={async () => { setRetrying(true); try { await homeworkPost("/grading/start", { date }); setError(""); } catch (e) { setError(e instanceof Error ? e.message : "暂时无法开始批改"); } finally { setRetrying(false); } }}>批改这一天的作业</button>}</div>}
      {!!batches.length && <h3 ref={listHeading} tabIndex={-1} className="grade-list-caption">{filter === "ungraded" ? `未批改 · ${ungradedPages.length}页` : isCategory ? `只看${filterLabels[filter]} · ${shownCount}题` : `${filter === "all" ? "全部题目" : "需要留意"} · ${shownCount}题`}</h3>}
      {!!batches.length && !rows.length && <p className="grade-filter-empty">{filter === "ungraded" ? "暂无未批改的页面。" : filter === "feedback" ? "暂无点评。" : isCategory ? `暂无${filterLabels[filter]}的题目。` : "当前没有需要留意的题。"}</p>}
      {visible.map(({batch,question},i) => {
        const q = question && gradingDisplayQuestion(question);
        const status = q && isSignatureRecord(q) ? "签名记录" : q ? filterLabels[q.verdict] : pageStatus(batch);
        const hint = q && isSignatureRecord(q) ? q.studentAnswer : q ? (q.familyReview?.correction ? `已订正为「${q.familyReview.correction}」` : gradingTakeaway(q,batch.readings?.[q.id]) || q.question) : batch.failure?.reason || batch.note;
        return <div key={JSON.stringify([batch.id,q?.id])}>
          {(i === 0 || visible[i-1].batch.id !== batch.id) && <h4 className="grade-list-group">{batch.subject} · {batch.title}</h4>}
          <button type="button" className="grade-result-row" onClick={e => openRow({batch,question}, e.currentTarget)}>
            <span className="grade-row-copy"><strong>{q?.label || "本页批改"}</strong>{hint && <small>{hint}</small>}</span>
            <span className={`grade-row-status status-${q ? q.verdict === "passedWithNote" ? "correct" : q.verdict : batch.status === "failed" ? "wrong" : "pending"}`}>{q && batch.previews?.[q.id] ? "待家长确认" : status}</span>
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>;
      })}
      {pageCount > 1 && <nav className="grade-list-pages" aria-label="批改结果翻页">
        <button type="button" disabled={currentPage === 0} onClick={() => turnPage(currentPage - 1)}>上一页</button>
        <span>{currentPage + 1} / {pageCount}</span>
        <button type="button" disabled={currentPage + 1 >= pageCount} onClick={() => turnPage(currentPage + 1)}>下一页</button>
      </nav>}
      {selected && <GradeDetail close={() => {
        setSelected(null);
        requestAnimationFrame(() => (opener.current?.isConnected ? opener.current : listHeading.current)?.focus({preventScroll:true}));
      }} position={selectedIndex} count={navigation.current.length} move={index => setSelected(navigation.current[index])} itemKey={JSON.stringify(selected)}>
        {selectedBatch && (selectedQuestion || !selected.questionId) ? <>
          <p className="grade-detail-source">{date.replaceAll("-","/")} · {selectedBatch.subject} · {selectedBatch.title}</p>
          {selectedQuestion ? <QuestionCard detailMode key={JSON.stringify(selected)} question={selectedQuestion} preview={selectedBatch.previews?.[selectedQuestion.id]} runId={selectedBatch.id} version={selectedBatch.reviewVersions?.[selectedQuestion.id]} canConfirm={canManage} readings={selectedBatch.readings?.[selectedQuestion.id]} date={date} subject={selectedBatch.subject} title={selectedBatch.title} pageId={selectedBatch.primaryPageId} /> :
            <section className="grade-page-detail" aria-label="本页批改情况">
              <h3>{pageStatus(selectedBatch)}</h3>
              {selectedBatch.status === "failed" ? <>
                <p>{selectedBatch.failure?.reason || "这份旧记录没有保存具体失败原因。"}</p>
                <p>{selectedBatch.failure?.nextStep || "原件已保存，可请家长重试。"}</p>
                {selectedBatch.attempts !== undefined && <small>已尝试{selectedBatch.attempts}次{selectedBatch.failure && ` · ${GRADING_STAGE_LABELS[selectedBatch.failure.stage]}`}</small>}
                {selectedBatch.retryAllowed === false && <p>本页已达到重试上限。</p>}
                {canManage && batches.some(b => b.status === "failed" && b.retryAllowed !== false) && <button type="button" className="button primary compact" disabled={retrying} onClick={async () => {
                  setRetrying(true);
                  try { await homeworkPost("/grading/retry",{date}); setError(""); }
                  catch(e) { setError(e instanceof Error ? e.message : "暂时不能重试"); }
                  finally { setRetrying(false); }
                }}>重试当天失败页</button>}
                {!canManage && <p>请家长处理重试，已有结果仍可查看。</p>}
              </> : <p>{selectedBatch.note || (selectedBatch.status === "done" ? selectedBatch.result?.scopeComplete ? "本页已完成批改。" : "本页已有部分结果，可在全部题目中查看。" : progressText)}</p>}
              {error && <p role="alert">{error}</p>}
              <Photo key={selectedBatch.id} id={selectedBatch.primaryPageId} />
            </section>}
          {(selectedBatch.note || selectedBatch.result?.note) && <details className="grade-batch-note"><summary>查看这页的批改说明</summary><p>{selectedBatch.result?.note || selectedBatch.note}</p></details>}
        </> : <p>这条记录已经更新，请返回列表查看。</p>}
      </GradeDetail>}
    </>}
  </section>;
}
const MISTAKE_PAGE_SIZE = 10;
type MistakePage = { total: number; items: MistakeView[];analysis?:Analysis;options?:Record<Dimension,string[]>;indexing?:boolean };
function mistakeSourceLabel(item: MistakeView, compact = false) {
  const source = item.provenance;
  if (source?.kind === "exam") return `试卷 · ${source.title}`;
  if (source?.kind === "assignment") return `${compact ? "作业" : "来自作业"} · ${source.title}`;
  if (source?.kind === "practice" || item.origin === "practice") {
    return `${compact ? "小练习" : "来自小练习"} · ${source?.title || item.title}`;
  }
  return source?.title ? `未匹配作业 · ${source.title}` : compact ? "作业待匹配" : "未匹配具体作业";
}
type MistakeFilters = { subject: PracticeSubject | ""; scope: LearningScope | ""; sort: MistakeSort; more?:Selections };

function readMistakes(filters: MistakeFilters, offset: number, signal: AbortSignal) {
  const query = new URLSearchParams({ offset: String(offset), limit: String(MISTAKE_PAGE_SIZE), sort: filters.sort });
  if (filters.subject) query.set("subject", filters.subject);
  if (filters.scope) query.set("scope", filters.scope);
  if(filters.more){
    for(const d of dimensions)for(const value of filters.more[d]??[])query.append(d,value);
    for(const k of ["from","to","grain"] as const)if(filters.more[k])query.set(k,filters.more[k]);
  }
  return homeworkRequest<MistakePage>(`/mistakes?${query}`, { signal });
}

function MistakeScopeEditor({ item, close, saved }: {
  item: MistakeView; close: () => void; saved: () => void;
}) {
  const summary = mistakeQuestionSummary(item.question);
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
      <p><strong>{summary.title}</strong></p>
      {summary.preview && <p className="reading-muted">{summary.preview}</p>}
      <p className="mistake-origin">{mistakeSourceLabel(item)}</p>
      <p className="reading-muted">{item.date} · {item.subject}</p>
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
  const [filters, setFilters] = useState<MistakeFilters>({ subject: "", scope: "", sort:"newest" });
  const [data, setData] = useState<MistakePage | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [editing, setEditing] = useState<MistakeView | null>(null);
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const requests = useRef<AbortController>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const openIdRef = useRef(openId);
  openIdRef.current = openId;

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    requests.current = controller;
    let loading = false;

    async function load() {
      if (loading) return;
      loading = true;
      try {
        const next = await readMistakes(filters, page * MISTAKE_PAGE_SIZE, signal);
        if (signal.aborted) return;
        const lastPage = Math.max(0, Math.ceil(next.total / MISTAKE_PAGE_SIZE) - 1);
        if (page > lastPage) {
          setData(null);
          setOpenId(null);
          setPage(lastPage);
          return;
        }
        setData(next);
        setOpenId(current => next.items.some(item => item.id === current) ? current : null);
        setError("");
      } catch (e) {
        if (!signal.aborted) setError(e instanceof Error ? e.message : "错题本暂未读取成功。");
      } finally {
        loading = false;
      }
    }
    void load();
    const timer = setInterval(() => {
      if (!document.hidden && page === 0 && !openIdRef.current) void load();
    }, 6000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [filters, page, revision]);

  function resetResults() {
    requests.current?.abort();
    setData(null);
    setError("");
    setOpenId(null);
  }

  function changeFilters(next: MistakeFilters) {
    if (next.subject === filters.subject && next.scope === filters.scope && next.more===filters.more && next.sort===filters.sort) return;
    requests.current?.abort();
    setOpenId(null);
    setPage(0);
    setFilters(next);
  }

  function changePage(next: number) {
    resetResults();
    setPage(next);
    heading.current?.focus();
  }

  const index = data?.items.findIndex(item => item.id === openId) ?? -1;
  const selected = data?.items[index];
  const sortField = filters.sort === "oldest" || filters.sort === "newest" ? "date" : "occurrences";
  const ascending = filters.sort === mistakeOrders[sortField].ascending;
  const pageCount = Math.ceil((data?.total ?? 0) / MISTAKE_PAGE_SIZE);
  return <section className="card grade-panel mistake-book" aria-label="错题本">
    <h2 ref={heading} tabIndex={-1}>我的错题本{data ? ` · ${data.total}题` : ""}</h2>
    <div className="mistake-toolbar" role="group" aria-label="错题筛选与排序">
      <MistakeFilterMenu<PracticeSubject | ""> name="科目" caption={filters.subject || "科目"} value={filters.subject} active={!!filters.subject}
        choices={[{value:"",label:"全部科目"}, ...PracticeSubjectSchema.options.map(value=>({value,label:value}))]}
        onChange={subject=>changeFilters({...filters, subject})} />
      <MistakeFilterMenu<LearningScope | ""> name="归属" caption={filters.scope ? scopeLabels[filters.scope] : "归属"} value={filters.scope} active={!!filters.scope}
        choices={[{value:"",label:"全部归属"}, ...LearningScopeSchema.options.map(value=>({value,label:scopeLabels[value]}))]}
        onChange={scope=>changeFilters({...filters, scope})} />
      <MistakeFilterMenu<keyof typeof mistakeOrders> name="排序依据" caption={sortField==="date" ? "日期" : "次数"} value={sortField} active={sortField==="occurrences"}
        choices={[{value:"date",label:"收录日期"},{value:"occurrences",label:"收录次数"}]}
        onChange={field=>changeFilters({...filters,sort:mistakeOrders[field][ascending ? "ascending" : "descending"]})} />
      <button type="button" className="mistake-sort-direction"
        aria-label={ascending ? "升序，切换为降序" : "降序，切换为升序"}
        onClick={() => changeFilters({...filters, sort: mistakeOrders[sortField][ascending ? "descending" : "ascending"]})}>
        <span>{ascending ? "↑ 升序" : "↓ 降序"}</span>
      </button>
    </div>
    {data?.options&&data.analysis&&<MistakeInsights options={data.options} analysis={data.analysis} filters={filters.more??{}} change={more=>changeFilters({...filters,more})} indexing={data.indexing}/>}
    {error && <div className="form-error" role="alert">{error} <button type="button" className="text-button" onClick={() => {
      resetResults();
      setRevision(value => value + 1);
    }}>重试</button></div>}
    {!data && !error && <p role="status">正在打开错题本…</p>}
    {data?.total === 0 && <p>这个分类暂时没有已核验的错题。</p>}
    {data?.items.map(item => {
      const scope = scopeLabels[item.scope || "unknown"];
      const source = mistakeSourceLabel(item, true);
      const summary = mistakeQuestionSummary(item.question);
      return <section className="mistake-entry" key={item.id}>
        <button type="button" className="mistake-toggle" aria-haspopup="dialog"
          onClick={event => {opener.current=event.currentTarget; setOpenId(item.id);}}>
          <span className="mistake-summary">
            <strong>{summary.title}</strong>
            {summary.preview && <span className="mistake-stem-preview">{summary.preview}</span>}
            <small>{item.lastDate || "日期待补充"} · {item.subject}{sortField === "occurrences" && ` · 收录${item.occurrences}次`}{item.tags?.form[0]&&item.tags.form[0]!=="待分类"?" · "+item.tags.form[0]:""}</small>
          </span>
          <ChevronRight size={18} aria-hidden="true" />
        </button>
        <div className="mistake-scope">
          {canManage ? <button type="button" className="mistake-scope-edit" aria-label={`${scope}，更改本题归属`}
            title="更改本题归属" aria-haspopup="dialog" onClick={() => setEditing(item)}>
            <span className="mistake-scope-chip">{scope}<PencilLine size={14} aria-hidden="true" /></span>
          </button> : <strong className="mistake-scope-chip">{scope}</strong>}
          <span className="mistake-origin" title={source}>{source}</span>
        </div>
      </section>;
    })}
    {selected && data && <GradeDetail label="错题详情" itemKey={selected.id} position={index} count={data.items.length}
      move={n=>setOpenId(data.items[n].id)} close={()=>{
        setOpenId(null);
        requestAnimationFrame(() => (opener.current?.isConnected ? opener.current : heading.current)?.focus({preventScroll:true}));
      }}>
      <p className="grade-detail-source">{selected.date || "日期待补充"} · {selected.subject} · {mistakeSourceLabel(selected)}</p>
        <QuestionCard key={selected.id} detailMode question={selected.question} date={selected.date} subject={selected.subject} pageId={selected.pageId} imageUrl={selected.imageUrl} displayLabel={mistakeQuestionSummary(selected.question).title} />
        <QuestionTags key={selected.id} item={selected} canManage={canManage} saved={()=>setRevision(n=>n+1)}/>
        {selected.retest && <p className="mistake-retest">复测{selected.retest.rounds}轮 · 已判定{selected.retest.attempts}题 · 通过率{selected.retest.passRate === null ? "暂无" : `${selected.retest.passRate}%`}{selected.retest.uncertain ? ` · ${selected.retest.uncertain}题待确认` : ""}{selected.retest.blank ? ` · ${selected.retest.blank}题未作答` : ""}{selected.retest.lastDate ? ` · 最近${selected.retest.lastDate}` : ""}。通过率只统计已确认的对错。</p>}
    </GradeDetail>}
    {pageCount > 1 && <nav className="mistake-pagination" aria-label="错题本分页">
      <button type="button" className="button secondary compact" disabled={page === 0} onClick={() => changePage(page - 1)}>
        <ChevronLeft size={16} aria-hidden="true" />上一页
      </button>
      <span role="status">第{page + 1}／{pageCount}页</span>
      <button type="button" className="button secondary compact" disabled={page + 1 >= pageCount} onClick={() => changePage(page + 1)}>
        下一页<ChevronRight size={16} aria-hidden="true" />
      </button>
    </nav>}
    {canManage && editing && <MistakeScopeEditor item={editing} close={() => setEditing(null)} saved={() => {
      resetResults();
      setEditing(null);
      setRevision(value => value + 1);
    }} />}
  </section>;
}
