"use client";
import {useEffect,useRef,useState} from "react";
import {ChevronLeft,ChevronRight,Download,HelpCircle,X} from "lucide-react";
export type TutorialTopic="home"|"reading"|"growth"|"assistant";
export const tutorials:Record<TutorialTopic,{name:string;pages:{title:string;text:string}[]}>= {
 home:{name:"作业",pages:[{title:"认识今天的任务",text:"拍备忘录，核对清单，识别有误可修改。复习、背诵等非书面作业，做完后可手动确认。"},{title:"上传与检查",text:"从对应作业上传，查看状态，再打开详情。遇到疑问，先看对应照片和具体原因，再决定是否补充。"}]},
 reading:{name:"阅读",pages:[{title:"开始阅读",text:"添加书籍，接着上次结束页的下一页开始。可以计时，也能直接填写页码和时长。"},{title:"留下自己的想法",text:"用自己的话说一说，保存阅读打卡，再和小步聊聊。可以打字或语音，章节、感想和照片选填。"}]},
 growth:{name:"成长",pages:[{title:"每一步都算数",text:"记录实际完成的活动，等家长确认后小脚步到账。家务每天合计一次，羽毛球课和英语线上课每周各一次。"},{title:"把心愿变成约定",text:"许愿，家长上架，再攒小脚步兑换。先看价格、次数和期限；商品上架期与兑换后使用期分别计算，已兑换的奖励保留原约定。"}]},
 assistant:{name:"小步",pages:[{title:"有问题就来问",text:"可以打字、语音或选图，一起找思路。对话附图最多三张。"},{title:"看清依据再确认",text:"结合对应作业提问，看清解释，需要时确认修改。聊天附图用于问答；作业归档请用“交作业”。"}]}
};
export function TutorialButton({topic}:{topic:TutorialTopic}){const [open,setOpen]=useState(false);return <><button type="button" className="icon-button study-help" aria-label={`${tutorials[topic].name}使用教程`} title="使用教程" onClick={()=>setOpen(true)}><HelpCircle size={21}/></button>{open&&<StudyTutorial topic={topic} close={()=>setOpen(false)}/>}</>;}
export function StudyTutorial({topic,close}:{topic:TutorialTopic;close:()=>void}){
 const ref=useRef<HTMLDialogElement>(null),body=useRef<HTMLDivElement>(null),touch=useRef<{x:number;y:number}|null>(null),[page,setPage]=useState(0),[failed,setFailed]=useState(false),[loaded,setLoaded]=useState(false),[retry,setRetry]=useState(0);
 const guide=tutorials[topic],current=guide.pages[page],url=`/tutorials/${topic}-${page+1}.png`;
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null;ref.current?.showModal();return()=>{ref.current?.close();previous?.focus({preventScroll:true});};},[]);
 function flip(next:number){const value=Math.max(0,Math.min(guide.pages.length-1,next));if(value===page)return;setPage(value);setFailed(false);setLoaded(false);body.current?.scrollTo({top:0});}
 return <dialog ref={ref} className="study-tutorial" aria-labelledby={`tutorial-title-${topic}`} onCancel={e=>{e.preventDefault();e.stopPropagation();close();}} onKeyDown={e=>{if(e.key==="ArrowRight"||e.key==="ArrowLeft"){e.preventDefault();flip(page+(e.key==="ArrowRight"?1:-1));}}}>
 <header><h2 id={`tutorial-title-${topic}`}>{guide.name}小教程</h2><button className="icon-button" aria-label="关闭教程" onClick={close}><X/></button></header>
 <div ref={body} className="study-tutorial-body" onTouchStart={e=>{touch.current=e.touches.length===1?{x:e.touches[0].clientX,y:e.touches[0].clientY}:null;}} onTouchEnd={e=>{const start=touch.current;touch.current=null;if(!start||!e.changedTouches.length)return;const dx=e.changedTouches[0].clientX-start.x,dy=e.changedTouches[0].clientY-start.y;if(Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy)*1.5)flip(page+(dx<0?1:-1));}}>
 <figure><div className="tutorial-art">{!loaded&&!failed&&<p role="status">正在打开这一页…</p>}<img key={url+retry} src={url.replace(".png",".webp")+(retry?`?retry=${retry}`:"")} alt={`${current.title}：${current.text}`} decoding="async" onLoad={()=>setLoaded(true)} onError={()=>setFailed(true)} hidden={failed}/>{failed&&<p role="alert">图片暂未打开，下面也可以阅读步骤。<button className="text-button" onClick={()=>{setFailed(false);setRetry(v=>v+1);}}>重新加载图片</button></p>}</div><figcaption><strong>{current.title}</strong><p>{current.text}</p><a href={url} download><Download size={16}/>保存这一页图片</a></figcaption></figure>
 </div><footer><button className="button secondary" disabled={page===0} onClick={()=>flip(page-1)}><ChevronLeft size={18}/>上一页</button><span role="status" aria-live="polite">{page+1} / {guide.pages.length}</span><button className="button primary" disabled={page===guide.pages.length-1} onClick={()=>flip(page+1)}>下一页<ChevronRight size={18}/></button></footer><p className="tutorial-swipe-hint">左右滑动也能翻页</p>
 </dialog>;
}
