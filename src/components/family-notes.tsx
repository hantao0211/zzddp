import type { ClarificationReceipt } from "@/domain/clarifications";
import type { ReactNode } from "react";

/** Current conclusions come first; verbatim, possibly superseded speech stays in the audit. */
export function FamilyNotes({ notes, action }: { notes: ClarificationReceipt[]; action?: (note: ClarificationReceipt) => ReactNode }) {
  const current = notes.filter(n => n.current !== false), history = notes.filter(n => n.current === false);
  return <div className="family-notes">
    {current.map(n => <section key={n.id}><strong>{n.title}</strong><p>{n.requirement || n.userQuote}</p>
      {n.requirement && <details><summary>查看这次说明的原话</summary><p>{n.userQuote}</p></details>}{action?.(n)}</section>)}
    {!!history.length && <details><summary>查看较早的说明（以当前理解为准）</summary>{history.map(n => <section key={n.id}><small>较早的说明 · {n.title}</small><p>{n.userQuote}</p></section>)}</details>}
  </div>;
}
