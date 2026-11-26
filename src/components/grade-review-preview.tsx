"use client";
import { Check, ChevronDown, ClipboardCheck, ScanEye, X } from "lucide-react";
import styles from "./grade-review.module.css";
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
  const facts = [
    ["原答", preview.original],
    ["参考答案", preview.expected],
    ["卷面订正", preview.correction],
    ["核对依据", preview.evidence],
  ];
  return <section className={styles.panel} aria-label="本题更正">
    <header className={styles.heading}>
      <ClipboardCheck size={18} aria-hidden="true" />
      <strong>{preview.label}</strong>
      <span className={styles.status}>{applied ? "已更正" : "待家长确认"}</span>
    </header>
    <p className={styles.outcome}>{preview.verdict === "wrong" ? (applied ? "原答错误，已收入错题本。" : "原答错误，确认后收入错题本。") : (applied ? "原答正确，错题本已同步。" : "原答正确，确认后同步错题本。")}</p>
    <dl className={styles.facts}>
      {facts.filter(([, value]) => value).map(([label, value]) =>
        <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
    </dl>
    {!applied && (canConfirm ? <div className={styles.actions}><button type="button" className="button primary compact" disabled={busy} onClick={() => void confirm()}>{busy ? "正在保存…" : "确认更正这道题"}</button></div> : <p className={styles.help}>建议已保存，家长可以在这道题上确认。</p>)}
    {error && <p role="alert" className="form-error">{error}</p>}
  </section>;
}

export function FamilyGradeReview({runId,questionId,version,initial}: {runId:string;questionId:string;version:string;initial:{original:string;expected:string;correction:string}}) {
  const [open,setOpen] = useState(false);
  const [error,setError] = useState("");
  const [busy,setBusy] = useState(false);
  const [preview,setPreview] = useState<GradePreview>();
  if (preview) return <GradeReviewPreview key={preview.id} preview={preview} canConfirm />;
  if (!open) return <button type="button" className="text-button" onClick={() => setOpen(true)}>家长核对这题</button>;
  return <form className={styles.panel} aria-label="家长核对" onSubmit={async event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try {
      setPreview(await homeworkPost<GradePreview>("/grading/review",{runId,questionId,base:version,review:Object.fromEntries(data)}));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "未生成预览，请重试。"); }
    finally { setBusy(false); }
  }}>
    <header className={styles.heading}><ClipboardCheck size={18} aria-hidden="true" /><strong>家长核对</strong></header>
    <fieldset className={styles.verdict}>
      <legend>孩子的原答</legend>
      <div className={styles.choices}>
        <label><input type="radio" name="verdict" value="correct" required /><span><Check size={16} aria-hidden="true" />正确</span></label>
        <label><input type="radio" name="verdict" value="wrong" required /><span><X size={16} aria-hidden="true" />错误</span></label>
      </div>
    </fieldset>
    <label className={styles.field}>核对依据
      <textarea name="evidence" required rows={2} maxLength={600} placeholder="例如：原答旁有红叉，下方另写了订正。" />
    </label>
    <details className={styles.extra}><summary>补充答案与订正<span>选填</span><ChevronDown size={16} aria-hidden="true" /></summary>
      <div className={styles.fields}>
        <label className={styles.field}>原答<input name="original" defaultValue={initial.original.slice(0,600)} maxLength={600} /></label>
        <label className={styles.field}>参考答案<input name="expected" defaultValue={initial.expected.slice(0,600)} maxLength={600} /></label>
        <label className={styles.field}>卷面订正<input name="correction" defaultValue={initial.correction.slice(0,600)} maxLength={600} /></label>
      </div>
    </details>
    <div className={styles.actions}>
      <button type="button" className="text-button" disabled={busy} onClick={() => setOpen(false)}>取消</button>
      <button type="submit" className="button primary compact" disabled={busy}><ScanEye size={16} aria-hidden="true" />{busy ? "正在生成…" : "预览更正"}</button>
    </div>
    {error && <p role="alert" className="form-error">{error}</p>}
  </form>;
}
