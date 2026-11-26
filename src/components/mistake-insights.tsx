"use client";
import { knowledgeGroups } from "@/domain/knowledge-groups";
import { useState } from "react";
import { dimensionNames, dimensions, type Analysis, type Dimension, type Tags } from "@/domain/assessment";
import type { MistakeView } from "@/domain/grading";
import { homeworkRequest } from "@/services/homework-gateway";

import { MistakeAdvancedFilters, type Selections } from "./mistake-advanced-filters";
export function MistakeInsights({options,analysis,filters,change,indexing}:{options:Record<Dimension,string[]>;analysis:Analysis;filters:Selections;change:(v:Selections)=>void;indexing?:boolean}){
  return <div className="mistake-insights">
    <MistakeAdvancedFilters options={options} filters={filters} change={change}/>
    <details><summary>薄弱项与长期趋势</summary>
      <p>原作答确认错误 <strong>{analysis.wrong}</strong> 次，来自 {analysis.sources} 份资料。已判对错 {analysis.known} 次，其他待核对或未作答 {analysis.unknown} 次。</p>
      <p>{analysis.wrongRate===null?(analysis.partial?"含仅收录错题或覆盖不完整的记录，暂不计算错误率。":"暂无足够的原作答记录。"):"已核验原作答错误率 "+analysis.wrongRate+"%"}　变式复测 {analysis.retestKnown?`${analysis.retestCorrect}/${analysis.retestKnown} 通过（${Math.round(analysis.retestCorrect/analysis.retestKnown*100)}%）`:"暂无已判定记录"}</p>
      {analysis.focus.length>0&&<><h3>优先关注的知识类别</h3>{analysis.focus.map(f=><button key={f.name} className="mistake-focus-row" onClick={()=>change({...filters,knowledge:[f.name]})}><strong>{f.name} ›</strong><small>{f.sources}份资料 · {f.wrong}次错误 · {f.retests?`复测 ${f.passed}/${f.retests} 通过`:"待复测"} · 最近 {f.latest}</small></button>)}</>}
      <label>按时段观察<select value={filters.grain??"month"} onChange={e=>change({...filters,grain:e.target.value})}><option value="week">按周</option><option value="month">按月</option><option value="term">按学期</option></select></label>
      {analysis.trends.map(t=><p key={t.period}><strong>{t.period}</strong>　错误 {t.wrong} 次 · 已判 {t.known} 次{t.known&&!t.partial?` · 错误率 ${Math.round(t.wrong/t.known*100)}%`:""} · 复测 {t.passes}/{t.retests}</p>)}
    </details>{indexing&&<small role="status">正在补齐历史标签，统计会随整理进度更新。</small>}</div>;
}
export function QuestionTags({item,canManage,saved}:{item:MistakeView;canManage:boolean;saved:()=>void}){
  const [editing,setEditing]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
  if(!item.tags)return null;
  const tags=item.tags,editable=dimensions.filter(k=>k!=="state"&&k!=="source");
  return <details className="question-tags"><summary>分类标签与依据</summary>
    <p><strong>知识分类</strong>　{knowledgeGroups(item.subject,tags.knowledge).join("、")}</p>
    {dimensions.map(d=><p key={d}><strong>{dimensionNames[d]}</strong>　{tags[d].join("、")} <small>{item.manualTags?.[d]?"家长确认":d==="state"?"据复测记录":d==="form"||d==="scene"||d==="skill"?"据题号与题干":d==="knowledge"||d==="cause"?"据批注或批改记录":"据来源资料"}</small></p>)}
    {canManage&&!editing&&<button className="text-button" onClick={()=>setEditing(true)}>校正本题标签</button>}
    {editing&&<form className="exam-form" onSubmit={async e=>{e.preventDefault();if(busy)return;const form=new FormData(e.currentTarget),edits:Partial<Tags>={...item.manualTags};
      for(const d of editable){const input=String(form.get(d)??"").trim();if(!input)delete edits[d];else if(input!==tags[d].join("、"))edits[d]=[...new Set(input.split(/[、,，]/).map(v=>v.trim()).filter(Boolean))];}
      setBusy(true);try{await homeworkRequest("/practice/tags/"+encodeURIComponent(item.id),{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({revision:item.tagRevision??0,tags:edits})});setEditing(false);saved();}catch(e){setError(e instanceof Error?e.message:"标签未保存。");}finally{setBusy(false);}
    }}><small>多个标签用顿号分开，清空后恢复自动归类。</small><div className="exam-fields">{editable.map(d=><label key={d}>{dimensionNames[d]}<input name={d} maxLength={500} defaultValue={tags[d].join("、")}/></label>)}</div>
    <div className="reading-record-actions"><button type="button" className="text-button" onClick={()=>setEditing(false)}>取消</button><button className="button primary compact" disabled={busy}>保存标签</button></div>{error&&<p role="alert">{error}</p>}</form>}
  </details>;
}
