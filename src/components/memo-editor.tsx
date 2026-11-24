"use client";
import { REQUIREMENT_PRESETS, taskSubmission } from "@/domain/task-submission";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, ChevronDown, LoaderCircle, Pencil, RefreshCw, X } from "lucide-react";
import type { ClarificationReceipt, HomeworkChatContext, MemoEdit, MemoEntry } from "@/domain/clarifications";
import { homeworkPost, homeworkRequest, HomeworkRequestError } from "@/services/homework-gateway";

import { HomeworkScopeForm } from "./homework-scope-field";
import { scopeLabels } from "@/domain/practice";

type Props = { canManage?: boolean; scopeSaved?: () => void; date: string; title?: string; subject?: string; close: () => void; saved: (receipt: ClarificationReceipt) => void };
export function MemoEditor({ date, title, subject, close, saved, canManage, scopeSaved }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [context, setContext] = useState<HomeworkChatContext | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [entry, setEntry] = useState<MemoEntry | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [conflict, setConflict] = useState(false);
  const request = useRef<MemoEdit | null>(null);
  useEffect(() => { const d = dialog.current; d?.showModal(); return () => d?.close(); }, []);
  useEffect(() => {
    const controller = new AbortController();
    void homeworkRequest<HomeworkChatContext>(`/assistant-api/homework-context?date=${date}&requirements=1`, { signal: controller.signal }).then(value => {
      if (controller.signal.aborted) return;
      setContext(value);
      const matches = value.entries.filter(e => e.title === title && (!subject || subject === "待识别" || e.subject === subject));
      if (matches.length === 1 || value.entries.length === 1) {
        const item = matches[0] || value.entries[0]; setSelected(item.entryId);
        setEntry({ subject: item.subject, title: item.title, requirement: item.requirement, format: item.format });
      }
    }).catch(e => { if (!controller.signal.aborted) setError((e as Error).message); });
    return () => controller.abort();
  }, [date, title, subject]);
  function choose(id: string) {
    const item = context?.entries.find(e => e.entryId === id); if (!item) return;
    setSelected(id); setEntry({ subject: item.subject, title: item.title, requirement: item.requirement, format: item.format }); setError(""); setConflict(false); request.current = null;
  }
  function change(value: Partial<MemoEntry>) { setEntry(current => current ? { ...current, ...value } : null); request.current = null; }
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (busy || !context || !selected || !entry) return;
    setBusy(true); setError("");
    const value = request.current || { requestId: crypto.randomUUID(), date, revision: context.revision, entryId: selected, entry };
    request.current = value;
    try { const receipt = await homeworkPost<ClarificationReceipt>("/assistant-api/memo-entries/update", value); saved(receipt); }
    catch (e) { setError((e as Error).message); setConflict(e instanceof HomeworkRequestError && e.status === 409); }
    finally { setBusy(false); }
  }
  async function reload() {
    setBusy(true);
    try {
      const latest = await homeworkRequest<HomeworkChatContext>(`/assistant-api/homework-context?date=${date}&requirements=1`);
      setContext(latest); request.current = null;
      if (!latest.entries.some(e => e.entryId === selected)) { setSelected(null); setEntry(null); setError("当天换了新备忘录，请从新清单选择要修改的一项。"); }
      else setError("已读取最新版本，你填写的内容已保留。检查后可以再次保存。");
      setConflict(false);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const original = context?.entries.find(e => e.entryId === selected);
  const changed = entry && original && ["subject", "title", "requirement", "format"].some(key => entry[key as keyof MemoEntry] !== original[key as keyof MemoEntry]);
  return <dialog ref={dialog} className="dialog hw-dialog memo-editor" aria-label="修改备忘录清单" onCancel={e => { e.preventDefault(); if (!busy) close(); }}>
    <div className="dialog-header">
      <h2><Pencil size={19} aria-hidden="true" />修改备忘录清单</h2>
      <button type="button" className="icon-button" aria-label="关闭修改清单" disabled={busy} onClick={close}><X size={22} aria-hidden="true" /></button>
      <div className="memo-edit-feedback" data-inline-operation-feedback />
    </div>
    <div className="dialog-body">
      {!context && !error && <p role="status"><LoaderCircle className="spin" size={18} /> 正在读取清单…</p>}
      {context && !entry && (context.entries.length ? <>
        <p className="memo-edit-intro">选一项要修改的作业。</p>
        <div className="memo-edit-list">
          {context.entries.map(item => <button type="button" key={item.entryId} onClick={() => choose(item.entryId)}>
            <span>{item.subject || "待定"}</span><strong>{item.title}</strong><Pencil size={17} aria-hidden="true" />
          </button>)}
        </div>
      </> : <p>备忘录还没识别出条目。请等识别完成，或补拍清晰备忘录。</p>)}
      {entry && original?.scopeSource && <details className="hw-date-edit" open={original.scopeSource.scope === "unknown" || undefined}>
        <summary>
          <span>作业归属 · {scopeLabels[original.scopeSource.scope]}</span>
          <ChevronDown size={17} aria-hidden="true" />
        </summary>
        {canManage && <HomeworkScopeForm key={original.scopeSource.id} source={original.scopeSource} saved={scopeSource => {
          setContext(current => current ? { ...current, entries: current.entries.map(item =>
            item.entryId === selected ? { ...item, scopeSource } : item) } : current);
          scopeSaved?.();
        }} />}
      </details>}
      {entry && <form className="memo-edit-form" onSubmit={save}>
        <div className="memo-edit-section-heading">
          <h3>作业内容</h3>
          {context && context.entries.length > 1 && <button type="button" className="text-button memo-edit-back" disabled={busy} onClick={() => { setEntry(null); setSelected(null); }}>
            <ArrowLeft size={16} aria-hidden="true" />换一项
          </button>}
        </div>
        <div className="memo-edit-identity">
          <label>科目<select aria-label="作业科目" value={entry.subject || ""} disabled={busy} onChange={e => change({ subject: (e.target.value || null) as MemoEntry["subject"] })}><option value="" disabled={!!original?.subject}>待确认</option>{["语文", "数学", "英语"].map(s => <option key={s}>{s}</option>)}</select></label>
          <label>作业名称<input aria-label="作业名称" value={entry.title} maxLength={150} required disabled={busy} onChange={e => change({ title: e.target.value })} /></label>
        </div>
        <p className="hw-secondary">{taskSubmission(entry) === "self" ? "小步判断：通常无需交书面，做好后可直接确认。" : taskSubmission(entry) === "written" ? "这项需要提交书面作业或资料。" : "作业方式还不明确，可以在下方选择。"}</p>
        <label>选择常用或已有要求<select aria-label="选择已有作业要求" value="" disabled={busy} onChange={e => { const [kind,index]=e.target.value.split(":");if(kind==="preset"){const p=REQUIREMENT_PRESETS[Number(index)];change({requirement:`${entry.title}；${p.text}`,format:p.format});}else{const previous=context?.requirementOptions?.[Number(index)];if(previous)change({requirement:previous.requirement,format:previous.format});} }}><option value="" disabled>选择后填入下方，也可以自己写</option><optgroup label="常用要求">{REQUIREMENT_PRESETS.map((p,i)=><option key={i} value={`preset:${i}`}>{p.label}</option>)}</optgroup><optgroup label="以前用过的要求">{context?.requirementOptions?.map((p,i)=>p.subject===entry.subject?<option key={i} value={`history:${i}`}>{p.requirement.slice(0,70)}</option>:null)}</optgroup></select></label>
        <p className="hw-secondary">选好后请看一下页码和次数，可在下面直接修改。</p>
        <label>具体要求<textarea aria-label="作业具体要求" rows={3} value={entry.requirement} maxLength={2000} required disabled={busy} onChange={e => change({ requirement: e.target.value })} /></label>
        <div className="memo-edit-format"><label>形式<select aria-label="作业形式" value={entry.format} disabled={busy} onChange={e => { const format=e.target.value as MemoEntry["format"];change({format,...(format==="written" && taskSubmission({...entry,format})==="self" ? {requirement:`${entry.requirement}；需提交书面作业。`}: {})}); }}><option value="written">需交书面／作业资料</option><option value="oral">朗读／背诵／口头（可直接完成）</option><option value="reading">阅读／预习复习（可直接完成）</option><option value="other">暂不确定</option></select></label></div>
        {error && <p className="form-error" role="alert">{error}</p>}
        {conflict && <button type="button" className="text-button memo-edit-reload" disabled={busy} onClick={() => void reload()}>
          <RefreshCw size={16} aria-hidden="true" />读取最新清单，保留我的填写
        </button>}
        <div className="dialog-footer">
          <button type="button" className="text-button memo-edit-cancel" disabled={busy} onClick={close}>取消</button>
          <button type="submit" className="button primary" disabled={busy || !changed || !entry.title.trim() || !entry.requirement.trim()}>
            {busy ? <LoaderCircle className="spin" size={18} aria-hidden="true" /> : <Check size={18} aria-hidden="true" />}
            {busy ? "保存中…" : "保存并重新整理"}
          </button>
        </div>
        <p className="hw-secondary memo-edit-save-note">保存后会按新内容重新整理，原照片保留。</p>
      </form>}
      {!entry && error && <p className="form-error" role="alert">{error}</p>}
    </div>
  </dialog>;
}
