"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ChevronRight, CircleAlert, CircleCheck, ClipboardCheck, Clock3, FileText, Upload, X, type LucideIcon } from "lucide-react";
import { type ExamRecord, type ExamDetail } from "@/domain/assessment";
import { homeworkPost, homeworkRequest } from "@/services/homework-gateway";
import { ExamWorkspace } from "./exam-detail";

const endpoint="/practice/exams";
type Archive={items:ExamRecord[];total:number;stage:{grade:number;semester:number}|null};
const pagePath=(id:string)=>"/practice/exam-pages/"+id;
const message=(e:unknown)=>e instanceof Error?e.message:"操作未完成，请重试。";
async function fileSha(file:File){return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",await file.arrayBuffer())),b=>b.toString(16).padStart(2,"0")).join("");}
async function putPhoto(id:string,file:File){await homeworkRequest(pagePath(id)+"/photo",{method:"PUT",headers:{"Content-Type":"application/octet-stream"},body:file});}

const examStates: Record<string,{tone:string;icon:LucideIcon}> = {
  "整理中": {tone:"in-progress",icon:Clock3},
  "已整理": {tone:"done",icon:CircleCheck},
  "待补传": {tone:"uncertain",icon:Upload},
  "需核对": {tone:"wrong",icon:CircleAlert},
};
function ExamRow({exam,open}:{exam:ExamRecord;open:(id:string)=>void}){
  const {tone,icon:Icon}=examStates[exam.status]??{tone:"neutral",icon:FileText};
  const info=[exam.date,exam.subject].filter(Boolean).join(" · ");
  return <button className={`exam-line exam-status-row status-${tone}`} onClick={()=>open(exam.id)}>
    <span className="exam-row-info"><strong>{exam.title||"已批试卷"}</strong>{info&&<small>{info}</small>}</span>
    <span className="exam-row-state"><Icon size={16} aria-hidden="true"/>{exam.status}<ChevronRight size={14} aria-hidden="true"/></span>
  </button>;
}

export function ExamShelf({canManage,openMistakes}:{canManage:boolean;openMistakes:()=>void}){
  const [mode,setMode]=useState<"new"|"list"|"detail"|null>(null),[latest,setLatest]=useState<Archive|null>(null),[archive,setArchive]=useState<Archive|null>(null);
  const [offset,setOffset]=useState(0),[selected,select]=useState(""),[detail,setDetail]=useState<ExamDetail|null>(null),[version,refresh]=useState(0);
  const [error,setError]=useState(""),[busy,setBusy]=useState(""),[notice,setNotice]=useState("");
  const submitting=useRef(false),dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const el=dialog.current;if(mode&&!el?.open)el?.showModal();if(!mode)el?.close();},[mode]);
  useEffect(()=>{
    const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;
    async function load(){try{
      if(!mode||mode==="list"){
        const query=mode==="list"?"?offset="+offset:"?latest=1";
        const data=await homeworkRequest<Archive>(endpoint+query,{signal:controller.signal});
        if(controller.signal.aborted)return;
        if(mode==="list")setArchive(data);else setLatest(data);
        if(data.items.some(exam=>exam.status==="整理中"))timer=setTimeout(load,3500);
      }
      if(mode==="detail"){const data=await homeworkRequest<ExamDetail>(endpoint+"/"+selected,{signal:controller.signal});
        if(controller.signal.aborted)return;setDetail(data);
        if(data.pages.some(p=>["queued","running"].includes(p.status)) || data.questions.some(q=>q.feedback && ["queued","running"].includes(q.feedback.status)))timer=setTimeout(load,3500);
      }
    }catch(e){if(!controller.signal.aborted)setError(message(e));}}
    void load();return ()=>{controller.abort();clearTimeout(timer);};
  },[mode,selected,offset,version]);
  function openDetail(id:string){select(id);setNotice("");setDetail(null);setError("");setMode("detail");}
  function close(){if(!submitting.current){setMode(null);refresh(n=>n+1);}}
  async function act(fn:()=>Promise<void>){if(submitting.current)return;submitting.current=true;setBusy("正在保存…");setError("");setNotice("");
    try{await fn();refresh(n=>n+1);}catch(e){setError(message(e));}finally{submitting.current=false;setBusy("");}}
  function upload(event:FormEvent<HTMLFormElement>){
    event.preventDefault();const data=new FormData(event.currentTarget);
    void act(async()=>{
      const files=data.getAll("photos") as File[];if(!files.length||files.length>12)throw Error("每份试卷可选 1～12 张照片。");
      const pages=[];for(const f of files){if(!f.size||f.size>20*1024*1024||!["image/jpeg","image/png","image/webp"].includes(f.type))throw Error("请选每张 20 MB 以内的 JPG、PNG 或 WebP 照片。");pages.push({bytes:f.size,sha:await fileSha(f)});}
      if(new Set(pages.map(p=>p.sha)).size!==pages.length)throw Error("选入了相同的照片，请每页只选一次。");
      const paper=await homeworkPost<ExamDetail>(endpoint,{pages});
      for(const page of paper.pages){if(page.status!=="awaiting")continue;setBusy("正在上传第 "+page.number+" 页…");await putPhoto(page.id,files[page.number-1]);}
      openDetail(paper.exam.id);setNotice("照片已保存，小步会在后台整理错题。");
    });
  }
  const latestPaper=latest?.items[0];
  return <section className="exam-shelf" aria-label="测验与考试">
    <div className="reading-section-heading"><h2><ClipboardCheck aria-hidden="true"/>测验与考试</h2><button className="button primary compact" onClick={()=>{setError("");setNotice("");setMode("new");}}><Upload size={16}/>上传试卷</button></div>
    {latestPaper?<ExamRow exam={latestPaper} open={openDetail}/>:<p className="reading-muted">{latest?"在这里保存老师批过的小测和考卷。":"正在读取试卷记录…"}</p>}
    {latestPaper&&<button className="text-button" onClick={()=>{setOffset(0);setError("");setNotice("");setMode("list");}}>全部试卷（{latest?.total}）</button>}
    {!mode&&error&&<p role="alert">{error} <button className="text-button" onClick={()=>{setError("");refresh(n=>n+1);}}>重试</button></p>}
    <dialog ref={dialog} className="reading-dialog exam-dialog" aria-label="试卷档案" onCancel={e=>{e.preventDefault();close();}}>
      <header><h2>{mode==="new"?"上传已批试卷":mode==="list"?"全部试卷":detail?.exam.title||"试卷详情"}</h2><button className="icon-button" disabled={!!busy} aria-label="关闭试卷档案" onClick={close}><X/></button></header>
      <div className="reading-dialog-body">
      {notice&&<p className="exam-notice" role="status">{notice}</p>}{error&&<p className="form-error" role="alert">{error}</p>}
      {mode==="new"&&<form onSubmit={upload} className="exam-form"><label>选择已批试卷照片<input required name="photos" type="file" multiple accept="image/jpeg,image/png,image/webp"/></label>
        <small>按页序选 1～12 张。小步会识别老师标出的错题，试卷资料可稍后补充。</small><button className="button primary" disabled={!!busy}>{busy||"上传并整理错题"}</button></form>}
      {mode==="list"&&<>{archive?.items.map(e=><ExamRow key={e.id} exam={e} open={openDetail}/>)}<div className="reading-record-actions"><button className="text-button" disabled={!offset} onClick={()=>setOffset(n=>n-10)}>上一页</button><button className="text-button" disabled={offset+10>=(archive?.total??0)} onClick={()=>setOffset(n=>n+10)}>下一页</button></div></>}
      {mode==="detail"&&detail&&<ExamWorkspace key={detail.exam.id} detail={detail} canManage={canManage} busy={!!busy} act={act} notify={setNotice}
        openMistakes={()=>{close();openMistakes();}} putPhoto={putPhoto}/>}
      {mode==="detail"&&!detail&&!error&&<p role="status">正在读取试卷…</p>}
      {busy&&<p role="status">{busy}</p>}
      </div></dialog>
  </section>;
}
