"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

type Choice<T> = {value: T; label: string};

export function MistakeFilterMenu<T extends string>({name, caption, value, choices, active, onChange}: {
  name: string; caption: string; value: T; choices: Choice<T>[]; active: boolean; onChange: (value: T) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const [cursor, setCursor] = useState<number | null>(null);
  const open = cursor !== null;
  const selected = choices.findIndex(choice => choice.value === value);

  useEffect(() => {
    if (!open) return;
    function dismiss(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setCursor(null);
    }
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);

  function choose(index: number) {
    onChange(choices[index].value);
    setCursor(null);
    trigger.current?.focus({preventScroll:true});
  }

  return <div ref={root} className="mistake-filter-menu" onBlur={e=>{
    if (!e.currentTarget.contains(e.relatedTarget)) setCursor(null);
  }}>
    <button type="button" ref={trigger} className="mistake-filter-chip" role="combobox" data-active={active}
      aria-label={name + "，" + choices[selected].label} aria-expanded={open} aria-haspopup="listbox"
      aria-controls={id} aria-activedescendant={open ? id+"-"+cursor : undefined}
      onClick={()=>setCursor(open ? null : selected)}
      onKeyDown={e=>{
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          setCursor(cursor === null ? selected : (cursor + (e.key === "ArrowDown" ? 1 : -1) + choices.length) % choices.length);
        } else if (open && (e.key === "Home" || e.key === "End")) {
          e.preventDefault();
          setCursor(e.key === "Home" ? 0 : choices.length-1);
        } else if (open && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          choose(cursor);
        } else if (open && e.key === "Escape") {
          e.preventDefault();
          setCursor(null);
        }
      }}>
      <span>{caption}<ChevronDown size={12} aria-hidden="true" /></span>
    </button>
    {open && <div id={id} role="listbox" aria-label={name} className="mistake-filter-options">
      {choices.map((choice,index)=><div key={choice.value} id={id+"-"+index} role="option"
        aria-selected={index===selected} data-current={cursor===index}
        onMouseDown={e=>e.preventDefault()} onClick={()=>choose(index)}>
        {choice.label}{index===selected && <Check size={14} aria-hidden="true" />}
      </div>)}
    </div>}
  </div>;
}
