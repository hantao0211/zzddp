import type { HomeworkSnapshot } from "./homework";
import { needsWrittenCompletionUpdate } from "./written-completion";
import { needsReviewTraceUpdate } from "./review-policy";

type State = { text: string; tone: "good" | "attention" | "muted" };
export type HomeworkSummaryRow = { id: string; title: string; subject: string; photo: State; activity: State; photoDetail: string; activityDetail: string; updating?: boolean };
export function homeworkSummary(snapshot: HomeworkSnapshot | null) {
  if (!snapshot?.uploads.length) return null;
  const receipt = (kind: "memo" | "homework") => {
    const uploads = snapshot.uploads.filter(u => u.kind === kind);
    const count = uploads.flatMap(u => u.files).filter(f => f.stored).length;
    return count ? `已上传${count}份` : uploads.length ? "上传未完成" : "未上传";
  };
  const hasPhotos = snapshot.uploads.some(u => u.kind === "homework" && u.files.some(f => f.stored));
  const rows: HomeworkSummaryRow[] = (snapshot.report?.tasks || []).map(task => {
    const photo: State = { text: { complete: "已收到", partial: "还缺照片", none: hasPhotos ? "未匹配" : "未交照片", uncertain: "待匹配" }[task.coverage], tone: task.coverage === "complete" ? "good" : "attention" };
    let activity: State = { text: "尚未判断", tone: "muted" };
    if (needsReviewTraceUpdate(task, snapshot.reviewPolicy)) activity = { text: "需重新整理", tone: "attention" };
    else if (task.reviewActivity?.status === "marked") activity = task.coverage === "complete" ? { text: "已做", tone: "good" } : { text: "有痕迹，缺页", tone: "attention" };
    else if (task.reviewActivity?.status === "blank") activity = { text: "未做", tone: "attention" };
    else if (task.reviewActivity?.status === "unclear") activity = { text: "AI未判清", tone: "attention" };
    if (task.writtenCompletion) {
      const value = task.writtenCompletion;
      activity = { text: value.status === "done" ? "已做完" : value.status === "incomplete" ? value.parts.every(p => p.status === "blank") ? "未做" : "未做完" : value.status === "missing" ? "缺照片" : "AI未判清", tone: value.status === "done" ? "good" : "attention" };
    } else if (needsWrittenCompletionUpdate(task, snapshot.writtenCompletionEnabled)) activity = { text: "需检查", tone: "attention" };
    const photoDetail = task.coverage === "complete" ? "已收到与这项作业对应的照片。照片收到与作业做完、答案正确是不同的判断。" : task.coverage === "partial" ? "这项作业的照片只对应到一部分，还需要补齐相关页面。" : hasPhotos ? "当天已经有作业照片，但AI还没把照片与这一项对应起来。可能是内容不一致、页码不清，或备忘录识别有误；不代表孩子没做，也不必重复上传所有照片。" : "还没有收到这一天的作业照片。做好后点“交作业”拍照上传，系统会自动对应到清单；这不表示孩子没做。";
    let activityDetail = task.writtenCompletion?.reason || task.reviewActivity?.reason || (task.format === "written" ? "还没有生成这项作业的作答检查结果。对应照片整理完成后，系统会自动检查，不需要家长逐题核对。" : "这项作业尚无自动完成判断。没有额外书面要求时，不需要为了证明完成而补写笔记。可以向小步说明实际要求。");
    if ((task.format === "written" || task.reviewActivity) && (task.coverage === "none" || task.coverage === "uncertain")) {
      activity = { text: hasPhotos ? "等匹配" : "等照片", tone: "muted" };
      activityDetail = hasPhotos ? "还没有对应到可检查的照片，所以暂时不能判断有没有做完。先检查清单是否识别正确；正确的照片可能已经上传，无需一律重传。" : "对应的作业照片还没收到，所以系统暂时不能检查是否做完；不是要求家长来核对。";
    }
    const updating=!!snapshot.pending&&!snapshot.processing?.memo&&!!snapshot.processing?.subjects.includes(task.subject);
    return { id: task.id, title: task.title, subject: task.subject, photo, activity, photoDetail:photoDetail+(updating?" 新照片还在整理，当前显示上次结果。":""), activityDetail:activityDetail+(updating?" 新照片还在整理，当前显示上次结果。":""), updating };
  });
  for (const [index, task] of (snapshot.report?.unclassified || []).entries()) rows.push({ id: `unclassified-${index}`, title: task.title, subject: "待识别", photo: { text: "未对应好", tone: "attention" }, activity: { text: "先确认科目", tone: "muted" }, photoDetail: "这项备忘录的科目还没识别清楚，因此还没对应照片。可以直接修改科目和作业要求。", activityDetail: "先把这项作业的科目和要求说清楚，系统才能对应照片并检查。" });
  return { memo: receipt("memo"), homework: receipt("homework"), rows, empty: snapshot.pending ? "AI正在整理，完成后会显示每项作业。" : !snapshot.uploads.some(u => u.kind === "memo") ? "补一张备忘录，就能列出各项作业。" : "AI还没整理出清单，已上传的照片会保留。" };
}
