"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, LoaderCircle, Pencil, X } from "lucide-react";
import type { ClarificationReceipt, HomeworkChatContext, MemoEdit, MemoEntry } from "@/domain/clarifications";
import { homeworkPost, homeworkRequest, HomeworkRequestError } from "@/services/homework-gateway";

type Props = { date: string; title?: string; subject?: string; close: () => void; saved: (receipt: ClarificationReceipt) => void };
export function MemoEditor({ date, title, subject, close, saved }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [context, setContext] = useState<HomeworkChatContext | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [entry, setEntry] = useState<MemoEntry | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [conflict, setConflict] = useState(false);
  const request = useRef<MemoEdit | null>(null);
  useEffect(() => { const d = dialog.current; d?.showModal(); return () => d?.close(); }, []);
  useEffect(() => {
    const controller = new AbortController();
    void homeworkRequest<HomeworkChatContext>(`/assistant-api/homework-context?date=${date}`, { signal: controller.signal }).then(value => {
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
      const latest = await homeworkRequest<HomeworkChatContext>(`/assistant-api/homework-context?date=${date}`);
      setContext(latest); request.current = null;
      if (!latest.entries.some(e => e.entryId === selected)) { setSelected(null); setEntry(null); setError("当天换了新备忘录，请从新清单选择要修改的一项。"); }
      else setError("已读取最新版本，你填写的内容已保留。检查后可以再次保存。");
      setConflict(false);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const original = context?.entries.find(e => e.entryId === selected);
  const changed = entry && original && ["subject", "title", "requirement", "format"].some(key => entry[key as keyof MemoEntry] !== original[key as keyof MemoEntry]);
  return <dialog ref={dialog} className="dialog hw-dialog memo-editor" aria-label="修改备忘录清单" onCancel={e => { e.preventDefault(); if (!busy) close(); }}>
    <div className="dialog-header"><h2><Pencil size={19} />修改备忘录清单</h2><button className="icon-button" aria-label="关闭修改清单" disabled={busy} onClick={close}><X size={22} /></button></div>
    <div className="dialog-body">
      <p className="memo-edit-intro">认错了可以直接改。保存后，小步会按新内容重新整理，原照片仍保留。</p>
      {!context && !error && <p role="status"><LoaderCircle className="spin" size={18} /> 正在读取清单…</p>}
      {context && !entry && <div className="memo-edit-list">{context.entries.map(item => <button key={item.entryId} onClick={() => choose(item.entryId)}><span>{item.subject || "科目待确认"}</span><strong>{item.title}</strong><Pencil size={17} /></button>)}{!context.entries.length && <p>备忘录还没识别出条目。请等识别完成，或补拍清晰备忘录。</p>}</div>}
      {entry && <form onSubmit={save}>
        {context && context.entries.length > 1 && <button type="button" className="text-button memo-edit-back" disabled={busy} onClick={() => { setEntry(null); setSelected(null); }}><ArrowLeft size={16} />换一项</button>}
        <label>科目<select aria-label="作业科目" value={entry.subject || ""} disabled={busy} onChange={e => change({ subject: (e.target.value || null) as MemoEntry["subject"] })}><option value="" disabled={!!original?.subject}>待确认</option>{["语文", "数学", "英语"].map(s => <option key={s}>{s}</option>)}</select></label>
        <label>作业名称<input aria-label="作业名称" value={entry.title} maxLength={150} required disabled={busy} onChange={e => change({ title: e.target.value })} /></label>
        <label>具体要求<textarea aria-label="作业具体要求" rows={3} value={entry.requirement} maxLength={2000} required disabled={busy} onChange={e => change({ requirement: e.target.value })} /></label>
        <details className="memo-edit-format"><summary>作业形式</summary><label>形式<select aria-label="作业形式" value={entry.format} disabled={busy} onChange={e => change({ format: e.target.value as MemoEntry["format"] })}><option value="written">书面作业</option><option value="oral">口头作业</option><option value="reading">阅读／预习复习</option><option value="other">其他</option></select></label></details>
        {error && <p className="form-error" role="alert">{error}</p>}{conflict && <button type="button" className="button secondary" disabled={busy} onClick={() => void reload()}>读取最新清单，保留我的填写</button>}
        <div className="dialog-footer"><button type="button" className="button secondary" disabled={busy} onClick={close}>取消</button><button className="button primary" disabled={busy || !changed || !entry.title.trim() || !entry.requirement.trim()}>{busy ? <LoaderCircle className="spin" size={18} /> : <Check size={18} />}{busy ? "保存中…" : "保存并重新整理"}</button></div>
      </form>}
      {!entry && error && <p className="form-error" role="alert">{error}</p>}
    </div>
  </dialog>;
}
