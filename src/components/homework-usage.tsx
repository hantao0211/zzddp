import { CheckCircle2, CircleAlert, Clock3, History, ListFilter, RefreshCw } from "lucide-react";
import { HOMEWORK_PHASES, type HomeworkUsage } from "@/domain/homework-usage";

const states = { returned: "已返回", failed: "失败", running: "处理中", interrupted: "处理中断" };
const time = (value: string) => new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
export function HomeworkUsageDetails({ usage }: { usage: HomeworkUsage }) {
  return <details className="admin-ai-details"><summary><ListFilter size={18} aria-hidden="true" />今天的调用明细</summary>
    <p>按AI请求计数，一次上传可能有多页、多轮检查；失败请求也计入额度。打开页面和复用已有结果不消耗次数。</p>
    {usage.untracked > 0 && <p className="admin-ai-legacy"><History size={18} aria-hidden="true" />有 {usage.untracked} 次旧记录没有逐次明细，仍计入今天总数。以下仅统计开始记录后的 {usage.tracked} 次。</p>}
    <div className="admin-ai-states" aria-label="调用状态统计">
      <span><CheckCircle2 aria-hidden="true" />已返回 {usage.returned}</span><span><CircleAlert aria-hidden="true" />失败 {usage.failed}</span>
      {usage.running > 0 && <span><Clock3 aria-hidden="true" />处理中 {usage.running}</span>}
      {usage.interrupted > 0 && <span><CircleAlert aria-hidden="true" />中断 {usage.interrupted}</span>}
    </div>
    {usage.tracked > 0 ? <>
      <h3>用在了哪些检查</h3><div className="admin-ai-phases">{usage.phases.map(row => <span key={row.phase}>{HOMEWORK_PHASES[row.phase]} <strong>{row.calls}</strong></span>)}</div>
      <details><summary>按作业查看</summary><ul className="admin-ai-assignments">{usage.assignments.map(row => <li key={row.date + ":" + row.title}><div><strong>{row.title}</strong><small>{row.date || "作业日期未记录"}</small></div><span>{row.calls} 次{row.failed > 0 && <small>其中失败 {row.failed} 次</small>}</span></li>)}</ul></details>
      <details><summary>最近50次调用</summary><ol className="admin-ai-recent">{usage.recent.map(call => <li key={call.id}><div><time dateTime={call.startedAt}>{time(call.startedAt)}</time><strong>{HOMEWORK_PHASES[call.phase]}</strong><span className={`admin-ai-call-${call.status}`}>{states[call.status]}</span></div><p>{call.title} · {call.date || "作业日期未记录"}</p>{call.attempt > 1 && <small><RefreshCw size={13} aria-hidden="true" />任务第 {call.attempt} 轮处理</small>}{call.reason && <small>{call.reason}</small>}</li>)}</ol></details>
      <small>“已返回”表示收到了AI回复，作业是否批改完成以批改结果为准。点击页面上方“刷新”更新明细。</small>
    </> : <p>从本次更新开始记录，后续调用会在这里显示。</p>}
  </details>;
}
