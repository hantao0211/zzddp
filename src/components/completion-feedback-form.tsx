"use client";
import {useState} from "react";
import {MessageSquareText} from "lucide-react";
import {feedbackReasons, type FeedbackReason, type CompletionFeedback} from "@/domain/completion-feedback";
import {homeworkPost} from "@/services/homework-gateway";

export function CompletionFeedbackForm({date,taskId,feedback,finding,canManage,pending,saved}:{
  date:string; taskId:string; feedback:CompletionFeedback; finding?:string; canManage:boolean; pending:boolean; saved:()=>Promise<void>;
}) {
  const latest = feedback.latest;
  const [open,setOpen] = useState(false);
  const [reason,setReason] = useState<FeedbackReason | "">(latest?.reason || "");
  const [note,setNote] = useState(latest?.note || "");
  const [busy,setBusy] = useState(false), [error,setError] = useState("");
  const [rule,setRule] = useState(""), [trigger,setTrigger] = useState(""), [message,setMessage] = useState("");
  async function teach() {
    setError(""); setMessage(""); setBusy(true);
    try {
      await homeworkPost("/completion-feedback/convention",{date,taskId,token:feedback.token,quote:rule,trigger});
      setMessage("已记住，可在家长管理的「知识记忆」里查看或停用。"); setRule(""); setTrigger("");
    } catch(e) { setError(e instanceof Error ? e.message : "约定未保存。"); }
    finally { setBusy(false); }
  }
  async function submit(confirm:boolean) {
    setError(""); setBusy(true);
    try {
      await homeworkPost("/completion-feedback",{date,taskId,token:feedback.token,previousId:latest?.id ?? null,reason,note,confirm});
      await saved(); setOpen(false);
      window.dispatchEvent(new Event("xiaobu:growth-updated"));
    } catch(e) { setError(e instanceof Error ? e.message : "反馈未保存，请重试。"); }
    finally { setBusy(false); }
  }
  const label = latest?.status === "confirmed" ? "家长已确认写完" : latest?.status === "pending" ? "小步正在重看原图" : latest?.status === "reviewed" ? "已按反馈复查" : "复查未完成";
  return <section className="task-feedback">
    {latest && <div role="status"><strong>{label}</strong><p>{feedbackReasons[latest.reason]}{latest.note && " · " + latest.note}</p>
      {latest.status === "reviewed" && finding && <p>{finding}</p>}
      {latest.status === "interrupted" && <p>反馈已保存，可以重新复查。</p>}</div>}
    <button type="button" className="button secondary compact" aria-expanded={open} onClick={()=>setOpen(!open)}><MessageSquareText size={16}/>{open ? "收起反馈" : latest ? "补充或更正" : "这里判错了"}</button>
    {open && <div className="hw-upload-form"><label>哪里看错了？<select value={reason} onChange={e=>setReason(e.target.value as FeedbackReason)}>
      <option value="">选一个原因</option>{Object.entries(feedbackReasons).map(([key,value])=><option key={key} value={key}>{value}</option>)}</select></label>
      <label>{reason === "other" ? "说说哪处要再看看" : "补充一句（选填）"}<input value={note} maxLength={240} onChange={e=>setNote(e.target.value)} placeholder="例如：最后一行是改错后又写了两遍"/></label>
      <div className="study-status-actions"><button type="button" className="button primary compact" disabled={pending || busy || !reason || (reason==="other" && !note.trim())} onClick={()=>void submit(false)}>请小步重看原图</button>
      {canManage && <button type="button" className="button secondary compact" disabled={pending || busy || !reason || (reason==="other" && !note.trim())} onClick={()=>void submit(true)}>我已核对，确认写完</button>}</div>
      {canManage && <details><summary>让小步记住今后的约定</summary><label>适用场景<input value={trigger} maxLength={80} onChange={e=>setTrigger(e.target.value)} placeholder="例如：听写订正"/></label>
        <label>这门课今后怎么判断？<textarea value={rule} maxLength={240} onChange={e=>setRule(e.target.value)} placeholder="例如：我们家听写订正通常写在本页最后一行。"/></label>
        <button type="button" className="button secondary compact" disabled={busy || !trigger.trim() || rule.trim().length<8} onClick={()=>void teach()}>保存家庭约定</button>
        {message && <p role="status">{message}</p>}</details>}
      {pending && <small>照片正在整理，整理好就能提交。</small>}
      {error && <p role="alert">{error}</p>}</div>}
  </section>;
}
