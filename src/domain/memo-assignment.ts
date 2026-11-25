// A memo defines the assignment. Tracking marks on the list describe neither
// a required answer on a worksheet nor the state of a later submission.
export const MEMO_ASSIGNMENT_POLICY = "备忘录只用于录取当天布置的作业及书名、范围、次数、订正、签字等明确要求。勾叉、打勾栏、完成或未完成、评分和已订等进度旁注只属于备忘录原文。不得写进作业要求、生成作答项、据以认定完成或未完成，或要求孩子把旁注抄到作业上。书面完成只检查对应作业原件，非书面完成按独立完成记录。题目本身要求打勾选择、订正或家长签字仍需按作业要求检查。";

// Older OCR often appended these observations after a semicolon. Match status
// language specifically so that e.g. “在正确答案右侧打勾” remains an instruction.
const trackingClause = /(^|[；;。\n，,])\s*((?:(?:备忘录|清单)(?:上|中)?(?:的)?\s*)?(?:(?:右侧|旁边|旁注|旁)(?:以大括号)?(?:标注?|写有|注明|注)?\s*)?[“"「]?(?:[−-]\d+[，,、]\s*)?(?:已讲已订|已订(?:正)?|已完成|未完成|未订完|全对[⭐★]?|[√✓×✗])[”"」]?(?:[，,、]\s*需签名[”"」]?)?(?:[（(](?:未|已)?勾选完成[）)])?(?:[，,、]?并勾选完成)?|(?:右侧)?(?:已|未)?勾选(?:完成|[√✓×✗](?:并注[“"]未订完[”"])?))(?=$|[。；;，,\n])/gu;

export function assignmentRequirement(requirement: string) {
  const cleaned = requirement.replace(trackingClause, (_match, separator: string, note: string) =>
    note.includes("需签名") ? separator + "需签名" : "");
  if (cleaned === requirement) return requirement;
  return cleaned.replace(/^[。；;，,\s]+|[；;，,\s]+$/gu, "").trim();
}

export function isMemoTrackingPart(label: string, requirement: string) {
  if (/^(?:备忘录|清单)(?:上|中)?(?:的)?(?:右侧)?(?:完成勾选(?:栏|框)?|勾选完成|完成标记)$/u.test(label)) return true;
  const cleaned = assignmentRequirement(requirement);
  if (cleaned === requirement) return false;
  if (/^(?:备忘录|清单)?(?:上的?|中)?(?:右侧)?(?:的)?(?:完成勾选|完成勾选栏|勾选完成|完成勾选框)$/u.test(label)) return /勾选|[√✓]/u.test(requirement);
  const annotation = label.match(/^(?:备忘录|清单)?(?:右侧|旁边|旁注)(?:的)?(?:标注)?[“"「]([^”"」]+)[”"」](?:标注)?(?:及完成勾选|并勾选完成)?$/u);
  return !!annotation && requirement.includes(annotation[1]) && !cleaned.includes(annotation[1]);
}
