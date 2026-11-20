import type { HomeworkSnapshot } from "./homework";
import { needsWrittenCompletionUpdate } from "./written-completion";
import { needsReviewTraceUpdate } from "./review-policy";

type State = { text: string; tone: "good" | "attention" | "muted" };
export type HomeworkSummaryRow = { id: string; title: string; subject: string; photo: State; activity: State };
export function homeworkSummary(snapshot: HomeworkSnapshot | null) {
  if (!snapshot?.uploads.length) return null;
  const receipt = (kind: "memo" | "homework") => {
    const uploads = snapshot.uploads.filter(u => u.kind === kind);
    const count = uploads.flatMap(u => u.files).filter(f => f.stored).length;
    return count ? `已上传${count}份` : uploads.length ? "上传未完成" : "未上传";
  };
  const rows: HomeworkSummaryRow[] = (snapshot.report?.tasks || []).map(task => {
    const photo: State = { text: { complete: "已收到", partial: "还缺照片", none: "未找到", uncertain: "未对应好" }[task.coverage], tone: task.coverage === "complete" ? "good" : "attention" };
    let activity: State = { text: "尚未判断", tone: "muted" };
    if (needsReviewTraceUpdate(task, snapshot.reviewPolicy)) activity = { text: "需重新整理", tone: "attention" };
    else if (task.reviewActivity?.status === "marked") activity = task.coverage === "complete" ? { text: "已做", tone: "good" } : { text: "有痕迹，缺页", tone: "attention" };
    else if (task.reviewActivity?.status === "blank") activity = { text: "未做", tone: "attention" };
    else if (task.reviewActivity?.status === "unclear") activity = { text: "AI未判清", tone: "attention" };
    if (task.writtenCompletion) {
      const value = task.writtenCompletion;
      activity = { text: value.status === "done" ? "已做完" : value.status === "incomplete" ? value.parts.every(p => p.status === "blank") ? "未做" : "未做完" : value.status === "missing" ? "缺照片" : "AI未判清", tone: value.status === "done" ? "good" : "attention" };
    } else if (needsWrittenCompletionUpdate(task, snapshot.writtenCompletionEnabled)) activity = { text: "需检查", tone: "attention" };
    const updating: State = { text: "整理中", tone: "muted" };
    return { id: task.id, title: task.title, subject: task.subject, photo: snapshot.pending ? updating : photo, activity: snapshot.pending ? updating : activity };
  });
  for (const [index, task] of (snapshot.report?.unclassified || []).entries()) rows.push({ id: `unclassified-${index}`, title: task.title, subject: "待识别", photo: { text: snapshot.pending ? "整理中" : "未对应好", tone: "attention" }, activity: { text: "尚未判断", tone: "muted" } });
  return { memo: receipt("memo"), homework: receipt("homework"), rows, empty: snapshot.pending ? "AI正在整理，完成后会显示每项作业。" : !snapshot.uploads.some(u => u.kind === "memo") ? "补一张备忘录，就能列出各项作业。" : "AI还没整理出清单，已上传的照片会保留。" };
}
