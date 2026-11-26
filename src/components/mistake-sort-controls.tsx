"use client";
import { ChevronDown } from "lucide-react";
import { useRef, useState, useEffect, useId, useLayoutEffect } from "react";
import { mistakeOrders, type MistakeSort } from "@/domain/mistake-sort";
import { MistakeFilterMenu } from "./mistake-filter-menu";

const orders: {value:MistakeSort;label:string}[] = [
  {value:"newest",label:"日期 · 最新优先"}, {value:"oldest",label:"日期 · 最早优先"},
  {value:"frequent",label:"次数 · 从多到少"}, {value:"leastFrequent",label:"次数 · 从少到多"},
];

export function MistakeSortControls({value,onChange}:{value:MistakeSort;onChange:(value:MistakeSort)=>void}) {
  const field = value==="newest" || value==="oldest" ? "date" : "occurrences";
  const ascending = mistakeOrders[field].ascending === value;
  const area = useRef<HTMLDivElement>(null);
  const pair = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const [compact,setCompact] = useState(false);
  const [open,setOpen] = useState(false);
  useLayoutEffect(()=>{
    const slot=area.current!, controls=pair.current!;
    function fit(){
      const overflow=controls.getBoundingClientRect().width>slot.clientWidth;
      setCompact(overflow);
      if(!overflow)setOpen(false);
    }
    fit();
    const observer=new ResizeObserver(fit);
    observer.observe(slot);
    observer.observe(controls);
    return ()=>observer.disconnect();
  },[]);
  useEffect(()=>{
    if(!open)return;
    function outside(e:PointerEvent){if(!area.current?.contains(e.target as Node))setOpen(false);}
    document.addEventListener("pointerdown",outside);
    return ()=>document.removeEventListener("pointerdown",outside);
  },[open]);

  return <div className="mistake-sort-slot" ref={area}
    onBlur={e=>{if(e.relatedTarget&&!e.currentTarget.contains(e.relatedTarget))setOpen(false);}}
    onKeyDown={e=>{if(open&&e.key==="Escape"){e.preventDefault();setOpen(false);trigger.current?.focus();}}}>
    <div ref={pair} className="mistake-sort-pair" data-hidden={compact} inert={compact}>
      <MistakeFilterMenu<keyof typeof mistakeOrders> name="排序依据" caption={field==="date"?"日期":"次数"} value={field} active={field==="occurrences"}
        choices={[{value:"date",label:"收录日期"},{value:"occurrences",label:"收录次数"}]}
        onChange={next=>onChange(mistakeOrders[next][ascending?"ascending":"descending"])} />
      <button type="button" className="mistake-sort-direction" aria-label={ascending?"升序，切换为降序":"降序，切换为升序"}
        onClick={()=>onChange(mistakeOrders[field][ascending?"descending":"ascending"])}>
        <span>{ascending?"↑ 升序":"↓ 降序"}</span>
      </button>
    </div>
    {compact&&<button ref={trigger} type="button" className="grade-filter-more" aria-expanded={open} aria-controls={menuId}
      onClick={()=>setOpen(!open)}>更多<ChevronDown size={15} aria-hidden="true"/></button>}
    {compact&&open&&<div className="grade-filter-dropdown" id={menuId} role="group" aria-label="更多排序选项">
      {orders.map(order=><button key={order.value} type="button" className="grade-filter-choice status-feedback" aria-pressed={value===order.value}
        onClick={()=>{onChange(order.value);setOpen(false);trigger.current?.focus();}}>
        <span className="grade-filter-pill">{order.label}</span>
      </button>)}
    </div>}
  </div>;
}
