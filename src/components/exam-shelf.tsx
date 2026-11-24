"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ClipboardCheck, Upload, X } from "lucide-react";
import { examKinds, type ExamRecord, type ExamDetail, type ExamMeta, type ExamQuestion, type Observation } from "@/domain/assessment";
import { homeworkPost, homeworkRequest } from "@/services/homework-gateway";
import { PhotoPreviewButton } from "./photo-preview";

const endpoint="/practice/exams";
type Archive={items:ExamRecord[];total:number;stage:{grade:number;semester:number}|null};
const choices=["语文","数学","英语"];
const pagePath=(id:string)=>"/practice/exam-pages/"+id;
const resultLabels={correct:"正确",wrong:"错误",uncertain:"待核对",blank:"未作答"};
const pageStatus:Record<string,string>={awaiting:"待补传",queued:"等待识读",running:"正在识读",done:"已整理",failed:"识读未完成"};
const message=(e:unknown)=>e instanceof Error?e.message:"操作未完成，请重试。";
async function fileSha(file:File){return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",await file.arrayBuffer())),b=>b.toString(16).padStart(2,"0")).join("");}
async function putPhoto(id:string,file:File){await homeworkRequest(pagePath(id)+"/photo",{method:"PUT",headers:{"Content-Type":"application/octet-stream"},body:file});}

export function ExamShelf({date,canManage}:{date:string;canManage:boolean}){
  const [mode,setMode]=useState<"new"|"list"|"detail"|null>(null),[latest,setLatest]=useState<Archive|null>(null),[archive,setArchive]=useState<Archive|null>(null);
  const [offset,setOffset]=useState(0),[selected,select]=useState(""),[detail,setDetail]=useState<ExamDetail|null>(null),[version,refresh]=useState(0);
  const [error,setError]=useState(""),[busy,setBusy]=useState(""),[notice,setNotice]=useState("");
  const [editingMeta,setEditingMeta]=useState(false);
  const submitting=useRef(false),dialog=useRef<HTMLDialogElement>(null);
  const [edit,setEdit]=useState<{pageId:string;q?:ExamQuestion}|null>(null);
  useEffect(()=>{const el=dialog.current;if(mode&&!el?.open)el?.showModal();if(!mode)el?.close();},[mode]);
  useEffect(()=>{
    const controller=new AbortController();
    homeworkRequest<Archive>(endpoint+"?latest=1",{signal:controller.signal}).then(setLatest).catch(e=>{if(!controller.signal.aborted)setError(message(e));});
    return ()=>controller.abort();
  },[version]);
  useEffect(()=>{
    const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;
    async function load(){try{
      if(mode==="list")setArchive(await homeworkRequest<Archive>(endpoint+"?offset="+offset,{signal:controller.signal}));
      if(mode==="detail"){const data=await homeworkRequest<ExamDetail>(endpoint+"/"+selected,{signal:controller.signal});
        if(controller.signal.aborted)return;setDetail(data);
        if(data.pages.some(p=>["queued","running"].includes(p.status)))timer=setTimeout(load,3500);
      }
    }catch(e){if(!controller.signal.aborted)setError(message(e));}}
    void load();return ()=>{controller.abort();clearTimeout(timer);};
  },[mode,selected,offset,version]);
  function openDetail(id:string){select(id);setEditingMeta(false);setDetail(null);setEdit(null);setError("");setMode("detail");}
  function close(){if(!submitting.current){setMode(null);setEdit(null);refresh(n=>n+1);}}
  async function act(fn:()=>Promise<void>){if(submitting.current)return;submitting.current=true;setBusy("正在保存…");setError("");setNotice("");
    try{await fn();refresh(n=>n+1);}catch(e){setError(message(e));}finally{submitting.current=false;setBusy("");}}
  function upload(event:FormEvent<HTMLFormElement>){
    event.preventDefault();const data=new FormData(event.currentTarget);
    void act(async()=>{
      const files=data.getAll("photos") as File[];if(!files.length||files.length>12)throw Error("每份试卷可选 1～12 张照片。");
      const pages=[];for(const f of files){if(!f.size||f.size>20*1024*1024||!["image/jpeg","image/png","image/webp"].includes(f.type))throw Error("请选每张 20 MB 以内的 JPG、PNG 或 WebP 照片。");pages.push({bytes:f.size,sha:await fileSha(f)});}
      if(new Set(pages.map(p=>p.sha)).size!==pages.length)throw Error("选入了相同的照片，请每页只选一次。");
      const paper=await homeworkPost<ExamDetail>(endpoint,{meta:readMeta(data),pages});
      for(const page of paper.pages){if(page.status!=="awaiting")continue;setBusy("正在上传第 "+page.number+" 页…");await putPhoto(page.id,files[page.number-1]);}
      openDetail(paper.exam.id);setNotice("试卷已保存，可关闭窗口。识读结果会自动更新。");
    });
  }
  const latestPaper=latest?.items[0];
  return <section className="exam-shelf" aria-label="测验与考试">
    <div className="reading-section-heading"><h2><ClipboardCheck aria-hidden="true"/>测验与考试</h2><button className="button primary compact" onClick={()=>{setError("");setNotice("");setMode("new");}}><Upload size={16}/>上传试卷</button></div>
    {latestPaper?<button className="exam-line" onClick={()=>openDetail(latestPaper.id)}><strong>{latestPaper.title}</strong><small>{latestPaper.date} · {latestPaper.subject} · {latestPaper.status} ›</small></button>:<p className="reading-muted">{latest?"在这里保存老师批过的小测和考卷。":"正在读取试卷记录…"}</p>}
    {latestPaper&&<button className="text-button" onClick={()=>{setOffset(0);setError("");setNotice("");setMode("list");}}>全部试卷（{latest?.total}）</button>}
    {!mode&&error&&<p role="alert">{error} <button className="text-button" onClick={()=>{setError("");refresh(n=>n+1);}}>重试</button></p>}
    <dialog ref={dialog} className="reading-dialog exam-dialog" aria-label="试卷档案" onCancel={e=>{e.preventDefault();close();}}>
      <header><h2>{mode==="new"?"上传已批试卷":mode==="list"?"全部试卷":detail?.exam.title||"试卷详情"}</h2><button className="icon-button" disabled={!!busy} aria-label="关闭试卷档案" onClick={close}><X/></button></header>
      <div className="reading-dialog-body">
      {mode==="new"&&<form onSubmit={upload} className="exam-form"><PaperFields date={date} stage={latest?.stage}/>        <label>按页序选择老师批改后的照片<input required name="photos" type="file" multiple accept="image/jpeg,image/png,image/webp"/></label>
        <small>每份可选 1～12 张，支持 JPG、PNG、WebP。</small><button className="button primary" disabled={!!busy}>{busy||"保存并识读试卷"}</button></form>}
      {mode==="list"&&<>{archive?.items.map(e=><button key={e.id} className="exam-line" onClick={()=>openDetail(e.id)}><strong>{e.title}</strong><small>{e.date} · {e.subject} · {e.status} ›</small></button>)}<div className="reading-record-actions"><button className="text-button" disabled={!offset} onClick={()=>setOffset(n=>n-10)}>上一页</button><button className="text-button" disabled={offset+10>=(archive?.total??0)} onClick={()=>setOffset(n=>n+10)}>下一页</button></div></>}
      {mode==="detail"&&detail&&<><p>{detail.exam.date} · {detail.exam.subject} · {detail.exam.kind} · {detail.exam.grade}年级{detail.exam.semester===1?"上":"下"}学期 · {detail.exam.scope==="curricular"?"课内":"课外"}{detail.exam.unit&&" · "+detail.exam.unit}</p>
        {(detail.exam.score!==null||detail.exam.maximum!==null)&&<p>得分 {detail.exam.score??"未填"} ／ 满分 {detail.exam.maximum??"未填"}</p>}
        {canManage&&<button className="text-button" onClick={()=>setEditingMeta(!editingMeta)}>{editingMeta?"收起资料编辑":"修改试卷资料"}</button>}
        {editingMeta&&<form className="exam-form" onSubmit={e=>{e.preventDefault();const meta=readMeta(new FormData(e.currentTarget));void act(async()=>{
          const {id,pages,done,status,...previous}=detail.exam;
          await homeworkRequest(endpoint+"/"+id,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({previous,meta})});setEditingMeta(false);setNotice("已保存试卷资料。");
        });}}><PaperFields date={date} meta={detail.exam}/><button className="button primary compact" disabled={!!busy}>保存试卷资料</button></form>}
        {detail.pages.map(p=><section key={p.id} className="exam-page"><h3>第 {p.number} 页 · {pageStatus[p.status]}</h3>
          {p.status!=="awaiting"?<PhotoPreviewButton src={"/assistant-api/learning"+pagePath(p.id)+"/photo"} alt={"试卷第"+p.number+"页"}>查看原卷</PhotoPreviewButton>:<label>补传本页原照片<input type="file" accept="image/jpeg,image/png,image/webp" disabled={!!busy} onChange={e=>{const f=e.target.files?.[0];if(f)void act(async()=>{await putPhoto(p.id,f);});}}/></label>}
          {p.note&&<p>{p.note}</p>}{canManage&&p.status==="failed"&&<button disabled={!!busy} className="button secondary compact" onClick={()=>void act(async()=>{await homeworkPost(pagePath(p.id)+"/retry");})}>重试识读</button>}
          {detail.questions.filter(q=>q.pageId===p.id).map(q=><details key={q.id}><summary>{q.label} · {resultLabels[q.verdict]}</summary><p>{q.question}</p><p>孩子原答：{q.studentAnswer||"未辨清"}</p><p>老师批注：{q.teacherMark||"待核对"}</p>{q.correction&&<p>卷面订正：{q.correction}</p>}{canManage&&<button className="text-button" onClick={()=>setEdit({pageId:p.id,q})}>核对这道题</button>}</details>)}
          {canManage&&["done","failed"].includes(p.status)&&<button className="text-button" onClick={()=>setEdit({pageId:p.id})}>补录漏识别的题</button>}
          {edit?.pageId===p.id&&<ReviewForm key={edit.q?.id??p.id} question={edit.q} busy={!!busy} cancel={()=>setEdit(null)} save={(value,id)=>void act(async()=>{await homeworkPost(pagePath(p.id)+"/review",{id,revision:edit.q?.revision??0,value});setEdit(null);setNotice("已保存核对结果，错题本同步更新。");})}/>}
        </section>)}</>}
      {busy&&<p role="status">{busy}</p>}{notice&&<p role="status">{notice}</p>}{error&&<p className="form-error" role="alert">{error}</p>}
      </div></dialog>
  </section>;
}
function choicesGrade(){return [1,2,3,4,5,6].map(g=><option key={g} value={g}>{g}年级</option>);}
function ReviewForm({question:q,busy,cancel,save}:{question?:ExamQuestion;busy:boolean;cancel:()=>void;save:(v:Observation,id:string)=>void}){
  const [id]=useState(()=>q?.id??crypto.randomUUID());
  const fields={label:"题号",question:"题干",studentAnswer:"孩子原答",teacherMark:"老师批注或核对依据",expectedAnswer:"参考答案（选填）",correction:"卷面订正（选填）"} as const;
  return <form className="exam-form" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);
    const text=(k:string)=>String(f.get(k)??"").trim();
    save({label:text("label"),question:text("question"),studentAnswer:text("studentAnswer"),teacherMark:text("teacherMark"),expectedAnswer:text("expectedAnswer"),correction:text("correction"),verdict:text("verdict") as Observation["verdict"],confident:true,knowledgePoints:q?.knowledgePoints??[],cause:q?.cause??"原因待确认",causeExplanation:q?.causeExplanation??""},id);
  }}>{(Object.keys(fields) as (keyof typeof fields)[]).map(k=><label key={k}>{fields[k]}<input name={k} defaultValue={q?.[k]??""} required={["label","question","teacherMark"].includes(k)}/></label>)}
  <label>核对结果<select name="verdict" defaultValue={q?.verdict??"uncertain"}>{Object.entries(resultLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
  <div className="reading-record-actions"><button type="button" className="text-button" onClick={cancel}>取消</button><button className="button primary compact" disabled={busy}>保存核对结果</button></div></form>;
}

function readMeta(data:FormData){
  const values=Object.fromEntries(["title","date","subject","kind","unit","scope"].map(k=>[k,data.get(k)]));
  return {...values,grade:Number(data.get("grade")),semester:Number(data.get("semester")),score:data.get("score")===""?null:Number(data.get("score")),maximum:data.get("maximum")===""?null:Number(data.get("maximum"))};
}
function PaperFields({date,meta,stage}:{date:string;meta?:ExamMeta;stage?:Archive["stage"]}){
  return <><label>试卷名称<input required name="title" defaultValue={meta?.title} maxLength={120} placeholder="例如：数学第三单元测验"/></label>
        <div className="exam-fields"><label>科目<select name="subject" defaultValue={meta?.subject}>{choices.map(s=><option key={s}>{s}</option>)}</select></label><label>类型<select name="kind" defaultValue={meta?.kind}>{examKinds.map(s=><option key={s}>{s}</option>)}</select></label>
        <label>测验日期<input required type="date" name="date" defaultValue={meta?.date??date}/></label><label>归属<select name="scope" defaultValue={meta?.scope}><option value="curricular">课内</option><option value="extracurricular">课外</option></select></label>
        <label>年级<select name="grade" required defaultValue={meta?.grade??stage?.grade??""}><option value="">请选择</option>{choicesGrade()}</select></label>
        <label>学期<select name="semester" required defaultValue={meta?.semester??stage?.semester??""}><option value="">请选择</option><option value="1">上学期</option><option value="2">下学期</option></select></label>
        <label>得分（选填）<input type="number" min="0" max="1000" step="any" name="score" defaultValue={meta?.score??""}/></label><label>满分（选填）<input type="number" min="0.01" max="1000" step="any" name="maximum" defaultValue={meta?.maximum??""}/></label></div>
        <label>单元（选填）<input name="unit" defaultValue={meta?.unit} maxLength={100}/></label></>;
}
