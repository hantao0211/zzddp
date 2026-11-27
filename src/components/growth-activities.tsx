"use client";
import { CollectionViewSwitch, useCollectionView } from "./collection-view";
import {useEffect,useRef,useState} from "react";
import {BookOpen,Home,Volleyball,MonitorPlay,ArrowRight,Check,Clock3,X, Plus, Pencil, Trash2, Footprints, Sparkles, Palette, Music, ChevronDown} from "lucide-react";
import {accountRequest} from "./account-login";
import {StepAmount} from "./growth-tokens";
import { GrowingSprout } from "./study-tab-illustrations";
import {activityIconLabels,type ActivityIconId,activityPeriod,addDays,weeklyActivity,type ActivityRule} from "@/domain/growth-economy";
import type {ReadingState} from "@/domain/reading";
const call=(path:string,value:unknown,method="POST")=>accountRequest("reading/"+path,value,method);
type Props={data:ReadingState;refresh:(message:string)=>Promise<void>};
const icons = {book:BookOpen, home:Home, sport:Volleyball, screen:MonitorPlay, pencil:Pencil, palette:Palette, music:Music, sparkles:Sparkles};
const presetIcons:Partial<Record<ActivityRule["key"],ActivityIconId>> = {"english-reading":"book",housework:"home",badminton:"sport","english-class":"screen"};
function iconFor(rule: ActivityRule) {
  return rule.icon ?? presetIcons[rule.key] ?? "sparkles";
}
function ActivityIcon({rule,size=18}:{rule:ActivityRule;size?:number}) {
  const Icon=icons[iconFor(rule)];
  return <Icon size={size} aria-hidden="true"/>;
}

function ActivityIconPicker({rule,disabled,initiallyOpen,onChange}:{rule:ActivityRule;disabled:boolean;initiallyOpen:boolean;onChange:(icon:ActivityIconId)=>void}) {
  const [open,setOpen]=useState(initiallyOpen);
  const trigger=useRef<HTMLButtonElement>(null);
  const selected=iconFor(rule);
  return <div className="activity-icon-picker">
    <button className="activity-icon-trigger" type="button" ref={trigger} disabled={disabled} aria-expanded={open} onClick={()=>setOpen(!open)}>
      <span>活动图标</span><ActivityIcon rule={rule}/>{activityIconLabels[selected]}<ChevronDown size={15} aria-hidden="true"/>
    </button>
    {open && <div className="reward-icon-choices activity-icon-choices" role="group" aria-label="选择活动图标">
      {(Object.keys(activityIconLabels) as ActivityIconId[]).map(id=>{
        const Icon=icons[id];
        return <button key={id} type="button" aria-pressed={id===selected} disabled={disabled}
          onClick={()=>{onChange(id);setOpen(false);trigger.current?.focus();}}>
          <Icon size={17} aria-hidden="true"/>{activityIconLabels[id]}
        </button>;
      })}
    </div>}
  </div>;
}
function activitySummary(rule: ActivityRule) {
 return [weeklyActivity(rule) ? "每周一次" : "每天一次", rule.description].filter(Boolean).join(" · ");
}
function ActivityEntry({rule,data,close,refresh}:Props&{rule:ActivityRule;close:()=>void}){
 const ref=useRef<HTMLDialogElement>(null),[date,setDate]=useState(data.today),[note,setNote]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),request=useRef<{id:string;date:string;note:string}|null>(null);
 useEffect(()=>{ref.current?.showModal();return()=>ref.current?.close();},[]);
 const parent=data.viewer.role!=="child";
 return <dialog ref={ref} className="reading-dialog" onCancel={e=>{e.preventDefault();if(!busy)close();}} aria-label={`记录${rule.title}`}><header><h2>{rule.title} <StepAmount value={rule.points} signed/></h2><button className="icon-button" disabled={busy} onClick={close} aria-label="关闭活动记录"><X/></button></header><form className="reading-dialog-body" onSubmit={async e=>{e.preventDefault();if(busy)return;setBusy(true);setError("");try{if(!request.current||request.current.date!==date||request.current.note!==note)request.current={id:crypto.randomUUID(),date,note};await call("activities",{...request.current,key:rule.key});await refresh(parent?"活动已确认，小脚步已到账。":"记录已送给家长，确认后小脚步到账。");close();}catch(e){setError(e instanceof Error?e.message:"请稍后重试。");}finally{setBusy(false);}}}><p>{activitySummary(rule)}{rule.key==="housework"&&"（各项家务合计）"}</p><label>完成日期<input type="date" value={date} min={[addDays(data.today,-7),data.activities?.startOn||data.today].sort().at(-1)} max={data.today} required disabled={busy} onChange={e=>setDate(e.target.value)}/></label><label>做了什么（选填）<textarea value={note} maxLength={300} rows={2} disabled={busy} onChange={e=>setNote(e.target.value)}/></label>{error&&<p role="alert" className="form-error">{error}</p>}<button className="button primary" disabled={busy}>{busy?"正在保存…":parent?"确认完成并奖励":"请家长确认"}</button></form></dialog>;
}
export function GrowthActivities({data,refresh}:Props){const[selected,setSelected]=useState<ActivityRule|null>(null),state=data.activities;
 const layout=useCollectionView("activities",data.viewer.id,"grid");
 if(!state)return null;
 const rules=state.rules.filter(r=>r.enabled&&r.points>0);
 return <section className="card growth-activities"><div className="collection-heading"><h2><GrowingSprout />生活里的小进步</h2>
   {!!rules.length && <CollectionViewSwitch label="成长活动显示方式" {...layout}/>}
 </div><p className="reading-muted">{data.viewer.role==="child"?"做过再记录，家长确认后到账。":"记录做过的小事，小脚步直接到账。"}</p><div className={layout.view==="grid"?"economy-grid":"journal-item-list activity-list"}>{rules.map(rule=>{const period=activityPeriod(rule,data.today),claim=state.claims.find(c=>c.key===rule.key&&activityPeriod(rule,c.date)===period&&c.status!=="rejected");return <article key={rule.key} className="journal-tile" data-described={rule.description ? "" : undefined}><h3 className="activity-heading journal-tile-heading"><span className="journal-tile-icon"><ActivityIcon rule={rule} size={20}/></span><span className="journal-tile-title">{rule.title}</span></h3><p className="activity-reward journal-tile-value"><StepAmount value={rule.points} signed/></p><span className="activity-frequency journal-tile-note">{activitySummary(rule)}</span><button className="button activity-record-action" disabled={!!claim} onClick={()=>setSelected(rule)}><span>{claim?.status==="approved"?"本期已到账":claim?"等家长确认":"记录完成"}</span>{claim?.status==="approved"?<Check aria-hidden="true"/>:claim?<Clock3 aria-hidden="true"/>:<ArrowRight aria-hidden="true"/>}</button></article>;})}</div>{!!state.claims.length&&<details><summary>活动记录 · {state.claims.filter(c=>c.status==="pending").length}项待确认</summary>{state.claims.slice(0,30).map(c=><div className="economy-row" key={c.id}><div><strong>{c.title} · {c.date}</strong><p>{c.note}</p>{c.parentNote&&<p>家长说：{c.parentNote}</p>}</div><span>{c.status==="approved"?"已到账":c.status==="pending"?"等家长确认":"这次未通过"} <StepAmount value={c.points}/></span></div>)}</details>}{selected&&<ActivityEntry rule={selected} data={data} refresh={refresh} close={()=>setSelected(null)}/>}</section>;}
type RuleAction = {kind:"add"} | {kind:"edit"|"delete"; rule:ActivityRule};

function ActivityRuleDialog({action,close,refresh}:Pick<Props,"refresh">&{action:RuleAction;close:()=>void}){
 const before=action.kind==="add"?null:action.rule;
 const [draft,setDraft]=useState<ActivityRule>(()=>before?{...before}:{key:crypto.randomUUID(),title:"",points:1,frequency:"daily",enabled:true});
 const [error,setError]=useState(""),[busy,setBusy]=useState(false);
 const ref=useRef<HTMLDialogElement>(null),lock=useRef(false);
 useEffect(()=>{const dialog=ref.current;dialog?.showModal();return()=>dialog?.close();},[]);
 const deleting=action.kind==="delete";
 const title=deleting?"删除活动":before?"编辑活动":"新增活动";
 async function save(e:React.FormEvent){
  e.preventDefault();if(lock.current)return;
  lock.current=true;setBusy(true);setError("");
  try{
   await call("activity-rule",{before,after:deleting?null:{...draft,title:draft.title.trim()}},"PATCH");
   await refresh(deleting?"活动已删除，已有记录保留。":"活动奖励已保存。");close();
  }catch(e){setError(e instanceof Error?e.message:"未能保存，请重试。");}
  finally{lock.current=false;setBusy(false);}
 }
 return <dialog ref={ref} className="reading-dialog" aria-label={title} onCancel={e=>{e.preventDefault();e.stopPropagation();if(!lock.current)close();}}>
  <header><h2>{title}</h2><button className="icon-button" disabled={busy} onClick={close} aria-label="关闭"><X/></button></header>
  <form className="reading-dialog-body" onSubmit={save}>
   {deleting?<p>删除「{before?.title}」后，孩子将无法继续打卡。已有活动记录、小脚步和待确认申请都将保留。</p>:<>
    <label>活动名称<input autoFocus required maxLength={60} value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/></label>
    <ActivityIconPicker rule={draft} initiallyOpen={action.kind==="add"} disabled={busy} onChange={icon=>setDraft({...draft,icon})}/>
    <label>奖励小脚步<input required type="number" min="0" max="100" defaultValue={draft.points} onChange={e=>setDraft({...draft,points:e.target.valueAsNumber})}/></label>
    <label>记录频率<select disabled={draft.key==="housework"} value={weeklyActivity(draft)?"weekly":"daily"} onChange={e=>setDraft({...draft,frequency:e.target.value as "daily"|"weekly"})}>
     <option value="daily">每天一次</option><option value="weekly">每周一次</option></select></label>
    {draft.key==="housework"&&<small>打扫卫生、叠衣服等家务每天合计一次。</small>}
    <label>活动说明（选填）<input maxLength={100} placeholder="例如：每次15分钟" value={draft.description??""} onChange={e=>setDraft({...draft,description:e.target.value})}/></label>
    <label className="reading-checkbox"><input type="checkbox" checked={draft.enabled} onChange={e=>setDraft({...draft,enabled:e.target.checked})}/>启用活动</label>
   </>}
   {error&&<p role="alert" className="form-error">{error}</p>}
   <div className="economy-actions"><button type="submit" className={deleting?"button danger":"button primary activity-rule-save"} disabled={busy||(!deleting&&!draft.title.trim())}>{busy?"正在保存…":deleting?"确认删除":"保存活动"}</button>
    <button type="button" className="text-button" disabled={busy} onClick={close}>取消</button></div>
  </form>
 </dialog>;
}

export function ActivityManagement({data,refresh}:Props){
 const [action,setAction]=useState<RuleAction|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 if(!data.activities)return null;
 async function run(work:()=>Promise<unknown>,message:string){setBusy(true);setError("");try{await work();await refresh(message);}catch(e){setError(e instanceof Error?e.message:"请稍后重试。");}finally{setBusy(false);}}
 return <section className="card activity-management">
  <header className="activity-management-header"><h2><Footprints/>活动确认与奖励</h2><button className="button primary" onClick={()=>setAction({kind:"add"})}><Plus size={16}/>新增活动</button></header>
  {error&&<p className="form-error" role="alert">{error}</p>}
  {data.activities.claims.filter(c=>c.status==="pending").map(c=><article className="economy-row" key={c.id}><div><strong>{c.title} · <StepAmount value={c.points}/></strong><p>{c.date} · {c.note||"孩子记录已完成"}</p></div><div className="economy-actions"><button className="button primary" disabled={busy} onClick={()=>void run(()=>call("activities/"+c.id,{status:"approved"},"PATCH"),"已确认，小脚步到账。")}>确认完成</button><button className="text-button" disabled={busy} onClick={()=>{const note=prompt("告诉孩子这次需要调整什么：");if(note===null)return;void run(()=>call("activities/"+c.id,{status:"rejected",note:note.slice(0,300)},"PATCH"),"已给孩子留下说明。");}}>暂不通过</button></div></article>)}{!data.activities.claims.some(c=>c.status==="pending")&&<p className="reading-muted">没有待确认的活动。</p>}
  {data.activities.rules.map(rule=><article key={rule.key} className="economy-row activity-rule-row">
   <div><strong className="activity-rule-title"><ActivityIcon rule={rule} size={16}/>{rule.title}</strong><p className="reading-muted"><StepAmount value={rule.points} signed/> · {activitySummary(rule)}{!rule.enabled||!rule.points?" · 已暂停":""}</p></div>
   <div className="economy-actions"><button className="button primary" aria-label={`编辑${rule.title}`} onClick={()=>setAction({kind:"edit",rule})}><Pencil size={15}/>编辑</button>
    <button className="text-button" aria-label={`删除${rule.title}`} onClick={()=>setAction({kind:"delete",rule})}><Trash2 size={15}/>删除</button></div>
  </article>)}
  {!data.activities.rules.length&&<p className="reading-muted">还没有活动，点「新增活动」开始设置。</p>}
  {action&&<ActivityRuleDialog action={action} close={()=>setAction(null)} refresh={refresh}/>}
 </section>;
}
