"use client";
import {useEffect,useRef,useState} from "react";
import {Printer,Download,Camera,BookOpen,RefreshCw,X,Check,Clock3} from "lucide-react";
import {accountRequest} from "./account-login";
import {StepAmount} from "./growth-tokens";
import {XiaobuMascot} from "./xiaobu-mascot";
import { PhotoPreviewButton } from "./photo-preview";
import { PracticePrintPreview } from "./practice-print-preview";
import {TutorialButton} from "./study-tutorial";
import {preparePracticePhoto} from "./practice-photos";
import type {PracticeView,PracticeSubject,PracticeAnswer} from "@/domain/practice";
import type { HomeworkScopeSource } from "@/domain/homework-scope";
import type {StudentProfileView} from "@/domain/student-profile";
const call=(path:string,value?:unknown,method="POST")=>accountRequest("learning/practice/"+path,value,method);
const message=(e:unknown)=>e instanceof Error?e.message:"操作未完成，请稍后重试。";
const labels={queued:"排队中",generating:"正在出题与校验",ready:"题单已准备好",grading:"正在批改",graded:"批改已完成",failed:"处理尚未完成"};
type State={today:string;viewer:{id:string;role:string};profile:StudentProfileView|null;subjects:{subject:PracticeSubject;curricular:number;extracurricular:number;unknown:number;pendingSources?:HomeworkScopeSource[];rewardEligible:boolean}[];items:PracticeView[]};
export function PracticeCenter({active=true,openSource}:{active?:boolean;openSource?:(source:HomeworkScopeSource)=>void}){const activeRef=useRef(active);activeRef.current=active;const[data,setData]=useState<State|null>(null),[selected,setSelected]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");const live=useRef(true),earned=useRef(""),reading=useRef(false);
 async function load(){if(reading.current)return;reading.current=true;try{const state=await call("state",undefined,"GET") as State;if(!live.current)return;setData(state);setError("");const signature=state.items.map(p=>p.id+":"+p.rewarded).join("|");if(earned.current&&earned.current!==signature)window.dispatchEvent(new Event("xiaobu:growth-updated"));earned.current=signature;}catch(e){if(live.current)setError(message(e));}finally{reading.current=false;}}
 useEffect(()=>{live.current=true;void load();const timer=setInterval(()=>{if(activeRef.current&&!document.hidden)void load();},5000);const clear=()=>{setData(null);setSelected(null);setNotice("");setError("");void load();};window.addEventListener("xiaobu:session-changed",clear);return()=>{live.current=false;clearInterval(timer);window.removeEventListener("xiaobu:session-changed",clear);};},[]);
 const parent=data?.viewer.role==="parent"||data?.viewer.role==="admin";
 return <section className="card practice-center" aria-label="课内小练习"><header className="practice-heading"><div><h2><BookOpen/>15分钟小练习</h2><p>从课内错题出发，先在纸上试一试。</p></div><div className="economy-actions"><TutorialButton topic="practice"/><XiaobuMascot/></div></header>{error&&<div><p className="form-error" role="alert">{error}</p><button className="button primary compact" onClick={()=>void load()}>重新读取</button></div>}{notice&&<p className="reading-notice" role="status">{notice}</p>}{!data?<p role="status">正在打开小练习…</p>:<><p className="reading-muted">{data.profile?`${data.profile.grade}年级第${data.profile.semester}学期` : "请家长先填写学习档案"} · 课内与课外分开。每科每天最多 <StepAmount value={2}/>，不要求全部答对。</p><div className="practice-subjects">{data.subjects.map(s=>{const existing=data.items.find(p=>p.subject===s.subject&&p.date===data.today);return <article key={s.subject}><h3>{s.subject}</h3><p>{s.curricular}道课内错题 · {s.unknown}道待分类</p><small>{s.rewardEligible?"今天还有一次奖励机会":"今天已领过这科奖励"}</small><button className="button primary" disabled={busy||!existing&&(!s.curricular||!data.profile)} onClick={()=>{if(existing){setSelected(existing.id);return;}setBusy(true);setError("");void call("generate",{subject:s.subject}).then(async p=>{await load();setSelected(p.id);}).catch(e=>setError(message(e))).finally(()=>setBusy(false));}}>{existing?"打开今日练习":s.curricular?"准备这科练习":"暂无课内错题"}</button>
 {s.pendingSources?.length && openSource ? <details className="practice-scope-sources">
   <summary>查看待补归属的原作业</summary>
   {s.pendingSources.map(source => <button key={source.id} type="button" className="text-button" onClick={() => openSource(source)}>
     {source.date} · {source.title}
   </button>)}
 </details> : null}</article>;})}</div><p className="reading-muted">小练习使用课内错题。旧作业待分类时，家长可到原作业补一次归属。教材版本和当前进度可在学习档案里补充。</p><details className="practice-history"><summary><Clock3 size={18}/>近期小练习 · {data.items.length}份</summary>{data.items.map(p=><button className="practice-history-row" key={p.id} onClick={()=>setSelected(p.id)}><span>{p.date} · {p.subject} · 课内</span><span>{labels[p.status]}{p.rewarded?` · +${p.rewarded}小脚步`:""}</span></button>)}{!data.items.length&&<p>还没有小练习，选一门主课开始。</p>}</details>{selected&&data.items.some(p=>p.id===selected)&&<PracticeDetail item={data.items.find(p=>p.id===selected)!} parent={!!parent} close={()=>setSelected(null)} refresh={async text=>{await load();setNotice(text);window.dispatchEvent(new Event("xiaobu:growth-updated"));}}/>}</>}</section>;
}
function PracticeDetail({item:p,parent,close,refresh}:{item:PracticeView;parent:boolean;close:()=>void;refresh:(text:string)=>Promise<void>}){const ref=useRef<HTMLDialogElement>(null),[photos,setPhotos]=useState<{name:string;image:string}[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(""),[review,setReview]=useState<PracticeAnswer|null>(null);
 useEffect(()=>{ref.current?.showModal();return()=>ref.current?.close();},[]);
 async function run(work:()=>Promise<unknown>,text:string){setBusy(true);setError("");try{await work();await refresh(text);}catch(e){setError(message(e));}finally{setBusy(false);}}
 async function downloadDocument(answers = false) {
  setBusy(true);
  setError("");
  try {
   const response = await fetch(`/assistant-api/learning/practice/items/${p.id}/document${answers ? "?answers=1" : ""}`, { credentials: "same-origin" });
   if (!response.ok) {
    const result = await response.json();
    throw Error(result.error || "题单暂时无法打开。");
   }
   const blob = new Blob([await response.text()], { type: "text/html;charset=utf-8" });
   const url = URL.createObjectURL(blob);
   const link = window.document.createElement("a");
   link.href = url;
   link.download = `小步学习-${p.subject}-${p.date}${answers ? "-参考答案" : "-练习单"}.html`;
   link.click();
   setTimeout(() => URL.revokeObjectURL(url), 30000);
  } catch (e) {
   setError(message(e));
  } finally {
   setBusy(false);
  }
 }
 const [previewOpen, setPreviewOpen] = useState(false);
 const printButton = useRef<HTMLButtonElement>(null);
 const working=["queued","generating","grading"].includes(p.status),complete=p.status==="graded"&&p.result?.scopeComplete&&p.result.answers.every(a=>!["blank","uncertain"].includes(a.verdict));
 return <dialog ref={ref} className="reading-dialog practice-dialog" aria-labelledby="practice-detail-title" onCancel={e=>{e.preventDefault();if(!busy)close();}}><header><h2 id="practice-detail-title">{p.subject} · 课内小练习</h2><div className="economy-actions"><TutorialButton topic="practice"/><button className="icon-button" disabled={busy} aria-label="关闭小练习" onClick={close}><X/></button></div></header><div className="reading-dialog-body"><p>{p.date} · {p.profileLabel} · {labels[p.status]}</p>{p.note&&<p className="practice-status-note">{p.note}</p>}{error&&<p className="form-error" role="alert">{error}</p>}{p.rewarded>0?<p className="reading-notice"><Check size={18}/>完成奖励已到账 <StepAmount value={p.rewarded} signed/></p>:!p.rewardEligible?<p className="reading-muted">今天这科奖励已领取，本次继续记录学习，不重复发放。</p>:<p className="reading-muted">真实做完这一套可攒 <StepAmount value={2}/>，批改正确率不影响奖励。</p>}
 {p.sources.length>0&&<details><summary>这次练习来自哪些错题</summary>{p.sources.map(s=><article className="practice-question-preview" key={s.id}><strong>{s.title}</strong><p>{s.question}</p><p>知识点：{s.knowledgePoints.join("、")}</p>{s.photoUrl&&<PhotoPreviewButton src={s.photoUrl} alt={`${s.title}的来源照片`}>查看来源原图</PhotoPreviewButton>}</article>)}</details>}
 {p.paper&&<><h3>{p.paper.title}</h3><div className="economy-actions"><button ref={printButton} className="button primary" disabled={busy} aria-haspopup="dialog" onClick={()=>setPreviewOpen(true)}><Printer size={18}/>打印／另存PDF</button><button className="button secondary" disabled={busy} onClick={()=>void downloadDocument()}><Download size={18}/>下载题单</button>{parent&&<button className="text-button" disabled={busy} onClick={()=>void downloadDocument(true)}><Download size={17}/>单独保存参考答案</button>}</div><details><summary>先看看这套题 · 约{p.paper.questions.reduce((n,q)=>n+q.estimatedMinutes,0)}分钟</summary>{p.paper.questions.map((q,i)=><article className="practice-question-preview" key={q.id}><strong>{i+1}. {q.knowledgePoint}</strong><p>{q.question}</p></article>)}</details></>}
 {p.paper&&!complete&&<section className="practice-upload"><h3><Camera size={19}/>交这份练习的答卷</h3><p className="reading-muted">一次选择1–3张完整清晰的页面，题号要拍全。补拍时重新选择本次需要批改的完整答卷，旧照片保留在历史里。</p><label>选择答卷照片<input type="file" accept="image/*" multiple disabled={busy||working} onChange={async e=>{const input=e.currentTarget,files=Array.from(input.files||[]);if(!files.length)return;if(files.length>3){setError("每次最多选择3张完整答卷照片。");input.value="";return;}setBusy(true);setError("");try{setPhotos(await Promise.all(files.map(preparePracticePhoto)));}catch(e){setError(message(e));}finally{input.value="";setBusy(false);}}}/></label>{photos.length>0&&<><div className="practice-photo-grid">{photos.map((photo,i)=><figure key={i}><img src={"data:image/jpeg;base64,"+photo.image} alt={"待提交答卷第"+(i+1)+"张"}/><figcaption>{photo.name}</figcaption></figure>)}</div><button className="button primary" disabled={busy||working} onClick={()=>void run(async()=>{const result=await call(`items/${p.id}/submit`,{photos});if(result.status==="failed")throw Error("这组照片已保存，但处理尚未完成。请家长重试，或更换清晰的完整答卷。");setPhotos([]);},"答卷已对应到这份练习，批改后自动更新。")}>上传并批改这份练习</button></>}</section>}
 {!!p.photos.length&&<details><summary>这次对应的答卷 · {p.photos.length}张</summary><div className="practice-photo-grid">{p.photos.map(photo=><PhotoPreviewButton key={photo.id} className="photo-preview-thumbnail" src={"/assistant-api/learning/practice/photos/"+photo.id} alt={photo.name}><img src={"/assistant-api/learning/practice/photos/"+photo.id} alt={photo.name} loading="lazy" /><span>查看完整答卷</span></PhotoPreviewButton>)}</div></details>}
 {p.result&&<section className="practice-results"><h3>逐题结果</h3><p className="reading-muted">复测通过率只统计已确认的对错；待确认的题先核对，不直接算错。</p>{p.result.answers.map((a,i)=><article key={a.questionId} className={"practice-verdict-"+a.verdict}><header><strong>第{i+1}题</strong><span>{{correct:"正确",wrong:"需要订正",blank:"未作答",uncertain:"待确认"}[a.verdict]}</span></header><p>{p.paper?.questions.find(q=>q.id===a.questionId)?.question}</p><p>识别到的作答：{a.studentAnswer||"未填写或未识别清楚"}</p>{a.verdict!=="uncertain"&&<p>参考答案：{a.expectedAnswer}</p>}<p>{a.explanation}</p>{parent&&<button className="text-button" onClick={()=>setReview(a)}>家长核对／更正</button>}</article>)}</section>}
 {parent&&p.status==="failed"&&p.retryAllowed&&<button className="button primary" disabled={busy} onClick={()=>void run(()=>call(`items/${p.id}/retry`,{}),"已重新排队，本轮最多尝试两次。")}><RefreshCw size={18}/>重试未完成处理</button>}{p.status==="failed"&&!parent&&<p className="reading-muted">请家长看看未完成原因并决定是否重试。</p>}{parent&&p.photos.length>0&&!working&&!p.rewarded&&p.rewardEligible&&<button className="text-button" disabled={busy} onClick={()=>{const reason=prompt("请核对完整答卷，说明确认实际完成的依据（这不会把待确认答案改为正确）：");if(reason?.trim())void run(()=>call(`items/${p.id}/complete`,{reason:reason.trim().slice(0,500)}),"已按家长确认记录完成，奖励仍受每科每日一次限制。");}}>识别有疑问，家长确认实际完成</button>}
 </div>{previewOpen && p.paper && <PracticePrintPreview paper={p.paper} date={p.date} profileLabel={p.profileLabel} close={() => {
   setPreviewOpen(false);
   printButton.current?.focus({ preventScroll: true });
 }}/>}{review&&<PracticeAnswerEditor itemId={p.id} answer={review} close={()=>setReview(null)} saved={async()=>{setReview(null);await refresh("家长更正已保存，复测统计已更新；不会重复发奖励。");}}/>}</dialog>;
}
function PracticeAnswerEditor({itemId,answer,close,saved}:{itemId:string;answer:PracticeAnswer;close:()=>void;saved:()=>Promise<void>}){const ref=useRef<HTMLDialogElement>(null),[form,setForm]=useState({verdict:answer.verdict,studentAnswer:answer.studentAnswer,expectedAnswer:answer.expectedAnswer,reason:""}),[busy,setBusy]=useState(false),[error,setError]=useState("");useEffect(()=>{ref.current?.showModal();return()=>ref.current?.close();},[]);return <dialog ref={ref} className="reading-dialog" aria-labelledby="practice-review-title" onCancel={e=>{e.preventDefault();e.stopPropagation();if(!busy)close();}}><header><h2 id="practice-review-title">家长核对这道题</h2><button className="icon-button" disabled={busy} onClick={close} aria-label="关闭更正"><X/></button></header><form className="reading-dialog-body" onSubmit={async e=>{e.preventDefault();setBusy(true);setError("");try{await call(`items/${itemId}/answers/${encodeURIComponent(answer.questionId)}`,form,"PATCH");await saved();}catch(e){setError(message(e));}finally{setBusy(false);}}}><label>核对结论<select value={form.verdict} onChange={e=>setForm({...form,verdict:e.target.value as PracticeAnswer["verdict"]})}>{Object.entries({correct:"正确",wrong:"错误",blank:"未作答",uncertain:"待确认"}).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><label>实际作答<textarea value={form.studentAnswer} maxLength={2500} onChange={e=>setForm({...form,studentAnswer:e.target.value})}/></label><label>参考答案<textarea value={form.expectedAnswer} maxLength={1500} onChange={e=>setForm({...form,expectedAnswer:e.target.value})}/></label><label>更正依据<textarea value={form.reason} maxLength={500} required onChange={e=>setForm({...form,reason:e.target.value})}/></label>{error&&<p className="form-error" role="alert">{error}</p>}<button className="button primary" disabled={busy}>保存家长核对</button></form></dialog>;}
