"use client";

import { useEffect, useState } from "react";
import { BookOpen, CalendarRange, CalendarDays, GraduationCap, ChevronLeft, ChevronRight, Footprints, NotebookPen, Sprout, Flag, Mail, Sparkles } from "lucide-react";
import { recapPeriods, recapRange, type GrowthRecap, type RecapPeriod } from "@/domain/growth-recap";
import { homeworkRequest } from "@/services/homework-gateway";
import { XiaobuMascot } from "./xiaobu-mascot";
import { ReadingCheckinDialog } from "./reading-checkin-dialog";

const periodIcons = { week: CalendarRange, month: CalendarDays, term: GraduationCap };

function PeriodLabel({period}:{period:RecapPeriod}) {
  const Icon = periodIcons[period];
  return <span className="recap-choice-face">
    <Icon size={15} aria-hidden="true"/>{recapPeriods[period]}小结
  </span>;
}

function RecapStory({ report, period, current }: { report: GrowthRecap; period: RecapPeriod; current: boolean }) {
  const { subjects, reading, steps } = report;
  const judged = subjects.reduce((sum, row) => sum + row.judged, 0);
  const title = reading.finished ? "你读到了最后一页！" : reading.days ? "你把时间留给了书" :
    judged ? "一道一道，走了这么远" : steps ? "你的努力留下了脚印" : "故事从一小步开始";
  const note = reading.finished ? `这段时间，你读完了 ${reading.finished} 本书。哪一本的结尾让你最舍不得？` :
    reading.days ? `有 ${reading.days} 天，你翻开了喜欢的书。还记得最想讲给别人听的那一页吗？` :
    judged ? `这段时间，你留下了 ${judged} 道已批改的作答。哪一道让你有过“原来如此”的瞬间？` :
    steps ? `你攒下了 ${steps} 个小脚步。回想一下，哪一次最让你开心？` :
    current ? "下次读完几页，来记下你最喜欢的一句吧。" : "这段时间还没有留下答题、阅读或小脚步记录。";
  const readingGoal = reading.minutes > 0 || judged === 0;
  const amount = readingGoal ? reading.minutes : judged;
  const interval = readingGoal ? 30 : 10;
  const firstTarget = readingGoal ? 10 : 1;
  const target = amount < firstTarget ? firstTarget : (Math.floor(amount / interval) + 1) * interval;
  return <>
    <section className="recap-letter">
      <div className="recap-letter-copy">
        <span className="recap-byline"><Mail size={14} aria-hidden="true"/>小步来信 · {recapPeriods[period]}小结</span>
        <h3>{title}</h3><p>{note}</p>
      </div>
      <div className="recap-postage" aria-hidden="true"><Sparkles size={16}/><XiaobuMascot/></div>
    </section>
    <div className="recap-keepsakes">
      <section className="recap-bookmark"><h3><BookOpen size={16}/>阅读时光</h3>
        <p><b>{reading.minutes}</b> 分钟</p><small>读过 {reading.books} 本 · 打卡 {reading.days} 天</small>
        {reading.finished > 0 && <small>读完 {reading.finished} 本</small>}
      </section>
      <section className="recap-footprint"><h3><Footprints size={16}/>攒下的小脚步</h3>
        <p><b>{steps}</b> 个</p><small>本{recapPeriods[period]}获得</small>
      </section>
    </div>
    {current && <section className="recap-goal">
      <h3><Flag size={16}/>下一个小目标</h3>
      <p>{readingGoal ? <>再读 <strong>{target - amount} 分钟</strong>，就到 {target} 分钟啦。</> : <>向 {target} 道作答出发，还差 <strong>{target - amount} 道</strong>。</>}</p>
      <progress max={target} value={amount} aria-label={readingGoal ? "本期累计阅读分钟数" : "本期已判作答题数"}/>
    </section>}
    <section className="recap-subjects"><h3><NotebookPen size={17}/>我的答题足迹</h3>
      {subjects.length ? <ul>{subjects.map(row => {
        const rate = row.denominator ? Math.round(100 * row.correct / row.denominator) : null;
        return <li key={row.subject}>
          <div className="recap-subject-line"><strong>{row.subject}</strong><small>已判 {row.judged} 题</small>
            <span>{rate === null ? "正确率待统计" : <>正确率 <b>{rate}%</b></>}</span>
          </div>
          {rate !== null && <><div className="recap-rate" aria-hidden="true"><i style={{width: rate + "%"}}/></div>
            <small>{row.denominator} 题中答对 {row.correct} 题</small></>}
          {row.pending > 0 && <small className="recap-pending">另有 {row.pending} 题待确认</small>}
        </li>;
      })}</ul> : <p className="reading-muted">本期还没有可统计的答题记录。</p>}
    </section>
  </>;
}

function RecapPage({period,day,today,onDay}: {
  period:RecapPeriod; day:string; today:string; onDay:(day:string)=>void;
}) {
  const [report,setReport]=useState<GrowthRecap|null>(null);
  const [error,setError]=useState(""),[retry,setRetry]=useState(0);
  const range=recapRange(period,day), current=range.end>=today;
  const through=current?today:range.end;
  const endLabel=through.slice(range.start.slice(0,4)===through.slice(0,4)?5:0).replaceAll("-","/");
  useEffect(()=>{
    const controller=new AbortController();
    homeworkRequest<GrowthRecap>(`/practice/growth-recap?period=${period}&day=${day}`,{signal:controller.signal})
      .then(data=>{if(!controller.signal.aborted)setReport(data);})
      .catch(()=>{if(!controller.signal.aborted)setError("小结暂时没能打开。");});
    return ()=>controller.abort();
  },[period,day,retry]);
  return <>
    <div className="recap-navigation">
      <button className="text-button" aria-label={"上一"+recapPeriods[period]} disabled={range.previous<"2000-01-01"} onClick={()=>onDay(range.previous)}><ChevronLeft size={18}/></button>
      <div><strong>{range.start.replaceAll("-","/")} — {endLabel}</strong>
        <small>{current?"截至今天":<button className="text-button" onClick={()=>onDay(today)}>回到本{recapPeriods[period]}</button>}</small></div>
      <button className="text-button" disabled={current} aria-label={"下一"+recapPeriods[period]} onClick={()=>onDay(range.next)}><ChevronRight size={18}/></button>
    </div>
    {error?<p role="alert">{error} <button className="text-button" onClick={()=>{setError("");setRetry(n=>n+1);}}>重试</button></p>:
      !report?<p role="status">正在整理这段时间的记录…</p>:<>
        <RecapStory report={report} period={period} current={current}/>
        <details><summary>数字怎么算的？</summary>
          <p>按作业日期、测验日期和小练习记录日期归期。已判作答统计有明确对错的题。正确率只用完整识读范围内的已判题计算。待核对、通过但存疑、未作答和签名均不参与计算。</p>
          <p>读过的书按本期打卡书名对应的书架记录去重，读完按本期有日期的标记计数。小脚步按获得日期累计，兑换不扣减本期成果。</p>
        </details>
      </>}
  </>;
}

export function GrowthRecapCard({today}:{today:string}) {
  const [period,setPeriod]=useState<RecapPeriod|null>(null),[day,setDay]=useState(today);
  const periods=Object.keys(recapPeriods) as RecapPeriod[];
  return <section className="card growth-recap">
    <h2><Sprout size={20}/>我的成长小结</h2>
    <div className="recap-entries">{periods.map(p=><button key={p} className="recap-choice" onClick={()=>{setDay(today);setPeriod(p);}}><PeriodLabel period={p}/></button>)}</div>
    {period&&<ReadingCheckinDialog title="我的成长小结" backText="返回成长" onBack={()=>setPeriod(null)}>
      <div className="recap-page">
        <div className="recap-periods" role="group" aria-label="小结周期">{periods.map(p=><button key={p} className="recap-choice" aria-pressed={period===p} onClick={()=>setPeriod(p)}><PeriodLabel period={p}/></button>)}</div>
        <RecapPage key={period+day} period={period} day={day} today={today} onDay={setDay}/>
      </div>
    </ReadingCheckinDialog>}
  </section>;
}
