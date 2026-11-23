"use client";
import { HomeworkDaySettings } from "./homework-day-settings";
import { resolveHomeworkDayPlan } from "@/domain/homework-calendar";
import { taskSubmission } from "@/domain/task-submission";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { BookOpen, Camera, ClipboardList, Download, FolderOpen, Heart, LoaderCircle, LogOut, RefreshCw, ShieldCheck, Sparkles, Sprout, Upload, X, MessageCircle, Pencil, CircleAlert, CalendarDays } from "lucide-react";
import type { HomeworkSnapshot, UploadView, UploadTarget } from "@/domain/homework";
import { DaySchema, shanghaiDay } from "@/domain/homework";
import { reviewActivityLabel, needsReviewTraceUpdate } from "@/domain/review-policy";
import { taskGradingLabel } from "@/domain/grading";
import { GradingPanel, MistakeBook } from "./grading-panel";
import { useStudyNavigation } from "./study-navigation";
import { useStudyRefresh } from "./app-interactions";
import { StudyShell } from "./study-shell";
import { HomeCompanion } from "./study-companion";
import { JournalGarden, useJournalDecoration } from "./journal-garden";
import { FamilyNotes } from "./family-notes";
import { StatusIndicator } from "./status-indicator";
import { AccountLogin, useViewer, sessionChanged } from "./account-login";
import { isParent, ROLE_LABELS } from "@/domain/accounts";
import { writtenCompletionLabel } from "@/domain/written-completion";
import { StepAmount } from "./growth-tokens";
import { HomeworkPhoto } from "./homework-photo";
import { pagePhotoUrl } from "@/services/homework-photo";
import { TaskCompleteButton } from "./task-complete-button";
import { HomeworkTaskStatus } from "./homework-task-status";
import { MemoEditor } from "./memo-editor";
import type { HomeworkSummaryRow } from "@/domain/homework-summary";
import { homeworkSummary } from "@/domain/homework-summary";
import { homeworkHomeStatus } from "@/domain/homework-home";
import type { Material } from "@/domain/contracts";
import { BrowserDemoGateway } from "@/services/browser-gateway";
import { getHomework, homeworkPost, homeworkRequest, HomeworkRequestError, uploadHomework } from "@/services/homework-gateway";

const labels: Record<string, string> = { uploading: "上传未完成", queued: "排队中", converting: "准备页面中", recognizing: "AI识别中", retrying: "等待重试", processed: "已整理", needs_rescan: "需要补拍或调整", failed: "整理未完成", empty: "还没有资料", waiting_memo: "等待备忘录" };
function Dialog({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = ref.current; d?.showModal(); return () => d?.close(); }, []);
  return <dialog className="dialog hw-dialog" ref={ref} onCancel={(e) => { e.preventDefault(); close(); }} aria-label={title}><div className="dialog-header"><h2>{title}</h2><button className="icon-button" onClick={close} aria-label="关闭"><X size={22} /></button></div><div className="dialog-body">{children}</div></dialog>;
}
function errorText(error: unknown) { return error instanceof Error ? error.message : "操作暂未完成，请稍后重试。"; }

export function HomeworkApp({ onDemo, onDateChange, active=true }: { onDemo: () => void; onDateChange?: (date: string) => void; active?:boolean }) {
  const workspace=useStudyNavigation();
  const activeRef=useRef(active);activeRef.current=active;
  const [dateReady,setDateReady]=useState(false);
  const [date, setDate] = useState(shanghaiDay);
  const { viewer, accounts } = useViewer();
  const dayPlanContext = useRef(""); dayPlanContext.current = `${viewer?.id || "legacy"}:${date}`;
  const journal = useJournalDecoration(viewer?.id || "legacy");
  const [allTasksVisible, setAllTasksVisible] = useState(false);
  useEffect(() => { setAllTasksVisible(false); }, [date, viewer?.id]);
  const canManage = !accounts || isParent(viewer);
  useEffect(() => { const update=()=>{const value = new URLSearchParams(location.search).get("studyDate"); if (value && DaySchema.safeParse(value).success) setDate(value);setDateReady(true);};update();window.addEventListener("popstate",update);return()=>window.removeEventListener("popstate",update); }, []);
  useEffect(() => { if(!dateReady)return;onDateChange?.(date);workspace?.setDate(date); }, [date, dateReady, onDateChange, workspace?.setDate]);
  const [savedSnapshot, setSnapshot] = useState<HomeworkSnapshot | null>(null);
  const [auth, setAuth] = useState<"loading" | "locked" | "ready" | "insecure">("loading");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [tab, setTab] = useState<"today" | "archive" | "grading" | "mistakes">("today");
  const [focusGradingFailures, setFocusGradingFailures] = useState(false);
  const [subject, setSubject] = useState("全部");
  const [upload, setUpload] = useState<{ kind: "memo" | "homework"; files: File[]; target?: UploadTarget } | null>(null);
  const pickedTarget = useRef<UploadTarget | undefined>(undefined);
  const picker = useRef<HTMLInputElement>(null), pickedKind = useRef<"memo" | "homework">("homework");
  const [memoEdit, setMemoEdit] = useState<{ title?: string; subject?: string } | null>(null);
  const [rowStatusId, setRowStatusId] = useState<string | null>(null);
  const [daySettingsOpen, setDaySettingsOpen] = useState(false);
  const [dayPlanBusy, setDayPlanBusy] = useState(false);
  const [dayPlanError, setDayPlanError] = useState("");
  const [dayPlanChoice, setDayPlanChoice] = useState<{ context: string; noHomework: boolean } | null>(null);
  const [undoEdit, setUndoEdit] = useState<string | null>(null);
  useEffect(() => { setMemoEdit(null); setRowStatusId(null); setUndoEdit(null); setDaySettingsOpen(false); setDayPlanError(""); setDayPlanChoice(null); }, [date, viewer?.id]);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [legacy, setLegacy] = useState(false);
  const requestId = useRef(0), pendingReads=useRef(0), previousActive=useRef(active);
  const refresh = useCallback(async (background=false, signal?: AbortSignal) => {
    if(background&&pendingReads.current)return;
    const id = ++requestId.current;
    if (location.protocol !== "https:") { setAuth("insecure"); return; }
    pendingReads.current++;
    try {
      const result = await getHomework(date, signal);
      signal?.throwIfAborted();
      if (id !== requestId.current) return;
      setSnapshot(result); setAuth("ready"); setError("");
    } catch (e) {
      if (id !== requestId.current) return;
      if (e instanceof HomeworkRequestError && e.status === 401) { setAuth("locked"); setSnapshot(null); }
      else setError(signal?.aborted ? "刷新未完成，请稍后重试。" : errorText(e));
      if (signal) throw e;
    } finally {pendingReads.current--;}
  }, [date]);
  useStudyRefresh(signal => refresh(false, signal), active);
  useEffect(() => { setSnapshot(null); void refresh(); const timer = setInterval(() => { if (activeRef.current && !document.hidden) void refresh(true); }, 4000); const focus = () => { if(activeRef.current)void refresh(true); }; window.addEventListener("focus", focus); window.addEventListener("xiaobu:homework-updated", focus); window.addEventListener("xiaobu:session-changed", focus); return () => { clearInterval(timer); window.removeEventListener("focus", focus); window.removeEventListener("xiaobu:homework-updated", focus); window.removeEventListener("xiaobu:session-changed", focus); requestId.current++; }; }, [refresh]);
  useEffect(()=>{if(active&&!previousActive.current)void refresh(true);previousActive.current=active;},[active,refresh]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(""), 8000); return () => clearTimeout(timer); }, [notice]);
  async function login(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    try { await homeworkPost("/assistant-api/session", { code }); setCode(""); await refresh(); }
    catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  const snapshot = savedSnapshot?.date === date ? savedSnapshot : null;
  const homeStatus = homeworkHomeStatus(snapshot);
  const summary = homeworkSummary(snapshot);
  const savedDayPlan = snapshot?.dayPlan || resolveHomeworkDayPlan(date, [1], null, !!snapshot?.uploads.length);
  const dayPlan = dayPlanChoice?.context === dayPlanContext.current ? { ...savedDayPlan, noHomework: dayPlanChoice.noHomework } : savedDayPlan;
  async function saveDayPlan(value: { date: string; noHomework?: boolean | null; weekdays?: number[] }) {
    if (dayPlanBusy) return;
    const context = dayPlanContext.current;
    setDayPlanBusy(true); setDayPlanError("");
    if (value.weekdays === undefined && typeof value.noHomework === "boolean") setDayPlanChoice({ context, noHomework: value.noHomework });
    try {
      const updated = await homeworkPost<typeof savedDayPlan>("/day-plan", value);
      if (context !== dayPlanContext.current) return;
      setSnapshot(current => current?.date === value.date ? { ...current, dayPlan: updated } : current);
      await refresh(); setDaySettingsOpen(false);
    }
    catch (e) { if (context === dayPlanContext.current) setDayPlanError(errorText(e)); }
    finally { setDayPlanChoice(null); setDayPlanBusy(false); }
  }
  const rowStatus = summary?.rows.find(row => row.id === rowStatusId) || null;
  useEffect(() => { if (snapshot?.homeworkReward?.earned) window.dispatchEvent(new Event("xiaobu:growth-updated")); }, [date, snapshot?.homeworkReward?.earned]);
  const alreadyCovered = !!summary?.rows.length && summary.rows.every(row=>row.photo.tone==="good"&&row.activity.tone==="good");
  useEffect(()=>{const showHome=()=>{setDetailsOpen(false);window.scrollTo({top:0,behavior:"instant"});};window.addEventListener("xiaobu:home-home",showHome);return()=>window.removeEventListener("xiaobu:home-home",showHome);},[]);
  function showDetails(value: boolean) { setDetailsOpen(value); window.scrollTo({ top: 0, behavior: "instant" }); }
  function showGrading(view: "grading" | "mistakes", focusFailures = false) { setFocusGradingFailures(focusFailures); setTab(view); showDetails(true); }
  function chooseUpload(kind: "memo" | "homework", row?: HomeworkSummaryRow) { pickedKind.current = kind; const task = row ? snapshot?.report?.tasks.find(t => t.id === row.id) : undefined; pickedTarget.current = task ? { taskId: task.id, subject: task.subject, title: task.title, requirement: task.requirement, format: task.format } : undefined; picker.current?.click(); }
  function askAboutDay() { window.dispatchEvent(new CustomEvent("xiaobu:ask-homework", { detail: { date } })); }
  const tasks = snapshot?.report?.tasks || [];
  const oldReviewTasks = tasks.filter((task) => needsReviewTraceUpdate(task, snapshot?.reviewPolicy));
  const filtered = snapshot?.uploads.filter((u) => subject === "全部" || u.subjects.includes(subject as "数学" | "英语" | "语文")) || [];
  const detail = snapshot?.uploads.find((u) => u.id === detailId);
  async function retryDay() { try { await homeworkPost("/retry-day", { date }); await refresh(); } catch (e) { setNotice(errorText(e)); } }
  return <StudyShell viewer={viewer} page="home" className="hw-app" date={date} name={viewer?.name} roleLabel={viewer?ROLE_LABELS[viewer.role]:undefined} parent={isParent(viewer)} onLogout={auth==="ready"?async()=>{try{await homeworkRequest("/assistant-api/session",{method:"DELETE"});sessionChanged();await refresh();}catch(e){setNotice(errorText(e));}}:undefined}>
    {daySettingsOpen && <Dialog title="无作业日安排" close={() => { if (!dayPlanBusy) setDaySettingsOpen(false); }}><HomeworkDaySettings key={date} date={date} plan={dayPlan} busy={dayPlanBusy} save={value => void saveDayPlan(value)} />{dayPlanError && <p className="error-text" role="alert">{dayPlanError}</p>}</Dialog>}
    <main className="hw-main">
      {auth === "insecure" ? <section className="card hw-login"><ShieldCheck size={35} /><h1>安全打开学习空间</h1><p>真实作业上传和AI整理需要使用安全地址。</p><a className="button primary" href="https://14.103.24.55/">打开安全地址</a><p>以前在此浏览器保存的文件仍然保留。可在下方示例空间查看、下载，再到安全地址上传。</p><button className="text-button" onClick={onDemo}>查看此浏览器的旧记录</button></section> : auth === "locked" ? <section className="card hw-login"><span className="hw-login-icon"><Heart size={32} /></span><div className="eyebrow">欢迎回到小步学习</div><h1>今天，也向前一小步</h1><p>{accounts ? "使用家长或孩子的独立账号登录，与小助手共用登录状态。" : "输入家庭访问码，查看作业和学习资料。与小助手使用同一个访问码。"}</p>{accounts ? <AccountLogin legacy onSignedIn={() => void refresh()} /> : <form onSubmit={login}><label htmlFor="family-code">8位家庭访问码</label><input id="family-code" name="code" type="password" inputMode="numeric" autoComplete="off" pattern="[0-9]{8}" maxLength={8} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} required /><button className="button primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : <ShieldCheck size={18} />}进入学习空间</button></form>}<p className="hw-secondary">这台设备会记住登录状态。公共设备使用后请退出。</p><a className="hw-account-entry" href="/admin/">家长登录与管理</a></section> : auth === "loading" ? <section className="card hw-login"><LoaderCircle className="spin" /><p>正在打开家庭学习空间…</p><button className="text-button" onClick={() => void refresh()}>重新连接</button></section> : <>
        {!detailsOpen ? <section className={`hw-simple-home ${summary ? "hw-home-with-summary" : ""}`} aria-label="交作业首页">
          <div className="hw-heading hw-simple-heading"><div><h1>我的小步手帐</h1></div><label className="hw-date journal-date"><span>作业日期</span><input type="date" value={date} onChange={(e) => { if (e.target.value) { setDate(e.target.value); setDetailId(null); setMemoEdit(null); setRowStatusId(null); } }} /></label></div>
          <JournalGarden sticker={journal.sticker} onChoose={journal.choose} hint={snapshot && dayPlan.noHomework ? "今天没有作业，留点时间给喜欢的事。" : "今天的作业，小步陪你整理。"} />
          <div className="study-home-grid"><div className="study-home-main">{(!snapshot || !dayPlan.noHomework) && <div className="hw-upload-actions hw-primary-actions"><button onClick={() => chooseUpload("homework")} className="study-primary-upload"><span><Camera size={25} aria-hidden="true"/></span><div><strong>交作业</strong><small>照片、扫描件都可以</small></div></button><button onClick={() => chooseUpload("memo")}><span><ClipboardList size={25} aria-hidden="true"/></span><div><strong>拍备忘录</strong><small>记下今天要做什么</small></div></button></div>}
          {summary && <section className="hw-home-summary" aria-label="作业概况">
            <div className="hw-summary-heading"><h2>作业进展</h2><div>{summary.rows.length > 0 && <span>共{summary.rows.length}项 · {summary.rows.filter(row => row.activity.tone === "good").length}项已完成</span>}<button className="text-button study-edit-list" onClick={() => setMemoEdit({})}><Pencil size={15} aria-hidden="true" />修改清单</button></div></div>
            {snapshot?.pending&&snapshot.report&&<p className="hw-summary-processing" role="status"><LoaderCircle size={15} className="spin" aria-hidden="true"/><span>{snapshot.memoEdits?.length ? "清单已更新，小步正在按新要求重新检查。" : `${snapshot.processing?.memo ? "新备忘录" : "新照片"}在后台整理，下面保留上次结果，可继续交作业。`}</span></p>}
            {!!snapshot?.memoEdits?.length && snapshot.status === "failed" && <div className="hw-summary-processing" role="status"><span>清单已更新，AI重新检查未完成。原照片可用于重试。</span>{canManage && <button className="text-button" onClick={retryDay}>重新检查</button>}</div>}
            <div className="hw-summary-receipts"><span>备忘录：{summary.memo}</span><span>作业：{summary.homework}</span></div>
            {summary.rows.length ? <><table><colgroup><col className="journal-col-task"/><col className="journal-col-photo"/><col className="journal-col-completion"/></colgroup><thead><tr><th scope="col">作业</th><th scope="col">照片</th><th scope="col">完成情况</th></tr></thead><tbody>{(allTasksVisible ? summary.rows : summary.rows.slice(0, 3)).map(row => <tr key={row.id}><th scope="row"><span className="study-task-title"><span title={`${row.subject} · ${row.displayTitle||row.title}`}>{row.subject} · {row.displayTitle||row.title}</span><button className="study-edit-task" aria-label={`修改${row.title}`} title="修改这项作业" onClick={() => setMemoEdit({ title: row.title, subject: row.subject })}><Pencil size={14} aria-hidden="true" /></button></span></th><td className={`hw-summary-${row.photo.tone}`} aria-label={row.photo.text}><button className="study-status-detail" aria-haspopup="dialog" aria-label={`查看${row.title}的照片情况`} onClick={() => setRowStatusId(row.id)}><StatusIndicator kind={row.selfTask && !row.photoCount ? "neutral" : row.photo.text === "整理中" ? "pending" : row.photo.tone === "good" || row.photo.text === "已关联" ? "received" : row.photo.text === "对应待确认" ? "partial" : row.photo.text === "待匹配" ? "uncertain" : "missing"}>{row.photo.text}</StatusIndicator></button>{!row.updating&&row.photo.text!=="整理中"&&row.photo.tone!=="good"&&<button className="study-row-upload" onClick={()=>chooseUpload("homework",row)} aria-label={`为${row.title}上传作业`}>去上传</button>}</td><td className={`hw-summary-${row.activity.tone}`} aria-label={row.activity.text}><button className="study-status-detail" aria-haspopup="dialog" aria-label={`查看${row.title}的完成情况`} onClick={() => setRowStatusId(row.id)}><StatusIndicator kind={["整理中", "重新检查中"].includes(row.activity.text) ? "pending" : row.activity.tone === "good" ? "done" : ["未做", "未做完"].includes(row.activity.text) ? "blank" : "uncertain"}>{row.selfConfirmed ? <span className="task-manual-label">已完成（手动）</span> : row.activity.text}</StatusIndicator></button>{row.selfTask && !row.selfConfirmed && row.completionToken && <TaskCompleteButton row={row} date={date} saved={() => refresh()} /> }{row.updating&&<small className="hw-row-updating"><LoaderCircle size={13} className="spin" aria-hidden="true"/>{row.memoEdited ? "按新要求检查中" : "新照片整理中"}</small>}</td></tr>)}</tbody></table><div className="journal-list-footer">{summary.rows.length > 3 && <button className="text-button journal-expand-tasks" aria-expanded={allTasksVisible} onClick={() => setAllTasksVisible(value => !value)}>{allTasksVisible ? "收起作业" : `展开其余${summary.rows.length - 3}项作业`}</button>}<button className="hw-details-link" onClick={() => showDetails(true)}><FolderOpen size={16} aria-hidden="true" />查看详情</button></div></> : <p className="hw-summary-empty">{summary.empty}</p>}
          </section>}
          {!summary && <section className="hw-home-summary hw-empty-progress" aria-label="作业概况">
            <div className="hw-summary-heading"><h2>作业进展</h2><label className="hw-day-toggle"><input type="checkbox" aria-label="无作业日" checked={dayPlan.noHomework} disabled={!snapshot || dayPlanBusy} onChange={event => void saveDayPlan({ date, noHomework: event.target.checked })} /><span>无作业日</span>{dayPlanBusy && <LoaderCircle size={14} className="spin" aria-label="保存中" />}</label></div>
            <div className={`hw-empty-progress-body ${snapshot && dayPlan.noHomework ? "is-day-off" : ""}`} role="status">
              {!snapshot ? <LoaderCircle size={25} className="spin" aria-hidden="true" /> : dayPlan.noHomework ? <Sprout size={28} aria-hidden="true" /> : <Upload size={26} aria-hidden="true" />}
              <div><h3>{!snapshot ? "正在读取这一天的记录…" : dayPlan.noHomework ? "今天是无作业日" : "作业待上传"}</h3><p>{!snapshot ? "稍等一下，马上就好。" : dayPlan.noHomework ? "好好休息，也可以读一段喜欢的故事。" : "还没有收到这一天的资料，可以先拍备忘录，或直接交作业。"}</p>
              </div>
            </div>
          </section>}
          <div className="hw-day-plan-line"><span>{snapshot && dayPlan.noHomework ? dayPlan.source === "date" ? "这一天设为无作业日" : "按每周安排休息" : ""}</span><button className="text-button" disabled={!snapshot || dayPlanBusy} onClick={() => { setDayPlanError(""); setDaySettingsOpen(true); }}><CalendarDays size={16} aria-hidden="true" />无作业日设置</button></div>
          {dayPlanError && !daySettingsOpen && <p className="error-text" role="alert">{dayPlanError}</p>}
          <HomeCompanion date={date} viewerKey={viewer?.id||"legacy"} rewardNote={!dayPlan.noHomework && snapshot?.homeworkReward?.eligible && <div className={`study-homework-reward ${snapshot.homeworkReward.earned ? "earned" : ""}`} role="status"><span>{snapshot.homeworkReward.earned ? "作业完成奖励已到账" : "当天作业全部做完，攒"}</span><StepAmount value={snapshot.homeworkReward.points} signed/></div>}/>
          {!!snapshot?.uploads.length && !(alreadyCovered&&snapshot?.grading?.enabled&&snapshot.grading.finished&&!snapshot.grading.pending&&!snapshot.grading.failed&&!homeStatus.help) && <div className={`hw-home-status ${homeStatus.help ? "hw-home-question" : ""}`} role="status">{homeStatus.help ? <button className="hw-status-question" aria-label="和小步说说" onClick={askAboutDay}><MessageCircle size={23} /><span>{homeStatus.text}<small>点这里，和小步说说</small></span></button> : <>{homeStatus.busy ? <LoaderCircle size={23} className="spin" /> : <Sparkles size={23} />}<p>{homeStatus.text}</p></>}</div>}
          {snapshot?.grading?.enabled && <div className="hw-grading-overview">{summary && <p>{snapshot.grading.pending ? `还有${snapshot.grading.pending}页待批改，可在批改结果查看进度。` : snapshot.grading.failed ? "有作业批改未完成，可查看原因并重试。" : snapshot.grading.finished ? `已批改${snapshot.grading.correct + snapshot.grading.wrong + snapshot.grading.blank + snapshot.grading.uncertain + snapshot.grading.feedback}题 · ${snapshot.grading.wrong}道错题${snapshot.grading.uncertain ? ` · ${snapshot.grading.uncertain}题尚未确认` : ""}` : "书面作业上传后会自动批改。"}</p>}<div>{summary && <button className="text-button" onClick={() => showGrading("grading", !!snapshot.grading?.failed)}>{snapshot.grading.failed ? <CircleAlert size={17} aria-hidden="true" /> : <ClipboardList size={17} aria-hidden="true" />}{snapshot.grading.failed ? "查看未完成原因" : "查看批改"}</button>}<button className="text-button" onClick={() => showGrading("mistakes")}><BookOpen size={17} aria-hidden="true" />我的错题本</button></div></div>}
          {(!summary || !summary.rows.length) && <button className="hw-details-link" onClick={() => showDetails(true)}><FolderOpen size={18} />查看详情</button>}
          </div></div>
        </section> : <section className="hw-details-page" aria-label="作业详情">
          <div className="hw-details-heading"><button className="button secondary" onClick={() => showDetails(false)}>返回首页</button><label className="hw-date">作业日期<input type="date" value={date} onChange={(e) => { if (e.target.value) { setDate(e.target.value); setDetailId(null); setMemoEdit(null); setRowStatusId(null); } }} /></label></div>
        <nav className="hw-tabs" aria-label="学习资料导航"><button className={tab === "today" ? "selected" : ""} onClick={() => setTab("today")}><ClipboardList size={19} /> 作业清单</button>{snapshot?.grading?.enabled && <><button className={tab === "grading" ? "selected" : ""} onClick={() => setTab("grading")}>批改结果</button><button className={tab === "mistakes" ? "selected" : ""} onClick={() => setTab("mistakes")}>错题本</button></>}<button className={tab === "archive" ? "selected" : ""} onClick={() => setTab("archive")}><FolderOpen size={19} /> 历史资料</button><button className="hw-refresh" onClick={() => void refresh()} aria-label="刷新作业状态"><RefreshCw size={18} /></button></nav>
        {(tab === "today" || tab === "archive") && snapshot && <div className={`hw-status ${snapshot.status === "failed" ? "hw-status-error" : ""}`} role="status">{snapshot.pending ? <LoaderCircle size={20} className="spin" /> : <Sparkles size={20} />}<div><strong>{labels[snapshot.status] || "正在整理"}</strong><p>{snapshot.note}</p>{snapshot.pending && snapshot.report && <p>下方暂时展示上一次结果，新资料整理完成后会自动更新。</p>}</div>{snapshot.status === "failed" && canManage && <button className="button secondary compact" onClick={retryDay}>重新查缺</button>}</div>}
        {(tab === "today" || tab === "archive") && snapshot?.reviewPolicy && <section className="hw-review-policy"><details><summary>预习复习按学习痕迹检查</summary><p>{snapshot.reviewPolicy.description}</p></details>{canManage && <button className="text-button" onClick={retryDay}>重新整理</button>}{oldReviewTasks.length > 0 && !snapshot.pending && <p>部分预习、复习还是旧版结果，尚未按新规则判断。重新整理会由AI检查已上传照片，无需重新上传。</p>}</section>}
        {tab === "today" && <div className="hw-grid"><section className="card hw-task-card"><div className="section-heading"><h2><ClipboardList size={21} /> 作业清单</h2>{tasks.length > 0 && <span className="pill neutral">共 {tasks.length} 项作业</span>}<button className="text-button study-edit-list" onClick={() => setMemoEdit({})}><Pencil size={15} />修改清单</button></div><p className="section-description">每项作业分别显示照片是否收到；预习、复习还会显示有没有动笔痕迹。</p>{!tasks.length ? <div className="hw-empty"><BookOpen size={38} /><h3>{snapshot?.uploads.some((u) => u.kind === "memo") ? "正在等待清晰的作业清单" : "从一张备忘录开始"}</h3><p>不用手动填写科目或任务。<br />已经上传的作业会保留，备忘录识别后自动关联。</p></div> : <div className="hw-tasks">{tasks.map((task) => <article key={task.id} className="hw-task"><span className={`subject-icon ${task.subject === "数学" ? "math" : task.subject === "英语" ? "english" : "chinese"}`}>{task.subject.slice(0, 1)}</span><div className="hw-task-content"><div><h3>{task.inferredMeaning?.displayTitle||task.title}</h3><span className={`pill ${task.coverage === "complete" && (!task.writtenCompletion || task.writtenCompletion.status === "done") && (!task.reviewActivity || task.reviewActivity.status === "marked") ? "neutral" : "amber"}`}>{taskSubmission(task) === "self" ? task.selfCompletion ? "已完成（手动）" : task.reviewActivity?.status === "marked" ? "已做（有痕迹）" : "非书面 · 可直接完成" : needsReviewTraceUpdate(task, snapshot?.reviewPolicy) ? "AI尚未按新规则判断" : taskGradingLabel(snapshot?.grading?.tasks[task.id]) || writtenCompletionLabel(task.writtenCompletion) || reviewActivityLabel(task) || { none: "还没找到对应照片", partial: "对应待确认", complete: "已找到对应照片", uncertain: "AI未能判断" }[task.coverage]}</span></div><p>{task.inferredMeaning?.description||task.inferredScope?.description||task.requirement}</p>{task.inferredScope&&<div className="task-inferred-scope"><strong><Sparkles size={15} aria-hidden="true"/>根据作业推断</strong>{task.inferredMeaning&&<p>{task.inferredScope.description}</p>}<p>{task.inferredScope.note}</p><details><summary>查看备忘录原要求</summary><p>原记：{task.title}</p><p>{task.requirement}</p></details></div>}{task.writtenCompletion && <details className="hw-activity-evidence" open={task.writtenCompletion.status === "incomplete" || task.writtenCompletion.status === "unclear"}><summary>作答完成检查依据</summary><p>{task.writtenCompletion.reason}</p>{task.writtenCompletion.parts.some(p => p.status !== "answered") && <ul>{task.writtenCompletion.parts.filter(p => p.status !== "answered").map((part, i) => <li key={i}>{part.label}：{part.status === "blank" ? "未作答" : "AI未看清"}</li>)}</ul>}</details>}{task.reviewActivity && <details className="hw-activity-evidence"><summary>{task.reviewActivity.status === "unclear" ? "AI没看清的原因" : "学习痕迹依据"}</summary><p>{task.reviewActivity.reason}</p></details>}{taskSubmission(task) !== "self" && needsReviewTraceUpdate(task, snapshot?.reviewPolicy) && <p className="hw-secondary">这项仍是旧版结果，AI尚未按圈画、批注等动笔痕迹重新判断。无需补充朗读、笔记或复习过程证明。</p>}{taskSubmission(task) !== "self" && !needsReviewTraceUpdate(task, snapshot?.reviewPolicy) && task.missing.length > 0 && <ul>{task.missing.map((text, i) => <li key={i}>{text}</li>)}</ul>}<div className="hw-evidence">{task.memoEvidence.length > 0 && <button className="text-button" onClick={() => setDetailId(snapshot!.report!.memoId)}>备忘录依据</button>}{task.evidence.map((ev, i) => { const owner = snapshot?.uploads.find((u) => u.files.some((f) => f.pages.some((p) => p.id === ev.fileId))); return <button className="text-button" key={i} title={ev.excerpt} onClick={() => owner && setDetailId(owner.id)}>查看作业依据 {i + 1}</button>; })}</div></div></article>)}</div>}{!!snapshot?.report?.unclassified?.length && <section className="hw-unclassified"><h3>备忘录中尚未确定科目的条目</h3>{snapshot.report.unclassified.map((a, i) => <div key={i}><strong>{a.title}</strong><p>{a.requirement}</p></div>)}<p className="hw-secondary">原文已保留，下面这些作业的科目还没确定。可以直接告诉小助手这条是什么意思，或补拍更清晰的备忘录。</p></section>}<button className="button secondary hw-discuss" onClick={() => window.dispatchEvent(new CustomEvent("xiaobu:ask-homework", { detail: { date } }))}>和小助手说说这些疑问</button><div className="hw-task-note"><ShieldCheck size={17} /><span>{snapshot?.reviewPolicy ? "非书面作业可以直接确认完成，照片为补充参考；书面作业仍检查对应资料，完成与答对分开判断。" : "找到照片表示已收到对应内容，不代表答案已经批改正确。"}</span></div></section><aside>{!!snapshot?.report?.uncertainties.length && <section className="card hw-uncertainties"><h2>识别说明</h2><p>AI无法确定的地方会保留说明。</p><details><summary>查看 {snapshot.report.uncertainties.length} 条说明</summary><ul>{snapshot.report.uncertainties.map((u, i) => <li key={i}>{u}</li>)}</ul></details></section>}{!!snapshot?.report?.unassigned.length && <section className="card hw-uncertainties"><h2>暂未对应到清单</h2><ul>{snapshot.report.unassigned.map((u, i) => <li key={i}>{u.reason}</li>)}</ul><p>这些原件仍在学习档案中。</p></section>}</aside></div>}
        {tab === "grading" && <GradingPanel date={date} canManage={canManage} focusFailures={focusGradingFailures} />}{tab === "mistakes" && <MistakeBook />}
        {(tab === "today" || tab === "archive") && <>{!!snapshot?.report?.familyNotes?.length && <section className="card hw-family-notes"><h2>家庭补充说明</h2><FamilyNotes notes={snapshot.report.familyNotes} /><span className="hw-secondary">以上是当前理解，较早的原话保留在历史里。</span></section>}<section className="card hw-archive"><div className="section-heading"><h2><FolderOpen size={21} /> {tab === "today" ? "已收到的资料" : "历史资料"}</h2><span className="count-label">{snapshot?.uploads.length || 0}</span></div>{tab === "archive" && <><div className="hw-history" aria-label="有记录的日期">{snapshot?.dates.map((d) => <button key={d} className={d === date ? "selected" : ""} onClick={() => setDate(d)}>{d}</button>)}</div><div className="tabs">{["全部", "数学", "英语", "语文"].map((s) => <button className={subject === s ? "selected" : ""} key={s} onClick={() => setSubject(s)}>{s}</button>)}</div></>}{(tab === "today" ? snapshot?.uploads || [] : filtered).map((u) => <button className="hw-file-row" key={u.id} onClick={() => setDetailId(u.id)}><span className="file-icon">{u.kind === "memo" ? <ClipboardList size={23} /> : <BookOpen size={23} />}</span><div><h3>{u.kind === "memo" ? "作业备忘录" : "作业照片／扫描件"}</h3><p>{u.subjects.length ? u.subjects.join("、") : "科目待识别"} · {u.files.length} 个原件</p><small>{u.note || "原件尚在上传，请重新选择同一批文件继续。"}</small></div><span className={`pill ${u.status === "processed" ? "neutral" : "amber"}`}>{labels[u.status]}</span></button>)}{!snapshot?.uploads.length && <p className="hw-no-files">这一天还没有收到资料。</p>}</section>
        </>}
        <div className="hw-storage"><ShieldCheck size={18} /><span>原件和整理结果保存在家庭服务器，通过家庭访问码保护。家长和孩子使用独立账号权限，旧家庭访问码只进入孩子学习空间。</span></div>
        </section>}
      </>}
      {error && <p className="form-error hw-error" role="alert">{error}</p>}
      {notice && <div className="hw-notice" role="status"><span>{notice}</span>{undoEdit && <button className="text-button" onClick={async () => { try { await homeworkPost(`/assistant-api/clarifications/${undoEdit}/undo`); setUndoEdit(null); setNotice("已撤销这次修改，小步会重新整理。"); window.dispatchEvent(new Event("xiaobu:homework-updated")); } catch (e) { setNotice(errorText(e)); } }}>撤销修改</button>}<button className="icon-button" onClick={() => setNotice("")} aria-label="关闭提示"><X size={17} /></button></div>}
      {(auth !== "ready" || detailsOpen) && <footer className="hw-footer"><span><Sprout size={17} /> 小步学习 · 陪伴每一次慢慢长大</span><div>{auth === "ready" && <button onClick={() => setLegacy(true)}>迁移本浏览器旧资料</button>}<button onClick={onDemo}>示例体验与旧记录</button></div></footer>}
    </main>
    {auth === "ready" && <input className="visually-hidden" ref={picker} type="file" multiple accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif,application/pdf" aria-label="选择备忘录或作业照片" onChange={(e) => { const files = Array.from(e.target.files || []); e.target.value = ""; if (files.length) setUpload({ kind: pickedKind.current, files, target: pickedTarget.current }); }} />}
    {upload && <HomeworkUpload target={upload.target} kind={upload.kind} initialFiles={upload.files} date={date} close={() => setUpload(null)} onSaved={async (u) => { setUpload(null); setDate(u.date); setNotice(""); await refresh(); }} />}
    {detail && <UploadDetail canManage={canManage} upload={detail} close={() => setDetailId(null)} refresh={refresh} onDate={(d) => { setDate(d); setDetailId(null); }} />}
    {memoEdit && auth === "ready" && <MemoEditor date={date} {...memoEdit} close={() => setMemoEdit(null)} saved={receipt => { setMemoEdit(null); setUndoEdit(receipt.id); setNotice("修改已保存，小步正在按新清单重新整理。"); void refresh(); }} />}
    {rowStatus && snapshot && auth === "ready" && <Dialog title="这项作业的情况" close={() => setRowStatusId(null)}><HomeworkTaskStatus snapshot={snapshot} row={rowStatus} saved={() => refresh()} allUploads={() => { setRowStatusId(null); setSubject("全部"); setTab("archive"); showDetails(true); }} /><div className="study-status-actions"><button className="button secondary" onClick={() => { setMemoEdit({ title: rowStatus.title, subject: rowStatus.subject }); setRowStatusId(null); }}><Pencil size={17} />识别有误，修改这项</button><button className="text-button" onClick={() => { const task = snapshot.report?.tasks.find(t => t.id === rowStatus.id); const question = rowStatus.selfTask ? `关于“${rowStatus.title}”：这项通常非书面，当前${rowStatus.activity.text}。请结合已有要求解释怎么做，不要让我上传照片来证明完成；完成记录可以在清单点“我完成了”。` : `关于“${rowStatus.title}”：照片显示${rowStatus.photo.text}，完成情况显示${rowStatus.activity.text}。${task?.missing.length ? `系统记录的疑点：${task.missing.join("；")}。` : ""}请结合这项已上传照片和已有记录，解释具体原因；不要笼统让我补齐，也不要增加原作业没有的要求。`; setRowStatusId(null); window.dispatchEvent(new CustomEvent("xiaobu:ask-homework", { detail: { date, question } })); }}>问问小步</button></div></Dialog>}
    {legacy && <LegacyMigration close={() => setLegacy(false)} refresh={refresh} />}
  </StudyShell>;
}

function validateFiles(files: File[]) {
  if (files.length > 20 || files.some((f) => !f.size || f.size > 20 * 1024 * 1024) || files.reduce((size, f) => size + f.size, 0) > 50 * 1024 * 1024) return "每批最多20个文件，单个20MB，合计50MB。";
  if (files.some((f) => !/\.(jpe?g|png|webp|heic|heif|pdf)$/i.test(f.name) && !/^image\/(jpeg|png|webp|heic|heif)$|^application\/pdf$/.test(f.type))) return "请选择照片或PDF扫描件。";
  return "";
}
function HomeworkUpload({ kind, date, initialFiles, close, onSaved, target }: { target?: UploadTarget; kind: "memo" | "homework"; date: string; initialFiles: File[]; close: () => void; onSaved: (u: UploadView) => Promise<void> }) {
  const [files, setFiles] = useState<File[]>(() => validateFiles(initialFiles) ? [] : initialFiles);
  const [busy, setBusy] = useState(false), [progress, setProgress] = useState(""), [error, setError] = useState(() => validateFiles(initialFiles));
  const input = useRef<HTMLInputElement>(null), camera = useRef<HTMLInputElement>(null);
  const add = (incoming: File[]) => { const next = [...files, ...incoming], problem = validateFiles(next); if (problem) { setError(problem); return; } setFiles(next); setError(""); };
  return <Dialog title={kind === "memo" ? "上传备忘录" : "交作业"} close={() => { if (!busy) close(); }}><form className="hw-upload-form hw-simple-upload" onSubmit={async (e) => { e.preventDefault(); if (!files.length) { setError("先选择照片或扫描件。"); return; } setBusy(true); setError(""); try { const result = await uploadHomework(date, kind, files, setProgress, target?.taskId); await onSaved(result); } catch (e) { setError(errorText(e)); } finally { setBusy(false); } }}>
    <p className="hw-upload-summary">{date.replaceAll("-", "/")} · {kind === "memo" ? "备忘录" : "作业"} · 已选 {files.length} 份</p>
    {target && <p className="hw-upload-target"><ClipboardList size={18} aria-hidden="true" /><span>交到：{target.subject} · {target.title}</span></p>}
    <div className="hw-chosen-files">{files.map((f, i) => <div key={i}><span>{f.name}<small>{(f.size / 1024 / 1024).toFixed(1)} MB</small></span><button type="button" className="icon-button" aria-label={`移除${f.name}`} disabled={busy} onClick={() => setFiles(files.filter((_, n) => n !== i))}><X size={18} /></button></div>)}</div>
    <input className="visually-hidden" ref={input} type="file" multiple accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif,application/pdf" aria-label="继续选择照片或扫描件" onChange={(e) => { add(Array.from(e.target.files || [])); e.target.value = ""; }} />
    <input className="visually-hidden" ref={camera} type="file" accept="image/*" capture="environment" aria-label="拍摄作业照片" onChange={(e) => { add(Array.from(e.target.files || [])); e.target.value = ""; }} />
    <div className="hw-add-files"><button type="button" className="text-button" disabled={busy} onClick={() => input.current?.click()}><Upload size={17} />继续添加</button><button type="button" className="text-button" disabled={busy} onClick={() => camera.current?.click()}><Camera size={17} />再拍一张</button></div>
    {error && <p className="form-error" role="alert">{error}</p>}{busy && <p className="assistant-progress" role="status"><LoaderCircle className="spin" size={18} />{progress}</p>}
    <div className="dialog-footer"><button type="button" className="button secondary" disabled={busy} onClick={close}>取消</button><button className="button primary" disabled={busy || !files.length}>{busy ? <LoaderCircle size={18} className="spin" /> : <Upload size={18} />}{busy ? "正在上传…" : "确认上传"}</button></div>
    <details className="hw-upload-help"><summary>上传说明</summary><p>{target ? "这批照片会用于所选作业，小步会检查内容，传错时会提示。" : "各科作业可以一起传，小步会自动分科整理。"}支持照片、HEIC和PDF，每批最多20份、合计50MB，单份20MB；PDF每份最多20页，一批最多40页。</p>{kind === "memo" && <p>备忘录请拍完整。补传新备忘录会更新当天清单，旧原件仍保留。</p>}<p>原件保存在家庭服务器。AI整理时会将页面发送给已配置的模型服务，后台会继续处理。</p></details>
  </form></Dialog>;
}

function UploadDetail({ upload, close, refresh, onDate, canManage }: { canManage: boolean; upload: UploadView; close: () => void; refresh: () => Promise<void>; onDate: (d: string) => void }) {
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [date, setDate] = useState(upload.date);
  const act = async (path: string, value = {}) => { setBusy(true); setError(""); try { await homeworkPost(path, value); await refresh(); } catch (e) { setError(errorText(e)); } finally { setBusy(false); } };
  return <Dialog title={upload.kind === "memo" ? "作业备忘录" : "作业照片／扫描件"} close={close}><div className="hw-detail-meta"><span>{upload.date}</span><span className="pill neutral">{labels[upload.status]}</span><span>{upload.subjects.join("、")}</span></div>{upload.target && <p className="hw-upload-target"><ClipboardList size={18} aria-hidden="true" />上传到：{upload.target.subject} · {upload.target.title}</p>}<p>{upload.note || "上传尚未完成，请重新选择同一批文件上传以继续。"}</p>{!!upload.issues?.filter((i) => !i.pageId).length && <details className="hw-page-issues"><summary>备忘录识别说明</summary><ul>{upload.issues.filter((i) => !i.pageId).map((i, n) => <li key={n}>{i.message}</li>)}</ul></details>}{upload.aiMs > 0 && <p className="hw-secondary">最近识别累计用时 {Math.max(1, Math.round(upload.aiMs / 1000))} 秒（不含排队和当天合并查缺）</p>}{upload.status === "failed" && <button className="button secondary" disabled={busy} onClick={() => act(`/uploads/${upload.id}/retry`)}>重试这份资料</button>}{canManage && <details className="hw-date-edit"><summary>调整这份资料的作业日期</summary><p>整理结束后可以调整。清单和关联会重新计算，原件保留。</p><input type="date" aria-label="调整作业日期" value={date} onChange={(e) => setDate(e.target.value)} /><button className="button secondary compact" disabled={busy || !date || date === upload.date} onClick={async () => { setBusy(true); try { await homeworkPost(`/uploads/${upload.id}/date`, { date }); onDate(date); } catch (e) { setError(errorText(e)); } finally { setBusy(false); } }}>保存日期</button></details>}{error && <p className="form-error" role="alert">{error}</p>}{upload.files.map((file) => <section className="hw-original" key={file.id}><div><strong>{file.name}</strong>{file.stored && <a className="text-button" href={`/assistant-api/learning/files/${file.id}`}><Download size={16} /> 下载原件</a>}</div>{file.pages.map((p) => <figure key={p.id}><a href={pagePhotoUrl(p.id,"full")} target="_blank" rel="noopener noreferrer" aria-label={`查看第${p.number}页高清图片`}><HomeworkPhoto pageId={p.id} alt={`${file.name} 第${p.number}页`} /></a><figcaption>原件第 {p.number} 页<a className="text-button" href={pagePhotoUrl(p.id,"screen",true)}><Download size={15} aria-hidden="true" />下载图片</a></figcaption>{!!upload.issues?.some((i) => i.pageId === p.id) && <details className="hw-page-issues"><summary>这一页的识别说明</summary><ul>{upload.issues.filter((i) => i.pageId === p.id).map((i, n) => <li key={n}>{i.message}</li>)}</ul></details>}</figure>)}{!file.pages.length && <p className="hw-secondary">{file.stored ? "原件已保存，预览将在页面转换完成后显示。" : "这个文件尚未上传成功。"}</p>}</section>)}</Dialog>;
}

function LegacyMigration({ close, refresh }: { close: () => void; refresh: () => Promise<void> }) {
  const [materials, setMaterials] = useState<Material[]>([]), [error, setError] = useState(""), [progress, setProgress] = useState(""), [busy, setBusy] = useState(false), [done, setDone] = useState<string[]>([]);
  useEffect(() => { new BrowserDemoGateway().load().then((s) => setMaterials(s.materials.filter((m) => !m.sample))).catch((e) => setError(errorText(e))); }, []);
  return <Dialog title="迁移本浏览器的旧资料" close={() => { if (!busy) close(); }}><p>旧文件仍然保留在此浏览器。选择一份上传至服务器后，才会进行真实AI整理；不会删除本地原件。</p><p className="hw-secondary">这里只能读取同一浏览器、同一访问地址下的旧记录。HTTP地址保存的文件，请先从原地址下载，再到HTTPS地址上传。</p>{!materials.length && <p>此地址的浏览器里没有找到待迁移的原件。</p>}{materials.map((m) => <div className="hw-migration-row" key={m.id}><span>{m.name}<small>{m.filenames.length} 个文件 · {m.date}</small></span><button className="button secondary compact" disabled={busy || done.includes(m.id)} onClick={async () => { setBusy(true); setError(""); try { const gateway = new BrowserDemoGateway(); const files = []; for (let i = 0; i < m.fileIds.length; i++) { const blob = await gateway.readFile(m.fileIds[i]); if (!blob) throw new Error("部分旧文件已无法读取，本地记录已保留。"); files.push(new File([blob], m.filenames[i], { type: blob.type })); } await uploadHomework(m.date, m.kind === "备忘录" ? "memo" : "homework", files, setProgress); setDone((d) => [...d, m.id]); setProgress("已保存到服务器，等待AI整理。"); await refresh(); } catch (e) { setError(errorText(e)); } finally { setBusy(false); } }}>{done.includes(m.id) ? "已迁移" : "上传到服务器"}</button></div>)}{progress && <p role="status">{progress}</p>}{error && <p className="form-error" role="alert">{error}</p>}</Dialog>;
}
