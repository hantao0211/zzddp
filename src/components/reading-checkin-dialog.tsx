"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { BackLabel } from "./back-label";

export function ReadingCheckinDialog({ title, onBack, children, backText = "返回手帐" }: {
  title: string;
  backText?: string;
  onBack: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return <dialog ref={ref} className="reading-dialog reading-checkin-dialog" aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); onBack(); }}>
    <header>
      <button type="button" className="text-button" onClick={onBack}><BackLabel>{backText}</BackLabel></button>
      <h2 id={titleId}>{title}</h2>
    </header>
    <div className="reading-dialog-body reading-checkin">{children}</div>
  </dialog>;
}
