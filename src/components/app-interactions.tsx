"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowDown, Check, CircleAlert, RefreshCw } from "lucide-react";
import { installModalScrollGuard } from "@/services/modal-scroll";

type Source = (signal: AbortSignal) => Promise<boolean | void>;
type RefreshContext = { register: (source: Source) => () => void; refresh: () => void; refreshing: boolean; available: boolean };
const Refresh = createContext<RefreshContext | null>(null);

/** Refresh server records without remounting pages, losing drafts or interrupting uploads. */
export function useStudyRefresh(source: Source, active = true) {
  const context = useContext(Refresh), latest = useRef(source); latest.current = source;
  const register = context?.register;
  useEffect(() => active && register ? register(signal => latest.current(signal)) : undefined, [register, active]);
}

export function RefreshLearningButton() {
  const context = useContext(Refresh);
  if (!context?.available) return null;
  return <button className="study-refresh-button" type="button" aria-label="刷新学习记录" title="刷新学习记录" disabled={context.refreshing} onClick={context.refresh}>
    <RefreshCw size={20} aria-hidden="true" className={context.refreshing ? "spin" : undefined} />
  </button>;
}

export function AppInteractions({ children }: { children: ReactNode }) {
  const sources = useRef(new Set<Source>()), running = useRef<AbortController | null>(null);
  const [available, setAvailable] = useState(false), [state, setState] = useState<"idle" | "pull" | "loading" | "done" | "error">("idle");
  const [distance, setDistance] = useState(0);
  const register = useCallback((source: Source) => {
    sources.current.add(source); setAvailable(true);
    return () => { sources.current.delete(source); setAvailable(sources.current.size > 0); };
  }, []);
  const refresh = useCallback(() => {
    if (running.current || !sources.current.size || document.querySelector("dialog[open]")) return;
    const controller = new AbortController(); running.current = controller; setState("loading"); setDistance(0);
    const timeout = setTimeout(() => controller.abort(), 20000);
    const aborted = new Promise<never>((_, reject) => controller.signal.addEventListener("abort", () => reject(new Error("refresh aborted")), { once: true }));
    void Promise.race([Promise.all([...sources.current].map(source => Promise.resolve().then(() => source(controller.signal)))), aborted])
      .then(results => { if (!controller.signal.aborted) setState(results.some(result => result === false) ? "error" : "done"); })
      .catch(() => { setState("error"); })
      .finally(() => { clearTimeout(timeout); if (running.current === controller) running.current = null; });
  }, []);
  useEffect(installModalScrollGuard, []);
  useEffect(() => () => { running.current?.abort(); }, []);
  useEffect(() => {
    if (state !== "done" && state !== "error") return;
    const timer = setTimeout(() => setState("idle"), state === "done" ? 2500 : 6000);
    return () => clearTimeout(timer);
  }, [state]);
  useEffect(() => {
    // Safari already supplies its own gesture in a browser tab. Home-screen apps do not.
    const standalone = () => matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    let start: { x: number; y: number; target: Element } | undefined, pull = 0;
    function reset() { start = undefined; pull = 0; setDistance(0); setState(old => old === "pull" ? "idle" : old); }
    function touchStart(event: TouchEvent) {
      reset();
      if (!standalone() || !sources.current.size || running.current || window.scrollY > 1 || document.querySelector("dialog[open]") || event.touches.length !== 1) return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target || target.closest("input,textarea,select,[contenteditable],button,a,summary,[role=slider]")) return;
      if (document.activeElement?.matches("input,textarea,select,[contenteditable]")) return;
      start = { x: event.touches[0].clientX, y: event.touches[0].clientY, target }; pull = 0;
    }
    function move(event: TouchEvent) {
      if (!start) return;
      if (event.touches.length !== 1 || window.scrollY > 1 || document.querySelector("dialog[open]")) { reset(); return; }
      const dx = event.touches[0].clientX - start.x, dy = event.touches[0].clientY - start.y;
      if (dy < -8 || Math.abs(dx) > Math.max(12, Math.abs(dy))) { reset(); return; }
      // Nested lists, text fields and photo viewers keep their own scrolling.
      for (let node: Element | null = start.target; node && node !== document.body; node = node.parentElement) {
        if (/(auto|scroll)/.test(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight + 1) { reset(); return; }
      }
      if (dy <= 8) return;
      if (event.cancelable) event.preventDefault();
      pull = Math.min(100, dy * .5); setDistance(pull); setState("pull");
    }
    function end(event: TouchEvent) { const ready = !event.touches.length && pull >= 64; reset(); if (ready) refresh(); }
    const cancel = () => reset();
    document.addEventListener("touchstart", touchStart, { passive: true });
    document.addEventListener("touchmove", move, { passive: false });
    document.addEventListener("touchend", end, { passive: true });
    document.addEventListener("touchcancel", cancel, { passive: true });
    return () => { document.removeEventListener("touchstart", touchStart); document.removeEventListener("touchmove", move); document.removeEventListener("touchend", end); document.removeEventListener("touchcancel", cancel); };
  }, [refresh]);
  const context = useMemo(() => ({ register, refresh, refreshing: state === "loading", available }), [register, refresh, state, available]);
  const label = state === "pull" ? distance >= 64 ? "松开刷新" : "下拉刷新" : state === "loading" ? "正在刷新…" : state === "done" ? "已更新" : "刷新未完成，请点刷新按钮重试";
  return <Refresh.Provider value={context}>{children}<div className="study-refresh-status" role="status" aria-live="polite" hidden={state === "idle"} data-state={state}>
    {state === "loading" ? <RefreshCw className="spin" size={18} aria-hidden="true" /> : state === "done" ? <Check size={18} aria-hidden="true" /> : state === "error" ? <CircleAlert size={18} aria-hidden="true" /> : <ArrowDown size={18} aria-hidden="true" />}{label}
  </div></Refresh.Provider>;
}
