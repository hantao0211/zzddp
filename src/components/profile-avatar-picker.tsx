"use client";
import { useEffect, useRef, useState } from "react";
import { Check, Save, X } from "lucide-react";
import { AVATARS, avatarOption, type AvatarId } from "@/domain/avatars";
import type { Viewer } from "@/domain/accounts";
import { accountRequest } from "./account-login";

export function ProfileAvatarPicker({ name, initial, close }: { name: string; initial: AvatarId; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState(initial), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const preview = avatarOption(selected);
  useEffect(() => { const current = dialog.current; current?.showModal(); return () => current?.close(); }, []);
  async function save() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const viewer = await accountRequest("profile/avatar", { avatar: selected }, "PATCH") as Viewer;
      window.dispatchEvent(new CustomEvent("xiaobu:profile-updated", { detail: viewer })); close();
    } catch (e) { setError(e instanceof Error ? e.message : "表情还没保存好，请重试。"); }
    finally { setBusy(false); }
  }
  return <dialog className="dialog hw-dialog profile-avatar-dialog" ref={dialog} aria-label="选择我的表情" onCancel={event => { event.preventDefault(); close(); }}>
    <div className="dialog-header"><h2>选一个像你的表情</h2><button className="icon-button" onClick={close} aria-label="关闭表情选择"><X size={22} /></button></div>
    <div className="dialog-body"><div className="profile-avatar-preview"><span className="profile-emoji" role="img" aria-label={preview.label}>{preview.emoji}</span><div><strong>{name}</strong><p>今天的我 · {preview.label}</p></div></div>
      {Array.from(new Set(AVATARS.map(avatar => avatar.group))).map(group => <section className="profile-avatar-group" key={group} aria-label={group}><h3>{group}</h3><div className="profile-avatar-grid">{AVATARS.filter(avatar => avatar.group === group).map(avatar => <button type="button" className="profile-avatar-choice" key={avatar.id} aria-label={avatar.label} aria-pressed={selected === avatar.id} onClick={() => setSelected(avatar.id)} disabled={busy}><span className="profile-emoji" aria-hidden="true">{avatar.emoji}</span>{selected === avatar.id && <Check className="profile-avatar-check" size={14} aria-hidden="true" />}</button>)}</div></section>)}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
    <div className="profile-avatar-footer"><button className="button primary" onClick={() => void save()} disabled={busy}><Save size={17} aria-hidden="true" />{busy ? "保存中…" : "就用这个"}</button><p>这是你的专属表情，各设备同步。</p></div>
  </dialog>;
}
