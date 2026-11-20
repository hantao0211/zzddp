"use client";
import { useEffect, useRef, useState } from "react";
import { homeworkPost, homeworkRequest } from "@/services/homework-gateway";
import type { GradedQuestion, GradingBatchView, GradingSummary, MistakeView } from "@/domain/grading";
const verdicts = { correct: "正确", wrong: "错误 · 已入错题本", blank: "未作答", uncertain: "AI尚未确认", feedback: "主观题点评" };
function Photo({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  return <div className="grade-photo"><button className="text-button" onClick={() => setOpen(!open)}>{open ? "收起原图" : "查看原题照片"}</button>{open && <img src={`/assistant-api/learning/pages/${encodeURIComponent(id)}`} alt="这道题所在的作业原图" />}</div>;
}
function QuestionCard({ question: q, date, subject, title, pageId }: { question: GradedQuestion; date: string; subject: string; title: string; pageId: string }) {
  return <article className={`grade-question grade-verdict-${q.verdict}`}>
    <div className="grade-question-heading"><h3>{q.label}</h3><span className={`pill ${q.verdict === "correct" ? "neutral" : "amber"}`}>{verdicts[q.verdict]}</span></div>
    <p className="grade-source">{date} · {subject} · {title}</p><p className="grade-stem">{q.question}</p>
    <dl className="grade-answers"><div><dt>我的答案</dt><dd>{q.studentAnswer || "未填写或未识别清楚"}</dd></div>{q.expectedAnswer && q.verdict !== "uncertain" && <div><dt>{q.verdict === "feedback" ? "参考思路" : "参考答案"}</dt><dd>{q.expectedAnswer}</dd></div>}</dl>
    <p>{q.explanation}</p>
    {q.verdict === "wrong" && <div className="grade-cause"><strong>可能的错因 · {q.cause}</strong><p>{q.causeExplanation || "仅凭这一次作答还不能确定原因。"}</p>{q.nextStep && <><strong>下一步怎么做</strong><p>{q.nextStep}</p></>}</div>}
    {!!q.knowledgePoints.length && <p className="grade-source">知识点：{q.knowledgePoints.join("、")}</p>}
    <div className="grade-question-actions"><Photo id={pageId} /><button className="text-button" onClick={() => window.dispatchEvent(new CustomEvent("xiaobu:ask-homework", { detail: { date, question: `我想讨论${subject}的${q.label}：${q.question.slice(0, 550)}。我的答案是${q.studentAnswer.slice(0, 250)}。请结合批改记录，引导我弄懂这道题。` } }))}>让小步帮我弄懂</button></div>
  </article>;
}
export function GradingPanel({ date, canManage = true }: { date: string; canManage?: boolean }) {
  const [data, setData] = useState<{ summary: GradingSummary; batches: GradingBatchView[] } | null>(null), [error, setError] = useState("");
  const [filter, setFilter] = useState("attention"), [retrying, setRetrying] = useState(false);
  useEffect(() => {
    let live = true; setData(null); setError("");
    const load = async () => { try { const next = await homeworkRequest<{ summary: GradingSummary; batches: GradingBatchView[] }>(`/grading?date=${date}`); if (live) { setData(next); setError(""); } } catch (e) { if (live) setError(e instanceof Error ? e.message : "批改记录暂未读取成功"); } };
    void load(); const timer = setInterval(() => { if (!document.hidden) void load(); }, 4000); return () => { live = false; clearInterval(timer); };
  }, [date]);
  return <section className="card grade-panel" aria-label="批改结果"><h2>批改结果</h2><p className="grade-source">{date.replaceAll("-", "/")} · AI逐题检查，错题自动归档</p>
    {error && <p role="alert" className="form-error">{error}</p>}
    {!data ? <p>正在读取批改记录…</p> : !data.summary.enabled ? <p>自动批改尚未启用。</p> : <>
      <div className="grade-counts"><span>正确 <strong>{data.summary.correct}</strong></span><span>错误 <strong>{data.summary.wrong}</strong></span><span>未作答 <strong>{data.summary.blank}</strong></span><span>未确认 <strong>{data.summary.uncertain}</strong></span>{data.summary.feedback > 0 && <span>点评 <strong>{data.summary.feedback}</strong></span>}</div>
      {!!data.summary.pending && <p className="grade-progress" role="status">AI正在批改或等待复核，完成后会自动更新。</p>}
      {!!data.summary.incomplete && <p>部分题目还没完整识别，下面只展示已经检查的题。</p>}
      {!!data.summary.failed && <div className="grade-progress"><p>有{data.summary.failed}页批改未完成，原件已保存。</p>{canManage && <button className="button secondary compact" disabled={retrying} onClick={async () => { setRetrying(true); try { await homeworkPost("/grading/retry", { date }); setError(""); } catch (e) { setError(e instanceof Error ? e.message : "暂时不能重试"); } finally { setRetrying(false); } }}>重试批改</button>}<small>{!canManage && "请家长在管理页处理，已有结果仍可查看。"}</small></div>}
      <div className="tabs grade-filters"><button className={filter === "attention" ? "selected" : ""} onClick={() => setFilter("attention")}>先看需要留意的题</button><button className={filter === "all" ? "selected" : ""} onClick={() => setFilter("all")}>全部题目</button></div>
      {!data.batches.length && <div><p>还没有批改记录。新上传的书面作业会自动处理；已上传的作业可以直接开始，无需重新上传。</p>{canManage && <button className="button secondary" disabled={retrying} onClick={async () => { setRetrying(true); try { await homeworkPost("/grading/start", { date }); setError(""); } catch (e) { setError(e instanceof Error ? e.message : "暂时无法开始批改"); } finally { setRetrying(false); } }}>批改这一天的作业</button>}</div>}
      {data.batches.map(batch => <section key={batch.id} className="grade-batch"><h3>{batch.subject} · {batch.title}</h3>{batch.note && <p className="grade-source">{batch.note}</p>}{batch.result?.note && <p className="grade-source">{batch.result.note}</p>}{batch.result?.questions.filter(q => filter === "all" || q.verdict !== "correct").map(q => <QuestionCard key={q.id} question={q} date={date} subject={batch.subject} title={batch.title} pageId={batch.primaryPageId} />)}{batch.status === "done" && batch.result && !batch.result.questions.length && <p>这页未发现需要逐题批改的作答。</p>}{batch.status === "done" && batch.result?.questions.length && batch.result.questions.every(q => q.verdict === "correct") && filter === "attention" ? <p className="grade-all-correct">已检查的{batch.result.questions.length}题均正确，可切换“全部题目”查看。</p> : null}</section>)}
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
