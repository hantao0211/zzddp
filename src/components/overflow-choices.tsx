"use client";
import { ChevronDown } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";

export function OverflowChoices<K extends string>({order,value,pinned,onChange,name,moreName,label,contents,tone}: {
  order: K[]; value: K; pinned?: K; onChange: (key: K) => void; name: string; moreName: string;
  label: (key: K) => string; contents: (key: K) => ReactNode; tone: (key: K) => string;
}) {
  const bar = useRef<HTMLDivElement>(null);
  const ruler = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const [visible, setVisible] = useState<K[]>([value]);
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
        const priority = new Set<K>([...(pinned ? [pinned] : []), value, ...order]);
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
  }, [value, pinned, order]);

  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      if (!bar.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  const hidden = order.filter(key => !visible.includes(key));
  function option(key: K, inMenu = false) {
    return <button key={key} type="button" className={"grade-filter-choice " + tone(key)} data-filter={key} aria-label={label(key)} aria-pressed={value === key}
      onClick={() => {
        setOpen(false);
        onChange(key);
        if (inMenu) requestAnimationFrame(() => (bar.current?.querySelector<HTMLButtonElement>('button[data-filter="' + key + '"]') || trigger.current)?.focus({preventScroll:true}));
      }}>{contents(key)}</button>;
  }
  const more = <>更多<ChevronDown size={15} aria-hidden="true" /></>;
  return <div ref={bar} className="grade-filter-bar" role="group" aria-label={name}
    onBlur={e => { if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}
    onKeyDown={e => { if (e.key === "Escape" && open) { e.preventDefault(); setOpen(false); trigger.current?.focus(); } }}>
    {order.filter(key => visible.includes(key)).map(key => option(key))}
    {!!hidden.length && <button ref={trigger} type="button" className="grade-filter-more" aria-expanded={open} aria-controls={menuId} onClick={() => setOpen(!open)}>{more}</button>}
    {open && !!hidden.length && <div id={menuId} className="grade-filter-dropdown" role="group" aria-label={moreName}>{hidden.map(key => option(key,true))}</div>}
    <div className="grade-filter-ruler" aria-hidden="true" ref={ruler}>
      {order.map(key => <span className="grade-filter-choice" key={key}>{contents(key)}</span>)}
      <span className="grade-filter-more">{more}</span>
    </div>
  </div>;
}
