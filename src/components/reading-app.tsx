"use client";
import {useEffect,useRef,useState} from "react";
import {BookOpen,Book,BookCheck,Bookmark,ChevronDown,List,LayoutGrid,Plus,Clock3,Flame,Sparkles,Mic,Square,Camera,Check,ChevronRight,Gift,Settings,ArrowLeft,Search,Save,MessageCircle,CalendarDays,LoaderCircle,PauseCircle,Play,History,NotebookPen,Footprints,Pencil,Trash2,Sprout,Heart} from "lucide-react";
import {useStudyNavigation} from "./study-navigation";
import {useStudyRefresh} from "./app-interactions";
import {AdminIdentity, AdminNavigation, useAdminSection} from "./admin-navigation";
import {GraduationCap, Store} from "lucide-react";
import {StudyShell} from "./study-shell";
import {StudyPageHeading} from "./study-page-heading";
import { BookFlip, GrowingSprout } from "./study-tab-illustrations";
import {parseBookQuery,isBookCollection} from "@/domain/book-query";
import {ReadingLogDelete,type ReadingDeleteResult} from "./reading-log-delete";
import {ReadingBookEditor} from "./reading-book-editor";
import {ReadingCheckinDialog} from "./reading-checkin-dialog";
import {AccountLogin,accountRequest,sessionChanged} from "./account-login";
import {StudyAssistant} from "./study-assistant";
import {HomeworkRewardSettings} from "./homework-reward-settings";
import {StudentProfileSummary,StudentProfileEditor} from "./student-profile";
import {FamilyRewardShop,FamilyShopManagement,RedemptionHistory} from "./family-shop";
import {GrowthRecapCard} from "./growth-recap";
import {GrowthActivities,ActivityManagement} from "./growth-activities";
import {WishPanel,WishManagement} from "./reading-wishes";
import {StepAmount} from "./growth-tokens";
import {StatusIndicator} from "./status-indicator";
import {createVoiceRecording,type VoiceRecording} from "@/services/voice-recording";
import {nextReadingPages,rewardExpired,ShelfStatusSchema,shelfStatusLabels,type ShelfStatus} from "@/domain/reading";
import type {ReadingState,ReadingBook,ReadingLog,ReadingRules,CatalogBook} from "@/domain/reading";
const HISTORY_PAGE_SIZE=10;
const call=(path:string,value?:unknown,method="POST")=>accountRequest("reading/"+path,value,method);
const errorText=(e:unknown)=>e instanceof Error?e.message:"操作未完成，请稍后重试。";
const emptyForm=()=>({id:crypto.randomUUID(),version:0,bookId:"",date:"",startPage:1,endPage:1,minutes:0,summary:"",chapter:"",reflection:"",excerpt:"",keepImage:true,separateSession:false});
const shelfIcons={unread:Book,wanted:Bookmark,reading:BookOpen,finished:BookCheck};

function bookStatus(book:ReadingBook):ShelfStatus {
 return book.shelfStatus ?? (book.finished?"finished":book.logCount?"reading":"unread");
}

function ShelfStatusPicker({status,label,disabled,onChange}:{
 status:ShelfStatus;label:string;disabled:boolean;onChange:(status:ShelfStatus)=>void
}){
 const Icon=shelfIcons[status];
 return <span className={`reading-shelf-status shelf-${status}`}>
  <Icon size={15} aria-hidden="true"/><span>{shelfStatusLabels[status]}</span><ChevronDown size={13} aria-hidden="true"/>
  <select value={status} aria-label={label} disabled={disabled} onChange={event=>onChange(ShelfStatusSchema.parse(event.target.value))}>
   {ShelfStatusSchema.options.map(value=><option key={value} value={value}>{shelfStatusLabels[value]}</option>)}
  </select>
 </span>;
}

function BookPicker({close,added}:{close:()=>void;added:(b:ReadingBook)=>void}){
 const [query,setQuery]=useState(""),[results,setResults]=useState<CatalogBook[]>([]),[note,setNote]=useState(""),[searching,setSearching]=useState(false),[searchError,setSearchError]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const [shelfStatus,setShelfStatus]=useState<ShelfStatus>("unread");
 const [book,setBook]=useState({title:"",author:"",isbn:"",publisher:"",totalPages:"",catalogId:null as string|null});
 const ref=useRef<HTMLDialogElement>(null);useEffect(()=>{ref.current?.showModal();return()=>ref.current?.close();},[]);
 const photoInput=useRef<HTMLInputElement>(null), catalog=useRef<HTMLDetailsElement>(null);
 const [scanning,setScanning]=useState(false);
 async function lookup(value:string){
  setResults([]);setSearchError("");setNote("");
  try{parseBookQuery(value);}catch(e){setSearchError(errorText(e));return;}
  setSearching(true);
  try{
   const r=await call("lookup",{query:value});setResults(r.items);
   if(r.status==="invalid_query")setSearchError(r.note);else setNote(r.note);
  }catch(e){setSearchError(errorText(e));}finally{setSearching(false);}
 }
 async function scan(file:File){
  setScanning(true);setSearchError("");setNote("");setResults([]);
  if(catalog.current)catalog.current.open=true;
  try{
   const {readBookBarcode}=await import("@/services/isbn-photo");
   const isbn=await readBookBarcode(file);
   if(!ref.current?.open)return;
   setQuery(isbn);
   setBook(current=>current.title || current.catalogId ? current : {...current,isbn});
   await lookup(isbn);
  }catch(e){setSearchError(errorText(e));}finally{setScanning(false);}
 }
 return <dialog ref={ref} className="reading-dialog" onCancel={e=>{e.preventDefault();close();}}><header><h2><BookOpen aria-hidden="true"/>添加书籍</h2><button className="button secondary" onClick={close}>关闭</button></header><div className="reading-dialog-body"><p className="reading-muted">先填书名即可开始记录，其他信息均为选填。</p><input ref={photoInput} type="file" hidden accept="image/*" aria-label="书背条码照片" onChange={e=>{
 const file=e.target.files?.[0];e.target.value="";if(file)void scan(file);
 }}/><button type="button" className="button secondary book-barcode-scan" disabled={busy||searching||scanning} onClick={()=>photoInput.current?.click()}>
 {scanning?<LoaderCircle size={18} className="spin" aria-hidden="true"/>:<Camera size={18} aria-hidden="true"/>}
 {searching?"正在查书…":scanning?"正在识别…":"拍书背查 ISBN"}
 </button><details ref={catalog} className="reading-catalog"><summary><Search size={17} aria-hidden="true"/>用书名或 ISBN 查找</summary><form className="reading-search" onSubmit={e=>{e.preventDefault();if(!searching&&!scanning)void lookup(query);}}><label>书名或ISBN<input value={query} onChange={e=>{setQuery(e.target.value);setResults([]);setNote("");setSearchError("");}} disabled={searching||scanning} aria-describedby="book-search-hint" maxLength={100} placeholder="输入书名或书背面的ISBN" required minLength={2}/></label><button className="button primary" disabled={searching||scanning}>{searching?<LoaderCircle size={18} aria-hidden="true"/>:<Search size={18} aria-hidden="true"/>}{searching?"正在查找…":"查找"}</button></form><p id="book-search-hint" className="reading-muted">输入书名，或书背面条形码旁的ISBN；其他编号可能无法查书。</p>{searchError&&<p className="form-error" role="alert">{searchError}</p>}{note&&<p role="status">{note}</p>}<div className="reading-search-results">{results.map(b=><button key={b.id} onClick={()=>{setBook({title:b.title,author:b.author,isbn:b.isbn,publisher:b.publisher,totalPages:isBookCollection(b.title)?"":b.totalPages?.toString()||"",catalogId:b.id});setResults([]);setNote(isBookCollection(b.title)?"这是套装书目。只读其中一本时，请改为单册书名，总页数填单册页数。":"已填入书籍信息，请核对版本后加入书架。");}}><BookOpen aria-hidden="true"/><span><strong>{b.title}</strong><small>{b.author} · {b.publisher}{b.isbn&&` · ${b.isbn}`}</small></span><ChevronRight aria-hidden="true"/></button>)}</div></details><form onSubmit={async e=>{e.preventDefault();setBusy(true);setError("");try{const b=await call("books",{...book,shelfStatus,totalPages:book.totalPages?Number(book.totalPages):null});added(b);}catch(e){setError(errorText(e));}finally{setBusy(false);}}}><p className="reading-muted">查到的书请核对版本，书目信息不等于AI已有全文。</p><label>书名<input value={book.title} onChange={e=>setBook({...book,title:e.target.value,catalogId:null})} maxLength={150} required/></label><div className="reading-fields"><label>作者（选填）<input value={book.author} onChange={e=>setBook({...book,author:e.target.value,catalogId:null})} maxLength={150}/></label><label>总页数（选填）<input type="number" min={1} max={20000} value={book.totalPages} onChange={e=>setBook({...book,totalPages:e.target.value})}/></label></div><div className="reading-add-status">书架状态 <ShelfStatusPicker status={shelfStatus} label="书架状态" disabled={busy} onChange={setShelfStatus}/></div><details><summary>版本信息（选填）</summary><label>ISBN<input value={book.isbn} onChange={e=>setBook({...book,isbn:e.target.value,catalogId:null})} maxLength={20}/></label><label>出版社<input value={book.publisher} onChange={e=>setBook({...book,publisher:e.target.value,catalogId:null})} maxLength={150}/></label></details>{error&&<p className="form-error" role="alert">{error}</p>}<button className="button primary" disabled={busy}><Plus size={18} aria-hidden="true"/>{busy?"正在添加…":"加入我的书架"}</button></form></div></dialog>;
}
function ReadingCheckInStatus({log}:{log:ReadingLog}){
 return log.bookStreak>=2?<span className="reading-book-streak" aria-label={`${log.date}已打卡，这本书截至当天连读${log.bookStreak}天`} title="同一本书按阅读日期计算，同一天只计一次"><Sprout size={15} aria-hidden="true"/>连读{log.bookStreak}天</span>:<StatusIndicator kind="done">已打卡</StatusIndicator>;
}
function ReadingReviewCard({log,book,refresh,edit,ask,remove}:{log:ReadingLog;book?:ReadingBook;refresh:()=>Promise<void>;edit:(l:ReadingLog)=>void;ask:(l:ReadingLog)=>void;remove:(l:ReadingLog)=>void}){
 const [error,setError]=useState("");return <article className="reading-record"><div className="reading-record-heading"><span className="reading-book-icon"><BookOpen aria-hidden="true"/></span><div><h3>{book?.title||"阅读记录"}</h3><p className="reading-record-meta"><time dateTime={log.date}>{log.date}</time><span>· {log.startPage}—{log.endPage}页</span><span>· {log.minutes}分钟</span>{log.backfilled&&<span>· 补记</span>}</p></div><ReadingCheckInStatus log={log}/></div><p className="reading-summary">{log.summary}</p>{log.reflection&&<p>我的想法：{log.reflection}</p>}
 {log.reviewStatus==="done"&&log.review?<div className="reading-feedback"><h4><Sparkles size={18} aria-hidden="true"/>小步的阅读反馈</h4><p>{log.review.summaryFeedback}</p>{log.review.strengths.map((s,i)=><p className="reading-strength" key={i}><Check size={16} aria-hidden="true"/>{s}</p>)}{log.review.nextStep&&<p>{log.review.nextStep}</p>}<div className="reading-evidence-status"><StatusIndicator kind={log.review.comparison==="consistent"?"received":"uncertain"}>{log.review.comparison==="consistent"?"已对照提供的片段":log.review.comparison==="possible_mismatch"?"有一点值得再聊聊":"内容准确性暂未核对"}</StatusIndicator></div>{log.review.followUpQuestion&&<p className="reading-small-question"><MessageCircle size={18} aria-hidden="true"/>{log.review.followUpQuestion}</p>}<details><summary>评价依据与范围</summary><p>{log.review.comparisonReason}</p>{log.review.evidenceQuote&&<blockquote>{log.review.evidenceQuote}</blockquote>}<p>{log.review.timingNote}</p>{log.excerpt&&<p>你提供的原文：{log.excerpt}</p>}{log.imageId&&<img className="reading-evidence-image" loading="lazy" src={`/assistant-api/reading/images/${log.imageId}`} alt="这次阅读补充的书页照片"/>}</details></div>:<div className="reading-muted"><StatusIndicator kind={log.reviewStatus==="failed"?"uncertain":"pending"}>{log.reviewStatus==="failed"?"评价暂未完成，打卡和小脚步已保存。":"小步正在读你的概括，打卡和小脚步已保存。"}</StatusIndicator>{log.reviewStatus==="failed"&&log.canEdit&&<button className="button primary compact" onClick={async()=>{try{await call(`logs/${log.id}/retry`,{});await refresh();}catch(e){setError(errorText(e));}}}>重试评价</button>}</div>}
 <div className="reading-record-actions"><button className="text-button" onClick={()=>ask(log)}><MessageCircle size={17} aria-hidden="true"/>和小步聊这次阅读</button>{log.canEdit&&<button className="text-button" onClick={()=>edit(log)}><NotebookPen size={17} aria-hidden="true"/>修改记录</button>}{log.canEdit&&<button className="text-button reading-delete-link" onClick={()=>remove(log)}><Trash2 size={16} aria-hidden="true"/>删除记录</button>}</div>{error&&<p role="alert" className="form-error">{error}</p>}</article>;
}
function ReadingTimer({startedAt,active}:{startedAt:number|null;active:boolean}){
 const [seconds,setSeconds]=useState(0);
 useEffect(()=>{if(startedAt===null||!active)return;const update=()=>setSeconds(Math.max(0,Math.floor((Date.now()-startedAt)/1000)));update();const timer=setInterval(update,1000);return()=>clearInterval(timer);},[startedAt,active]);
 return <span>{startedAt===null?"也可以直接填写时长":`${Math.floor(seconds/60)}分${seconds%60}秒`}</span>;
}
export function ReadingApp({active=true}:{active?:boolean}={}){
 const workspace=useStudyNavigation();
 const activeRef=useRef(active);activeRef.current=active;
 const previousActive=useRef(active),pendingReads=useRef(0);
 const [data,setData]=useState<ReadingState|null>(null),[locked,setLocked]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false),[localTab,setTab]=useState("reading"),[addBook,setAddBook]=useState(false),[editingBook,setEditingBook]=useState<ReadingBook|null>(null),[form,setForm]=useState<ReturnType<typeof emptyForm>|null>(null),[photo,setPhoto]=useState<string|undefined>(),[photoName,setPhotoName]=useState(""),[assistantLogId,setAssistantLogId]=useState<string|undefined>(),[recording,setRecording]=useState(false),[transcribing,setTranscribing]=useState(false),[timer,setTimer]=useState<{startedAt:number;bookId:string}|null>(null),[historyDate,setHistoryDate]=useState(""),[historyBook,setHistoryBook]=useState(""),[history,setHistory]=useState<{items:ReadingLog[];total:number;date:string;bookId:string;offset:number}|null>(null),[historyBusy,setHistoryBusy]=useState(false),[historyOpen,setHistoryOpen]=useState(false),[historyError,setHistoryError]=useState(""),[historyRevision,setHistoryRevision]=useState(0),[historyPage,setHistoryPage]=useState(0),[expandedHistoryId,setExpandedHistoryId]=useState<string|null>(null);
 const editingLogRef=useRef<ReadingLog|null>(null),historySequence=useRef(0),historyController=useRef<AbortController|null>(null),historyPending=useRef(false),historyRetryOffset=useRef(0);
 const recordingRef=useRef<VoiceRecording|null>(null),recordingController=useRef<AbortController|null>(null),formRef=useRef<HTMLFormElement>(null),loadedViewer=useRef<string|null>(null),loadSequence=useRef(0);
 const [shelfView,setShelfView]=useState<"list"|"grid">("list");
 const shelfPreference=data?.viewer.id ? "xiaobu-shelf-view:"+data.viewer.id : null;
 useEffect(()=>{
  try{setShelfView(shelfPreference && localStorage.getItem(shelfPreference)==="grid"?"grid":"list");}
  catch{setShelfView("list");}
 },[shelfPreference]);
 function chooseShelfView(view:"list"|"grid"){
  setShelfView(view);
  try{if(shelfPreference)localStorage.setItem(shelfPreference,view);}catch{/* The selection still applies to this session. */}
 }
 const [entryOpen,setEntryOpen]=useState(false);
 const [deletingLog,setDeletingLog]=useState<ReadingLog|null>(null);
 const [receipt,setReceipt]=useState<{log:ReadingLog;book:ReadingBook;pointsAdded:number;reused?:boolean;wasEdit:boolean}|null>(null);
 const actionLock=useRef(false),savedReceipt=useRef(false),mutationEpoch=useRef(0),receiptRef=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(receipt&&activeRef.current)receiptRef.current?.scrollIntoView({behavior:"smooth",block:"nearest"});},[receipt]);
 const parent=data?.viewer.role==="parent"||data?.viewer.role==="admin";
 const tab=workspace&&workspace.page!=="home"?workspace.page:localTab;
 useEffect(()=>{if(!active||tab!=="reading")setEntryOpen(false);},[active,tab]);
 const [savedHomeDate,setHomeDate]=useState<string|undefined>();
 const homeDate=workspace?.date||savedHomeDate;
 function changeTab(value:"reading"|"growth"|"mall"|"manage",push=true){if(workspace){workspace.navigate(value,!push);return;}if(value===tab){window.scrollTo({top:0,behavior:"instant"});return;}setTab(value);if(push){const url=new URL(location.href);if(value==="reading")url.searchParams.delete("view");else url.searchParams.set("view",value);window.history.pushState(null,"",url);}window.scrollTo({top:0,behavior:"instant"});}
 useEffect(()=>{const update=()=>{const q=new URLSearchParams(location.search),v=q.get("view"),d=q.get("studyDate");setTab(v==="growth"||v==="mall"||v==="manage"?v:"reading");setHomeDate(d&&/^\d{4}-\d{2}-\d{2}$/.test(d)?d:undefined);};update();window.addEventListener("popstate",update);return()=>window.removeEventListener("popstate",update);},[]);
 async function load(background=false,signal?:AbortSignal,reportFailure=false){if(background&&pendingReads.current)return;const sequence=++loadSequence.current;pendingReads.current++;try{const s=await accountRequest("reading/state?logLimit=1",undefined,"GET",signal) as ReadingState;if(sequence!==loadSequence.current)return;if(loadedViewer.current!==s.viewer.id){loadedViewer.current=s.viewer.id;editingLogRef.current=null;savedReceipt.current=false;setReceipt(null);setDeletingLog(null);setEditingBook(null);setAddBook(false);setEntryOpen(false);setForm(null);setPhoto(undefined);setPhotoName("");setHistoryDate("");setHistoryBook("");setHistoryPage(0);setExpandedHistoryId(null);setHistoryOpen(false);setHistory(null);setHistoryRevision(value=>value+1);setAssistantLogId(undefined);}if(s.viewer.role==="child"&&location.pathname==="/reading/"&&new URLSearchParams(location.search).get("view")==="manage"){setTab("reading");if(workspace)workspace.navigate("reading",true);const url=new URL(location.href);url.searchParams.delete("view");window.history.replaceState(null,"",url);}setData(s);setLocked(false);if(!background)setError("");const preferredBook=s.books.find(b=>bookStatus(b)==="reading")??s.books.find(b=>!b.finished)??s.books[0];setForm(old=>old||{...emptyForm(),bookId:preferredBook?.id||"",date:s.today,...nextReadingPages(preferredBook)});}catch(e){if(sequence!==loadSequence.current)return;if((e as Error).message.includes("登录")){setLocked(true);setData(null);loadedViewer.current=null;setEditingBook(null);setAddBook(false);setEntryOpen(false);setForm(null);setPhoto(undefined);setPhotoName("");}setError(signal?.aborted?"刷新未完成，请稍后重试。":errorText(e));if(signal||reportFailure)throw e;}finally{pendingReads.current--;}}
 useStudyRefresh(async signal=>{await load(false,signal);setHistoryRevision(value=>value+1);},active);
 useEffect(()=>{const v=new URLSearchParams(location.search).get("view");if(v==="growth"||v==="mall"||v==="manage")setTab(v);void load();const t=setInterval(()=>{if(activeRef.current&&!document.hidden)void load(true);},5000);return()=>{loadSequence.current++;clearInterval(t);recordingController.current?.abort();recordingRef.current?.cancel();};},[]);
 useEffect(()=>{if(!data)return;setTimer(null);try{const saved=JSON.parse(localStorage.getItem("xiaobu-reading-timer:"+data.viewer.id)||"null");if(saved&&typeof saved.startedAt==="number"&&saved.startedAt<=Date.now()&&Date.now()-saved.startedAt<12*3600000&&data.books.some(b=>b.id===saved.bookId)){setTimer(saved);setForm(f=>f?{...f,bookId:saved.bookId,...nextReadingPages(data.books.find(b=>b.id===saved.bookId))}:f);}}catch{}},[data?.viewer.id]);
 useEffect(()=>{if(active&&!previousActive.current)void load(true);previousActive.current=active;if(!active){recordingController.current?.abort();recordingRef.current?.cancel();recordingRef.current=null;setRecording(false);}},[active]);
 async function action(work:()=>Promise<void>){if(actionLock.current)return;const epoch=mutationEpoch.current;actionLock.current=true;setBusy(true);setError("");setNotice("");try{await work();if(epoch===mutationEpoch.current)void load(true);}catch(e){if(epoch===mutationEpoch.current)setError(errorText(e));}finally{if(epoch===mutationEpoch.current){actionLock.current=false;setBusy(false);}}}
 async function saveReading(){
  if(!form||!data||actionLock.current||savedReceipt.current)return;
  if(timer){setError("请先结束计时，把时长计入记录后再保存。");return;}
  const epoch=mutationEpoch.current;
  await action(async()=>{
   const r=await call("logs",{...form,...(photo?{image:photo}:{})}) as {log:ReadingLog;book:ReadingBook;pointsAdded:number;reused?:boolean};
   if(epoch!==mutationEpoch.current)return;
   editingLogRef.current=r.log;savedReceipt.current=true;setReceipt({...r,wasEdit:form.version>0});
   setData(current=>current?{...current,books:current.books.map(book=>book.id===r.book.id?r.book:book),logs:[r.log,...current.logs.filter(log=>log.id!==r.log.id)]}:current);
   setHistory(null);setHistoryRevision(value=>value+1);
  });
 }
 function startAnotherReading(){if(!data||!form||busy)return;editingLogRef.current=null;const book=receipt?.book||data.books.find(book=>book.id===form.bookId);savedReceipt.current=false;setReceipt(null);setForm({...emptyForm(),separateSession:true,date:data.today,bookId:form.bookId,...nextReadingPages(book)});setPhoto(undefined);setPhotoName("");setError("");setNotice("");formRef.current?.scrollIntoView({behavior:"smooth",block:"start"});}
 useEffect(()=>{const refresh=()=>{mutationEpoch.current++;actionLock.current=false;savedReceipt.current=false;setBusy(false);setReceipt(null);setDeletingLog(null);void load();};window.addEventListener("xiaobu:session-changed",refresh);return()=>window.removeEventListener("xiaobu:session-changed",refresh);},[]);
 useEffect(()=>{if(receipt||!form||(!form.summary.trim()&&!form.reflection.trim()&&!form.excerpt.trim()&&!form.chapter.trim()&&!photo&&!form.minutes))return;const protect=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue="";};window.addEventListener("beforeunload",protect);return()=>window.removeEventListener("beforeunload",protect);},[form,photo,receipt]);
 function stopTimer(){if(!timer||!form||!data)return;const minutes=Math.max(1,Math.ceil((Date.now()-timer.startedAt)/60000));setForm({...form,minutes:Math.min(720,form.minutes+minutes)});setTimer(null);try{localStorage.removeItem("xiaobu-reading-timer:"+data.viewer.id);}catch{};setNotice(`已把${minutes}分钟计入本次阅读，可在保存前调整。`);}
 async function endVoice(){const voice=recordingRef.current;if(!voice)return;recordingRef.current=null;setRecording(false);setTranscribing(true);try{const audio=voice.stop();const r=await fetch("/assistant-api/transcribe",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"audio/wav"},body:audio});const v=await r.json();if(!r.ok)throw Error(v.error||"没有听清，可以继续打字。");setForm(f=>f?{...f,summary:(f.summary+(f.summary?"\n":"")+v.text).slice(0,3000)}:f);}catch(e){setError(errorText(e));}finally{setTranscribing(false);}}
 async function voice(){if(recording){await endVoice();return;}setError("");recordingController.current?.abort();const controller=new AbortController();recordingController.current=controller;try{recordingRef.current=await createVoiceRecording(controller.signal,()=>void endVoice());setRecording(true);}catch(e){if(!controller.signal.aborted)setError(errorText(e));}}
 async function choosePhoto(file?:File){if(!file)return;setError("");try{if(!file.type.startsWith("image/")||file.size>20*1024*1024)throw Error("请选择不超过20MB的照片。");const bitmap=await createImageBitmap(file);const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext("2d")!.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();const url=canvas.toDataURL("image/jpeg",.78);if(url.length>2800000)throw Error("照片过大，请裁剪到本次阅读的相关书页后重试。");setPhoto(url.split(",")[1]);setPhotoName(file.name);}catch(e){setError(e instanceof DOMException?"这张照片暂时无法读取，请换成JPEG或PNG照片后重试。":errorText(e));}}
 useEffect(()=>{
  if(!historyOpen||!active||tab!=="reading"||locked||!data?.viewer.id)return;
  void filterHistory();
  return()=>{historySequence.current++;historyController.current?.abort();historyPending.current=false;};
 },[historyOpen,historyDate,historyBook,historyPage,historyRevision,active,tab,locked,data?.viewer.id]);
 useEffect(()=>{
  if(!historyOpen||!active||tab!=="reading"||locked||!data?.viewer.id||!history||history.date!==historyDate||history.bookId!==historyBook||history.offset!==historyPage*HISTORY_PAGE_SIZE)return;
  const timer=setInterval(()=>{if(!document.hidden&&!historyPending.current)void filterHistory(historyPage*HISTORY_PAGE_SIZE,true);},6000);
  return()=>clearInterval(timer);
 },[historyOpen,active,tab,locked,data?.viewer.id,history,historyDate,historyBook,historyPage]);
 function edit(log:ReadingLog){if(actionLock.current)return;if(timer){setNotice("请先结束本次阅读计时，再修改历史记录。");return;}editingLogRef.current=log;savedReceipt.current=false;setReceipt(null);setError("");if(tab!=="reading")changeTab("reading");setEntryOpen(true);setForm({id:log.id,version:log.version,bookId:log.bookId,date:log.date,startPage:log.startPage,endPage:log.endPage,minutes:log.minutes,summary:log.summary,chapter:log.chapter,reflection:log.reflection,excerpt:log.excerpt,keepImage:true,separateSession:false});setPhoto(undefined);setPhotoName(log.imageId?"已保存一张阅读依据照片":"");setNotice("正在修改这条记录，修改不会重复领取当天小脚步。");}
 function logDeleted(result:ReadingDeleteResult){
  if(editingLogRef.current?.id===result.id)editingLogRef.current=null;
  setDeletingLog(null);setData(current=>current?{...current,logs:current.logs.filter(log=>log.id!==result.id),books:current.books.map(book=>book.id===result.book.id?result.book:book)}:current);
  setHistory(null);setHistoryRevision(value=>value+1);
  if(form?.id===result.id||receipt?.log.id===result.id){setEntryOpen(false);savedReceipt.current=false;setReceipt(null);setForm({...emptyForm(),date:data?.today||result.date,bookId:result.book.id,...nextReadingPages(result.book)});setPhoto(undefined);setPhotoName("");}
  setError("");setNotice("阅读记录已删除，已获得的小脚步保留。");void load(true);
 }
 function ask(log:ReadingLog){setAssistantLogId(log.id);workspace?.setReadingLogId(log.id);window.dispatchEvent(new CustomEvent("xiaobu:ask-homework",{detail:{date:log.date,question:"我想聊聊这次阅读，请结合我的概括和阅读反馈帮助我。"}}));}
 async function filterHistory(offset=historyPage*HISTORY_PAGE_SIZE,background=false){
  const sequence=++historySequence.current,controller=new AbortController();historyController.current?.abort();historyController.current=controller;historyPending.current=true;
  if(!background){setHistoryBusy(true);setHistoryError("");setHistory(null);}
  try{
   const q=new URLSearchParams({offset:String(offset),limit:String(HISTORY_PAGE_SIZE)});if(historyDate)q.set("date",historyDate);if(historyBook)q.set("bookId",historyBook);
   const r=await accountRequest("reading/logs?"+q,undefined,"GET",controller.signal) as {items:ReadingLog[];total:number};
   if(sequence!==historySequence.current)return;
   if(offset&&offset>=r.total){setHistoryPage(Math.max(0,Math.ceil(r.total/HISTORY_PAGE_SIZE)-1));setExpandedHistoryId(null);return;}
   setHistory({total:r.total,date:historyDate,bookId:historyBook,offset,items:r.items});setHistoryError("");
  }catch(e){if(sequence===historySequence.current&&!controller.signal.aborted){historyRetryOffset.current=offset;setHistoryError(errorText(e));}}
  finally{if(sequence===historySequence.current){historyPending.current=false;setHistoryBusy(false);}}
 }
 const entryBook=data?.books.find(book=>book.id===form?.bookId);
 const defaultPages=nextReadingPages(entryBook);
 const draftStarted=!!form&&(!!(form.summary||form.chapter||form.reflection||form.excerpt||form.minutes||photo)||
  form.startPage!==defaultPages.startPage||form.endPage!==defaultPages.endPage||form.date!==data?.today);
 const entryAction=timer?"返回阅读计时":receipt?"再记一次阅读":form?.version?"继续修改":draftStarted?"继续填写":"阅读打卡";
 function leaveEntry(){
  recordingController.current?.abort();
  if(recordingRef.current)void endVoice();
  setEntryOpen(false);
 }
 const visibleHistory=history?.date===historyDate&&history?.bookId===historyBook&&history.offset===historyPage*HISTORY_PAGE_SIZE?history:null;
 const logout=async()=>{try{await accountRequest("session",undefined,"DELETE");sessionChanged();setData(null);setForm(null);setPhoto(undefined);setPhotoName("");setTimer(null);setLocked(true);}catch(e){setError(errorText(e));}};
 if(tab==="manage" && parent && data){
   return <div className="admin-app"><AdminIdentity name={data.viewer.name} role={data.viewer.role==="admin"?"家庭管理员":"家长"} home={homeDate?`/?studyDate=${homeDate}`:"/"} logout={logout}/>
     <main><ReadingManagement key={data.viewer.id} data={data} busy={busy} action={action} notice={setNotice}
       refresh={async message=>{await load(false,undefined,true);setNotice(message);}} clearFeedback={()=>{setNotice("");setError("");}}/>
       {notice&&<p className="admin-message" role="status">{notice}</p>}{error&&<p className="form-error" role="alert">{error}</p>}
     </main></div>;
 }
 return <StudyShell viewer={data?.viewer} className="reading-app" page={tab==="mall"?"mall":tab==="growth"?"growth":tab==="manage"?"manage":"reading"} name={data?.viewer.name} roleLabel={data?.viewer.role==="admin"?"家庭管理员":parent?"家长":"孩子"} parent={!!parent} date={homeDate} pendingWishes={data?.wishes.filter(w=>w.status==="pending").length||0} onNavigate={changeTab} onLogout={data?logout:undefined}><main className="reading-main">

 {!entryOpen&&notice&&<p className="reading-notice" role="status">{notice.includes("小脚步")?<Footprints size={20} aria-hidden="true"/>:<CircleSuccess/>}{notice}</p>}{!entryOpen&&error&&<p className="form-error" role="alert">{error}</p>}
 {locked?<section className="card reading-auth"><h1>登录阅读空间</h1><p>与作业和小助手共用家庭账号。</p><AccountLogin legacy onSignedIn={()=>void load()}/></section>:!data||!form?<p role="status"><LoaderCircle className="spin"/>正在打开阅读空间…</p>:<>
 {tab==="reading"&&<><StudyPageHeading className="reading-heading" title="我的阅读手帐" subtitle={<><BookOpen size={16} aria-hidden="true"/><span>{data.stats.minutes ? `累计阅读 ${data.stats.minutes} 分钟` : "读一读，说一说"}</span></>} aside={<span className="reading-streak study-heading-badge"><Flame aria-hidden="true"/><span className="study-streak-value">连续<strong>{data.stats.currentStreak}</strong>天</span></span>}/>
 <div className="study-reading-main reading-journal-home">
 <section className="card">
  <div className="reading-section-heading"><h2><BookFlip />{entryBook&&bookStatus(entryBook)==="reading"?"正在读":"我的读物"}</h2>
   {data.books.length>0&&<button className="text-button" disabled={busy} onClick={()=>setAddBook(true)}><Plus size={18} aria-hidden="true"/>添加书籍</button>}
  </div>
  {entryBook?<div className="reading-current-book">
   <span className="reading-pocket-cover" aria-hidden="true"><Bookmark size={18}/><BookOpen size={28}/></span>
   <div className="reading-current-copy"><h3>{entryBook.title}</h3>{entryBook.author&&<p>{entryBook.author}</p>}
    <small>{entryBook.lastReadPage ? `上次读到第 ${entryBook.lastReadPage} 页` : shelfStatusLabels[bookStatus(entryBook)]}{entryBook.totalPages ? ` · 共 ${entryBook.totalPages} 页` : ""}</small>
   </div>
   <button className="button primary reading-entry-trigger" disabled={busy||transcribing} onClick={()=>{setNotice("");if(receipt)startAnotherReading();setEntryOpen(true);}}>
    <NotebookPen size={17} aria-hidden="true"/>{entryAction}
   </button>
  </div>:<div className="reading-empty"><BookOpen size={36} aria-hidden="true"/><h3>先选一本喜欢的书</h3><button className="button primary" disabled={busy} onClick={()=>setAddBook(true)}><Plus size={18} aria-hidden="true"/>添加第一本书</button></div>}
 </section>
 {active&&entryOpen&&entryBook&&<ReadingCheckinDialog title={form.version?"修改阅读记录":"阅读打卡"} onBack={leaveEntry}>
 {notice&&<p className="reading-notice" role="status">{notice}</p>}
 <form key={form.id} ref={formRef} aria-busy={busy} onSubmit={e=>{e.preventDefault();void saveReading();}}>
 <fieldset className="reading-entry-fields" disabled={busy||!!receipt}>
 {!form.version&&data.calendar.some(d=>d.date===form.date)&&<p className="reading-already"><StatusIndicator kind="done">{form.date===data.today?"今天已打卡":"这一天已打卡"}</StatusIndicator><small>想再读一会儿，可以继续记录。</small></p>}
 <div className="reading-book-date"><label>正在读的书<select aria-label="正在读的书" disabled={!!timer||form.version>0} value={form.bookId} onChange={e=>{const selected=data.books.find(b=>b.id===e.target.value);setForm({...form,bookId:e.target.value,...nextReadingPages(selected)});}} required>{data.books.map(b=><option key={b.id} value={b.id}>{b.title}{b.author?` · ${b.author}`:""}{b.finished?"（已读完）":""}</option>)}</select></label><label>阅读日期<input type="date" value={form.date} max={data.today} disabled={form.version>0} onChange={e=>setForm({...form,date:e.target.value})} required/></label></div>
 <div className="reading-fields reading-pages"><label>开始页<input type="number" min={1} max={20000} value={form.startPage||""} onChange={e=>setForm({...form,startPage:Number(e.target.value)})} required/></label><label>结束页<input type="number" min={form.startPage||1} max={20000} value={form.endPage||""} onChange={e=>setForm({...form,endPage:Number(e.target.value)})} required/></label><label>时长（分钟）<input type="number" min={1} max={720} value={form.minutes||""} onChange={e=>setForm({...form,minutes:Number(e.target.value)})} required/></label></div>
 {!form.version&&!!data.books.find(b=>b.id===form.bookId)?.lastReadPage&&<p className="reading-muted reading-continuation">上次读到第{data.books.find(b=>b.id===form.bookId)?.lastReadPage}页，页码可按本次阅读调整。</p>}
 <div className="reading-timer"><button type="button" className="button secondary" onClick={()=>{if(timer){stopTimer();return;}const t={startedAt:Date.now(),bookId:form.bookId};setTimer(t);try{localStorage.setItem("xiaobu-reading-timer:"+data.viewer.id,JSON.stringify(t));}catch{setNotice("当前浏览器无法保存计时状态，离开页面前请先结束计时。");}}}>{timer?<Square size={16} aria-hidden="true"/>:<Play size={16} aria-hidden="true"/>}{timer?"结束计时并计入":"开始阅读计时"}</button><ReadingTimer startedAt={timer?.startedAt??null} active={active&&tab==="reading"}/></div>
 <div className="reading-summary-label"><label htmlFor="reading-summary">今天读到了什么？</label><button className="text-button" type="button" aria-label={transcribing?"正在转成文字…":recording?"结束录音":"说一说（最多30秒）"} title="每次最多30秒" disabled={transcribing||busy} onClick={()=>void voice()}>{recording?<Square size={17} aria-hidden="true"/>:<Mic size={17} aria-hidden="true"/>}{transcribing?"正在转成文字…":recording?"结束录音":"说一说"}</button></div><textarea id="reading-summary" rows={3} maxLength={3000} minLength={2} placeholder="讲讲主要发生了什么，或你学到的一件事。简单几句就好。" value={form.summary} onChange={e=>setForm({...form,summary:e.target.value})} required/>
 <details className="reading-extras"><summary>添加章节、感想或阅读依据（选填）</summary><label>章节或篇目<input value={form.chapter} maxLength={200} onChange={e=>setForm({...form,chapter:e.target.value})}/></label><label>我的感想或问题<textarea rows={2} value={form.reflection} maxLength={2000} onChange={e=>setForm({...form,reflection:e.target.value})}/></label><p className="reading-muted">想让小步对照内容，可以补充相关原文或一张书页照片。只评价提供的片段，不用每天拍书。</p><label>相关原文<textarea rows={3} maxLength={12000} value={form.excerpt} onChange={e=>setForm({...form,excerpt:e.target.value})}/></label><label className="reading-photo-picker"><Camera size={18} aria-hidden="true"/>补充一张书页照片<input type="file" accept="image/*" onChange={e=>{void choosePhoto(e.target.files?.[0]);e.target.value="";}}/></label>{photoName&&<p>{photoName}<button type="button" className="text-button" onClick={()=>{setPhoto(undefined);setPhotoName("");setForm({...form,keepImage:false});}}>移除照片</button></p>}</details>
 </fieldset>
 {error&&!receipt&&<p className="form-error reading-save-error" role="alert">{error}</p>}
 <div className="reading-save"><button className="button primary" disabled={busy||!!receipt||recording||transcribing}>{busy?<LoaderCircle className="spin" size={19} aria-hidden="true"/>:<Check size={19} aria-hidden="true"/>}{busy?"正在保存，请稍候…":receipt?"已保存":form.version?"保存修改":"完成阅读打卡"}</button>{form.version>0&&!receipt&&<button type="button" className="button secondary" disabled={busy} onClick={startAnotherReading}>取消修改</button>}{form.version>0&&!receipt&&<button type="button" className="text-button reading-delete-link" disabled={busy} onClick={()=>{const saved=data.logs.find(log=>log.id===form.id)||history?.items.find(log=>log.id===form.id)||(editingLogRef.current?.id===form.id?editingLogRef.current:null);if(saved)setDeletingLog(saved);}}><Trash2 size={16} aria-hidden="true"/>删除这条记录</button>}</div>
 {receipt?<div ref={receiptRef} className="reading-save-receipt" role="status"><strong><Check size={20} aria-hidden="true"/>{receipt.reused?"这次阅读已保存，没有重复记入":receipt.wasEdit?"阅读修改已保存":"阅读打卡成功，已保存"}</strong><p>{receipt.book.title}<br/>{receipt.log.date} · {receipt.log.startPage}—{receipt.log.endPage}页 · {receipt.log.minutes}分钟</p><p>{receipt.pointsAdded>0?`获得${receipt.pointsAdded}个小脚步。`:"当天打卡小脚步只领取一次。"}AI评价在后台进行，可以放心离开。</p><div className="reading-record-actions"><button type="button" className="button primary" onClick={startAnotherReading}>再记一次阅读</button><button type="button" className="text-button" onClick={()=>edit(receipt.log)}><Pencil size={17} aria-hidden="true"/>修改这次记录</button></div></div>:<small className="reading-muted">保存后完成打卡，AI评价在后台进行。同一天读多本书只领一次基础小脚步。</small>}
 </form></ReadingCheckinDialog>}
 <details className="card reading-library">
  <summary><BookOpen size={20} aria-hidden="true"/>我的书架 · {data.books.length}本</summary>
  {!!data.books.length&&<div className="shelf-view-switch" role="group" aria-label="书架显示方式">
   <button type="button" aria-label="列表视图" title="列表视图" aria-pressed={shelfView==="list"} onClick={()=>chooseShelfView("list")}><List size={18} aria-hidden="true"/></button>
   <button type="button" aria-label="方块视图" title="方块视图" aria-pressed={shelfView==="grid"} onClick={()=>chooseShelfView("grid")}><LayoutGrid size={17} aria-hidden="true"/></button>
  </div>}
  <div className="reading-books" data-view={shelfView}>{data.books.map(b=>
   <article key={b.id}>
    <span className="shelf-book-icon" aria-hidden="true"><BookOpen size={16}/></span>
    <div className="shelf-book-copy">
     <h3 aria-label={b.title}><button className="shelf-book-open" type="button" aria-label={`修改${b.title}的书籍信息`} onClick={()=>setEditingBook(b)}>
      <span>{b.title}</span><Pencil size={13} aria-hidden="true"/>
     </button></h3>
     <p>{b.logCount || b.uniquePages || b.minutes
      ? `已记录${b.uniquePages}${b.totalPages ? " / "+b.totalPages : ""}页 · ${b.minutes}分钟`
      : `${b.totalPages ? "全"+b.totalPages+"页 · " : ""}暂无打卡`}</p>
    </div>
    <ShelfStatusPicker status={bookStatus(b)} label={`《${b.title}》的阅读状态`} disabled={busy} onChange={status=>void action(async()=>{
     const updated:ReadingBook=await call(`books/${b.id}/status`,{status});
     setData(current=>current?.viewer.id===data.viewer.id?{...current,books:current.books.map(book=>book.id===updated.id?updated:book)}:current);
    })}/>
   </article>)}</div>
  {!data.books.length&&<p className="reading-muted">书架还是空的。</p>}
 </details>
 <section className="card"><h2><History size={21} aria-hidden="true"/>最近一次阅读</h2>{data.reviewBudget.used>=data.reviewBudget.limit&&<p className="reading-muted">今天AI评价额度已用完，排队记录会在后续继续评价；打卡和小脚步不受影响。</p>}{data.logs.slice(0,1).map(log=><ReadingReviewCard key={log.id} log={log} book={data.books.find(b=>b.id===log.bookId)} refresh={load} edit={edit} ask={ask} remove={setDeletingLog}/>)}{!data.logs.length&&<p className="reading-muted">第一次打卡后，这里会留下阅读脚印。</p>}<details className="reading-history" open={historyOpen} onToggle={e=>setHistoryOpen(e.currentTarget.open)}><summary>查看阅读历史</summary><div className="reading-history-filters"><label>按日期<select value={historyDate?"specific":"all"} onChange={e=>{setHistoryDate(e.target.value==="specific"?data.today:"");setHistoryPage(0);setExpandedHistoryId(null);}}><option value="all">全部日期</option><option value="specific">指定日期</option></select></label><label>按书籍<select value={historyBook} onChange={e=>{setHistoryBook(e.target.value);setHistoryPage(0);setExpandedHistoryId(null);}}><option value="">全部书籍</option>{data.books.map(b=><option key={b.id} value={b.id}>{b.title}</option>)}</select></label>{historyDate&&<label className="reading-history-specific-date">阅读日期<input type="date" value={historyDate} max={data.today} onChange={e=>{setHistoryDate(e.target.value);setHistoryPage(0);setExpandedHistoryId(null);}}/></label>}</div><div aria-busy={historyBusy}>{historyBusy&&<p className="reading-muted" role="status">正在加载阅读记录…</p>}{historyError&&<p className="form-error" role="alert">{historyError} <button className="button primary compact" disabled={historyBusy} onClick={()=>void filterHistory(historyRetryOffset.current)}>重试加载</button></p>}{visibleHistory&&<p className="reading-muted" role="status">{visibleHistory.total?`共${visibleHistory.total}条阅读记录 · 第${historyPage+1}/${Math.ceil(visibleHistory.total/HISTORY_PAGE_SIZE)}页`:"没有符合条件的阅读记录。"}</p>}{historyOpen&&(visibleHistory?.items||[]).map(log=><details className="reading-history-entry" key={log.id} open={expandedHistoryId===log.id} onToggle={e=>{const open=e.currentTarget.open;setExpandedHistoryId(current=>open?log.id:current===log.id?null:current);}}><summary><span className="reading-history-label"><strong>{data.books.find(b=>b.id===log.bookId)?.title||"阅读记录"}</strong><small>{log.date} · {log.startPage}—{log.endPage}页 · {log.minutes}分钟</small></span><span className="reading-history-meta"><ReadingCheckInStatus log={log}/><ChevronRight size={18} aria-hidden="true"/></span></summary>{expandedHistoryId===log.id&&<ReadingReviewCard log={log} book={data.books.find(b=>b.id===log.bookId)} refresh={load} edit={edit} ask={ask} remove={setDeletingLog}/>}</details>)}{visibleHistory&&visibleHistory.total>HISTORY_PAGE_SIZE&&<nav className="reading-history-pages" aria-label="阅读历史翻页"><button className="button secondary" disabled={historyBusy||historyPage===0} onClick={()=>{setHistoryPage(page=>page-1);setExpandedHistoryId(null);}}>上一页</button><span className="reading-muted">每页{HISTORY_PAGE_SIZE}条</span><button className="button secondary" disabled={historyBusy||(historyPage+1)*HISTORY_PAGE_SIZE>=visibleHistory.total} onClick={()=>{setHistoryPage(page=>page+1);setExpandedHistoryId(null);}}>下一页</button></nav>}</div></details></section></div></>}
 {tab==="growth"&&<><StudyPageHeading className="reading-heading growth-heading" title="我的小脚步" subtitle={data.studentProfile?<StudentProfileSummary profile={data.studentProfile}/>:<><Sprout size={16} aria-hidden="true"/><span>记录每一点成长</span></>} aside={<span className="reading-points study-heading-badge"><StepAmount value={data.growth.balance}/></span>}/>{active&&<GrowthRecapCard key={data.viewer.id} today={data.today}/>}<GrowthActivities data={data} refresh={async message=>{await load();setNotice(message);}}/><section className="card reading-homework-reward"><h2>{data.activities ? <Footprints aria-hidden="true"/> : <GrowingSprout />}每天作业，走一小步</h2>{(data.homeworkRewardRules?.dailyPoints??1)>0?<><p>当天作业全部做完，自动攒 <StepAmount value={data.homeworkRewardRules?.dailyPoints??1} signed/>。</p><p className="reading-muted">每天只奖励一次，不要求全部答对。可和阅读奖励一起攒，用来兑换心愿。</p></>:<p className="reading-muted">家长暂时关闭了作业完成奖励，已攒的小脚步会保留。</p>}</section><details className="card reading-growth-details"><summary><Flame size={19} aria-hidden="true"/>阅读成长与连续奖励</summary><div className="reading-stats">{[[Flame,"连续阅读",data.stats.currentStreak,"天"],[BookOpen,"累计阅读",data.stats.days,"天"],[Clock3,"累计时长",data.stats.minutes,"分钟"],[Check,"读完书籍",data.stats.booksFinished,"本"]].map(([Icon,label,value,unit])=>{const I=Icon as typeof Flame;return <div className="card" key={String(label)}><I aria-hidden="true"/><span>{String(label)}</span><strong>{String(value)}<small>{String(unit)}</small></strong></div>;})}</div><section className="card"><h2><Flame aria-hidden="true"/>连续阅读的小目标</h2><p>每日打卡攒 <StepAmount value={data.rules.dailyPoints}/>。断签不扣已有小脚步，累计成果会保留。</p><div className="reading-milestones">{data.rules.milestones.map(m=><span key={m.days} className={data.stats.currentStreak>=m.days?"reached":""}>{data.stats.currentStreak>=m.days?<Check aria-hidden="true"/>:<Flame aria-hidden="true"/>}<strong>{m.days}天</strong><StepAmount value={m.points} signed/></span>)}</div><p className="reading-muted">最长连续{data.stats.bestStreak}天 · 累计读{data.stats.pages}页（含重读）。{data.rules.backfillCounts?"补记可计入连续奖励。":"补记保留记录，不补领打卡或连续奖励。"}</p><details><summary>最近的阅读日历</summary><div className="reading-calendar">{data.calendar.map(d=><span key={d.date}><CalendarDays size={15} aria-hidden="true"/>{d.date} · {d.minutes}分钟{d.backfilled?"（补记）":""}</span>)}</div></details></section></details><details className="card"><summary>小脚步明细 · 累计攒了{data.growth.earned}个小脚步</summary>{data.growth.ledger.map(l=><div className="reading-ledger" key={l.id}><span>{l.date} · {l.label}</span><strong><StepAmount value={l.points} signed/></strong></div>)}</details></>}
 {tab==="mall"&&<><StudyPageHeading className="reading-heading" title="我的心愿商城" subtitle={<><Heart size={16} aria-hidden="true"/><span>攒小步，换心愿</span></>} aside={<span className="reading-points study-heading-badge"><StepAmount value={data.growth.balance}/></span>}/><FamilyRewardShop data={data} refresh={async message=>{await load();setNotice(message);}}/><WishPanel data={data} refresh={async message=>{await load();setNotice(message);}}/><RedemptionHistory data={data} refresh={async message=>{await load();setNotice(message);}}/></>}
 {tab==="manage"&&<section className="card"><h1>这里需要家长账号</h1><a href="/admin/">打开家长登录</a></section>}
 </>}{deletingLog&&<ReadingLogDelete log={deletingLog} book={data?.books.find(book=>book.id===deletingLog.bookId)} close={()=>setDeletingLog(null)} deleted={logDeleted}/>}{editingBook&&<ReadingBookEditor book={editingBook} close={()=>setEditingBook(null)} saved={book=>{setEditingBook(null);setData(current=>current?{...current,books:current.books.map(item=>item.id===book.id?book:item)}:current);setNotice("书籍信息已更新，阅读记录和小脚步都保留了。");void load();}}/>}{addBook&&<BookPicker close={()=>setAddBook(false)} added={b=>{setAddBook(false);if(form?.bookId&&(timer||(!receipt&&(draftStarted||form.version))||bookStatus(b)==="wanted"||bookStatus(b)==="finished")){setNotice(`已在书架标为「${shelfStatusLabels[bookStatus(b)]}」。`);void load();return;}const wasSaved=savedReceipt.current;savedReceipt.current=false;setReceipt(null);setForm(f=>f?{...(wasSaved?{...emptyForm(),date:data?.today||f.date}:f),id:crypto.randomUUID(),version:0,bookId:b.id,...nextReadingPages(b)}:f);setNotice(`已加入书架 · ${shelfStatusLabels[bookStatus(b)]}`);void load();}}/>}</main>{!workspace&&<StudyAssistant navigationManaged readingMode readingLogId={assistantLogId}/>}</StudyShell>;
}
function CircleSuccess(){return <Check size={19} aria-hidden="true"/>;}
const rewardSections = [
 {id:"rules",label:"奖励规则",icon:Footprints}, {id:"activities",label:"成长活动",icon:Sprout},
 {id:"profile",label:"学习档案",icon:GraduationCap}, {id:"wishes",label:"审批心愿",icon:Heart},
 {id:"shop",label:"商品兑换",icon:Store},
];
function ReadingManagement({data,busy,action,notice,refresh,clearFeedback}:{data:ReadingState;busy:boolean;action:(work:()=>Promise<void>)=>Promise<void>;notice:(s:string)=>void;refresh:(message:string)=>Promise<void>;clearFeedback:()=>void}){
 const [section,select] = useAdminSection(data.viewer.id,"rewards",rewardSections);
 const [refreshing,setRefreshing] = useState(false);
 async function reload(){
   clearFeedback();
   setRefreshing(true);
   try { await refresh("已刷新阅读与奖励"); } catch { /* load reports the error in the page. */ } finally { setRefreshing(false); }
 }
 return <>
   <AdminNavigation rewards sections={rewardSections} current={section} select={id=>{select(id);clearFeedback();}} busy={busy||refreshing} refresh={()=>void reload()}/>
   <div className="admin-rewards-content">
     {section==="rules"&&<RewardRules data={data} busy={busy} action={action} notice={notice}/>}
     {section==="activities"&&<ActivityManagement data={data} refresh={refresh}/>}
     {section==="profile"&&<StudentProfileEditor profile={data.studentProfile} refresh={refresh}/>}
     {section==="wishes"&&<WishManagement data={data} refresh={refresh}/>}
     {section==="shop"&&<FamilyShopManagement data={data} refresh={refresh}/>}
   </div>
 </>;
}
function RewardRules({data,busy,action,notice}:{data:ReadingState;busy:boolean;action:(work:()=>Promise<void>)=>Promise<void>;notice:(s:string)=>void}){
 const [rules,setRules]=useState<ReadingRules>(data.rules);
 return <><HomeworkRewardSettings rules={data.homeworkRewardRules||{dailyPoints:1}} busy={busy} save={rules=>void action(async()=>{await call("homework-rules",rules,"PATCH");notice("作业完成奖励已保存。");})}/><section className="card"><h2><Footprints aria-hidden="true"/>阅读奖励规则</h2><p className="reading-muted">规则用于之后提交的记录，已获得的小脚步保留。AI评价不参与小脚步计算。</p><form onSubmit={e=>{e.preventDefault();void action(async()=>{await call("rules",rules,"PATCH");notice("阅读奖励规则已保存。");});}}><label>每日打卡奖励（个小脚步）<input type="number" min={0} max={100} value={rules.dailyPoints} onChange={e=>setRules({...rules,dailyPoints:Number(e.target.value)})} required/></label><label className="reading-checkbox"><input type="checkbox" checked={rules.backfillCounts} onChange={e=>setRules({...rules,backfillCounts:e.target.checked})}/>允许之后补记的日期计入打卡及连续奖励</label><div className="reading-rule-list">{rules.milestones.map((m,i)=><div key={i}><label>连续天数<input type="number" min={2} max={365} value={m.days} onChange={e=>setRules({...rules,milestones:rules.milestones.map((v,j)=>j===i?{...v,days:Number(e.target.value)}:v)})} required/></label><label>额外奖励（个小脚步）<input type="number" min={1} max={1000} value={m.points} onChange={e=>setRules({...rules,milestones:rules.milestones.map((v,j)=>j===i?{...v,points:Number(e.target.value)}:v)})} required/></label><button type="button" className="text-button" onClick={()=>setRules({...rules,milestones:rules.milestones.filter((_,j)=>j!==i)})}>移除</button></div>)}</div><div className="reading-record-actions"><button type="button" className="button secondary" disabled={rules.milestones.length>=8} onClick={()=>setRules({...rules,milestones:[...rules.milestones,{days:60,points:60}]})}><Plus size={17} aria-hidden="true"/>增加连续奖励</button><button className="button primary" disabled={busy}><Save size={17} aria-hidden="true"/>保存规则</button></div></form></section></>;
}
