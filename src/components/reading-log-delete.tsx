"use client";
import {useEffect,useRef,useState} from "react";
import {LoaderCircle,Trash2,X} from "lucide-react";
import type {ReadingBook,ReadingLog} from "@/domain/reading";
import {accountRequest} from "./account-login";
export type ReadingDeleteResult={id:string;date:string;book:ReadingBook;deleted:true;alreadyDeleted?:boolean};
export function ReadingLogDelete({log,book,close,deleted}:{log:ReadingLog;book?:ReadingBook;close:()=>void;deleted:(result:ReadingDeleteResult)=>void}){
 const ref=useRef<HTMLDialogElement>(null),lock=useRef(false),alive=useRef(true);
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 useEffect(()=>{alive.current=true;ref.current?.showModal();return()=>{alive.current=false;ref.current?.close();};},[]);
 async function remove(){if(lock.current)return;lock.current=true;setBusy(true);setError("");try{
  const result=await accountRequest(`reading/logs/${log.id}`,{version:log.version},"DELETE") as ReadingDeleteResult;
  if(alive.current)deleted(result);
 }catch(e){if(alive.current)setError(e instanceof Error?e.message:"删除未完成，请重试。");}finally{lock.current=false;if(alive.current)setBusy(false);}}
 return <dialog ref={ref} className="reading-dialog" aria-labelledby="reading-delete-title" onCancel={event=>{event.preventDefault();if(!lock.current)close();}}><header><h2 id="reading-delete-title"><Trash2 size={22} aria-hidden="true"/>删除这条阅读记录？</h2><button type="button" className="icon-button" disabled={busy} aria-label="关闭删除确认" onClick={close}><X/></button></header><div className="reading-dialog-body"><h3>{book?.title||"阅读记录"}</h3><p className="reading-delete-meta">{log.date} · {log.startPage}—{log.endPage}页 · {log.minutes}分钟</p><p>删除后，这次阅读将从历史和阅读进度中移除，已获得的小脚步保留。请核对，避免删错。</p>{error&&<p className="form-error" role="alert">{error}</p>}<div className="reading-record-actions reading-delete-actions"><button type="button" className="button secondary" disabled={busy} onClick={close}>保留记录</button><button type="button" className="button primary danger" disabled={busy} onClick={()=>void remove()}>{busy?<LoaderCircle className="spin" size={18} aria-hidden="true"/>:<Trash2 size={18} aria-hidden="true"/>}{busy?"正在删除…":"确认删除"}</button></div></div></dialog>;
}
