"use client";
import { useState } from "react";
import { CircleHelp, ClipboardList, Download, Image, Maximize2, Sparkles } from "lucide-react";
import type { HomeworkSnapshot } from "@/domain/homework";
import type { HomeworkSummaryRow } from "@/domain/homework-summary";
import { homeworkTaskDetail, type TaskEvidencePhoto } from "@/domain/homework-task-detail";
import { HomeworkPhoto } from "./homework-photo";
import { pagePhotoUrl } from "@/services/homework-photo";
import { TaskCompleteButton } from "./task-complete-button";
import { StatusIndicator } from "./status-indicator";

function EvidencePhotos({ photos }: { photos: TaskEvidencePhoto[] }) {
  const [expanded, setExpanded] = useState(false);
  return <><div className="task-evidence-photos">{(expanded ? photos : photos.slice(0, 4)).map((photo, i) => <figure key={photo.pageId}>
    <a className="task-photo-preview" href={`/assistant-api/learning/pages/${encodeURIComponent(photo.pageId)}`} target="_blank" rel="noopener noreferrer" aria-label={`查看照片${i + 1}大图`}><HomeworkPhoto pageId={photo.pageId} size="thumb" alt={`照片${i + 1} · ${photo.name} 第${photo.number}页`} /><span><Maximize2 size={15} aria-hidden="true" />查看大图</span></a>
    <figcaption><strong>照片{i + 1} · 原件第{photo.number}页</strong>{photo.excerpts.map((text, n) => <p key={n}>{text}</p>)}{photo.issues.map((text, n) => <p className="task-photo-issue" key={n}>{text}</p>)}<div className="task-photo-downloads"><a className="text-button" href={pagePhotoUrl(photo.pageId,"screen",true)}><Download size={15} aria-hidden="true" />下载图片</a><a className="text-button" aria-label="下载原件" href={`/assistant-api/learning/files/${encodeURIComponent(photo.fileId)}`}>原件</a></div></figcaption>
  </figure>)}</div>{photos.length > 4 && <button className="text-button task-evidence-more" onClick={() => setExpanded(!expanded)}>{expanded ? "收起更多照片" : `展开其余${photos.length - 4}张照片`}</button>}</>;
}
export function HomeworkTaskStatus({ snapshot, row, allUploads, saved }: { snapshot: HomeworkSnapshot; row: HomeworkSummaryRow; allUploads: () => void; saved?: () => Promise<void> }) {
  const task = snapshot.report?.tasks.find(t => t.id === row.id);
  const detail = task ? homeworkTaskDetail(snapshot, task) : null;
  return <div className="task-status-body"><h3>{row.subject} · {row.displayTitle||row.title}</h3>{row.displayTitle&&<p className="hw-secondary">备忘录原记：{row.title}</p>}
    <div className="task-status-badges"><StatusIndicator kind={row.selfTask ? "neutral" : row.photo.tone === "good" || row.photo.text === "已关联" ? "received" : "uncertain"}>照片 · {row.photo.text}</StatusIndicator><StatusIndicator kind={row.activity.tone === "good" ? "done" : ["未做", "未做完"].includes(row.activity.text) ? "blank" : "uncertain"}>{row.activity.text}</StatusIndicator></div>
    {row.selfTask && row.completionToken && saved && <TaskCompleteButton row={row} date={snapshot.date} saved={saved} />}
    {(task?.inferredScope||task?.inferredMeaning)&&<section className="task-inferred-scope" aria-label="推断的作业要求"><strong><Sparkles size={17} aria-hidden="true"/>根据作业推断</strong>{task?.inferredMeaning&&<p>{task.inferredMeaning.description}</p>}{task?.inferredScope&&<p>{task.inferredScope.description}</p>}<details><summary>推断依据</summary>{task?.inferredMeaning?.evidence.map((e,i)=><p key={i}>页面写有：{e.excerpt}</p>)}{task?.inferredScope&&<p>{task.inferredScope.note}</p>}</details></section>}
    {detail && <details className="task-status-requirement"><summary><ClipboardList size={17} aria-hidden="true" />系统理解的作业要求</summary><p>{detail.requirement}</p></details>}
    <section className="study-status-explanation"><p>{row.photoDetail}</p>
      {!!detail?.concerns.length && <div className="task-status-concerns"><h4><CircleHelp size={19} aria-hidden="true" />AI记录的具体疑点</h4><ul>{detail.concerns.map((text, i) => <li key={i}>{text}</li>)}</ul><p>这是AI的判断依据，不等于确实缺页或作业没做。先看下面对应的照片，不必重复上传。</p></div>}
      {detail && !detail.concerns.length && row.photo.tone !== "good" && <p className="task-status-no-reason">这次记录没有说明具体缺哪一页，不能据此要求补拍。可查看已上传照片，或让小步说明。</p>}
    </section>
    {detail && <section className="task-status-evidence" aria-label="这项作业对应的照片"><h4><Image size={19} aria-hidden="true" />{row.selfTask ? "补充照片" : "已对应照片"} · {detail.homework.photos.length}张</h4>{detail.homework.photos.length ? <EvidencePhotos key={row.id} photos={detail.homework.photos} /> : <p>{row.selfTask ? "这项不需要上传照片。" : "暂未对应到可查看的作业照片，不表示没有上传。"}</p>}{detail.homework.unavailable > 0 && <p role="status">有{detail.homework.unavailable}条照片依据暂时无法定位，系统没有把它当成缺交，请查看当天上传。</p>}</section>}
    <section className="study-status-explanation task-status-completion"><h4>完成情况 · {row.activity.text}</h4><p>{row.activityDetail}</p>{task?.reviewActivity?.status === "marked" && <details className="task-status-requirement"><summary>查看学习痕迹依据</summary><p>{task.reviewActivity.reason}</p></details>}{!!detail?.parts.length && <ul>{detail.parts.map((part, i) => <li key={i}><strong>{part.label}</strong> · {part.status === "blank" ? "未作答" : "AI未看清"}{detail.homework.photos.some(p => p.pageId === part.evidence.fileId) && <a href={`/assistant-api/learning/pages/${encodeURIComponent(part.evidence.fileId)}`} target="_blank" rel="noopener noreferrer">查看这一题照片</a>}</li>)}</ul>}</section>
    {!!detail?.memo.photos.length && <details className="task-status-memo"><summary><ClipboardList size={17} aria-hidden="true" />查看备忘录原文和照片</summary><EvidencePhotos key={row.id} photos={detail.memo.photos} /></details>}
    <button className="text-button task-status-all" onClick={allUploads}><Image size={17} aria-hidden="true" />查看当天全部上传</button>
  </div>;
}
