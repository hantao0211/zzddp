import type { DailyReport, ExtractedHomework } from "./homework";
import { taskSubmission } from "./task-submission";
import { SELECTED_SUBMISSION_POLICY, isCorrectionSignTask } from "./submission-policy";
import { inferTaskMeaning } from "./inferred-meaning";

type Task = DailyReport["tasks"][number];
export const SUBMITTED_SCOPE_POLICY = "作业名称和具体要求中的明确排除项同样限定作业范围。名称中的‘除默写部分’等说明必须执行，排除项不计入必做、缺交或空题。要求未明确词数、页数或题号时，依据已匹配且清晰的作业推断检查范围，说明推断依据；只检查该范围内实际要求作答的内容。遇到L19等简称，主动结合对应页面课号、课题、题目和页码理解具体含义，不把简称当成无法理解或仅仅忽略；明确区分推断和原文，互相矛盾的线索不能硬凑。没有指定词表时，学生手写序号跳号不能单独证明漏写一个词。只检查实际可见的作答位置。不因不知道默写词语总数、L19简称含义，或页面末尾留白而假设还有额外内容、续页；无需让孩子补填这些细节。有明确词数/页码/题号时仍以明确要求为准；确有题目被裁切、看不清、可定位的缺页或空题时具体指出。推断检查范围不代表补造老师的真实要求、标准答案或已掌握知识。" + SELECTED_SUBMISSION_POLICY;

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
  if (task.selectedSubmission && isCorrectionSignTask(task)) return task;
  if (!mayInferScope(task) || !task.evidence.length || !task.writtenCompletion?.parts.length) return task;
  const ids = [...new Set(task.evidence.map(e => e.fileId))];
  if (ids.length > 6) return task;
  const matched = ids.map(id => pages.find(p => p.fileId === id));
  if (matched.some(p => !p?.readable || p.subject !== task.subject) || task.evidence.some(e => /内容对应尚未判清|交给.+但/u.test(e.excerpt))) return task;
  if (task.writtenCompletion.parts.some(p => !ids.includes(p.evidence.fileId))) return task;
  const concerns = task.missing.filter(text => !speculativeScopeConcern(text));
  if (concerns.length || (task.coverage !== "complete" && !task.missing.length)) return task;
  const dictation = /家默|默写|听写/u.test(task.title.replace(/[（(](?:除|不含|不做|不包括)[^）)]*[）)]/gu, ""));
  // A gap in the child's own numbering does not identify an assigned word.
  const parts = task.writtenCompletion.parts.map(part => {
    if (dictation && part.status === "blank" && /编号\d+默写词[（(]页面未出现编号\d+[）)]/u.test(part.label)) {
      return { ...part, label: "默写编号跳号，无法确认是否漏词", status: "unclear" as const };
    }
    return part;
  });
  if (parts.every(p=>p.status==="answered") && /裁切|遮挡|模糊|看不清|无法辨认|现有记录不足以确认整项作业|未完成逐题检查|超过.{0,8}页/u.test(task.writtenCompletion.reason)) return task;
  const status = parts.some(p => p.status === "blank") ? "incomplete" : parts.some(p => p.status === "unclear") ? "unclear" : "done";
  const printed = [...new Set(matched.flatMap(p => p?.printedPage ? [p.printedPage] : []))];
  const description = dictation ? "按已上传照片中的词语默写和订正内容检查。" : `按已上传${printed.length ? `第${printed.join("、")}页` : "照片中"}符合清单要求的内容检查。`;
  const note = dictation ? "备忘录未写明具体词语和数量，已根据对应默写作业推断检查范围，不要求补填总词数。" : task.inferredMeaning ? "课号和课题与简称相符，已理解具体作业内容，并按对应页面检查；不因页末留白而要求证明没有续页。" : "已根据对应照片推断备忘录未写明的范围，按清单明确说明核对。";
  return {...task,coverage:"complete",missing:[],inferredScope:{version:"submitted-work-v1",description,note,pageIds:ids},writtenCompletion:{...task.writtenCompletion,parts,status,reason:status === "done" ? `按已传作业推断范围，已检查${parts.length}处作答，均有填写；答案对错另看批改。` : status === "incomplete" ? "已按所传作业推断范围，仍有明确空题，具体位置见下方。" : parts.some(p => p.label === "默写编号跳号，无法确认是否漏词") ? "手写编号有跳号，照片不足以确认漏写了哪个词。" : "已按所传作业推断范围，仍有作答看不清，具体位置见下方。"}};
}
export function inferredReportScope(report: DailyReport, pages: ExtractedHomework["pages"]): DailyReport {
  const tasks=report.tasks.map(task=>inferTaskScope(inferTaskMeaning(task,pages),pages));
  const resolved=new Set(report.tasks.flatMap((task,i)=>task.missing.filter(s=>!tasks[i].missing.includes(s))));
  return {...report,tasks,uncertainties:report.uncertainties.filter(s=>!resolved.has(s))};
}
