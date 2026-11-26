"use client";

import { useEffect, useRef, useState } from "react";
import {XiaobuMascot} from "./xiaobu-mascot";
import {TutorialButton} from "./study-tutorial";
import { createPortal } from "react-dom";
import { CalendarDays, Check, Copy, Download, ImagePlus, LoaderCircle, LockKeyhole, LogOut, MessageCircle, Mic, MoreHorizontal, Send, Sparkles, Square, Trash2, Volume2, X } from "lucide-react";
import type { ClarificationReceipt, HomeworkChatContext } from "@/domain/clarifications";
import { FamilyNotes } from "./family-notes";
import { GradeReviewPreview } from "./grade-review-preview";
import { AccountLogin, useViewer, sessionChanged } from "./account-login";
import { isParent } from "@/domain/accounts";
import { CHAT_PHOTO_LIMIT, type ChatMessage, type ChatPhoto, type GradingTopic } from "@/domain/assistant";
import { prepareChatPhoto } from "@/services/chat-photo";
import { exportAssistantConversation } from "@/domain/assistant-export";
import type { LearnedMemory } from "@/domain/memory";
import { createVoiceRecording, type VoiceRecording } from "@/services/voice-recording";

class RequestError extends Error { constructor(public status: number, message: string) { super(message); } }
async function request(path: string, init: RequestInit = {}) {
  const response = await fetch(`/assistant-api/${path}`, { ...init, credentials: "same-origin", cache: "no-store" });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new RequestError(response.status, (result.error || "小助手暂时连接不上，请稍后再试。") + (/^[a-f0-9]{8}$/.test(result.requestId || "") ? `（错误编号：${result.requestId}）` : ""));
  }
  return response;
}
const formatLabel = { written: "书面", oral: "口头", reading: "朗读或阅读", other: "其他" };
const json = (value: unknown) => ({ headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) });

export function StudyAssistant({ studyDate, launcherTarget, readingMode = false, readingLogId, navigationManaged = false }: { studyDate?: string; launcherTarget?: HTMLElement | null; readingMode?: boolean; readingLogId?: string; navigationManaged?: boolean } = {}) {
  const [open, setOpen] = useState(false);
  const { viewer, accounts } = useViewer();
  const [toolsOpen, setToolsOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(studyDate || "");
  const [homeworkContext, setHomeworkContext] = useState<HomeworkChatContext | null>(null);
  const [contextNotice, setContextNotice] = useState("");
  const [status, setStatus] = useState<"checking" | "locked" | "ready" | "offline" | "insecure">("checking");
  const [code, setCode] = useState("");
  const [gradingTopic, setGradingTopic] = useState<GradingTopic | undefined>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [exportNotice, setExportNotice] = useState("");
  const [manualExport, setManualExport] = useState("");
  const [memories, setMemories] = useState<LearnedMemory[]>([]);
  const [memoryBusy, setMemoryBusy] = useState<string | null>(null);
  const [pending, setPending] = useState<"login" | "chat" | "photo" | "transcribe" | "speech" | "microphone" | "clarification" | null>(null);
  const [photos, setPhotos] = useState<ChatPhoto[]>([]);
  const [referencePhotos, setReferencePhotos] = useState<ChatPhoto[]>([]);
  const [previewPhoto, setPreviewPhoto] = useState<ChatPhoto | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const [pendingQuestion, setPendingQuestion] = useState("");
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [speech, setSpeech] = useState(false);
  const [autoRead, setAutoRead] = useState(false);
  const [reviewPhotos, setReviewPhotos] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const [audioReady, setAudioReady] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null), transcript = useRef<HTMLDivElement>(null);
  const updatedCard = useRef<string | undefined>(undefined);
  const questionInput = useRef<HTMLTextAreaElement>(null);
  const current = useRef<AbortController | null>(null), recorder = useRef<VoiceRecording | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null), audioUrl = useRef<string | null>(null), audioId = useRef<string | null>(null);
  const stopRecordingRef = useRef<() => void>(() => undefined);
  const previousViewer = useRef(viewer?.id);

  function stopAudio(clear = false) {
    audio.current?.pause(); setPlaying(null);
    if (clear) { if (audioUrl.current) URL.revokeObjectURL(audioUrl.current); audio.current = null; audioUrl.current = null; audioId.current = null; setAudioReady(null); }
  }
  function cancelWork() {
    current.current?.abort(); recorder.current?.cancel(); recorder.current = null;
    if (pendingQuestion) setInput(pendingQuestion);
    setRecording(false); setPending(null); setPendingQuestion(""); stopAudio(true);
  }
  function close() { setToolsOpen(false); setPreviewPhoto(null); cancelWork(); setOpen(false); setError(""); setCode(""); setManualExport(""); setExportNotice(""); }
  function clearPhotos() { setPhotos([]); setReferencePhotos([]); setPreviewPhoto(null); }
  const canExport = !!(messages.length || input.trim() || pendingQuestion || error || photos.length);
  function exportText() { return exportAssistantConversation({ date: selectedDate, messages, draft: input, pendingQuestion, error, draftPhotoCount: photos.length, activeMemoryIds: memories.map((m) => m.id) }); }
  async function copyConversation() {
    const text = exportText(); setManualExport("");
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(text);
      setExportNotice("已复制对话，可以粘贴到其他聊天。");
    } catch {
      setManualExport(text); setExportNotice("浏览器未允许自动复制，可长按下面的文字全选复制，或下载文本。");
    }
  }
  function downloadConversation() {
    const url = URL.createObjectURL(new Blob(["\uFEFF", exportText()], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `小步学习对话-${selectedDate || "未选日期"}.txt`;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    setExportNotice("已生成对话文本，请在浏览器中查看下载。");
  }
  function report(cause: unknown) {
    if (cause instanceof DOMException && cause.name === "AbortError") return;
    if (cause instanceof RequestError && cause.status === 401) setStatus("locked");
    setError(cause instanceof Error ? cause.message : "暂时没有完成，请再试一次。");
  }
  function controller() { current.current?.abort(); const value = new AbortController(); current.current = value; return value; }

  async function loadContext(task: AbortController, date = selectedDate || studyDate || "", fallback = false) {
    if (readingMode) { setHomeworkContext(null); return; }
    let value: HomeworkChatContext;
    try { value = await (await request("homework-context" + (date ? `?date=${date}` : ""), { signal: task.signal })).json(); }
    catch (e) { if (e instanceof RequestError && e.status === 404) { setHomeworkContext(null); return; } throw e; }
    if (fallback && !value.hasMaterials && value.availableDates.length && value.availableDates[0] !== value.date) {
      const emptyDate = value.date;
      value = await (await request(`homework-context?date=${value.availableDates[0]}`, { signal: task.signal })).json();
      if (!task.signal.aborted) setContextNotice(`${emptyDate} 暂无资料，已打开最近有记录的 ${value.date}。`);
    } else if (!task.signal.aborted) setContextNotice("");
    if (!task.signal.aborted) { setSelectedDate(value.date); setHomeworkContext(value); }
  }
  async function loadMemories(task: AbortController) {
    if (readingMode) { setMemories([]); return; }
    try { const value = await (await request("memories", { signal: task.signal })).json(); if (!task.signal.aborted) setMemories(value.items || []); }
    catch (e) { if (!(e instanceof RequestError && e.status === 404)) throw e; }
  }
  async function stopMemory(id: string) {
    if (memoryBusy || pending || recording) return;
    const task = controller(); setMemoryBusy(id); setError("");
    try { await request(`memories/${id}/revoke`, { method: "POST", ...json({}), signal: task.signal }); await loadMemories(task); }
    catch (e) { report(e); } finally { setMemoryBusy(null); }
  }
  async function check(date?: string, fallback = true) {
    setError(""); setStatus("checking");
    if (location.protocol !== "https:" && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") { setStatus("insecure"); return; }
    const task = controller();
    try { const result = await (await request("status", { signal: task.signal })).json(); if (result.authenticated) { await loadContext(task, date, fallback); await loadMemories(task); } if (!task.signal.aborted) { setSpeech(result.speech === true); setStatus(result.authenticated ? "ready" : "locked"); } }
    catch (cause) { if (!task.signal.aborted) { setStatus("offline"); report(cause); } }
  }
  useEffect(() => {
    const openHomework = (event: Event) => {
      const detail = (event as CustomEvent<{ date: string; question?: string; gradingTopic?: GradingTopic }>).detail;
      if (!/^20\d{2}-\d{2}-\d{2}$/.test(detail?.date || "")) return;
      cancelWork(); clearPhotos(); setSelectedDate(detail.date); setMessages([]); setHomeworkContext(null);
      setGradingTopic(detail.gradingTopic); setReviewPhotos(false); setToolsOpen(false);
      setInput(detail.gradingTopic ? "" : detail.question || "这一天的作业，系统还有哪些疑问？");
      if (open) void check(detail.date, false); else setOpen(true);
    };
    const openNavigation = () => setOpen(true);
    window.addEventListener("xiaobu:open-assistant", openNavigation);
    window.addEventListener("xiaobu:ask-homework", openHomework);
    return () => {window.removeEventListener("xiaobu:ask-homework", openHomework);window.removeEventListener("xiaobu:open-assistant", openNavigation);};
    // The event is only a UI navigation hint; server reloads all context and verifies every mutation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    if (studyDate) { cancelWork(); clearPhotos(); setSelectedDate(studyDate); setGradingTopic(undefined); setMessages([]); setHomeworkContext(null); setReviewPhotos(false); }
    // A photo belongs to the conversation for this homework date.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studyDate]);
  useEffect(() => { setManualExport(""); setExportNotice(""); }, [selectedDate]);
  useEffect(() => {
    if (previousViewer.current && previousViewer.current !== viewer?.id) {
      cancelWork(); clearPhotos(); setMessages([]); setGradingTopic(undefined); setInput(""); setManualExport(""); setExportNotice("");
    }
    previousViewer.current = viewer?.id;
    // Clear private conversation pictures when the account changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer?.id]);
  useEffect(() => { if (new URLSearchParams(location.search).get("assistant") === "1") setOpen(true); }, []);
  useEffect(() => {
    if (!open) return;
    dialog.current?.showModal(); void check(selectedDate || studyDate, !gradingTopic);
    return () => { current.current?.abort(); recorder.current?.cancel(); audio.current?.pause(); if (audioUrl.current) URL.revokeObjectURL(audioUrl.current); dialog.current?.close(); };
    // The dialog owns the in-flight request and microphone for its whole lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    const container = transcript.current;
    if (!container) return;
    if (updatedCard.current) {
      const card = document.getElementById("assistant-card-" + updatedCard.current);
      updatedCard.current = undefined;
      if (card && container.contains(card)) { card.scrollIntoView({ block: "nearest" }); return; }
    }
    const lastAnswer = container.querySelector<HTMLElement>(".assistant-message.assistant:last-of-type");
    // Start at the new answer, rather than hiding its beginning below a long response.
    if (!pendingQuestion && messages.at(-1)?.role === "assistant" && lastAnswer) {
      container.scrollTop += lastAnswer.getBoundingClientRect().top - container.getBoundingClientRect().top - 16;
    } else container.scrollTop = container.scrollHeight;
  }, [messages, pendingQuestion]);
  useEffect(() => {
    if (!open) return;
    const viewport = window.visualViewport;
    const resize = () => {
      dialog.current?.toggleAttribute("data-compact-viewport", (viewport?.height || window.innerHeight) < 500);
      dialog.current?.style.setProperty("--assistant-viewport-height", `${viewport?.height || window.innerHeight}px`);
      dialog.current?.style.setProperty("--assistant-viewport-top", `${viewport?.offsetTop || 0}px`);
    };
    resize(); viewport?.addEventListener("resize", resize); viewport?.addEventListener("scroll", resize);
    window.addEventListener("resize", resize);
    return () => {
      viewport?.removeEventListener("resize", resize); viewport?.removeEventListener("scroll", resize);
      window.removeEventListener("resize", resize);
    };
  }, [open]);
  useEffect(() => {
    const field = questionInput.current;
    if (field) { field.style.height = "auto"; field.style.height = `${Math.min(field.scrollHeight, 104)}px`; }
  }, [input, open, status]);
  useEffect(() => { if (!recording) return; const timer = setInterval(() => setElapsed((value) => value + 1), 1000); return () => clearInterval(timer); }, [recording]);

  async function login(event: React.FormEvent) {
    event.preventDefault(); const task = controller(); setPending("login"); setError("");
    try { await request("session", { method: "POST", ...json({ code }), signal: task.signal }); if (!task.signal.aborted) { await loadContext(task, selectedDate || studyDate, true); await loadMemories(task); setStatus("ready"); sessionChanged(); setCode(""); } }
    catch (cause) { report(cause); } finally { if (!task.signal.aborted) setPending(null); }
  }
  async function logout() {
    setToolsOpen(false); cancelWork(); const task = controller(); setPending("login"); setError("");
    try { await request("session", { method: "DELETE", signal: task.signal }); setStatus("locked"); sessionChanged(); clearPhotos(); setMessages([]); setHomeworkContext(null); setMemories([]); setInput(""); setManualExport(""); setExportNotice(""); }
    catch (cause) { report(cause); } finally { setPending(null); }
  }
  async function ask(event: React.FormEvent) {
    event.preventDefault();
    await sendQuestion();
  }
  async function sendQuestion(revisit?: ChatMessage, shortcut?: string) {
    const preview = revisit?.proposal;
    const question = preview?.userQuote || shortcut || input.trim() || (photos.length ? "请看看这张图片，帮我理解。" : "");
    if (!question || pending || recording || memoryBusy) return;
    const attached = preview ? [] : photos.length ? photos : referencePhotos;
    stopAudio(); const task = controller(); setPending("chat"); if (!preview) { setPendingQuestion(question); setInput(""); } setError("");
    let answer: ChatMessage | undefined;
    try {
      const history: { role: "user" | "assistant"; content: string }[] = []; let length = 0;
      const previous = preview ? messages.slice(0, messages.findIndex(m => m.id === revisit?.id)) : messages;
      for (const { role, content } of previous.slice(preview ? -7 : -8).reverse()) { if (length + content.length > (preview ? 11000 : 12000)) break; history.unshift({ role, content }); length += content.length; }
      if (preview) history.push({ role: "assistant", content: `这是一条尚未保存的旧预览。之前讨论的是「${preview.before.subject || ""} · ${preview.before.title}」。请依据最新清单重新核对接下来的家庭原话，目标不明确时先问清楚。` });
      const result = await (await request("chat", { method: "POST", ...json({ question, history, ...(!preview && gradingTopic ? { gradingTopic } : {}), reviewPhotos: preview ? false : reviewPhotos || (!!gradingTopic && shortcut !== "给我讲讲这道题"), ...(attached.length ? { photos: attached, photoOrigin: photos.length ? "current" : "previous" } : {}), ...(readingMode ? { readingMode: true, ...(readingLogId ? { readingLogId } : {}) } : {}), ...(preview ? { studyDate: preview.date } : homeworkContext ? { studyDate: selectedDate } : {}) }), signal: task.signal })).json();
      if (task.signal.aborted) return;
      answer = { role: "assistant", content: result.answer, id: result.id, spokenAnswer: result.spokenAnswer, proposal: result.proposal, photoReview: result.photoReview, memoriesSaved: result.memoriesSaved, memoryNotices: result.memoryNotices, gradePreview: result.gradePreview, changeStatus: gradingTopic ? undefined : result.changeStatus };
      if (preview && answer.proposal) {
        updatedCard.current = answer.id;
        setMessages(items => items.map(m => m.id === revisit?.id ? answer! : m));
      } else setMessages((items) => [...items, { role: "user" as const, content: question, ...(!preview && photos.length ? { photos } : {}) }, answer!]);
      if (!preview && photos.length) { setReferencePhotos(photos); setPhotos([]); }
      if (!preview) setReviewPhotos(false);
      if (result.activeMemories) setMemories(result.activeMemories);
      else if (result.memoriesSaved?.length) setMemories((items) => [...result.memoriesSaved, ...items.filter((m) => !result.memoriesSaved.some((n: LearnedMemory) => n.kind === m.kind && n.subject === m.subject && n.trigger === m.trigger))]);
    } catch (cause) { if (!task.signal.aborted) { if (!preview) setInput(question); report(cause); } }
    finally { if (!task.signal.aborted) { setPending(null); setPendingQuestion(""); } }
    if (answer?.id && autoRead && !task.signal.aborted) void playReply(answer.id);
  }
  async function addPhotos(files: FileList | null) {
    if (!files?.length || pending || recording) return;
    if (photos.length + files.length > CHAT_PHOTO_LIMIT) { setError("每次最多发3张图片，可以分几次问小步。"); return; }
    const task = controller(); setPending("photo"); setError("");
    try {
      const added: ChatPhoto[] = [];
      for (const file of Array.from(files)) { added.push(await prepareChatPhoto(file)); if (task.signal.aborted) return; }
      setPhotos(items => [...items, ...added]);
    } catch (cause) { if (!task.signal.aborted) report(cause); }
    finally { if (!task.signal.aborted) setPending(null); }
  }
  function photoThumbs(items: ChatPhoto[], removable = false) {
    return <div className="assistant-photo-thumbs">{items.map((photo, index) => <div className="assistant-photo-thumb" key={photo.id}><button type="button" onClick={() => setPreviewPhoto(photo)} aria-label={`放大图片${index + 1}`}><img src={`data:${photo.mimeType};base64,${photo.base64}`} alt={`对话图片${index + 1}`} /></button>{removable && <button className="assistant-photo-remove" type="button" disabled={!!pending} onClick={() => setPhotos(current => current.filter(p => p.id !== photo.id))} aria-label={`移除图片${index + 1}`}><X size={15} /></button>}</div>)}</div>;
  }
  async function saveClarification(message: ChatMessage, undo = false) {
    const id = undo ? message.receipt?.id : message.proposal?.id;
    if (!id || pending || recording) return;
    const task = controller(); stopAudio(); setPending("clarification"); setError("");
    try {
      const value = await (await request(`clarifications/${id}/${undo ? "undo" : "confirm"}`, { method: "POST", ...json({}), signal: task.signal })).json();
      if (task.signal.aborted) return;
      updatedCard.current = message.id;
      setMessages((items) => items.map((m) => m.id === message.id || (undo && m.receipt?.id === id) ? { ...m, changeStatus: undo ? "undone" : "confirmed", ...(undo ? {} : { receipt: value as ClarificationReceipt }) } : m));
      window.dispatchEvent(new Event("xiaobu:homework-updated"));
      await loadContext(task, selectedDate, false);
    } catch (cause) {
      if (task.signal.aborted) return;
      if (!undo && cause instanceof RequestError && [404, 409, 410].includes(cause.status)) {
        updatedCard.current = message.id;
        setMessages(items => items.map(m => m.id === message.id ? { ...m, proposalNotice: cause.status === 404 || cause.status === 410 ? "旧预览已失效，你的说明还在。" : cause.message } : m));
      } else report(cause);
    } finally { if (!task.signal.aborted) setPending(null); }
  }
  async function playReply(id: string) {
    if (playing === id) { stopAudio(); return; }
    setError("");
    if (audioId.current === id && audio.current) {
      try { audio.current.currentTime = 0; await audio.current.play(); setPlaying(id); } catch { setError("请再点一次播放回答，或检查设备音量。"); }
      return;
    }
    stopAudio(true); const task = controller(); setPending("speech");
    try {
      const blob = await (await request("speech", { method: "POST", ...json({ id }), signal: task.signal })).blob();
      if (task.signal.aborted) return;
      audioUrl.current = URL.createObjectURL(blob); audio.current = new Audio(audioUrl.current); audioId.current = id; setAudioReady(id);
      audio.current.onended = () => setPlaying(null);
      audio.current.onerror = () => { setPlaying(null); setError("这台设备没有成功播放语音，可以继续阅读文字回答。"); };
      try { await audio.current.play(); setPlaying(id); } catch { setError("语音已准备好，请再点一次“播放回答”。"); }
    } catch (cause) { report(cause); } finally { if (!task.signal.aborted) setPending(null); }
  }
  async function beginRecording() {
    stopAudio(true); const task = controller(); setPending("microphone"); setError("");
    try {
      const value = await createVoiceRecording(task.signal, () => stopRecordingRef.current());
      if (task.signal.aborted) { value.cancel(); return; }
      recorder.current = value; setElapsed(0); setRecording(true);
    } catch (cause) {
      if (cause instanceof DOMException && ["NotAllowedError", "SecurityError"].includes(cause.name)) setError("没有获得麦克风权限。可以在浏览器设置中允许，也可以直接打字提问。");
      else report(cause);
    } finally { if (!task.signal.aborted) setPending(null); }
  }
  async function endRecording() {
    if (!recorder.current) return;
    let blob: Blob;
    try { blob = recorder.current.stop(); } catch (cause) { report(cause); setRecording(false); recorder.current = null; return; }
    recorder.current = null; setRecording(false); const task = controller(); setPending("transcribe"); setError("");
    try {
      const result = await (await request("transcribe", { method: "POST", headers: { "Content-Type": "audio/wav" }, body: blob, signal: task.signal })).json();
      if (!task.signal.aborted) setInput(result.text);
    } catch (cause) { report(cause); } finally { if (!task.signal.aborted) setPending(null); }
  }
  stopRecordingRef.current = () => { void endRecording(); };

  const launcher = <button className="assistant-launcher" onClick={() => setOpen(true)} aria-haspopup="dialog"><MessageCircle size={22} /><span>小助手</span></button>;
  return <>
    {!navigationManaged && (launcherTarget ? createPortal(launcher, launcherTarget) : launcher)}
    {open && <dialog className="assistant-dialog" ref={dialog} aria-labelledby="assistant-title" onCancel={(event) => { event.preventDefault(); if (toolsOpen) setToolsOpen(false); else close(); }} onClick={(event) => { if (event.target === dialog.current) close(); }}>
      <header className="assistant-header"><span className="assistant-avatar assistant-rabbit"><XiaobuMascot/></span><div><h2 id="assistant-title">小步在这里</h2><p>有问题，就来问小步。</p></div><div className="assistant-header-actions"><TutorialButton topic="assistant"/>{status === "ready" && <button className="icon-button" onClick={() => setToolsOpen(!toolsOpen)} aria-label={toolsOpen ? "收起更多" : "更多功能"} aria-expanded={toolsOpen} aria-controls="assistant-settings"><MoreHorizontal size={23} /></button>}<button className="icon-button" onClick={close} aria-label="关闭小助手"><X size={23} /></button></div></header>
      {status === "checking" ? <div className="assistant-welcome" role="status"><LoaderCircle className="spin" /> 正在连接小助手…</div> : status === "insecure" ? <div className="assistant-welcome"><LockKeyhole size={32} /><h3>从安全地址打开吧</h3><p>小助手和麦克风需要安全连接。</p><a className="button primary" href="https://14.103.24.55/?assistant=1">打开 HTTPS 小助手</a></div> : status === "offline" ? <div className="assistant-welcome"><MessageCircle size={32} /><h3>暂时没有连接上</h3><p>{error}</p><button className="button primary" onClick={() => void check()}>重新连接</button></div> : status === "locked" ? accounts ? <div className="assistant-welcome"><h3>登录学习账号</h3><AccountLogin legacy onSignedIn={() => void check()} /><a href="/admin/">家长登录与管理</a></div> : <form className="assistant-welcome" onSubmit={login}><LockKeyhole size={32} /><h3>打开家里的小助手</h3><p>第一次使用，请输入家长提供的家庭访问码。<br />这台设备会记住登录状态。</p><label>家庭访问码<input type="password" inputMode="numeric" pattern="[0-9]{8}" maxLength={8} minLength={8} autoComplete="one-time-code" required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} placeholder="8位数字" /></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="button primary" disabled={!!pending}>{pending ? <LoaderCircle size={18} className="spin" /> : <Check size={18} />}打开小助手</button></form> : <>
        {readingMode && <div className="assistant-context-bar"><span>课外阅读交流</span><span>{readingLogId ? "已关联这次阅读" : "阅读与奖励使用帮助"}</span></div>}
        {homeworkContext && <div className="assistant-context-bar" inert={toolsOpen}><button onClick={() => setToolsOpen(true)} aria-label="切换作业日期"><CalendarDays size={16} /><span>{selectedDate.replaceAll("-", "/")} 的作业</span></button><span>{gradingTopic ? gradingTopic.label : reviewPhotos ? "本次重看照片" : homeworkContext.pending ? "正在整理" : homeworkContext.hasMaterials ? "已关联记录" : "暂无资料"}</span></div>}
        <section id="assistant-settings" className="assistant-settings" aria-label="小助手更多功能" hidden={!toolsOpen}>
          <div className="assistant-settings-heading"><strong>更多功能</strong><button className="text-button" onClick={() => setToolsOpen(false)}>返回对话</button></div>
        <div className="assistant-tools"><span>{homeworkContext ? "作业沟通与学习问答" : "AI 学习问答"}</span><button disabled={!canExport} onClick={() => void copyConversation()}><Copy size={15} /> 复制对话</button><button disabled={!canExport} onClick={downloadConversation}><Download size={15} /> 下载文本</button><button disabled={!!pending || recording} onClick={() => { clearPhotos(); setMessages([]); setGradingTopic(undefined); setError(""); setReviewPhotos(false); setExportNotice(""); setManualExport(""); stopAudio(true); }}><Trash2 size={15} /> 清空对话</button><button disabled={!!pending || recording} onClick={() => void logout()}><LogOut size={15} /> 退出设备</button></div>
        {(exportNotice || manualExport) && <section className="assistant-export-panel"><p role="status">{exportNotice}</p>{manualExport && <><label className="visually-hidden" htmlFor="assistant-export-text">待复制的对话文本</label><textarea id="assistant-export-text" readOnly value={manualExport} rows={4} onFocus={(e) => e.currentTarget.select()} /><button onClick={() => { setManualExport(""); setExportNotice(""); }}>收起复制文本</button></>}</section>}
        {homeworkContext && <div className="assistant-homework-context"><label>讨论的作业日期<input aria-label="讨论的作业日期" type="date" value={selectedDate} disabled={!!pending || recording} onChange={(e) => { if (e.target.value) { cancelWork(); clearPhotos(); setMessages([]); setGradingTopic(undefined); void check(e.target.value, false); } }} /></label><p>{contextNotice || (homeworkContext.hasMaterials ? `已读取这一天的作业整理记录${homeworkContext.pending ? "，后台正在更新查缺结果。" : "。"}` : "这一天还没有上传资料，可以切换日期或先问学习问题。")}</p>{!!homeworkContext.familyNotes.length && <details className="assistant-saved-notes"><summary>当前有 {homeworkContext.familyNotes.filter(n => n.current !== false).length} 项补充说明</summary><FamilyNotes notes={homeworkContext.familyNotes} action={(n) => n.canUndo && <button className="text-button" disabled={!!pending || recording} onClick={() => void saveClarification({ role: "assistant", content: "", id: `saved-note:${n.id}`, receipt: n }, true)}>撤销这次说明</button>} /></details>}</div>}
        {!!memories.length && <details className="assistant-memory-list"><summary>已学到 {memories.length} 条有用记忆</summary>{memories.map((m) => <section key={m.id}><strong>{m.summary}</strong><details><summary>查看依据</summary><p>{m.sourceQuote}</p><small>来自 {m.sourceDate} 的交流说明</small></details>{(!accounts || isParent(viewer)) && <button disabled={!!pending || recording || !!memoryBusy} onClick={() => void stopMemory(m.id)}>{memoryBusy === m.id ? "正在停用…" : "停用这条记忆"}</button>}</section>)}</details>}
          <div className="assistant-preferences">{homeworkContext?.hasMaterials && <label className="assistant-photo-option"><input type="checkbox" checked={reviewPhotos} disabled={!!pending || recording} onChange={(e) => setReviewPhotos(e.target.checked)} /> 重新查看当天照片（每次最多6页）</label>}{speech && <label><input type="checkbox" checked={autoRead} onChange={(event) => setAutoRead(event.target.checked)} /> 回答后朗读</label>}</div>
          <p className="assistant-footnote">输入框旁的图片按钮可以拍照或选图，最多3张。对话图片仅用于问答；作业归档请用“交作业”。刷新或清空对话后图片不保留。说“看看作业”或勾选重看照片，可重新查看当天照片。清单修改先确认；提炼的记忆会保留，可停用。聊天全文请先复制或下载。</p>
        </section>
        <div className="assistant-messages" inert={toolsOpen || !!previewPhoto} ref={transcript} role="log" aria-live="polite" aria-label="小助手对话">
          {!messages.length && !pendingQuestion && gradingTopic && <div className="assistant-intro">
            <h3>{gradingTopic.label}</h3><p>{gradingTopic.stem}</p>
            <div>{["帮我看看这里有没有认错", "给我讲讲这道题"].map(text =>
              <button key={text} disabled={!!pending || recording || !!input.trim()} onClick={() => void sendQuestion(undefined, text)}>{text}</button>)}</div>
          </div>}
          {!messages.length && !pendingQuestion && !gradingTopic && <div className="assistant-intro"><span className="assistant-avatar assistant-rabbit"><XiaobuMascot/></span><h3>你好，我是小步。</h3><p>不会操作、看不懂提示，或者学习卡住了，<br />都可以来问我，也可以拍张图。</p><div>{(readingMode ? ["怎样记录今天的阅读？", "我想聊聊今天读的内容", "怎样许愿和兑换奖励？"] : ["怎么上传今天的备忘录和作业？", "系统对这天的作业还有什么疑问？", "小数减法退位时，我总是弄错"]).map((question) => <button key={question} onClick={() => setInput(question)}>{question}</button>)}</div></div>}
          {messages.map((message, index) => <article key={message.id || `question-${index}`} className={`assistant-message ${message.role}`}><strong>{message.role === "user" ? "我" : "小步"}</strong><div>{message.photos?.length ? photoThumbs(message.photos) : null}{message.content}</div>{message.photoReview?.requested && <small className="assistant-photo-result">{message.photoReview.providedPages ? `本次已重新查看 ${message.photoReview.providedPages} 页照片。${message.photoReview.totalAvailablePages > message.photoReview.providedPages ? `还有 ${message.photoReview.totalAvailablePages - message.photoReview.providedPages} 页未查看。` : ""}` : "本次没有可重新查看的页面，仅依据已有整理记录回答。"}</small>}{message.memoriesSaved?.map((m) => <aside className="assistant-memory-receipt" key={m.id}><strong>{memories.some((active) => active.id === m.id) ? "这次学到的知识" : "这条记忆已停用或更新"}</strong><p>{m.summary}</p><small>可在“更多功能”的记忆列表查看依据或停用。停用后不再用于后续识别和问答。</small></aside>)}{message.memoryNotices?.map((notice, i) => <small className="assistant-memory-notice" key={i}>{notice}</small>)}{message.gradePreview && <GradeReviewPreview key={message.gradePreview.id} preview={message.gradePreview} canConfirm={isParent(viewer)} onSaved={receipt => setMessages(items => items.map(m => m.gradePreview?.id === receipt.id ? {...m,gradePreview:receipt} : m))} />}{message.proposal && <section className="assistant-proposal" id={"assistant-card-" + message.id}><h4>{message.changeStatus === "confirmed" ? "家庭说明已保存" : message.changeStatus === "undone" ? "这次说明已撤销" : "修改预览 · 尚未保存"}</h4><div><span>原清单</span><strong>{message.proposal.before.subject || "科目未定"} · {message.proposal.before.title}</strong><p>{message.proposal.before.requirement}</p><small>形式：{formatLabel[message.proposal.before.format]}</small></div><div><span>拟修改为</span><strong>{message.proposal.after.subject || "科目未定"} · {message.proposal.after.title}</strong><p>{message.proposal.after.requirement}</p><small>形式：{formatLabel[message.proposal.after.format]}</small></div><blockquote>你的说明：{message.proposal.userQuote}</blockquote>{!!message.proposal.resolves.length && <details><summary>将按这份说明处理 {message.proposal.resolves.length} 条识别疑问</summary><ul>{message.proposal.resolves.map((r, n) => <li key={n}>{r}</li>)}</ul></details>}{message.proposalNotice && <p role="status">{message.proposalNotice}</p>}{message.changeStatus === "pending" && <button className="button primary" disabled={!!pending || recording} onClick={() => void (message.proposalNotice ? sendQuestion(message) : saveClarification(message))}>{message.proposalNotice ? "用原说明重新预览" : "确认修改并重新查缺"}</button>}{message.changeStatus === "confirmed" && <><p>后台会重新关联作业。原照片和原识别结果保留。</p><button className="text-button" disabled={!!pending || recording} onClick={() => void saveClarification(message, true)}>撤销这次说明</button></>}</section>}{message.role === "assistant" && message.changeStatus === "none" && <small className="assistant-no-change">本次只作解释，未修改清单。</small>}{message.role === "assistant" && speech && message.id && <button className="assistant-read" disabled={!!pending || recording} onClick={() => void playReply(message.id!)}>{playing === message.id ? <Square size={15} /> : <Volume2 size={16} />}{playing === message.id ? "停止朗读" : audioReady === message.id ? "播放回答" : "朗读回答"}</button>}</article>)}
          {pendingQuestion && <article className="assistant-message user"><strong>我</strong><div>{photos.length ? photoThumbs(photos) : null}{pendingQuestion}</div></article>}
          {pending === "chat" && <p className="assistant-progress" role="status"><LoaderCircle size={17} className="spin" /> 小步正在想一想…<button onClick={() => { current.current?.abort(); if (pendingQuestion) setInput(pendingQuestion); setPendingQuestion(""); setPending(null); }}>停止等待</button></p>}
        </div>
        <form className="assistant-compose" inert={toolsOpen || !!previewPhoto} onSubmit={ask}>
          {error && <p className="form-error" role="alert">{error}</p>}
          {pending === "photo" && <p className="assistant-progress" role="status"><LoaderCircle size={17} className="spin" /> 正在准备图片…</p>}
          {photos.length > 0 && pending !== "chat" && <div className="assistant-photo-draft" aria-label="待发送图片">{photoThumbs(photos, true)}<small>已选 {photos.length}/3 张，可加一句想问的</small></div>}
          {!photos.length && !!referencePhotos.length && <p className="assistant-compose-hint assistant-photo-context"><ImagePlus size={14} /> 继续参考上次的 {referencePhotos.length} 张图<button type="button" disabled={!!pending || recording} onClick={() => setReferencePhotos([])} aria-label="不再参考上次图片"><X size={14} /></button></p>}
          {recording && <div className="assistant-recording" role="status"><Mic size={17} /> 正在听你说 · {Math.min(elapsed, 30)} / 30秒<button type="button" onClick={() => void endRecording()}><Square size={14} /> 结束录音</button></div>}
          {pending === "transcribe" && <p className="assistant-progress" role="status"><LoaderCircle className="spin" size={17} /> 正在把语音变成文字…</p>}
          {pending === "speech" && <p className="assistant-progress" role="status"><LoaderCircle className="spin" size={17} /> 正在准备朗读…</p>}
          {reviewPhotos && <p className="assistant-compose-hint">本次会重看当天照片<button type="button" onClick={() => setReviewPhotos(false)} aria-label="取消重看照片"><X size={14} /></button></p>}
          <input ref={photoInput} className="visually-hidden" type="file" accept="image/*" multiple aria-label="选择对话图片" tabIndex={-1} onChange={event => { void addPhotos(event.target.files); event.currentTarget.value = ""; }} />
          <div className="assistant-compose-row">
            <button className="button secondary assistant-add-photo" type="button" aria-label="添加图片，可拍照或从相册选择" title="拍照或选择图片" disabled={!!pending || recording || photos.length >= CHAT_PHOTO_LIMIT} onClick={() => photoInput.current?.click()}><ImagePlus size={21} /></button>
            {speech && <button className="button secondary assistant-mic" type="button" aria-label={recording ? "结束录音" : "语音提问"} title={recording ? "结束录音" : "语音提问"} disabled={!!pending} onClick={() => recording ? void endRecording() : void beginRecording()}>{pending === "microphone" ? <LoaderCircle size={20} className="spin" /> : recording ? <Square size={19} /> : <Mic size={21} />}</button>}
            <label className="visually-hidden" htmlFor="assistant-question">想问小步的问题</label><textarea id="assistant-question" ref={questionInput} rows={1} value={input} onChange={(event) => setInput(event.target.value)} maxLength={1200} placeholder={gradingTopic ? "你发现了什么？直接告诉小步…" : "问问小步…"} disabled={!!pending || recording} />
            <button className="button primary assistant-send" type="submit" aria-label="发送问题" title="发送问题" disabled={!!pending || recording || !!memoryBusy || (!input.trim() && !photos.length)}><Send size={20} /><span>发送</span></button>
          </div>
        </form>
        {previewPhoto && <section className="assistant-photo-preview" aria-label="图片预览"><button type="button" onClick={() => setPreviewPhoto(null)} autoFocus><X size={20} /> 返回对话</button><div><img src={`data:${previewPhoto.mimeType};base64,${previewPhoto.base64}`} alt="放大的对话图片" /></div></section>}
      </>}
    </dialog>}
  </>;
}
