"use client";
import { useState, type FormEvent } from "react";
import { Award, BookOpen, Flag, Pencil, Plus, X } from "lucide-react";
import { contextSchema, goalResult, metrics, milestoneKinds, percent, type Cohort, type ExamNode, type GoalSpec, type MilestoneData } from "@/domain/exam-milestones";
import { homeworkPost, homeworkRequest } from "@/services/homework-gateway";

const subjects=["语文","数学","英语"] as const;
type Act=(fn:()=>Promise<void>)=>void;
const fmt=(n:number)=>Number(n.toFixed(2)).toString();
const metricValue=(m:GoalSpec["metric"],v:number)=>m==="percent"?fmt(v)+"%":"第 "+v+" 名";
const scopes=[["classroom","班级"],["year","年级"]] as const;

function ScoreChart({exams}:{exams:ExamNode[]}){
  const points=exams.filter(e=>e.date).slice(0,8).reverse();
  if(!points.some(p=>percent(p)!==null))return <p className="reading-muted">补齐考试日期、得分和满分后，这里会显示成绩曲线。</p>;
  const x=(i:number)=>points.length===1?160:35+i*260/(points.length-1);
  const y=(value:number)=>115-value;
  return <figure className="milestone-chart"><figcaption>同科得分率 <small>按考试顺序 · 最近 {points.length} 场</small></figcaption>
    <svg viewBox="0 0 320 145" role="img" aria-label="历次考试得分率曲线，下方按考试列有对应成绩">
      {[0,50,100].map(t=><g key={t}><line x1="32" x2="300" y1={y(t)} y2={y(t)} className="mile-grid"/><text x="0" y={y(t)+4}>{t}%</text></g>)}
      {points.map((p,i)=>{const value=percent(p),prev=i?percent(points[i-1]):null;if(value===null)return null;
        return <g key={p.id}>{prev!==null&&<line x1={x(i-1)} x2={x(i)} y1={y(prev)} y2={y(value)} className="mile-line"/>}
          <circle cx={x(i)} cy={y(value)} r="4"><title>{p.date} · {p.kind} · {fmt(value)}%</title></circle></g>;})}
      <text x="32" y="137">{points[0].date}</text>{points.length>1&&<text x="300" y="137" textAnchor="end">{points.at(-1)?.date}</text>}
    </svg></figure>;
}
function GroupFigures({value,label}:{value:Cohort;label:string}){
  const high=Math.max(1,...value.bands.map(b=>b.count));
  const summary=[value.rank!==null&&"第 "+value.rank+" 名",value.total!==null&&value.total+" 人参考",value.average!==null&&"平均 "+value.average+" 分"].filter(Boolean).join(" · ");
  if(!summary&&!value.bands.length)return null;
  return <div className="mile-group"><h4>{label}</h4>{summary&&<p>{summary}</p>}{value.bands.map(b=><div className="mile-band" key={b.label}><span>{b.label}</span><span className="mile-track"><i style={{width:100*b.count/high+"%"}}/></span><span>{b.count} 人</span></div>)}</div>;
}
function ContextEditor({exam,busy,act,close}:{exam:ExamNode;busy:boolean;act:Act;close:()=>void}){
  const [draft,setDraft]=useState(exam.context),[revision]=useState(exam.revision),[error,setError]=useState("");
  function save(e:FormEvent){e.preventDefault();
    const parsed=contextSchema.safeParse(draft);
    if(!parsed.success){setError(parsed.error.issues[0].message);return;}
    act(async()=>{await homeworkRequest("/practice/milestones/"+exam.id+"/context",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({revision,context:parsed.data})});close();});
  }
  return <form className="exam-form mile-editor" onSubmit={save}><small>按老师公布的信息填写，未公布的项目留空。</small>
    {scopes.map(([k,label])=>{
      const v=draft[k];const set=(change:Partial<Cohort>)=>setDraft(d=>({...d,[k]:{...d[k],...change}}));
      return <fieldset key={k}><legend>{label}</legend><div className="mile-inputs">
        {([["rank","我的名次"],["total","参考人数"],["average","平均分"]] as const).map(([key,name])=><label key={key}>{name}<input type="number" min={key==="average"?0:1} max={key==="average"?exam.maximum??1000:100000} step={key==="average"?"any":1} value={v[key]??""} onChange={e=>set({[key]:e.target.value===""?null:Number(e.target.value)})}/></label>)}</div>
        {v.bands.map((b,i)=><div className="mile-band-input" key={i}><label>分数段<input required maxLength={30} placeholder="如 90～100 分" value={b.label} onChange={e=>set({bands:v.bands.map((p,j)=>j===i?{...p,label:e.target.value}:p)})}/></label>
          <label>人数<input type="number" required min="0" step="1" max="100000" value={b.count} onChange={e=>set({bands:v.bands.map((p,j)=>j===i?{...p,count:Number(e.target.value)}:p)})}/></label>
          <button type="button" className="text-button" aria-label={"移除"+label+"第"+(i+1)+"个分数段"} onClick={()=>set({bands:v.bands.filter((_,j)=>i!==j)})}><X size={16}/></button></div>)}
        {v.bands.length<20&&<button type="button" className="text-button" onClick={()=>set({bands:[...v.bands,{label:"",count:0}]})}><Plus size={14}/>添加分数段</button>}</fieldset>;
    })}
    {error&&<p role="alert">{error}</p>}<div className="exam-tools"><button className="text-button" type="button" onClick={close}>取消</button><button className="button primary compact" disabled={busy}>保存对照数据</button></div></form>;
}
function GoalEditor({subject,act,busy,close}:{subject:string;act:Act;busy:boolean;close:(savedSubject?:string)=>void}){
  const [metric,setMetric]=useState<GoalSpec["metric"]>("percent"),[id]=useState(()=>crypto.randomUUID());
  function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);
    const goal={subject:f.get("subject"),kind:f.get("kind"),metric,target:Number(f.get("target")),points:Number(f.get("points")),celebration:f.get("celebration")};
    act(async()=>{await homeworkPost("/practice/milestone-goals",{id,goal});close(String(goal.subject));});
  }
  return <form className="exam-form mile-editor" onSubmit={submit}><div className="exam-fields">
    <label>科目<select name="subject" defaultValue={subjects.some(s=>s===subject)?subject:"数学"}>{subjects.map(s=><option key={s}>{s}</option>)}</select></label>
    <label>考试类型<select name="kind">{milestoneKinds.map(k=><option key={k}>{k}</option>)}</select></label>
    <label>目标指标<select value={metric} onChange={e=>setMetric(e.target.value as GoalSpec["metric"])}>{Object.entries(metrics).map(([k,v])=><option value={k} key={k}>{v}</option>)}</select></label>
    <label>{metric==="percent"?"至少达到（%）":"进入前几名"}<input name="target" type="number" min={metric==="percent"?0.01:1} max={metric==="percent"?100:100000} step={metric==="percent"?"0.01":1} required/></label></div>
    <label>奖励小脚步（选填）<input name="points" type="number" min="0" max="1000" step="1" placeholder="由家长约定"/></label>
    <label>鼓励或庆祝约定（选填）<input name="celebration" maxLength={120} placeholder="如：周末一起去看期待的电影"/></label>
    <div className="exam-tools"><button type="button" className="text-button" onClick={()=>close()}>取消</button><button className="button primary compact" disabled={busy}>保存考前目标</button></div></form>;
}

export function ExamMilestonePanel({data,act,busy,canManage,openExam,initialSubject}:{data:MilestoneData;act:Act;busy:boolean;canManage:boolean;openExam:(id:string)=>void;initialSubject?:string}){
  const [subject,setSubject]=useState(initialSubject||data.exams[0]?.subject||data.goals[0]?.subject||"数学");
  const [tab,setTab]=useState<"scores"|"goals">("scores"),[editing,setEditing]=useState(""),[adding,setAdding]=useState(false);
  const exams=data.exams.filter(e=>(e.subject??"待补科目")===subject), goals=data.goals.filter(g=>g.subject===subject&&g.status!=="cancelled");
  const choices:string[]=data.exams.some(e=>!e.subject)?[...subjects,"待补科目"]:[...subjects];
  return <div className="exam-workspace"><div className="exam-tools"><div className="exam-filters">
    <button aria-pressed={tab==="scores"} onClick={()=>setTab("scores")}>历次成绩</button><button aria-pressed={tab==="goals"} onClick={()=>setTab("goals")}>考前目标</button></div>
    <select aria-label="里程碑科目" value={subject} onChange={e=>{setSubject(e.target.value);setEditing("");setAdding(false);}}>{choices.map(s=><option key={s}>{s}</option>)}</select></div>
    {tab==="scores"?<>
      {exams.length>0?<ScoreChart exams={exams}/>:<p>暂无{subject}重要考试。在试卷资料中选定期中、期末、模拟或其他重要考试，即可加入这里。</p>}
      {exams.map(exam=><article className="exam-sheet mile-entry" key={exam.id}><small>{[exam.date??"日期待补",exam.grade&&exam.grade+"年级",exam.semester&&(exam.semester===1?"上学期":"下学期"),exam.kind].filter(Boolean).join(" · ")}</small>
        <h3>{exam.title||exam.kind}</h3><div className="exam-tools"><strong>{exam.score===null?"成绩待补":exam.score+" 分"}{exam.maximum!==null&&" / 满分 "+exam.maximum}{percent(exam)!==null&&" · "+fmt(percent(exam)!)+"%"}</strong><button className="text-button" onClick={()=>openExam(exam.id)}><BookOpen size={15}/>试卷 · {exam.wrong} 道错题</button></div>
        {editing===exam.id?<ContextEditor exam={exam} busy={busy} act={act} close={()=>setEditing("")}/>:<><GroupFigures value={exam.context.classroom} label="班级"/><GroupFigures value={exam.context.year} label="年级"/>{canManage&&<button className="text-button" onClick={()=>setEditing(exam.id)}><Pencil size={15}/>{exam.revision?"修改":"补充"}班级与年级数据</button>}</>}
      </article>)}</>:<>
      {canManage&&!adding&&<button className="button primary compact mile-add" onClick={()=>setAdding(true)}><Flag size={16}/>定个目标</button>}
      {adding&&<GoalEditor subject={subject} busy={busy} act={act} close={s=>{if(s)setSubject(s);setAdding(false);}}/>}
      {!goals.length&&!adding&&<p>还没有{subject}考试目标。</p>}
      {goals.map(g=><article className="exam-sheet mile-entry" key={g.id}><small>{g.created} 约定 · {g.subject}</small><h3>{g.kind} · {metrics[g.metric]}{g.metric==="percent"?"达到 "+fmt(g.target)+"%":"进入前 "+g.target+" 名"}</h3>
        {g.points>0&&<p>达成奖励 · {g.points} 个小脚步</p>}{g.celebration&&<p>家庭约定 · {g.celebration}</p>}
        {g.status==="earned"?<p className="mile-earned"><Award size={16}/>目标达成！{g.actual!==null&&metricValue(g.metric,g.actual)}{g.points>0&&" · 小脚步已到账"}</p>:<>
          {!exams.some(e=>goalResult(g,e))&&<small>等待符合条件的考试成绩。</small>}
          {exams.map(e=>{const result=goalResult(g,e);return result&&<div className="exam-tools" key={e.id}><span>{e.date} · {metricValue(g.metric,result.value)} · {result.reached?"已达到":"继续加油"}</span>{canManage&&result.reached&&<button className="button primary compact" disabled={busy} onClick={()=>act(async()=>{await homeworkPost("/practice/milestone-goals/"+g.id,{action:"confirm",examId:e.id});})}>确认达成</button>}</div>;})}
          {canManage&&<button className="text-button" disabled={busy} onClick={()=>act(async()=>{await homeworkPost("/practice/milestone-goals/"+g.id,{action:"cancel"});})}>结束这个目标</button>}</>}
      </article>)}</>}
  </div>;
}
