"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, BookOpen, Check, ChevronRight, FileImage, MessageCircle, Pencil, Plus, ScanLine } from "lucide-react";
import { examKinds, examReadingChecks, type ExamDetail, type ExamMeta, type ExamQuestion, type Observation } from "@/domain/assessment";
import { homeworkPost, homeworkRequest } from "@/services/homework-gateway";
import { PhotoPreviewButton } from "./photo-preview";

const choices=["语文","数学","英语"];
const pagePath=(id:string)=>"/practice/exam-pages/"+id;
const resultLabels={correct:"正确",wrong:"错误",uncertain:"待核对",blank:"未作答"};
const pageStatus:Record<string,string>={awaiting:"待补传",queued:"等待识读",running:"正在识读",done:"已整理",failed:"识读未完成"};
type Act=(fn:()=>Promise<void>)=>void;
function choicesGrade(){return [1,2,3,4,5,6].map(g=><option key={g} value={g}>{g}年级</option>);}
function readMeta(data:FormData){
  const text=(key:string)=>String(data.get(key)??"").trim()||null;
  const num=(key:string)=>text(key)===null?null:Number(text(key));
  return {title:text("title"),date:text("date"),subject:text("subject"),kind:text("kind"),scope:text("scope"),unit:text("unit")??"",
    grade:num("grade"),semester:num("semester"),score:num("score"),maximum:num("maximum")};
}
function PaperFields({meta}:{meta:ExamMeta}){
  return <><label>试卷名称<input name="title" defaultValue={meta.title??""} maxLength={120} placeholder="例如：数学第三单元测验"/></label>
        <div className="exam-fields"><label>科目<select name="subject" defaultValue={meta.subject??""}><option value="">待补充</option>{choices.map(s=><option key={s}>{s}</option>)}</select></label><label>类型<select name="kind" defaultValue={meta.kind??""}><option value="">待补充</option>{examKinds.map(s=><option key={s}>{s}</option>)}</select></label>
        <label>测验日期<input type="date" name="date" defaultValue={meta.date??""}/></label><label>归属<select name="scope" defaultValue={meta.scope??""}><option value="">待补充</option><option value="curricular">课内</option><option value="extracurricular">课外</option></select></label>
        <label>年级<select name="grade" defaultValue={meta.grade??""}><option value="">请选择</option>{choicesGrade()}</select></label>
        <label>学期<select name="semester" defaultValue={meta.semester??""}><option value="">请选择</option><option value="1">上学期</option><option value="2">下学期</option></select></label>
        <label>得分（选填）<input type="number" min="0" max="1000" step="any" name="score" defaultValue={meta?.score??""}/></label><label>满分（选填）<input type="number" min="0.01" max="1000" step="any" name="maximum" defaultValue={meta?.maximum??""}/></label></div>
        <label>单元（选填）<input name="unit" defaultValue={meta?.unit} maxLength={100}/></label></>;
}

function Original({pageId,number}:{pageId:string;number:number}){
  return <PhotoPreviewButton src={"/assistant-api/learning"+pagePath(pageId)+"/photo"} alt={"试卷第"+number+"页"}><FileImage size={16}/>查看原卷</PhotoPreviewButton>;
}
type WorkspaceProps={
  detail:ExamDetail;canManage:boolean;busy:boolean;act:Act;notify:(text:string)=>void;
  openMistakes:()=>void;putPhoto:(id:string,file:File)=>Promise<void>;
};
export function ExamWorkspace({detail,canManage,busy,act,notify,openMistakes,putPhoto}:WorkspaceProps){
  const {exam,questions,pages}=detail;
  const [filter,setFilter]=useState<"all"|"wrong"|"uncertain">("all");
  const [selection,select]=useState<{pageId:string;id?:string}|null>(null);
  const [meta,setMeta]=useState<ExamMeta|null>(null);
  const heading=useRef<HTMLHeadingElement>(null), lastRow=useRef("");
  useEffect(()=>{
    if(selection){heading.current?.focus();heading.current?.scrollIntoView({block:"nearest"});}
    else if(lastRow.current)document.getElementById(lastRow.current)?.focus();
  },[selection]);
  function open(pageId:string,id?:string){lastRow.current="exam-open-"+(id??pageId);notify("");select({pageId,id});}
  const page=pages.find(p=>p.id===selection?.pageId);
  if(selection&&page){
    const q=questions.find(q=>q.id===selection.id);
    return <div className="exam-workspace"><div className="exam-tools"><button className="text-button" disabled={busy} onClick={()=>{select(null);notify("");}}><ArrowLeft size={16}/>返回题目</button><Original pageId={page.id} number={page.number}/></div>
      <div><small>第 {page.number} 页</small><h3 ref={heading} tabIndex={-1}>{q?.label??"补录题目"}</h3></div>
      <QuestionDesk key={q?.id??page.id} q={q} pageId={page.id} canManage={canManage} subject={exam.subject} busy={busy} act={act} notify={notify} onAdded={()=>select(null)}/>
    </div>;
  }
  const counts={all:questions.length,uncertain:questions.filter(q=>q.verdict==="uncertain").length,wrong:questions.filter(q=>q.verdict==="wrong").length};
  return <div className="exam-workspace">
    <div className="exam-overview"><div><strong>{counts.wrong?"已收录 "+counts.wrong+" 道错题":exam.done===exam.pages?"已整理 "+counts.all+" 道题":"已整理 "+exam.done+" / "+exam.pages+" 页"}</strong>
      <small>{[exam.subject,exam.grade&&exam.grade+"年级",exam.date].filter(Boolean).join(" · ")||"共 "+exam.pages+" 页"}</small></div>
      {counts.wrong>0&&<button className="text-button" onClick={openMistakes}><BookOpen size={15}/>错题本</button>}</div>
    <details className="exam-meta-panel"><summary>试卷资料</summary>
      {meta?<form className="exam-form" onSubmit={e=>{e.preventDefault();const value=readMeta(new FormData(e.currentTarget));act(async()=>{
        await homeworkRequest("/practice/exams/"+exam.id,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({previous:meta,meta:value})});setMeta(null);notify("试卷资料已保存。");
      });}}><PaperFields meta={meta}/><div className="exam-tools"><button type="button" className="text-button" onClick={()=>setMeta(null)}>取消</button><button className="button primary compact" disabled={busy}>保存试卷资料</button></div></form>:
      <><p>{[exam.title,exam.kind,exam.semester&&(exam.semester===1?"上学期":"下学期"),exam.scope&&(exam.scope==="curricular"?"课内":"课外"),exam.unit,exam.score!=null&&"得分 "+exam.score,exam.maximum!=null&&"满分 "+exam.maximum].filter(Boolean).join(" · ")||"试卷资料待补充"}</p>{canManage&&<button className="text-button" onClick={()=>{const {id,pages,done,status,...value}=exam;setMeta(value);}}><Pencil size={15}/>补充或修改试卷资料</button>}</>}
      {!!detail.savedChecks?.length&&<div className="exam-check"><strong>已沿用的读图方法</strong>{detail.savedChecks.map(c=><div key={c.id} className="exam-tools"><span>{c.subject} · {examReadingChecks[c.check]}</span>{canManage&&<button className="text-button" disabled={busy} onClick={()=>act(async()=>{await homeworkPost(pagePath(c.pageId)+"/learn",{id:c.id,enabled:false});notify("这条方法已停用。");})}>停用</button>}</div>)}</div>}
    </details>
    <div className="exam-filters" aria-label="题目筛选">{(["all","uncertain","wrong"] as const).map(k=><button key={k} aria-pressed={filter===k} onClick={()=>setFilter(k)}>{({all:"全部",uncertain:"待核对",wrong:"错题"})[k]} {counts[k]}</button>)}</div>
    {filter!=="all"&&!counts[filter]&&<p className="reading-muted">没有{filter==="wrong"?"已收录的错题":"待核对的题目"}。</p>}
    {pages.map(p=>{
      const rows=questions.filter(q=>q.pageId===p.id&&(filter==="all"||q.verdict===filter));
      if(filter!=="all"&&!rows.length)return null;
      return <section key={p.id} className="exam-sheet"><div className="exam-tools"><h3>第 {p.number} 页 <small>{pageStatus[p.status]}</small></h3>{p.status!=="awaiting"&&<Original pageId={p.id} number={p.number}/>}</div>
        {p.status==="awaiting"&&<label>补传本页原照片<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e=>{const f=e.target.files?.[0];if(f)act(()=>putPhoto(p.id,f));}}/></label>}
        {p.note&&(p.status==="done"?<details><summary>识读说明</summary><p>{p.note}</p></details>:<p className="reading-muted" role="status">{p.note}</p>)}
        {canManage&&p.status==="failed"&&<button className="button secondary compact" disabled={busy} onClick={()=>act(async()=>{await homeworkPost(pagePath(p.id)+"/retry");notify("");})}>重试识读</button>}
        {rows.map(q=><button className="exam-qrow" id={"exam-open-"+q.id} key={q.id} onClick={()=>open(p.id,q.id)}><span><strong>{q.label}</strong><small>{q.feedback?(q.feedback.status==="done"?"小步已回复":q.feedback.status==="failed"?"复读未完成":"小步正在看原卷"):q.question}</small></span><span className={"exam-verdict v-"+q.verdict}>{resultLabels[q.verdict]}</span><ChevronRight size={15}/></button>)}
        {canManage&&["done","failed"].includes(p.status)&&<button className="text-button" id={"exam-open-"+p.id} onClick={()=>open(p.id)}><Plus size={15}/>补录漏识别的题</button>}
      </section>;
    })}
  </div>;
}

function QuestionDesk({q,pageId,canManage,subject,busy,act,notify,onAdded}:{q?:ExamQuestion;pageId:string;canManage:boolean;subject:ExamMeta["subject"];busy:boolean;act:Act;notify:(t:string)=>void;onAdded:()=>void}){
  const [mode,setMode]=useState<"view"|"explain"|"edit">(q?"view":"edit");
  const [note,setNote]=useState(""),[requestId,setRequestId]=useState(()=>crypto.randomUUID());
  const feedback=q?.feedback, reply=feedback?.result;
  const pending=feedback?.status==="queued"||feedback?.status==="running";
  function save(value:Observation,id:string,revision:number){
    act(async()=>{await homeworkPost(pagePath(pageId)+"/review",{id,revision,value});setMode("view");notify("已保存核对结果，错题本已同步。");if(!q)onAdded();});
  }
  if(mode==="edit"&&canManage)return <ReviewForm q={q} busy={busy} cancel={()=>q?setMode("view"):onAdded()} save={save}/>;
  if(!q)return null;
  const change=reply?.change;
  const alreadyApplied=change&&Object.entries(change).every(([k,v])=>q[k as keyof Observation]===v);
  return <><div className="exam-question-text"><span className={"exam-verdict v-"+q.verdict}>{resultLabels[q.verdict]}</span><p>{q.question}</p></div>
    <dl className="exam-evidence"><dt>孩子原答</dt><dd>{q.studentAnswer||"未辨清"}</dd><dt>老师批注</dt><dd>{q.teacherMark||"待核对"}</dd>{q.correction&&<><dt>卷面订正</dt><dd>{q.correction}</dd></>}{q.expectedAnswer&&<><dt>参考答案</dt><dd>{q.expectedAnswer}</dd></>}</dl>
    {feedback&&<section className="exam-reply" aria-live="polite"><h4><MessageCircle size={16}/>这道题的说明</h4><blockquote>{feedback.note}</blockquote>
      {pending?<p>小步正在重看原卷，可以先离开。</p>:reply?<><strong>小步的回复</strong><p>{reply.reply}</p>{reply.evidence&&<p><small>原卷依据</small> {reply.evidence}</p>}
      {change&&<details><summary>查看建议的修改</summary><dl className="exam-evidence">{(["question","studentAnswer","teacherMark","correction","verdict"] as const).filter(k=>q[k]!==change[k]).map(k=><div key={k}><dt>{{question:"题干",studentAnswer:"孩子原答",teacherMark:"老师批注",correction:"卷面订正",verdict:"核对结果"}[k]}</dt><dd>{k==="verdict"?resultLabels[change[k]]:change[k]||"留空"}</dd></div>)}</dl>{alreadyApplied&&<p>当前记录已一致。</p>}</details>}
      {canManage&&change&&!alreadyApplied&&feedback.revision===q.revision&&<button className="button primary compact" disabled={busy} onClick={()=>save({...q,...change,confident:change.verdict!=="uncertain"},q.id,feedback.revision)}>采用这次修改</button>}
      {change&&!alreadyApplied&&feedback.revision!==q.revision&&<small>题目记录已更新，请对照当前记录。</small>}
      {reply.check&&subject&&<div className="exam-check"><small>同科试卷可用的方法</small><p>{examReadingChecks[reply.check]}</p>{canManage?<button className="text-button" disabled={busy} onClick={()=>act(async()=>{await homeworkPost(pagePath(pageId)+"/learn",{id:feedback.id,enabled:!feedback.learned});notify(feedback.learned?"已停用这条方法。":"下次读同科试卷时会参考。");})}>{feedback.learned?"停用这条方法":"下次也这样看"}</button>:feedback.learned&&<small>已用于同科试卷</small>}</div>}</>:<p>这次没能读完，说明已保存，可再试一次。</p>}</section>}
    {mode==="explain"?<form className="exam-form exam-compose" onSubmit={e=>{e.preventDefault();if(!note.trim())return;act(async()=>{await homeworkPost(pagePath(pageId)+"/explain",{requestId,questionId:q.id,revision:q.revision,note:note.trim()});setMode("view");setNote("");setRequestId(crypto.randomUUID());notify("说明已收到，小步会重看这道题的原卷。");});}}>
      <label>向小步说明<textarea autoFocus rows={3} maxLength={500} required value={note} onChange={e=>setNote(e.target.value)} placeholder="例如：题号旁的红圈是题型标记，请再看答案下方的勾。"/></label>
      <div className="exam-tools"><button type="button" className="text-button" disabled={busy} onClick={()=>setMode("view")}>取消</button><button className="button primary compact" disabled={busy||!note.trim()||pending}><ScanLine size={16}/>请小步看原卷</button></div>
    </form>:<div className="exam-tools"><button className="button primary compact" disabled={busy||pending} onClick={()=>{setNote(feedback?.status==="failed"?feedback.note:"");setMode("explain");}}><MessageCircle size={16}/>{pending?"正在看原卷":feedback?.status==="failed"?"重新说明":"向小步说明"}</button>
    {canManage&&<button className="text-button" disabled={busy} onClick={()=>setMode("edit")}><Pencil size={15}/>手动核对</button>}</div>}
  </>;
}

function ReviewForm({q,busy,cancel,save}:{q?:ExamQuestion;busy:boolean;cancel:()=>void;save:(v:Observation,id:string,revision:number)=>void}){
  const [id]=useState(()=>q?.id??crypto.randomUUID());
  const [revision]=useState(q?.revision??0);
  function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();const data=new FormData(e.currentTarget);const text=(k:string)=>String(data.get(k)??"").trim();
    const verdict=text("verdict") as Observation["verdict"];
    save({label:text("label"),question:text("question"),studentAnswer:text("studentAnswer"),teacherMark:text("teacherMark"),expectedAnswer:text("expectedAnswer"),correction:text("correction"),verdict,confident:verdict!=="uncertain",knowledgePoints:q?.knowledgePoints??[],cause:q?.cause??"原因待确认",causeExplanation:q?.causeExplanation??""},id,revision);}
  return <form className="exam-form" onSubmit={submit}>
    <label>核对结果<select name="verdict" defaultValue={q?.verdict??"uncertain"}>{Object.entries(resultLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
    <label>核对依据<textarea required rows={2} maxLength={500} defaultValue={q?.teacherMark} name="teacherMark"/></label>
    <details open={!q||undefined}><summary>题号、题干和作答</summary><div className="exam-form">
      <label>题号<input name="label" required defaultValue={q?.label} maxLength={180}/></label><label>题干<textarea rows={3} required name="question" defaultValue={q?.question} maxLength={3500}/></label>
      <label>孩子原答<textarea rows={2} name="studentAnswer" defaultValue={q?.studentAnswer} maxLength={1200}/></label>
      <label>参考答案（选填）<textarea rows={2} name="expectedAnswer" defaultValue={q?.expectedAnswer} maxLength={1200}/></label>
      <label>卷面订正（选填）<textarea rows={2} name="correction" defaultValue={q?.correction} maxLength={1200}/></label>
    </div></details>
    <div className="exam-tools"><button className="text-button" type="button" disabled={busy} onClick={cancel}>取消</button><button className="button primary compact" disabled={busy}><Check size={16}/>保存核对结果</button></div>
  </form>;
}
