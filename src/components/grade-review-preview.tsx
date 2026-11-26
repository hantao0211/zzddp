"use client";
import { useState } from "react";
import type { GradePreview } from "@/domain/grade-review";
import { homeworkPost } from "@/services/homework-gateway";

export function GradeReviewPreview({preview, canConfirm, onSaved}: {preview: GradePreview; canConfirm: boolean; onSaved?:(value:GradePreview)=>void}) {
  const [saved, setSaved] = useState(false);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const applied = saved || preview.applied;
  async function confirm() {
    setBusy(true); setError("");
    try {
      const receipt = await homeworkPost<GradePreview>("/grading/confirm",{id:preview.id});
      setSaved(receipt.applied); onSaved?.(receipt);
      window.dispatchEvent(new Event("xiaobu:homework-updated"));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "暂未保存，请重试。"); }
    finally { setBusy(false); }
  }
  return <section className="assistant-proposal" aria-label="本题更正">
    <strong>{preview.label} · {applied ? "已更正" : "待家长确认"}</strong>
    <p>{preview.verdict === "wrong" ? (applied ? "原答错误，已收入错题本。" : "原答错误，确认后收入错题本。") : (applied ? "原答正确，错题本已同步。" : "原答正确，确认后同步错题本。")}</p>
    {preview.original && <p>原答　{preview.original}</p>}
    {preview.expected && <p>参考答案　{preview.expected}</p>}
    {preview.correction && <p>卷面已订正　{preview.correction}</p>}
    <small>{preview.evidence}</small>
    {!applied && (canConfirm ? <button type="button" className="button primary compact" disabled={busy} onClick={() => void confirm()}>{busy ? "正在保存…" : "确认更正这道题"}</button> : <p>建议已保存，家长可以在这道题上确认。</p>)}
    {error && <p role="alert">{error}</p>}
  </section>;
}

export function FamilyGradeReview({runId,questionId,version,initial}: {runId:string;questionId:string;version:string;initial:{original:string;expected:string;correction:string}}) {
  const [open,setOpen] = useState(false);
  const [error,setError] = useState("");
  const [busy,setBusy] = useState(false);
  const [preview,setPreview] = useState<GradePreview>();
  if (preview) return <GradeReviewPreview key={preview.id} preview={preview} canConfirm />;
  if (!open) return <button type="button" className="text-button" onClick={() => setOpen(true)}>家长核对这题</button>;
  return <form className="assistant-proposal" onSubmit={async event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try {
      setPreview(await homeworkPost<GradePreview>("/grading/review",{runId,questionId,base:version,review:Object.fromEntries(data)}));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "未生成预览，请重试。"); }
    finally { setBusy(false); }
  }}>
    <label>看过原图，原答是<select required name="verdict" defaultValue=""><option value="" disabled>请选择</option><option value="wrong">错误</option><option value="correct">正确</option></select></label>
    <label>核对依据<input name="evidence" required maxLength={600} placeholder="例如，原答旁有红叉，下方另写了订正" /></label>
    <details><summary>补充原答、参考答案或订正</summary>
      <label>原答<input name="original" defaultValue={initial.original.slice(0,600)} maxLength={600} /></label>
      <label>参考答案<input name="expected" defaultValue={initial.expected.slice(0,600)} maxLength={600} /></label>
      <label>卷面订正<input name="correction" defaultValue={initial.correction.slice(0,600)} maxLength={600} /></label>
    </details>
    <button type="submit" className="button secondary compact" disabled={busy}>预览更正</button>
    <button type="button" className="text-button" disabled={busy} onClick={() => setOpen(false)}>取消</button>
    {error && <p role="alert">{error}</p>}
  </form>;
}
