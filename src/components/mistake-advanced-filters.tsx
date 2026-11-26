"use client";
import { useEffect, useRef, useState } from "react";
import { Check, SlidersHorizontal, X } from "lucide-react";
import { dimensions, dimensionNames, type Dimension } from "@/domain/assessment";

export type Selections = Partial<Record<Dimension, string[]>> & { from?: string; to?: string; grain?: string };
type Props = { options: Record<Dimension, string[]>; filters: Selections; change: (value: Selections) => void };
const groups: (Dimension | "date")[] = ["knowledge", "form", "cause", "source", "stage", "unit", "state", "scene", "skill", "difficulty", "date"];
function name(group: Dimension | "date") {
  return group === "date" ? "日期范围" : group === "knowledge" ? "知识分类" : dimensionNames[group];
}
function count(filters: Selections) {
  return dimensions.reduce((sum, key) => sum + (filters[key]?.length ?? 0), filters.from || filters.to ? 1 : 0);
}

function FilterDialog({ options, filters, change, close }: Props & { close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(filters);
  const [openingOptions] = useState(options);
  const available = groups.filter(key => key === "date" || openingOptions[key]?.length || filters[key]?.length);
  const [group, setGroup] = useState(available.find(key => key === "date" ? filters.from || filters.to : filters[key]?.length) ?? available[0]);
  const choices = group === "date" ? [] : [...new Set([...(openingOptions[group] ?? []), ...(filters[group] ?? []), ...(draft[group] ?? [])])];
  const invalidDates = !!(draft.from && draft.to && draft.from > draft.to);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  function toggle(value: string) {
    if (group === "date") return;
    const selected = draft[group] ?? [];
    setDraft({...draft, [group]: selected.includes(value) ? selected.filter(item => item !== value) : [...selected, value]});
  }

  return <dialog ref={dialog} className="mistake-filter-dialog" aria-label="筛选错题" onCancel={event => { event.preventDefault(); close(); }}>
    <header><h3>筛选错题</h3><button type="button" onClick={close} aria-label="关闭筛选"><X size={18} /></button></header>
    <div className="mistake-filter-body">
      <div className="mistake-filter-groups" role="group" aria-label="筛选类别">
        {available.map(key => {
          const n = key === "date" ? Number(!!(draft.from || draft.to)) : draft[key]?.length ?? 0;
          return <button type="button" key={key} aria-pressed={group === key} onClick={() => setGroup(key)}>{name(key)}{n > 0 && <small>{n}</small>}</button>;
        })}
      </div>
      <section key={group} className="mistake-filter-values" aria-label={name(group)}>
        <h4>{name(group)}</h4>
        {group === "date" ? <div className="mistake-filter-dates">
          <label>开始日期<input type="date" value={draft.from ?? ""} max={draft.to} onChange={e => setDraft({...draft, from:e.target.value})}/></label>
          <label>结束日期<input type="date" value={draft.to ?? ""} min={draft.from} onChange={e => setDraft({...draft, to:e.target.value})}/></label>
          {invalidDates && <small role="alert">结束日期要在开始日期当天或之后。</small>}
        </div> : <div className="mistake-filter-choices">{choices.map(value => {
          const selected = draft[group]?.includes(value) ?? false;
          return <button type="button" key={value} aria-pressed={selected} onClick={() => toggle(value)}>{selected && <Check size={14} aria-hidden="true"/>}{value}</button>;
        })}</div>}
      </section>
    </div>
    <footer><button type="button" className="text-button" disabled={!count(draft)} onClick={() => setDraft({grain:draft.grain})}>清空条件</button>
      <button type="button" className="button primary compact" disabled={invalidDates} onClick={() => { change(draft); close(); }}>应用筛选{count(draft) > 0 && `（${count(draft)}）`}</button></footer>
  </dialog>;
}

export function MistakeAdvancedFilters(props: Props) {
  const [open, setOpen] = useState(false);
  const { filters, change } = props;
  const selected = dimensions.flatMap(key => (filters[key] ?? []).map(value => name(key) + " · " + value));
  if (filters.from || filters.to) selected.push((filters.from || "不限") + " 至 " + (filters.to || "不限"));
  return <div className="mistake-advanced">
    <button type="button" className="mistake-filter-trigger" aria-haspopup="dialog" onClick={() => setOpen(true)}>
      <SlidersHorizontal size={15} aria-hidden="true"/>更多筛选{selected.length > 0 && <b>{selected.length}</b>}
    </button>
    {selected.length > 0 && <div className="mistake-filter-summary"><span title={selected.join("，")}>{selected.join("，")}</span>
      <button type="button" className="text-button" onClick={() => change({grain:filters.grain})}>清除</button></div>}
    {open && <FilterDialog {...props} close={() => setOpen(false)}/>}
  </div>;
}
