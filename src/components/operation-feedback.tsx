"use client";
import {useEffect, useRef, useState} from "react";
import {createPortal} from "react-dom";
import {CheckCircle2, CircleAlert, LoaderCircle, X} from "lucide-react";
import {subscribeOperationFeedback, type OperationFeedback as Feedback} from "@/services/operation-feedback";

/** A manual popover also stays visible above native modal dialogs. */
export function OperationFeedback() {
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const inline = container?.hasAttribute("data-inline-operation-feedback");
  useEffect(() => {
    // Native modal dialogs make their outside DOM inert. Mount the receipt in
    // the active modal so it remains both visible and accessible to touch/AT.
    const update = () => {
      const dialog = Array.from(document.querySelectorAll<HTMLDialogElement>("dialog[open]")).at(-1);
      setContainer(dialog?.querySelector<HTMLElement>("[data-inline-operation-feedback]") ?? dialog ?? document.body);
    };
    update(); const observer = new MutationObserver(update);
    observer.observe(document.body, {subtree: true, childList: true, attributes: true, attributeFilter: ["open"]});
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const pending = new Map<number, Feedback>();
    return subscribeOperationFeedback(event => {
      if (!event) { pending.clear(); setFeedback(null); return; }
      if (event.phase === "pending") pending.set(event.id, event); else pending.delete(event.id);
      setFeedback([...pending.values()].at(-1) || event);
    });
  }, []);
  useEffect(() => {
    if (!feedback) return;
    const node = ref.current;
    // A successful write may close/unmount its dialog in this same commit.
    // Wait for the observer to move the receipt before calling top-layer APIs.
    if (!node?.isConnected || (container instanceof HTMLDialogElement && !container.open)) return;
    if (!inline && typeof node.showPopover === "function") {
      // A dialog opened after an earlier receipt moves above that receipt in the
      // top layer. Reinsert on every new result so its backdrop cannot dim it.
      if (node.matches(":popover-open")) node.hidePopover();
      node.showPopover();
    }
    if (feedback.phase !== "success") return;
    const timer = setTimeout(() => setFeedback(current => current?.id === feedback.id ? null : current), 8000);
    return () => clearTimeout(timer);
  }, [feedback, container, inline]);
  if (!feedback || !container) return null;
  const Icon = feedback.phase === "pending" ? LoaderCircle : feedback.phase === "error" ? CircleAlert : CheckCircle2;
  return createPortal(<div ref={ref} popover={inline ? undefined : "manual"} className="study-operation-feedback" data-phase={feedback.phase} role={feedback.phase === "error" ? "alert" : "status"} aria-live={feedback.phase === "error" ? "assertive" : "polite"}>
    <Icon size={22} className={feedback.phase === "pending" ? "spin" : undefined} aria-hidden="true"/>
    <span>{feedback.message}</span>
    {feedback.phase !== "pending" && <button type="button" aria-label="关闭操作提示" onClick={() => setFeedback(null)}><X size={18}/></button>}
  </div>, container);
}
