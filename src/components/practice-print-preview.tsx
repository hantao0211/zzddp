"use client";
import { BackLabel } from "./back-label";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Printer } from "lucide-react";
import { formatPracticeQuestionText } from "@/domain/practice-question-text";
import { accountRequest } from "./account-login";
import type { PracticePaper, PracticeView } from "@/domain/practice";

type SheetProps = Pick<PracticeView, "date" | "profileLabel"> & {
  paper: NonNullable<PracticeView["paper"]>;
};

function PracticePrintSheet({ paper, profileLabel, date, answers }: SheetProps & { answers?: PracticePaper }) {
  paper = answers ?? paper;
  const minutes = paper.questions.reduce((total, question) => total + question.estimatedMinutes, 0);
  return <section className="practice-document-sheet">
    <div className="practice-document-heading">
      <p>小步学习 · {profileLabel} · {paper.subject} · 课内</p>
      <h2>{paper.title}{answers && " · 参考答案"}</h2>
      <p>{date} · 预计{minutes}分钟{!answers && " · 姓名：____________　实际用时：________"}</p>
    </div>
    {paper.questions.map((question, index) => <article key={question.id}>
      <h3>{index + 1}. {formatPracticeQuestionText(question.question)}</h3>
      {answers ? <div className="practice-document-answer">
        <p><strong>参考答案</strong>{answers.questions[index].answer}</p>
        <p><strong>解题思路</strong>{answers.questions[index].explanation}</p>
      </div> : <div className="practice-document-space" aria-hidden="true" />}
    </article>)}
    {!answers && <p className="practice-document-footer">做完后回到这份小练习上传答卷。</p>}
  </section>;
}

export function PracticePrintPreview({ close, answerItemId, ...sheet }: SheetProps & { close: () => void; answerItemId?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const back = useRef<HTMLButtonElement>(null);
  const [answers, setAnswers] = useState<PracticePaper>();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!answerItemId) return;
    const controller = new AbortController();
    setAnswers(undefined);
    setError("");
    accountRequest(`learning/practice/items/${answerItemId}/document?answers=1&format=json`, undefined, "GET", controller.signal)
      .then(paper => { if (!controller.signal.aborted) setAnswers(paper); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "参考答案暂时无法打开。"); });
    return () => controller.abort();
  }, [answerItemId, attempt]);
  const ready = !answerItemId || !!answers;


  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    back.current?.focus({ preventScroll: true });
    return () => element?.close();
  }, []);

  function dismiss() {
    dialog.current?.close();
    close();
  }

  return createPortal(<div className="practice-print-host">
    <dialog ref={dialog} className="reading-dialog practice-print-dialog" aria-label={answerItemId ? "参考答案预览" : "题单预览"} onCancel={event => {
      event.preventDefault();
      event.stopPropagation();
      dismiss();
    }}>
      <header>
        <button ref={back} type="button" className="button secondary" onClick={dismiss}>
          <BackLabel>返回练习</BackLabel>
        </button>
        <button type="button" className="button primary" disabled={!ready} onClick={() => window.print()}>
          <Printer size={18} aria-hidden="true" />打印／另存PDF
        </button>
      </header>
      <div className="practice-print-body" tabIndex={0} role="region" aria-label={answerItemId ? "参考答案" : "练习题单"}>
        {ready ? <PracticePrintSheet {...sheet} answers={answers} /> : error ? <div>
          <p role="alert">{error}</p><button className="button primary" onClick={() => setAttempt(n => n + 1)}>重新加载答案</button>
        </div> : <p role="status">正在读取参考答案…</p>}
      </div>
    </dialog>
    {ready && <div className="practice-print-output"><PracticePrintSheet {...sheet} answers={answers} /></div>}
  </div>, document.body);
}
