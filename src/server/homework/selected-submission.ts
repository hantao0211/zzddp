import type { HomeworkStore } from "./store";
import { ExtractedHomeworkSchema, type DailyReport } from "../../domain/homework";
import { selectedReportConclusion, type SelectedPage } from "../../domain/selected-submission";
import { resolveUploadTarget } from "./upload-target";

export function selectedSubmissionReport(store: HomeworkStore, report: DailyReport) {
  const pages: SelectedPage[] = [];
  for (const upload of store.uploads(report.date).filter(u => u.kind === "homework" && u.result)) {
    const target = resolveUploadTarget(store, upload.id);
    if (!target) continue;
    for (const observed of ExtractedHomeworkSchema.parse(JSON.parse(upload.result!)).pages) {
      const page = store.page(observed.fileId), file = page && store.file(page.file_id);
      if (page && file?.stored && file.upload_id === upload.id) pages.push({ ...observed, page: page.number, target });
    }
  }
  return selectedReportConclusion(report, pages, store.writtenCompletionEnabled);
}
