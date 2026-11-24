"use client";
import { useEffect, useState } from "react";
import { ArrowLeftRight, RefreshCw, type LucideIcon } from "lucide-react";

export type AdminSection = { id: string; label: string; icon: LucideIcon };

export function useAdminSection(viewerId: string | undefined, mode: string, sections: AdminSection[]) {
  const [selection, setSelection] = useState({ key: "", id: "" });
  const key = viewerId ? `xiaobu:admin-section:${viewerId}:${mode}` : "";
  useEffect(() => {
    if (!key) return;
    try { setSelection({ key, id: sessionStorage.getItem(key) || "" }); } catch { /* Session storage is optional. */ }
  }, [key]);
  const current = sections.find(item => selection.key === key && item.id === selection.id)?.id || sections[0].id;
  return [current, (id: string) => {
    setSelection({ key, id });
    try { if (key) sessionStorage.setItem(key, id); } catch { /* Keep the selection in memory. */ }
  }] as const;
}

export function AdminIdentity({name, role, logout, home = "/"}: {name?: string; role?: string; logout: () => Promise<void>; home?: string}) {
  return <header>
    <div className="admin-identity"><a href={home} className="admin-brand">小步学习</a>{role && <small>{name} · {role}</small>}</div>
    <div className="admin-session"><a href={home} aria-label="打开学习空间">学习空间</a>{role && <button onClick={() => void logout()} aria-label="退出账号">退出</button>}</div>
  </header>;
}

export function AdminNavigation({rewards = false, sections, current, select, busy, refresh}: {
  rewards?: boolean; sections: AdminSection[]; current: string; select: (id: string) => void; busy: boolean; refresh: () => void;
}) {
  const title = rewards ? "阅读与奖励" : "家长管理";
  const destination = rewards ? "家长设置" : "阅读与奖励";
  return <>
    <div className="admin-heading"><h1>{title}</h1><div className="admin-heading-actions">
      <a className="button primary plum-action admin-mode-switch" href={rewards ? "/admin/" : "/reading/?view=manage"} aria-label={`切换至${destination}`}>
        <ArrowLeftRight aria-hidden="true"/>
        <span className="admin-switch-label"><span>切换至</span><strong>{destination}</strong></span>
      </a>
      <button className="button primary plum-action" disabled={busy} title="刷新" onClick={refresh}><RefreshCw aria-hidden="true"/><span className="visually-hidden">刷新</span></button>
    </div></div>
    <nav className="admin-sections" aria-label={title + "导航"}>
      {sections.map(({id, label, icon: Icon}) => <button key={id} aria-current={current === id ? "page" : undefined} onClick={() => select(id)}><Icon aria-hidden="true"/>{label}</button>)}
    </nav>
  </>;
}
