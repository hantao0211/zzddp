import { mayInferScope } from "./inferred-scope";
import type { DailyReport, ExtractedHomework, UploadTarget } from "./homework";
import { WRITTEN_COMPLETION_VERSION } from "./written-completion";

type Task = DailyReport["tasks"][number];
export type SelectedPage = ExtractedHomework["pages"][number] & { page: number; target: UploadTarget };
import { isCorrectionSignTask } from "./submission-policy";
export { isCorrectionSignTask, SELECTED_SUBMISSION_POLICY } from "./submission-policy";

/** Only identification doubts are discarded. A concrete content conflict or missing answer stays. */
export function identityOnlyConcern(text: string) {
  if (/科目不符|内容不符|明确不符|选错|错传|应为.{0,12}实际|(?:答案|作答|题干|词条|单词|汉字|词语|第.{0,6}题).{0,12}(?:裁切|切掉|遮挡|模糊|看不清|不完整|缺失)|缺页|漏拍.{0,8}页|缺少.{0,8}(?:页|题|作答|订正|签字)|第.{0,8}页.{0,8}缺失|未完成|未填写|未作答|漏做|未订正|未签/u.test(text)) return false;
  return /(?:本子|本册|书名|教材名|封面|本号|本编号|本子编号|几号本|哪一本|哪本|2[#＃号]本|页眉|签名人身份)/u.test(text)
    || /(?:无法|不能|尚未|未能).{0,12}(?:确认|确定|判断|核实).{0,15}(?:归属|对应关系|属于|题号顺序)/u.test(text)
    || /(?:归属|对应关系|属于|题号顺序).{0,18}(?:不明|不清|不确定|无法确认|尚未判清)/u.test(text)
    || /照片已交到本项，但内容与要求是否对应仍未判清/u.test(text);
}

function pageNumbers(text: string) {
  const range = text.match(/^\s*(?:P(?:age)?\.?\s*)?(\d{1,4})(?:\s*[-—–至到、]\s*(\d{1,4}))?\s*$/iu);
  if (!range) return null;
  const first = Number(range[1]), last = Number(range[2] || range[1]);
  return last >= first && last - first < 30 ? Array.from({ length: last - first + 1 }, (_, i) => first + i) : null;
}
function requiredPages(task: Task) {
  const explicit = `${task.title} ${task.requirement}`.match(/\bP(?:age)?\.?\s*(\d+(?:\s*[-—–至到、]\s*\d+)?)|第\s*(\d+(?:\s*[-—–至到、]\s*\d+)?)\s*页/iu);
  return explicit ? pageNumbers(explicit[1] || explicit[2]) : null;
}
function feature(pages: SelectedPage[], pattern: RegExp) {
  for (const page of pages) {
    for (const clause of page.content.split(/[。；;\n]/u)) {
      if (!pattern.test(clause) || /未见|没有|未写|未填|未签|未订正|尚未|未能|无法|不能确认|不清楚|看不清|模糊|[_＿]{2,}|待填写|仅有.{0,5}签名栏|为空|空白|待签|需签|尚待|缺少|疑似签名|可能为签名/u.test(clause)) continue;
      return { fileId: page.fileId, page: page.page, excerpt: clause.trim().slice(0, 180) };
    }
  }
  return null;
}

/** Interpretation of existing, current-target observations; never edits originals or calls AI. */
export function selectedReportConclusion(report: DailyReport, pages: SelectedPage[], completionEnabled = true): DailyReport {
  const removed = new Set<string>();
  const tasks = report.tasks.map(original => {
    // Stale memo/report versions must not gain a current destination's meaning.
    const assigned = pages.filter(p => p.target.taskId === original.id && p.target.subject === original.subject && p.target.title === original.title && p.target.requirement === original.requirement && p.target.format === original.format);
    if (!assigned.length) return original.selectedSubmission ? { ...original, selectedSubmission: undefined, writtenCompletion: original.writtenCompletion?.reason.startsWith("已看到订正内容和手写签名") ? null : original.writtenCompletion } : original;
    const required = requiredPages(original), observed = assigned.flatMap(p => pageNumbers(p.printedPage || "") || []);
    const wrongPage = required && observed.length && !observed.some(n => required.includes(n));
    const wrongSubject = assigned.some(p => p.subject && p.subject !== original.subject);
    const contentConflict = original.missing.some(text => !identityOnlyConcern(text) && /内容不符|科目不符|明显不符|选错|错传|页码不符/u.test(text));
    if (wrongPage || wrongSubject || contentConflict) return { ...original, selectedSubmission: undefined, coverage: "uncertain" as const, missing: [...new Set([...original.missing, wrongSubject ? "指定作业与照片科目明显不符，请检查所选照片。" : wrongPage ? "照片上可见的页码与指定作业页码不符，请检查所选照片。" : "照片内容与这项作业有明确冲突，请查看已有具体说明。"])] };
    const readable = assigned.filter(p => p.readable);
    if (readable.length !== assigned.length) return { ...original, selectedSubmission: undefined, coverage: "uncertain" as const, missing: [...new Set([...original.missing, "照片有关键内容看不清，暂时无法检查；不需要补拍封面。"])] };
    // A routing safeguard is an internal exclusion, not evidence that the child missed work.
    const missing = original.missing.filter(text => { if (!identityOnlyConcern(text) && text !== "指定交给其他作业的照片未用作本项依据。") return true; removed.add(text); return false; });
    if (required && observed.length && required.some(n => !observed.includes(n))) missing.push(`明确要求的第${required.filter(n => !observed.includes(n)).join("、")}页尚未对应。`);
    // With no explicit page/count requirement, the selected photos define the inferred scope.
    // Do not borrow unrelated same-subject worksheets from automatic matching.
    const sourceEvidence = mayInferScope(original) ? original.evidence.filter(e => assigned.some(p => p.fileId === e.fileId)) : original.evidence;
    const scopeChanged = sourceEvidence.length !== original.evidence.length;
    const evidence = sourceEvidence.map(e => assigned.some(p => p.fileId === e.fileId) && /内容对应尚未判清/u.test(e.excerpt) ? { ...e, excerpt: "上传时已明确选择这项作业，按指定归属接收。" } : e);
    for (const page of assigned) if (!evidence.some(e => e.fileId === page.fileId)) evidence.push({ fileId: page.fileId, page: page.page, excerpt: "上传时已明确选择这项作业，按指定归属接收。" });
    const task: Task = { ...original, ...(scopeChanged ? {writtenCompletion:null,inferredScope:undefined} : {}), evidence, missing: [...new Set(missing)], coverage: missing.length ? original.coverage === "complete" ? "partial" : original.coverage : "complete", selectedSubmission: { version: "selected-destination-v1", pageIds: assigned.map(p => p.fileId), note: "已按上传时指定的作业接收并做基本检查，没有明显归属冲突；不需要补拍封面或本子编号。" } };
    if (task.writtenCompletion?.status === "unclear" && task.writtenCompletion.parts.length && task.writtenCompletion.parts.every(p=>p.status==="answered") && !task.missing.length && original.missing.length && original.missing.every(identityOnlyConcern) && (identityOnlyConcern(task.writtenCompletion.reason) || task.writtenCompletion.reason === "指定作业范围的照片还不完整，不能判断整项是否写完。") && !assigned.some(p=>p.uncertainties.some(s=>/(?:题干|作答|答案).{0,15}(?:裁切|遮挡|模糊|看不清)/u.test(s)))) task.writtenCompletion = {...task.writtenCompletion,status:"done",reason:"已按指定作业接收，已检查的作答均有填写；看不到本子编号不影响完成判断，答案对错另看批改。"};
    if (completionEnabled && isCorrectionSignTask(task) && !task.writtenCompletion && !task.missing.length && !readable.some(p=>/未订正|未签名|未签字|漏订正|漏签|(?:订正|签名|签字).{0,8}(?:为空|空白|未完成)|(?:尚需|还需|待).{0,4}(?:订正|签名|签字)/u.test(p.content))) {
      const correction = feature(readable, /(?:订正|改正)(?:行|处|内容|词语|为|[:：])|(?:底部|页底|下方|已|有|可见).{0,20}订正/u);
      const signature = feature(readable, /手写.{0,15}(?:签名|签字)|(?:签名|签字).{0,12}(?:手写|黑笔|已签)|(?:有|可见|写有).{0,10}(?:签名|签字)|已签(?:名|字)/u);
      if (correction && signature) task.writtenCompletion = { version: WRITTEN_COMPLETION_VERSION, status: "done", reason: "已看到订正内容和手写签名，按“订正并签字”记为已完成；不要求验证本子编号或签名人身份，答案对错另看批改。", parts: [{ label: "订正", status: "answered", evidence: correction }, { label: "签字", status: "answered", evidence: signature }] };
    }
    return task;
  });
  const linked = new Set(tasks.flatMap(t => t.selectedSubmission?.pageIds || []));
  return { ...report, tasks, uncertainties: report.uncertainties.filter(s => !removed.has(s)), unassigned: report.unassigned.filter(p => !linked.has(p.fileId)) };
}
