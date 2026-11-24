"use client";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Printer } from "lucide-react";
import { formatPracticeQuestionText } from "@/domain/practice-question-text";
import type { PracticeView } from "@/domain/practice";

type SheetProps = Pick<PracticeView, "date" | "profileLabel"> & {
  paper: NonNullable<PracticeView["paper"]>;
};

function PracticePrintSheet({ paper, profileLabel, date }: SheetProps) {
  const minutes = paper.questions.reduce((total, question) => total + question.estimatedMinutes, 0);
  return <section className="practice-document-sheet">
    <div className="practice-document-heading">
      <p>小步学习 · {profileLabel} · {paper.subject} · 课内</p>
      <h2>{paper.title}</h2>
      <p>{date} · 预计{minutes}分钟 · 姓名：____________　实际用时：________</p>
    </div>
    {paper.questions.map((question, index) => <article key={question.id}>
      <h3>{index + 1}. {formatPracticeQuestionText(question.question)}</h3>
      <div className="practice-document-space" aria-hidden="true" />
    </article>)}
    <p className="practice-document-footer">做完后回到这份小练习上传答卷。</p>
  </section>;
}

export function PracticePrintPreview({ close, ...sheet }: SheetProps & { close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const back = useRef<HTMLButtonElement>(null);

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
    <dialog ref={dialog} className="reading-dialog practice-print-dialog" aria-label="题单预览" onCancel={event => {
      event.preventDefault();
      event.stopPropagation();
      dismiss();
    }}>
      <header>
        <button ref={back} type="button" className="button secondary" onClick={dismiss}>
          <ArrowLeft size={18} aria-hidden="true" />返回练习
        </button>
        <button type="button" className="button primary" onClick={() => window.print()}>
          <Printer size={18} aria-hidden="true" />打印／另存PDF
        </button>
      </header>
      <div className="practice-print-body" tabIndex={0} role="region" aria-label="练习题单">
        <PracticePrintSheet {...sheet} />
      </div>
    </dialog>
    <div className="practice-print-output"><PracticePrintSheet {...sheet} /></div>
  </div>, document.body);
}
