"use client";
import { useEffect, useState } from "react";
import type { Viewer } from "@/domain/accounts";
export const sessionChanged = () => window.dispatchEvent(new Event("xiaobu:session-changed"));
export async function accountRequest(path: string, value?: unknown, method = "POST") {
  const response = await fetch(`/assistant-api/${path}`, { credentials: "same-origin", cache: "no-store", ...(value === undefined ? { method } : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) }) });
  const result = await response.json(); if (!response.ok) throw new Error(result.error || "操作未完成，请稍后再试。"); return result;
}
export function useViewer() {
  const [state, setState] = useState<{ viewer: Viewer | null; accounts: boolean }>({ viewer: null, accounts: false });
  useEffect(() => { let active = true; const refresh = () => { void accountRequest("status", undefined, "GET").then(r => { if (active) setState({ viewer: r.viewer || null, accounts: r.accounts === true }); }).catch(() => {}); }; refresh(); window.addEventListener("xiaobu:session-changed", refresh); window.addEventListener("focus", refresh); return () => { active = false; window.removeEventListener("xiaobu:session-changed", refresh); window.removeEventListener("focus", refresh); }; }, []);
  return state;
}
export function AccountLogin({ onSignedIn, legacy = false }: { onSignedIn: () => void; legacy?: boolean }) {
  const [username, setUsername] = useState(""), [password, setPassword] = useState(""), [code, setCode] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function submit(value: unknown) { setBusy(true); setError(""); try { await accountRequest("session", value); setPassword(""); setCode(""); sessionChanged(); onSignedIn(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  return <div className="account-login"><form onSubmit={e => { e.preventDefault(); void submit({ username, password }); }}><label>登录名<input autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} minLength={2} maxLength={32} required /></label><label>密码<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} minLength={8} maxLength={128} required /></label><button className="button primary" disabled={busy}>{busy ? "正在登录…" : "登录"}</button></form>
    {legacy && <details><summary>继续使用原来的家庭访问码</summary><p>旧访问码仅进入孩子学习空间。家长管理请用独立账号。</p><form onSubmit={e => { e.preventDefault(); void submit({ code }); }}><label>8位家庭访问码<input type="password" inputMode="numeric" autoComplete="off" pattern="[0-9]{8}" minLength={8} maxLength={8} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ""))} required /></label><button className="button secondary" disabled={busy}>进入孩子学习空间</button></form></details>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </div>;
}
