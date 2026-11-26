"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { GradedQuestion, GradingSummary } from "@/domain/grading";

export const filterLabels = { correct: "正确", passedWithNote: "通过但存疑", wrong: "错误", blank: "未作答", uncertain: "未确认", feedback: "点评" };
export type GradingFilter = "all" | "attention" | "ungraded" | GradedQuestion["verdict"];
const order: GradingFilter[] = ["all", "attention", "wrong", "ungraded", "uncertain", "blank", "passedWithNote", "correct", "feedback"];
const labels = { ...filterLabels, all: "全部", attention: "需留意", ungraded: "未批改" };
const tones: Record<GradingFilter, string> = {
  all: "", attention: "status-in-progress", wrong: "status-wrong", ungraded: "status-in-progress",
  uncertain: "status-uncertain", blank: "status-blank", passedWithNote: "status-correct", correct: "status-correct", feedback: "status-feedback",
};

export function GradingFilters({value, onChange, summary, ungraded}: {
  value: GradingFilter; onChange: (next: GradingFilter) => void; summary: GradingSummary; ungraded: number;
}) {
  const bar = useRef<HTMLDivElement>(null);
  const ruler = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const [visible, setVisible] = useState<GradingFilter[]>(["all", value]);
  const [open, setOpen] = useState(false);

  // Measure the actual labels, including counts, in the same font as the controls.
  useLayoutEffect(() => {
    const strip = bar.current!;
    const samples = Array.from(ruler.current!.children);
    function fit() {
      const widths = samples.map(el => el.getBoundingClientRect().width);
      const gap = parseFloat(getComputedStyle(strip).columnGap);
      const available = strip.clientWidth;
      let next = order;
      if (widths.slice(0, order.length).reduce((a,b) => a+b,0) + gap*(order.length-1) > available) {
        const priority = new Set<GradingFilter>(["all", value, ...order]);
        let remaining = available - widths[order.length];
        next = [];
        for (const key of priority) {
          const space = widths[order.indexOf(key)] + gap;
          if (space <= remaining) { next.push(key); remaining -= space; }
        }
      } else {
        setOpen(false);
      }
      setVisible(previous => previous.join() === next.join() ? previous : next);
    }
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(strip);
    samples.forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [value]);

  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      if (!bar.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  const hidden = order.filter(key => !visible.includes(key));
  function count(key: GradingFilter) {
    if (key === "all" || key === "attention") return undefined;
    return key === "ungraded" ? ungraded : summary[key] ?? 0;
  }
  function contents(key: GradingFilter) {
    const n = count(key);
    return <span className="grade-filter-pill">{labels[key]}{n !== undefined && <span className="grade-filter-count">{n}{key === "ungraded" && "页"}</span>}</span>;
  }
  function option(key: GradingFilter, inMenu = false) {
    const label = key === "all" ? "全部题目" : key === "attention" ? "先看需要留意的题" : labels[key] + " " + count(key) + (key === "ungraded" ? "页" : "题");
    return <button key={key} type="button" className={"grade-filter-choice " + tones[key]} data-filter={key} aria-label={label} aria-pressed={value === key}
      onClick={() => {
        setOpen(false);
        onChange(key);
        if (inMenu) requestAnimationFrame(() => (bar.current?.querySelector<HTMLButtonElement>('button[data-filter="' + key + '"]') || trigger.current)?.focus({preventScroll:true}));
      }}>{contents(key)}</button>;
  }
  const more = <>更多<ChevronDown size={15} aria-hidden="true" /></>;
  return <div ref={bar} className="grade-filter-bar" role="group" aria-label="按批改结果筛选"
    onBlur={e => { if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}
    onKeyDown={e => { if (e.key === "Escape" && open) { e.preventDefault(); setOpen(false); trigger.current?.focus(); } }}>
    {order.filter(key => visible.includes(key)).map(key => option(key))}
    {!!hidden.length && <button ref={trigger} type="button" className="grade-filter-more" aria-expanded={open} aria-controls={menuId} onClick={() => setOpen(!open)}>{more}</button>}
    {open && !!hidden.length && <div id={menuId} className="grade-filter-dropdown" role="group" aria-label="更多筛选">{hidden.map(key => option(key,true))}</div>}
    <div className="grade-filter-ruler" aria-hidden="true" ref={ruler}>
      {order.map(key => <span className="grade-filter-choice" key={key}>{contents(key)}</span>)}
      <span className="grade-filter-more">{more}</span>
    </div>
  </div>;
}
