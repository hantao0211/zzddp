"use client";

import { useEffect, useState } from "react";
import { BookOpen, CalendarRange, CalendarDays, GraduationCap, ChevronLeft, ChevronRight, Footprints, NotebookPen, Sprout } from "lucide-react";
import { recapPeriods, recapRange, type GrowthRecap, type RecapPeriod } from "@/domain/growth-recap";
import { homeworkRequest } from "@/services/homework-gateway";
import { ReadingCheckinDialog } from "./reading-checkin-dialog";

const periodIcons = { week: CalendarRange, month: CalendarDays, term: GraduationCap };

function PeriodLabel({period}:{period:RecapPeriod}) {
  const Icon = periodIcons[period];
  return <><Icon className="recap-period-icon" size={17} aria-hidden="true"/>{recapPeriods[period]}小结</>;
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
  const total=report?.subjects.reduce((sum,row)=>sum+row.judged,0)??0;
  const reading=report?.reading;
  const highlight=reading?.finished ? `你给 ${reading.finished} 本书翻到了最后一页。` :
    reading && reading.days>1 ? `有 ${reading.days} 天，你为喜欢的书留出了时间。` :
    total ? `你留下了 ${total} 道已经判好对错的答题记录。` :
    reading?.minutes ? `你为阅读留出了 ${reading.minutes} 分钟。` :
    report?.steps ? `你攒下了 ${report.steps} 个小脚步。` : "";
  return <>
    <div className="recap-navigation">
      <button className="text-button" aria-label={"上一"+recapPeriods[period]} disabled={range.previous<"2000-01-01"} onClick={()=>onDay(range.previous)}><ChevronLeft size={18}/></button>
      <div><strong>{range.start.replaceAll("-","/")} — {endLabel}</strong>
        <small>{current?"截至今天":<button className="text-button" onClick={()=>onDay(today)}>回到本{recapPeriods[period]}</button>}</small></div>
      <button className="text-button" disabled={current} aria-label={"下一"+recapPeriods[period]} onClick={()=>onDay(range.next)}><ChevronRight size={18}/></button>
    </div>
    {error?<p role="alert">{error} <button className="text-button" onClick={()=>{setError("");setRetry(n=>n+1);}}>重试</button></p>:
      !report||!reading?<p role="status">正在整理这段时间的记录…</p>:<>
        <p className="recap-highlight"><Sprout size={22} aria-hidden="true"/>{highlight||"这段时间还没有已判题目、阅读打卡或小脚步记录。"}</p>
        <section><h3><NotebookPen size={18}/>我的答题记录</h3>
          {report.subjects.length?<table><thead><tr><th>科目</th><th>已判作答</th><th>正确率</th></tr></thead><tbody>
            {report.subjects.map(row=><tr key={row.subject}><th scope="row">{row.subject}</th><td>{row.judged} 题</td>
              <td>{row.denominator?<><strong>{Math.round(100*row.correct/row.denominator)}%</strong><small>{row.denominator} 题中答对 {row.correct} 题</small></>:"暂缺依据"}
              {row.pending>0&&<small>另有 {row.pending} 题待确认</small>}</td></tr>)}
          </tbody></table>:<p className="reading-muted">本期还没有可统计的答题记录。</p>}
        </section>
        <section><h3><BookOpen size={18}/>我的阅读</h3>
          <p>读过 <strong>{reading.books}</strong> 本书，共 <strong>{reading.minutes}</strong> 分钟</p>
          <small>打卡 {reading.days} 天 · 标记读完 {reading.finished} 本</small>
        </section>
        <section><h3><Footprints size={18}/>我的小脚步</h3><p>本期获得 <strong>{report.steps}</strong> 个小脚步</p></section>
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
    <div className="recap-entries">{periods.map(p=><button key={p} className="button secondary compact" onClick={()=>{setDay(today);setPeriod(p);}}><PeriodLabel period={p}/></button>)}</div>
    {period&&<ReadingCheckinDialog title="我的成长小结" backText="返回成长" onBack={()=>setPeriod(null)}>
      <div className="recap-page">
        <div className="recap-periods" role="group" aria-label="小结周期">{periods.map(p=><button key={p} aria-pressed={period===p} onClick={()=>setPeriod(p)}><PeriodLabel period={p}/></button>)}</div>
        <RecapPage key={period+day} period={period} day={day} today={today} onDay={setDay}/>
      </div>
    </ReadingCheckinDialog>}
  </section>;
}
