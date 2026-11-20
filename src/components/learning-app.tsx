"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowDownToLine, ArrowRight, BookOpen, Camera, Check, CheckCheck, ChevronRight,
  CircleHelp, ClipboardList, Clock3, FileImage, FileText, FolderOpen, Gift,
  GraduationCap, Heart, Home, Leaf, LoaderCircle, Plus, Printer, Search,
  ShieldCheck, Sparkles, Sprout, Target, TrendingUp, Upload, Users, X,
} from "lucide-react";
import type { LearningState, Material, MaterialKind } from "@/domain/contracts";
import { makeDemoState, mistakes, subjects, summarize } from "@/domain/demo";
import { BrowserDemoGateway } from "@/services/browser-gateway";
import { createMaterialId } from "@/services/material-id";
import { HomeworkApp } from "@/components/homework-app";
import { useStudyNavigation } from "./study-navigation";
import { StudyAssistant } from "@/components/study-assistant";

type View = "today" | "archive" | "mistakes" | "growth" | "family";
const gateway = new BrowserDemoGateway();
const navigation = [
  { id: "today" as View, label: "今日学习", icon: Home },
  { id: "archive" as View, label: "学习档案", icon: FolderOpen },
  { id: "mistakes" as View, label: "我的错题本", icon: BookOpen },
  { id: "growth" as View, label: "成长与奖励", icon: Sprout },
  { id: "family" as View, label: "家长概览", icon: Users },
];
const titles: Record<View, string> = { today: "今日学习", archive: "学习档案", mistakes: "我的错题本", growth: "成长与奖励", family: "家长概览" };

function Modal({ title, children, close, wide = false }: { title: string; children: ReactNode; close: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => { dialog?.close(); }; }, []);
  return <dialog ref={ref} className={`dialog ${wide ? "wide" : ""}`} aria-labelledby="dialog-title" onCancel={(e) => { e.preventDefault(); close(); }} onClick={(e) => { if (e.target === ref.current) close(); }}>
    <div className="dialog-header"><h2 id="dialog-title">{title}</h2><button className="icon-button" aria-label="关闭弹窗" onClick={close}><X size={20} /></button></div>{children}
  </dialog>;
}

function Seedling() {
  return <svg className="seedling" viewBox="0 0 240 180" aria-hidden="true"><ellipse cx="128" cy="158" rx="72" ry="12" fill="#e7d4dd" /><path d="M102 108h63l-10 45h-43z" fill="#c59da9" /><path d="M99 108h69v12H99z" fill="#d8b5c0" /><path d="M133 108V54" stroke="#627968" strokeWidth="5" strokeLinecap="round" /><path d="M132 87C91 87 85 59 88 41c26 2 46 18 44 46" fill="#93a796" /><path d="M134 70c1-35 27-49 49-43 1 26-17 46-49 43" fill="#748d7b" /><path d="M130 52c-16-4-23-18-19-30 17 1 26 12 19 30" fill="#b0bfae" /><path d="M179 99l4-10m-9 5 12 2" stroke="#c5aa99" strokeWidth="3" strokeLinecap="round" /><circle cx="69" cy="99" r="4" fill="#c5aa99" /><path d="M67 45l3-10m-7 4 10 2" stroke="#c5aa99" strokeWidth="2" strokeLinecap="round" /></svg>;
}

export function LearningApp({active=true,onDemoModeChange}:{active?:boolean;onDemoModeChange?:(demo:boolean)=>void}={}) {
  const workspace=useStudyNavigation();
  const [demo, setDemo] = useState(false);
  const [studyDate, setStudyDate] = useState("");
  useEffect(()=>{onDemoModeChange?.(active&&demo);},[active,demo,onDemoModeChange]);
  return <>{demo ? <><div className="hw-demo-return"><button className="button primary" onClick={() => setDemo(false)}>返回真实作业空间</button><span>以下为示例体验及本浏览器旧记录</span></div><PrototypeApp /></> : <HomeworkApp active={active} onDemo={() => setDemo(true)} onDateChange={setStudyDate} />}{!workspace&&<StudyAssistant studyDate={studyDate || undefined} navigationManaged={!demo} />}</>;
}

function PrototypeApp() {
  const [view, setView] = useState<View>("today");
  const [parent, setParent] = useState(false);
  const [state, setState] = useState<LearningState>(makeDemoState);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [upload, setUpload] = useState<MaterialKind | null>(null);
  const [detail, setDetail] = useState<Material | null>(null);
  const [toast, setToast] = useState("");
  const [filter, setFilter] = useState("全部");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [review, setReview] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const [reflection, setReflection] = useState("");
  const stats = summarize(state);

  useEffect(() => {
    gateway.load().then((saved) => { setState(saved); setReflection(saved.reflection); }).catch((e: Error) => { setToast(e.message); setStorageError(true); }).finally(() => setReady(true));
  }, []);
  useEffect(() => { if (!toast) return; const timeout = setTimeout(() => setToast(""), 6500); return () => clearTimeout(timeout); }, [toast]);

  async function commit(next: LearningState, message?: string) {
    if (storageError) { setToast("本地记录读取异常，已暂停写入以保护已有资料。"); return false; }
    setSaving(true);
    try { await gateway.save(next); setState(next); if (message) setToast(message); return true; }
    catch { setToast("保存失败，请检查浏览器存储权限或空间后重试。"); return false; }
    finally { setSaving(false); }
  }

  function changeView(next: View) { setView(next); setFilter("全部"); setSearch(""); }
  function toggleRole() { setParent(!parent); if (parent && view === "family") setView("today"); }
  const recent = state.materials.slice(0, 3);
  const filtered = state.materials.filter((m) => (filter === "全部" || m.subject === filter || m.kind === filter) && `${m.name}${m.filenames.join("")}`.includes(search));

  return <div className="app-shell">
    <a href="#main" className="skip-link">跳到主要内容</a>
    <aside className="sidebar">
      <a className="brand" href="/" aria-label="小步学习首页"><span className="brand-icon"><Sprout size={25} /></span><span>小步学习<small>每一步，都算数</small></span></a>
      <div className="profile"><div className="avatar">小</div><div><strong>小同学的学习空间</strong><span>四年级 · 家庭学习档案</span></div></div>
      <div className="nav-caption">我的学习空间</div>
      <nav aria-label="主要导航">{navigation.filter((n) => n.id !== "family" || parent).map(({ id, label, icon: Icon }) => <button key={id} className={`nav-item ${view === id ? "active" : ""}`} onClick={() => changeView(id)} aria-current={view === id ? "page" : undefined}><Icon size={20} /><span>{label}</span>{id === "mistakes" && <em>{mistakes.length}</em>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="gentle-note"><Heart size={18} /><p>成长有自己的节奏。<br />今天，进步一点点就好。</p></div><button className="role-switch" onClick={toggleRole}><Users size={17} /><span>{parent ? "家长视角" : "孩子视角"}</span><span className="small-label">切换演示</span></button></div>
    </aside>

    <div className="workspace">
      <header className="topbar"><div className="breadcrumb">我的学习空间 <ChevronRight size={14} /> <strong>{titles[view]}</strong></div><div className="topbar-right"><span className="demo-chip"><span /> 交互原型</span><button className="top-role" onClick={toggleRole} aria-label={`切换至${parent ? "孩子" : "家长"}演示视角`}><span className="top-avatar">{parent ? "家" : "小"}</span><span>{parent ? "家长" : "孩子"}视角</span></button></div></header>
      <div className="prototype-note"><CircleHelp size={16} /><span>当前为演示空间：统计与分析使用示例数据；导入文件仅保存在本浏览器，尚未接入云端、自动识别和批改。</span></div>
      {!ready ? <main className="loading" id="main"><LoaderCircle className="spin" /> 正在打开学习空间…</main> : <main id="main" className="main-content">
        {view === "today" && <>
          <div className="page-heading"><div><div className="eyebrow">2026 年 11 月 18 日 · 星期三 · 示例日程</div><h1>今天，也向前一小步<span className="heading-sprout"><Sprout size={28} /></span></h1><p>先完成学校作业，再给自己的进步留一点时间。</p></div><button className="button primary" onClick={() => setUpload("每日作业")} disabled={storageError}><Plus size={18} /> 上传学习资料</button></div>
          <div className="dashboard-grid">
            <div className="main-column">
              <section className="welcome-card"><div><span className="pill light"><Leaf size={13} /> 不急，慢慢来</span><h2>每一次认真，<br />都会悄悄发芽。</h2><p>从今天的作业开始，<br />把学会的、还没学会的，都记录下来。</p><button className="text-button" onClick={() => setUpload("备忘录")}>先拍一下作业备忘录 <ArrowRight size={17} /></button></div><Seedling /><div className="welcome-caption">一点一滴 · 看见成长</div></section>
              <section className="card tasks-card"><div className="section-heading"><h2><ClipboardList size={19} /> 备忘录里的学校作业 <span className="count-label">{stats.completed}/{stats.total}</span></h2><button className="text-button muted" onClick={() => setUpload("备忘录")}>拍备忘录 <Camera size={16} /></button></div><p className="section-description">以当天备忘录为清单，AI对照作业内容查缺。下方当前为示例，真实上传与识别尚未接通。</p><div className="progress-track"><span style={{ width: `${stats.completed / Math.max(stats.total, 1) * 100}%` }} /></div>
                <div className="task-list">{state.tasks.map((task) => <div className={`task-row ${task.completed ? "is-complete" : ""}`} key={task.id}><button className={`task-check ${task.completed ? "checked" : ""}`} aria-label={`${task.completed ? "取消完成" : "标记完成"}：${task.title}`} aria-pressed={task.completed} disabled={saving || storageError} onClick={() => commit({ ...state, tasks: state.tasks.map((t) => t.id === task.id ? { ...t, completed: !t.completed } : t) }, "已保存你的完成记录，尚未自动核验作业内容。")}>{task.completed && <Check size={15} />}</button><span className={`subject-icon ${task.subject === "数学" ? "math" : task.subject === "英语" ? "english" : "chinese"}`}>{task.subject === "数学" ? "数" : task.subject === "英语" ? "英" : "语"}</span><div className="task-info"><h3>{task.title}</h3><p>{task.description}</p></div><span className={`task-status ${task.uploaded ? "green" : ""}`}>{task.coverage === "partial" ? "部分收到" : task.coverage === "complete" ? "材料齐全" : task.coverage === "uncertain" ? "待辨认" : task.uploaded ? "已收到" : "未收到材料"}</span><button className="icon-button task-upload" aria-label={`上传${task.title}`} onClick={() => setUpload("每日作业")}><Camera size={19} /></button></div>)}</div><div className="tasks-footer"><ShieldCheck size={15} /> 学校作业优先。今天不用追求做很多，认真完成就很好。</div></section>
              <section className="card recent-card"><div className="section-heading"><h2>最近的学习记录</h2><button className="text-button muted" onClick={() => changeView("archive")}>全部记录 <ArrowRight size={16} /></button></div><div className="recent-grid">{recent.map((m, i) => <button className="material-preview" key={m.id} onClick={() => setDetail(m)}><div className={`document-thumb thumb-${i}`}><div className="mini-paper"><span />{m.kind === "备忘录" ? <><i /><i /><i /></> : <><b>学习记录</b><i /><i /><i /><i /></>}</div><span className="thumb-badge">{m.sample ? "示例" : `${m.filenames.length} 个文件`}</span></div><h3>{m.name}</h3><p>{m.date.slice(5).replace("-", "/")} <span>·</span> {m.kind}</p></button>)}</div></section>
            </div>
            <aside className="right-column">
              <section className="card rhythm-card"><div className="section-heading"><h2>今天的小脚印</h2><span className="icon-circle"><TrendingUp size={17} /></span></div><div className="daily-stats"><div><strong>{stats.completed}<small>/{stats.total}</small></strong><span>自己确认完成</span></div><div><strong>{stats.uploaded}</strong><span>作业已上传</span></div><div><strong>{stats.reviewed}</strong><span>复习已记录</span></div></div><div className="step-row"><span className="step-icon done"><Check size={13} /></span><div><strong>记录作业清单</strong><p>已载入一份备忘录示例</p></div></div><div className="step-row"><span className="step-icon"><Camera size={14} /></span><div><strong>纸上完成，拍照留存</strong><p>支持一次选择多张照片</p></div></div><div className="step-row"><span className="step-icon"><Sprout size={14} /></span><div><strong>回顾一点点进步</strong><p>也记下今天的疑问</p></div></div></section>
              <section className="review-card"><span className="eyebrow"><Target size={15} /> 温故知新</span><h2>和一道老朋友，再见面</h2><p>小数点对齐了吗？<br />试着说说，你准备怎么做。</p><div className="review-question">12.5 <span>−</span> 3.78 <span>=</span> <b>?</b></div><button className="button secondary" onClick={() => { changeView("mistakes"); setReview("decimal"); setShowHint(false); setShowAnswer(false); }}>开始复习示例 <ArrowRight size={16} /></button><small>依据数学示例错题推荐 · 不计时</small></section>
              <section className="print-card"><span className="print-icon"><Printer size={23} /></span><div><h3>喜欢在纸上思考？</h3><p>打印一张短练习，写下思路。</p><a href="/print" target="_blank" rel="noreferrer" className="text-button">查看练习单 <ArrowRight size={15} /></a></div></section>
            </aside>
          </div>
        </>}

        {view === "archive" && <>
          <div className="page-heading"><div><div className="eyebrow">点滴留存 · 随时回看</div><h1>每一页，都是成长的记录</h1><p>备忘录、作业、试卷和订正，都在这里。</p></div><button className="button primary" onClick={() => setUpload("每日作业")} disabled={storageError}><Plus size={18} /> 上传资料</button></div>
          <div className="archive-tools"><div className="tabs" aria-label="资料筛选">{["全部", ...subjects, "备忘录"].map((f) => <button className={filter === f ? "selected" : ""} key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>{f}</button>)}</div><label className="search-box"><Search size={17} /><input placeholder="搜索记录或文件名" aria-label="搜索学习记录" value={search} onChange={(e) => setSearch(e.target.value)} /></label></div>
          <section className="card archive-list"><div className="section-heading"><h2>学习资料 <span className="count-label">{filtered.length}</span></h2><span className="small-label">本地导入原件可在详情中查看</span></div>{filtered.length ? filtered.map((m) => <button className="archive-row" key={m.id} onClick={() => setDetail(m)}><span className={`file-icon ${m.kind === "备忘录" ? "yellow" : ""}`}><FileText size={23} /></span><div><h3>{m.name}</h3><p>{m.date} · {m.kind === "备忘录" ? "多科目备忘录" : m.subject || "科目待识别"} · {m.filenames.length} 个文件</p></div><span className={`pill ${m.sample ? "neutral" : "amber"}`}>{m.sample ? "示例资料" : "等待AI整理"}</span><ChevronRight size={18} /></button>) : <div className="empty-state"><FolderOpen size={35} /><h3>这里还没有匹配的记录</h3><p>试试其他筛选，或者上传一份新资料。</p></div>}</section>
          <div className="inline-note"><ShieldCheck size={17} /> 当前文件保存在此浏览器。换设备或清除浏览器数据后无法访问，正式版将接入家庭私有存储。</div>
        </>}

        {view === "mistakes" && <>
          <div className="page-heading"><div><div className="eyebrow">把不会的，慢慢变成会的</div><h1>错过一次，也能学会一次</h1><p>先自己想一想，需要时再打开提示。</p></div><a href="/print" target="_blank" rel="noreferrer" className="button primary"><Printer size={18} /> 打印示例练习</a></div>
          <div className="tabs spaced">{["全部", ...subjects].map((f) => <button className={filter === f ? "selected" : ""} key={f} onClick={() => setFilter(f)} aria-pressed={filter === f}>{f}</button>)}</div><div className="mistake-grid">{mistakes.filter((m) => filter === "全部" || m.subject === filter).map((m) => <section className="card mistake-card" key={m.id}><div className="mistake-tags"><span className="pill neutral">{m.subject} · {m.tag}</span><span className="small-label">{m.date} · 示例</span></div><h2>{m.title}</h2><div className="question-box">{m.question}</div><p className="mistake-reason">{m.reason}</p><div className="answer-comparison"><span>原作答 <del>{m.wrong}</del></span><span>订正答案 <strong>{m.answer}</strong></span></div><div className="mistake-footer"><span className={`small-label ${state.reviewDone.includes(m.id) ? "green" : ""}`}>{state.reviewDone.includes(m.id) ? "已记录复习 · 待后续复测" : m.progress}</span><button className="text-button" onClick={() => { setReview(m.id); setShowHint(false); setShowAnswer(false); }}>再试一次 <ArrowRight size={16} /></button></div></section>)}</div>{!mistakes.some((m) => filter === "全部" || m.subject === filter) && <section className="card empty-state"><BookOpen size={35} /><h3>这个科目暂时没有示例错题</h3><p>正式版会从批改结果中整理错题。</p></section>}
          <div className="inline-note"><CircleHelp size={17} /> 当前复习用于体验流程；记录一次复习不会直接判定“已掌握”。</div>
        </>}

        {view === "growth" && <>
          <div className="page-heading"><div><div className="eyebrow">认真尝试，也值得被看见</div><h1>属于你的，成长小花园</h1><p>记录自己的发现，也给努力一点小小的期待。</p></div><Sprout className="large-icon" size={48} /></div>
          <div className="growth-grid"><section className="growth-banner"><Seedling /><span className="eyebrow">今天的一小步</span><h2>不只记录对错，<br />也记录你如何长大。</h2><p>主动开始、认真订正、说出疑问，<br />每一种努力都值得被看见。</p><div className="growth-badges"><span><Leaf size={16} /> 乐于尝试</span><span><Heart size={16} /> 认真订正</span></div></section><section className="card reflection-card"><h2>今天，我想记住……</h2><label htmlFor="reflection">学会了什么？或者，还有什么想问？</label><textarea id="reflection" placeholder="比如：我发现把小数点对齐，计算就清楚多了。" value={reflection} maxLength={500} onChange={(e) => setReflection(e.target.value)} /><div className="reflection-footer"><span>{reflection.length}/500</span><button className="button primary" disabled={saving || storageError} onClick={() => commit({ ...state, reflection }, "今天的发现已保存在本浏览器。")}>留下这一步 <Check size={16} /></button></div></section></div>
          <div className="section-heading reward-heading"><h2><Gift size={21} /> 小小期待清单</h2><span className="pill neutral">示例可用积分 {120 - state.rewardRequests.reduce((sum, id) => sum + ({ book: 60, park: 80, movie: 100 }[id] ?? 0), 0)}</span></div><p className="section-description">这里只演示申请流程，实际积分规则和奖励由家庭共同商量。</p><div className="reward-grid">{[{ id: "book", title: "挑选一本喜欢的书", text: "一起去发现新的故事", cost: 60, icon: BookOpen }, { id: "park", title: "周末公园探索", text: "和家人一起走进大自然", cost: 80, icon: Leaf }, { id: "movie", title: "家庭电影之夜", text: "选一部电影，一起放松", cost: 100, icon: Sparkles }].map(({ id, title, text, cost, icon: Icon }) => { const requested = state.rewardRequests.includes(id); const available = 120 - state.rewardRequests.reduce((sum, key) => sum + ({ book: 60, park: 80, movie: 100 }[key] ?? 0), 0); return <section className="card reward-card" key={id}><span className={`reward-icon ${id}`}><Icon size={30} /></span><h3>{title}</h3><p>{text}</p><div><strong>{cost} <small>积分</small></strong><button className="button secondary compact" disabled={requested || available < cost || saving || storageError} onClick={() => commit({ ...state, rewardRequests: [...state.rewardRequests, id] }, "已保存演示申请，积分仅作预留，尚无真实审批和消息发送。")}>{requested ? "申请中" : available < cost ? "积分不足" : "申请兑换"}</button></div></section>; })}</div>
        </>}

        {view === "family" && parent && <>
          <div className="page-heading"><div><div className="eyebrow">看见过程，陪伴成长</div><h1>不用每天盯着，也能了解进步</h1><p>本周报告为示例，不会根据当前导入文件自动生成结论。</p></div><button className="button secondary" onClick={() => { const data = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(data); const link = document.createElement("a"); link.href = url; link.download = "xiaobu-local-records.json"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setToast("已导出记录清单，照片与扫描件原件不包含在此文件中。"); }}><ArrowDownToLine size={17} /> 导出记录清单</button></div>
          <div className="family-stats">{[{ label: "示例任务完成", value: `${stats.completed}/${stats.total}`, text: "孩子自行记录", icon: CheckCheck }, { label: "当前资料记录", value: `${state.materials.length}`, text: "包含示例和本地导入", icon: FolderOpen }, { label: "示例待关注知识点", value: "2", text: "小数计算、单位换算", icon: Target }, { label: "演示兑换申请", value: `${state.rewardRequests.length}`, text: "尚未接入真实审批", icon: Gift }].map(({ label, value, text, icon: Icon }) => <section className="card stat-card" key={label}><div>{label}<Icon size={19} /></div><strong>{value}</strong><p>{text}</p></section>)}</div>
          <div className="family-grid"><section className="card"><div className="section-heading"><h2>这周，值得关注什么</h2><span className="pill neutral">示例周报</span></div><div className="insight"><span className="insight-icon"><TrendingUp size={21} /></span><div><h3>小数加减法：关注数位对齐</h3><p>示例中出现了数位对齐相关错误。建议先观察竖式过程，再通过少量变式验证，不能据此认定孩子不认真。</p><button className="text-button" onClick={() => changeView("mistakes")}>查看示例题目 <ArrowRight size={15} /></button></div></div><div className="insight"><span className="insight-icon warm"><Heart size={21} /></span><div><h3>给她一点选择的空间</h3><p>可以先让孩子选一道想弄明白的题，再讲讲自己的思路。学校作业较多时，减少额外练习。</p></div></div></section><section className="card"><h2>家庭协作与权限</h2><p className="section-description">角色模型预览，当前切换不代表真实登录或权限验证。</p>{[{ title: "家庭管理员", text: "成员与权限、规则和资料管理", icon: ShieldCheck }, { title: "家长成员", text: "录入资料、查看报告、安排任务", icon: Users }, { title: "孩子", text: "本人任务、上传、复习和兑换申请", icon: GraduationCap }].map(({ title, text, icon: Icon }) => <div className="member-row" key={title}><span className="file-icon"><Icon size={21} /></span><div><h3>{title}</h3><p>{text}</p></div></div>)}</section></div>
        </>}
        <footer className="page-footer"><Sprout size={14} /> 小步学习 <span>·</span> 陪伴每一次慢慢长大 <span className="footer-mode">原型 v0.1</span></footer>
      </main>}
    </div>

    <nav className="mobile-nav" aria-label="移动端导航">{navigation.filter((n) => n.id !== "family" || parent).map(({ id, label, icon: Icon }) => <button key={id} className={view === id ? "active" : ""} aria-current={view === id ? "page" : undefined} onClick={() => changeView(id)}><Icon size={20} /><span>{label}</span></button>)}</nav>
    {toast && <div className="toast" role="status"><CircleHelp size={18} /><span>{toast}</span><button aria-label="关闭提示" onClick={() => setToast("")}><X size={15} /></button></div>}
    {upload && <UploadDialog kind={upload} close={() => setUpload(null)} onSaved={async () => { setState(await gateway.load()); setUpload(null); setToast("原件已保留在本浏览器，等待接通AI整理流程。你不需要手动选择科目或关联任务。"); }} />}
    {detail && <MaterialDialog material={detail} close={() => setDetail(null)} />}
    {review && (() => { const m = mistakes.find((item) => item.id === review)!; return <Modal title="再想一想 · 示例复习" close={() => setReview(null)}><div className="dialog-body"><span className="pill neutral">{m.subject} · {m.tag}</span><div className="review-big-question">{m.question}</div><p className="section-description">先在纸上写一写，也可以试着说出你的思路。</p><div className="review-actions"><button className="button secondary" onClick={() => setShowHint(!showHint)}>{showHint ? "收起提示" : "给我一点提示"}</button><button className="text-button" onClick={() => setShowAnswer(!showAnswer)}>{showAnswer ? "收起答案" : "我想核对答案"}</button></div>{showHint && <div className="hint-box"><Sparkles size={17} />{m.hint}</div>}{showAnswer && <div className="answer-box">参考答案：<strong>{m.answer}</strong></div>}<div className="dialog-footer"><p>记录复习不会直接判定掌握。</p><button className="button primary" disabled={saving || storageError} onClick={async () => { const saved = await commit({ ...state, reviewDone: [...new Set([...state.reviewDone, m.id])] }, "已记录本次复习，后续仍需复测验证。"); if (saved) setReview(null); }}>记录本次复习 <Check size={16} /></button></div></div></Modal>; })()}
  </div>;
}

function UploadDialog({ kind: initialKind, close, onSaved }: { kind: MaterialKind; close: () => void; onSaved: () => Promise<void> }) {
  const [kind, setKind] = useState<MaterialKind>(initialKind === "备忘录" ? "备忘录" : "待识别");
  const [date, setDate] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; });
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  function addFiles(incoming: File[]) {
    const allowed = incoming.every((f) => ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"].includes(f.type) || /\.(heic|heif)$/i.test(f.name));
    if (!allowed) { setError("请选择 JPG、PNG、WebP、HEIC 照片或 PDF 扫描件。"); return; }
    if ([...files, ...incoming].length > 20) { setError("一次最多选择 20 个文件，可以分批保存。"); return; }
    if (incoming.some((f) => f.size > 20 * 1024 * 1024)) { setError("单个文件请控制在 20 MB 以内。"); return; }
    setFiles((old) => [...old, ...incoming]); setError("");
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (!files.length) { setError("先选择要保存的照片或扫描件。"); return; }
    setBusy(true); setError("");
    try {
      const id = createMaterialId();
      const material: Material = { id, name: kind === "备忘录" ? `${date} 作业备忘录` : `${date} 待整理作业`, kind, date, processing: "waiting_for_ai", sample: false, fileIds: files.map((_, i) => `${id}-${i}`), filenames: files.map((f) => f.name) };
      await gateway.addMaterial(material, files); await onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : "保存失败，请稍后重试。"); setBusy(false); }
  }
  return <Modal title="本浏览器保存 · 示例体验" close={() => { if (!busy) close(); }}><form className="dialog-body upload-form" onSubmit={submit}><p className="section-description">不用选科目，也不用关联任务。先拍当天备忘录，再把做完的作业一起上传，交给后台自动整理。</p>
      <div className="upload-intent" aria-label="上传入口"><button type="button" className={kind === "备忘录" ? "selected" : ""} onClick={() => setKind("备忘录")}><ClipboardList size={19} /><span>当天备忘录<small>作为各科作业清单的依据</small></span></button><button type="button" className={kind !== "备忘录" ? "selected" : ""} onClick={() => setKind("待识别")}><Camera size={19} /><span>作业照片／扫描件<small>可以混合多个科目上传</small></span></button></div>
      <div className="ai-upload-flow"><span>识别内容</span><ChevronRight size={13} /><span>自动分科与关联</span><ChevronRight size={13} /><span>对照备忘录查缺</span></div>
      <details className="upload-date"><summary>调整资料日期（默认今天）</summary><label>资料日期<input type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></label><p>后台接入后会结合备忘录中的日期识别；日期不确定时不会强行关联。</p></details>
      <input ref={input} type="file" className="visually-hidden" multiple accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif,application/pdf" aria-label="选择学习资料文件" onChange={(e) => { addFiles(Array.from(e.target.files || [])); e.target.value = ""; }} />
      <button type="button" className="dropzone" disabled={busy} onClick={() => input.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (!busy) addFiles(Array.from(e.dataTransfer.files)); }}><span><Upload size={26} /></span><strong>点击选择照片或扫描件</strong><small>支持多选或拖入 · 每次最多 20 个文件</small></button>
      {!!files.length && <div className="selected-files">{files.map((file, index) => <div key={`${file.name}-${index}`}><FileImage size={18} /><span>{file.name}<small>{(file.size / 1024 / 1024).toFixed(2)} MB</small></span><button type="button" className="icon-button" aria-label={`移除 ${file.name}`} disabled={busy} onClick={() => setFiles((old) => old.filter((_, i) => i !== index))}><X size={16} /></button></div>)}</div>}
      <div className="inline-note"><CircleHelp size={17} /><span>网页尚未接通AI整理流程：资料先在本浏览器保留为“等待AI整理”。尚未实际识别，不会假装已分科、已关联或已批改。</span></div>{error && <p className="form-error" role="alert">{error}</p>}<div className="dialog-footer"><button className="button secondary" type="button" onClick={close} disabled={busy}>取消</button><button className="button primary" type="submit" disabled={busy}>{busy ? <LoaderCircle size={17} className="spin" /> : <Check size={17} />}{busy ? "正在保存…" : `保存${files.length ? ` ${files.length} 个文件` : "资料"}`}</button></div></form></Modal>;
}

function MaterialDialog({ material, close }: { material: Material; close: () => void }) {
  const [previews, setPreviews] = useState<{ url: string; type: string; name: string }[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    const urls: string[] = []; let active = true;
    Promise.all(material.fileIds.map(async (id, index) => { const blob = await gateway.readFile(id); if (!blob) throw new Error("部分本地文件已无法读取，浏览器数据可能已被清理。"); const url = URL.createObjectURL(blob); urls.push(url); return { url, type: blob.type, name: material.filenames[index] }; })).then((items) => { if (active) setPreviews(items); else urls.forEach(URL.revokeObjectURL); }).catch((e: Error) => { if (active) setError(e.message); });
    return () => { active = false; urls.forEach(URL.revokeObjectURL); };
  }, [material]);
  return <Modal title={material.name} close={close} wide><div className="dialog-body"><div className="material-meta"><span className="pill neutral">{material.kind}</span><span>{material.date}</span><span>{material.sample ? "示例资料" : "本浏览器原件"}</span></div>{material.sample ? <div className="sample-document"><span className="eyebrow">以下为文字示例，没有真实试卷照片</span><h3>{material.name}</h3>{material.kind === "备忘录" ? <ol><li>数学：练习册第 32–33 页，小数加减法。</li><li>英语：Unit 4 词汇与句型。</li><li>语文：课后第 2、3 题。</li></ol> : material.subject === "数学" ? <><p>题目：12.5 − 3.78 = ?</p><p>孩子作答示例：9.28</p><p>老师批改示例：×</p><p>系统解答示例：8.72。建议关注数位对齐，通过复测验证。</p></> : <p>英语作业已上传的示例记录。真实图片将在资料导入后显示。</p>}</div> : <><div className="inline-note amber-note"><Clock3 size={17} /> 已保存原件 · 等待AI整理，科目与任务关联尚未确定。</div>{error && <p className="form-error" role="alert">{error}</p>}{!previews.length && !error && <p className="loading"><LoaderCircle className="spin" size={19} /> 正在读取本地原件…</p>}{previews.map((file) => <div className="original-file" key={file.url}><div><span>{file.name}</span><a href={file.url} download={file.name} className="text-button"><ArrowDownToLine size={15} /> 保存原件</a></div>{file.type === "application/pdf" ? <iframe title={file.name} src={file.url} /> : /heic|heif/.test(file.type) || /\.(heic|heif)$/i.test(file.name) ? <p>已保留 HEIC 原件。此浏览器可能不支持预览，可下载查看。</p> : <img src={file.url} alt={`学习资料原件：${file.name}`} />}</div>)}</>}</div></Modal>;
}
