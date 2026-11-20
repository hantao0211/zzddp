"use client";
import {useEffect,useState} from "react";
import {BookOpen,Footprints,Sprout,Heart} from "lucide-react";
import type {ReadingState,ReadingBook} from "@/domain/reading";
import {StepAmount} from "./growth-tokens";
export function ReadingCompanion({book,days,minutes}:{book?:ReadingBook;days:number;minutes:number}){return <aside className="study-companion"><section className="study-side-card"><div className="study-book-spot" aria-hidden="true">{book?<div className="study-book-cover"><Sprout/><span>{book.title}</span></div>:<BookOpen size={48}/>}</div><h2>{book?.title||"读一点喜欢的书"}</h2>{book&&<p>{book.author}{book.author&&" · "}已记录{book.uniquePages}页</p>}<p>{days?`连续阅读${days}天 · 累计${minutes}分钟` : "从今天的一小段故事开始。"}</p>{book?.totalPages&&<progress aria-label="这本书已记录的页数" value={book.uniquePages} max={book.totalPages}/>}</section></aside>;}
export function HomeCompanion({date,viewerKey}:{date:string;viewerKey:string}){
 const [state,setState]=useState<ReadingState|null>(null);
 useEffect(()=>{let active=true;const controller=new AbortController();setState(null);fetch("/assistant-api/reading/state",{credentials:"same-origin",cache:"no-store",signal:controller.signal}).then(async r=>r.ok?r.json():null).then(s=>{if(active)setState(s);}).catch(()=>{});return()=>{active=false;controller.abort();};},[viewerKey]);
 const book=state?.books.find(b=>!b.finished&&b.logCount>0)||state?.books.find(b=>!b.finished),query=`studyDate=${encodeURIComponent(date)}`;
 return <aside className="study-companion study-home-companion"><section className="study-side-card"><div className="study-book-spot" aria-hidden="true">{book?<div className="study-book-cover"><Sprout/><span>{book.title}</span></div>:<BookOpen size={48}/>}</div><h2>{book?"读到哪里了？":"读一点喜欢的书"}</h2><p>{book?`《${book.title}》 · 已记录${book.uniquePages}页`:"找一本喜欢的书，留一点时间给故事。"}</p><a href={`/reading/?${query}`} className="button secondary"><BookOpen size={18} aria-hidden="true"/>{book?"继续阅读":"去阅读"}</a></section><section className="study-side-card">{state?<StepAmount value={state.growth.balance}/>:<h2><Footprints aria-hidden="true"/>我的小脚步</h2>}<p>每一点坚持，都留下脚印。</p><a className="text-button" href={`/reading/?view=growth&${query}`}><Heart size={17} aria-hidden="true"/>看看我的心愿</a></section></aside>;
}
