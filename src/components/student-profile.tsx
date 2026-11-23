"use client";
import {useEffect,useRef,useState} from "react";
import {GraduationCap,ChevronRight,X} from "lucide-react";
import {accountRequest} from "./account-login";
import type {StudentProfileView} from "@/domain/student-profile";
function StudentProfileDetails({profile,close}:{profile:StudentProfileView;close:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const current=dialog.current;current?.showModal();return()=>current?.close();},[]);
 return <dialog ref={dialog} className="reading-dialog student-profile-dialog" aria-label="我的学习档案" onCancel={event=>{event.preventDefault();close();}}>
  <header><h2><GraduationCap size={20} aria-hidden="true"/>我的学习档案</h2><button type="button" className="icon-button" aria-label="关闭学习档案" onClick={close}><X size={21} aria-hidden="true"/></button></header>
  <div className="reading-dialog-body">
   <p>学习阶段：{profile.grade}年级 · 第{profile.semester}学期</p>
   {[profile.region,profile.school].some(Boolean)&&<p>{[profile.region,profile.school].filter(Boolean).join(" · ")}</p>}
   {(["语文","数学","英语"] as const).map(subject=><section key={subject}><h3>{subject}</h3><p>{profile.textbooks[subject].version||"教材待补充"}</p><p className="reading-muted">学习范围：{profile.textbooks[subject].scope||"待补充"}</p></section>)}
   <p className="reading-muted">课内练习将参考学习阶段与已学范围，由家长维护。</p>
  </div>
 </dialog>;
}
export function StudentProfileSummary({profile}:{profile?:StudentProfileView|null}){
 const [open,setOpen]=useState(false),trigger=useRef<HTMLButtonElement>(null);
 const close=()=>{setOpen(false);requestAnimationFrame(()=>trigger.current?.focus());};
 if(!profile)return null;
 const stage=`${profile.grade}年级 · ${profile.semester===1?"上学期":"下学期"}`;
 return <><button ref={trigger} type="button" className="student-profile-summary" aria-label={`查看学习档案：${stage}`} aria-haspopup="dialog" aria-expanded={open} onClick={()=>setOpen(true)}><GraduationCap size={16} aria-hidden="true"/><span>{stage}</span><ChevronRight size={13} aria-hidden="true"/></button>{open&&<StudentProfileDetails profile={profile} close={close}/>}</>;
}
export function StudentProfileEditor({profile,refresh}:{profile?:StudentProfileView|null;refresh:(message:string)=>Promise<void>}){const [form,setForm]=useState(()=>profile||{grade:4,semester:2 as 1|2,region:"",school:"",textbooks:{语文:{version:"",scope:""},数学:{version:"",scope:""},英语:{version:"",scope:""}}}),[busy,setBusy]=useState(false),[error,setError]=useState("");return <section className="card student-profile"><h2><GraduationCap/>学习档案</h2><p className="reading-muted">用于限定练习阶段与范围。教材和进度不清楚时可以暂留空，收到教材信息后再补充。</p><form onSubmit={async e=>{e.preventDefault();setBusy(true);setError("");try{const v=await accountRequest("reading/student-profile",form,"PATCH");setForm(v);await refresh("学习档案已保存。");}catch(e){setError(e instanceof Error?e.message:"请稍后重试。");}finally{setBusy(false);}}}><div className="reading-fields"><label>年级<select value={form.grade} onChange={e=>setForm({...form,grade:Number(e.target.value)})}>{[1,2,3,4,5,6].map(n=><option key={n} value={n}>{n}年级</option>)}</select></label><label>学期<select value={form.semester} onChange={e=>setForm({...form,semester:Number(e.target.value) as 1|2})}><option value={1}>第一学期</option><option value={2}>第二学期</option></select></label></div><label>所在地区<input value={form.region} maxLength={100} onChange={e=>setForm({...form,region:e.target.value})}/></label><label>学校<input value={form.school} maxLength={120} onChange={e=>setForm({...form,school:e.target.value})}/></label>{(["语文","数学","英语"] as const).map(subject=><details key={subject}><summary>{subject}教材与已学范围</summary><label>教材版本<input value={form.textbooks[subject].version} maxLength={100} onChange={e=>setForm({...form,textbooks:{...form.textbooks,[subject]:{...form.textbooks[subject],version:e.target.value}}})}/></label><label>目前已学到哪里<textarea value={form.textbooks[subject].scope} maxLength={300} rows={2} onChange={e=>setForm({...form,textbooks:{...form.textbooks,[subject]:{...form.textbooks[subject],scope:e.target.value}}})}/></label></details>)}{error&&<p className="form-error" role="alert">{error}</p>}<button className="button primary" disabled={busy}>保存学习档案</button></form></section>;}
