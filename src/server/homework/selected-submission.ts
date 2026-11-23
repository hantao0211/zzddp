import { existingWrittenInspection, type WrittenPageInput } from "./written-cache";
import { evaluateWrittenInspection, isWrittenTask } from "../../domain/written-completion";
import { isCorrectionSignTask } from "../../domain/submission-policy";
import type { HomeworkStore } from "./store";
import { ExtractedHomeworkSchema, type DailyReport } from "../../domain/homework";
import { selectedReportConclusion, type SelectedPage } from "../../domain/selected-submission";
import { resolveUploadTarget } from "./upload-target";

export function selectedSubmissionReport(store: HomeworkStore, report: DailyReport) {
  const pages: SelectedPage[] = [];
  const known = new Map<string, WrittenPageInput>();
  for (const upload of store.uploads(report.date).filter(u => u.kind === "homework" && u.result)) {
    const target = resolveUploadTarget(store, upload.id);
    for (const observed of ExtractedHomeworkSchema.parse(JSON.parse(upload.result!)).pages) {
      const page = store.page(observed.fileId), file = page && store.file(page.file_id);
      if (page && file?.stored && file.upload_id === upload.id) {
        known.set(page.id,{fileId:page.id,page:page.number,printedPage:observed.printedPage});
        if (target) pages.push({ ...observed, page: page.number, target });
      }
    }
  }
  const projected = selectedReportConclusion(report, pages, store.writtenCompletionEnabled);
  if (!store.writtenCompletionEnabled) return projected;
  return {...projected,tasks:projected.tasks.map(task => {
    if (!task.selectedSubmission || !isWrittenTask(task) || isCorrectionSignTask(task) || task.writtenCompletion && task.writtenCompletion.status !== "unclear") return task;
    const ids = new Set(task.evidence.map(e => e.fileId));
    const batch = [...known.values()].filter(page => ids.has(page.fileId));
    if (batch.length !== ids.size) return task;
    const cached = existingWrittenInspection(store,task,batch);
    return cached ? {...task,writtenCompletion:evaluateWrittenInspection(cached,task.coverage)} : task;
  })};
}
