"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { BackLabel } from "./back-label";

export function ReadingCheckinDialog({ title, onBack, children }: {
  title: string;
  onBack: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return <dialog ref={ref} className="reading-dialog reading-checkin-dialog" aria-labelledby="reading-entry-title"
    onCancel={event => { event.preventDefault(); onBack(); }}>
    <header>
      <button type="button" className="text-button" onClick={onBack}><BackLabel>返回手帐</BackLabel></button>
      <h2 id="reading-entry-title">{title}</h2>
    </header>
    <div className="reading-dialog-body reading-checkin">{children}</div>
  </dialog>;
}
