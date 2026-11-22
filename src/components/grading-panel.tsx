"use client";
import { GRADING_STAGE_LABELS } from "@/domain/grading-failure";
import { useEffect, useRef, useState } from "react";
import { homeworkPost, homeworkRequest } from "@/services/homework-gateway";
import type { GradedQuestion, GradingBatchView, GradingSummary, MistakeView } from "@/domain/grading";
import { Image, ChevronUp, MessageCircle, PencilLine, Lightbulb, CircleCheck, Check, CircleAlert } from "lucide-react";
import { StatusIndicator } from "./status-indicator";
const verdicts = { correct: "正确", wrong: "错误 · 已入错题本", blank: "未作答", uncertain: "AI尚未确认", feedback: "主观题点评" };
const filterLabels = { correct: "正确", wrong: "错误", blank: "未作答", uncertain: "未确认", feedback: "点评" };
type GradingFilter = "attention" | "all" | GradedQuestion["verdict"];
function Photo({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  return <div className="grade-photo"><button className="text-button" onClick={() => setOpen(!open)}>{open ? <ChevronUp size={17} aria-hidden="true" /> : <Image size={17} aria-hidden="true" />}{open ? "收起原图" : "查看原题照片"}</button>{open && <img src={`/assistant-api/learning/pages/${encodeURIComponent(id)}`} alt="这道题所在的作业原图" />}</div>;
}
function QuestionCard({ question: q, date, subject, title, pageId }: { question: GradedQuestion; date: string; subject: string; title: string; pageId: string }) {
  return <article className={`grade-question grade-verdict-${q.verdict}`}>
    <div className="grade-question-heading"><h3>{q.label}</h3><StatusIndicator kind={q.verdict} className="grade-verdict-badge">{verdicts[q.verdict]}</StatusIndicator></div>
    <p className="grade-source">{date} · {subject} · {title}</p><p className="grade-stem">{q.question}</p>
    <dl className="grade-answers"><div><dt><PencilLine aria-hidden="true" />我的答案</dt><dd>{q.studentAnswer || "未填写或未识别清楚"}</dd></div>{q.expectedAnswer && q.verdict !== "uncertain" && <div><dt><Lightbulb aria-hidden="true" />{q.verdict === "feedback" ? "参考思路" : "参考答案"}</dt><dd>{q.expectedAnswer}</dd></div>}</dl>
    {q.verdict === "correct" ? <details className="grade-explanation"><summary><Lightbulb size={17} aria-hidden="true" />查看解题思路</summary><p>{q.explanation}</p>{!!q.knowledgePoints.length && <p className="grade-source">知识点：{q.knowledgePoints.join("、")}</p>}</details> : <p>{q.explanation}</p>}
    {q.verdict === "wrong" && <div className="grade-cause"><strong>可能的错因 · {q.cause}</strong><p>{q.causeExplanation || "仅凭这一次作答还不能确定原因。"}</p>{q.nextStep && <><strong>下一步怎么做</strong><p>{q.nextStep}</p></>}</div>}
    {q.verdict !== "correct" && !!q.knowledgePoints.length && <p className="grade-source">知识点：{q.knowledgePoints.join("、")}</p>}
    <div className="grade-question-actions"><Photo id={pageId} /><button className="text-button" onClick={() => window.dispatchEvent(new CustomEvent("xiaobu:ask-homework", { detail: { date, question: `我想讨论${subject}的${q.label}：${q.question.slice(0, 550)}。我的答案是${q.studentAnswer.slice(0, 250)}。请结合批改记录，引导我弄懂这道题。` } }))}><MessageCircle size={17} aria-hidden="true" />让小步帮我弄懂</button></div>
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
  return <section className="card grade-panel" aria-label="批改结果"><h2>批改结果</h2><p className="grade-source">{date.replaceAll("-", "/")} · AI逐题检查，错题自动归档</p>
    {error && <p role="alert" className="form-error">{error}</p>}
    {!data ? <p>正在读取批改记录…</p> : !data.summary.enabled ? <p>自动批改尚未启用。</p> : <>
      <div className="grade-counts" role="group" aria-label="按批改结果筛选">{(Object.keys(filterLabels) as GradedQuestion["verdict"][]).map(kind => <button type="button" key={kind} className="grade-stat-filter" aria-pressed={filter === kind} aria-label={`${filterLabels[kind]} ${data.summary[kind]}题`} onClick={() => setFilter(kind)}><StatusIndicator kind={kind} className="grade-stat"><span>{filterLabels[kind]}<strong>{data.summary[kind]}</strong></span></StatusIndicator>{filter === kind && <Check className="grade-filter-check" size={16} aria-hidden="true" />}</button>)}</div>
      {!!data.summary.pending && <p className="grade-progress" role="status"><StatusIndicator kind="pending">AI正在批改或等待复核，完成后会自动更新。</StatusIndicator></p>}
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
export function MistakeBook() {
  const expanded = useRef(false);
  const [subject, setSubject] = useState(""), [data, setData] = useState<{ total: number; items: MistakeView[] } | null>(null), [error, setError] = useState("");
  useEffect(() => { let live = true; expanded.current = false; setData(null); setError(""); const load = async () => { try { const next = await homeworkRequest<{ total: number; items: MistakeView[] }>(`/mistakes${subject ? `?subject=${encodeURIComponent(subject)}` : ""}`); if (live) { setData(next); setError(""); } } catch (e) { if (live) setError(e instanceof Error ? e.message : "错题本暂未读取成功"); } }; void load(); const timer = setInterval(() => { if (!document.hidden && !expanded.current) void load(); }, 6000); return () => { live = false; clearInterval(timer); }; }, [subject]);
  return <section className="card grade-panel mistake-book" aria-label="错题本"><h2>我的错题本{data ? ` · ${data.total}题` : ""}</h2><p className="grade-source">只收录已核验的错题，原题、作答和解法会一起保留。</p><div className="tabs grade-filters">{["", "语文", "数学", "英语"].map(s => <button key={s} className={subject === s ? "selected" : ""} onClick={() => setSubject(s)}>{s || "全部"}</button>)}</div>
    {error && <p className="form-error" role="alert">{error}</p>}{!data ? <p>正在打开错题本…</p> : !data.total ? <p>目前没有已核验的错题。新上传作业批改后会自动整理到这里。</p> : <>{data.items.map(item => <QuestionCard key={item.id} question={item.question} date={item.date} subject={item.subject} title={item.title} pageId={item.pageId} />)}{data.items.length < data.total && <button className="button secondary" onClick={async () => { expanded.current = true; try { const next = await homeworkRequest<{ total: number; items: MistakeView[] }>(`/mistakes?offset=${data.items.length}${subject ? `&subject=${encodeURIComponent(subject)}` : ""}`); setData({ total: next.total, items: [...data.items, ...next.items] }); } catch (e) { setError(e instanceof Error ? e.message : "暂未读取成功"); } }}>查看更多错题</button>}</>}
  </section>;
}
