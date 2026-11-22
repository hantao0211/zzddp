import type { DailyReport, ExtractedHomework } from "./homework";
import { taskSubmission } from "./task-submission";

type Task = DailyReport["tasks"][number];
export const SUBMITTED_SCOPE_POLICY = "要求未明确词数、页数或题号时，依据已匹配且清晰的作业推断检查范围，说明推断依据；只检查该范围内实际要求作答的内容。不因不知道默写词语总数、L19简称含义，或页面末尾留白而假设还有额外内容、续页；无需让孩子补填这些细节。有明确词数/页码/题号时仍以明确要求为准；确有题目被裁切、看不清、可定位的缺页或空题时具体指出。推断检查范围不代表补造老师的真实要求、标准答案或已掌握知识。";

/** A lesson identifier is enough context to match a worksheet, but is not a word count or page list. */
export function mayInferScope(task: Pick<Task,"title"|"requirement"|"format">) {
  if (taskSubmission(task) !== "written") return false;
  const text = `${task.title} ${task.requirement}`.replace(/旁注[“"](?:已完成|全对)[^”"]*[”"]/gu, "").replace(/(?:未写明|未说明|未注明|未明确|未指定|没有说明|没有明确|不清楚)[^，。；;\n]*/gu, "");
  const n="[0-9一二三四五六七八九十百两]+",range=`${n}(?:\\s*[-—–至到、]\\s*${n})?`;
  return !new RegExp(`\\bP(?:age)?\\.?\\s*[0-9]+|第\\s*${range}\\s*(?:页|题)|[0-9]+(?:\\s*[-—–至到、]\\s*[0-9]+)?\\s*页|${range}\\s*(?:个?词|个?字|遍)|(?:单词|词语|生字|题目)\\s*${n}\\s*(?:个|道)|${n}\\s*(?:个|道)\\s*(?:单词|词语|生字|题)|(?:完成|共|做|前)\\s*${n}\\s*题`,"iu").test(text);
}

/** Drop hypothetical scope gaps only; a real blank answer, crop, mismatch or unreadable page stays actionable. */
export function speculativeScopeConcern(text: string) {
  if (/裁切|截断|遮挡|模糊|看不清|无法辨认|内容不符|科目不符|错传|不匹配|对应尚未|缺少第|缺失第|漏拍第|指定.{0,15}未拍|第.{0,8}题.{0,8}(?:未作答|未填写|未写|没有作答)/u.test(text)) return false;
  return /未写明|未说明|未注明|未明确|未指定|不明确|所指不明|是否|可能|不确定|无法确认|无法核对|范围未明|不足以确认覆盖全部要求/u.test(text)
    && /内容|词|数量|个数|范围|要求|页|课|编号|L\s*\d+/iu.test(text);
}

export function inferTaskScope(task: Task, pages: ExtractedHomework["pages"]): Task {
  if (!mayInferScope(task) || !task.evidence.length || !task.writtenCompletion?.parts.length) return task;
  const ids = [...new Set(task.evidence.map(e => e.fileId))];
  if (ids.length > 6) return task;
  const matched = ids.map(id => pages.find(p => p.fileId === id));
  if (matched.some(p => !p?.readable || p.subject !== task.subject) || task.evidence.some(e => /内容对应尚未判清|交给.+但/u.test(e.excerpt))) return task;
  if (task.writtenCompletion.parts.some(p => !ids.includes(p.evidence.fileId))) return task;
  const concerns = task.missing.filter(text => !speculativeScopeConcern(text));
  if (concerns.length || (task.coverage !== "complete" && !task.missing.length)) return task;
  const parts = task.writtenCompletion.parts;
  if (parts.every(p=>p.status==="answered") && /裁切|遮挡|模糊|看不清|无法辨认|未完成逐题检查|超过.{0,8}页/u.test(task.writtenCompletion.reason)) return task;
  const status = parts.some(p => p.status === "blank") ? "incomplete" : parts.some(p => p.status === "unclear") ? "unclear" : "done";
  const printed = [...new Set(matched.flatMap(p => p?.printedPage ? [p.printedPage] : []))];
  const description = /家默|默写|听写/u.test(task.title) ? "按已上传照片中的词语默写和订正内容检查。" : `按已上传${printed.length ? `第${printed.join("、")}页` : "照片中"}的作业内容检查。`;
  const note = /家默|默写|听写/u.test(task.title) ? "备忘录未写明具体词语和数量，已根据对应默写作业推断检查范围，不要求补填总词数。" : "备忘录未写明具体范围或简称含义，已根据对应练习推断；不因页末留白而要求证明没有续页。";
  return {...task,coverage:"complete",missing:[],inferredScope:{version:"submitted-work-v1",description,note,pageIds:ids},writtenCompletion:{...task.writtenCompletion,status,reason:status === "done" ? `按已传作业推断范围，已检查${parts.length}处作答，均有填写；答案对错另看批改。` : status === "incomplete" ? "已按所传作业推断范围，仍有明确空题，具体位置见下方。" : "已按所传作业推断范围，仍有作答看不清，具体位置见下方。"}};
}
export function inferredReportScope(report: DailyReport, pages: ExtractedHomework["pages"]): DailyReport {
  const tasks=report.tasks.map(task=>inferTaskScope(task,pages));
  const resolved=new Set(report.tasks.flatMap((task,i)=>task.missing.filter(s=>!tasks[i].missing.includes(s))));
  return {...report,tasks,uncertainties:report.uncertainties.filter(s=>!resolved.has(s))};
}
