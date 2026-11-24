import type { GradedQuestion } from "./grading";
/** Internal evidence identifiers are links, not readable explanations. Keep genuine problem numbers. */
export function gradingDisplayQuestion(question: GradedQuestion): GradedQuestion {
  const ids = [question.id, ...question.evidence.map(e => e.fileId)].filter(Boolean);
  const clean = (value: string) => {
    let text = value;
    for (const id of ids) text = text.split(id).join("");
    return text.replace(/[（(]\s*[)）]/g, "").replace(/ {2,}/g, " ").trim();
  };
  return { ...question, label: clean(question.label), question: clean(question.question), studentAnswer: clean(question.studentAnswer), expectedAnswer: clean(question.expectedAnswer), explanation: clean(question.explanation), knowledgePoints: question.knowledgePoints.map(clean), causeExplanation: clean(question.causeExplanation), nextStep: clean(question.nextStep) };
}

const sectionNumber = /^(?:第\s*([一二三四五六七八九十\d]+)\s*大题\s*[、，,：:·.\s]*|([一二三四五六七八九十]+)[、，,]\s*)/;
const itemNumber = /第\s*([一二三四五六七八九十\d]+)\s*(小题|题|句|行|空)/;

function displayNumber(number: string): string {
  if (/^\d+$/.test(number)) return number.replace(/^0+(?=\d)/, "");
  const digits = " 一二三四五六七八九";
  if (number.length === 1 && number !== "十") return String(digits.indexOf(number));
  const match = number.match(/^([一二三四五六七八九]?)十([一二三四五六七八九]?)$/);
  if (!match) return number;
  return String((match[1] ? digits.indexOf(match[1]) : 1) * 10 + (match[2] ? digits.indexOf(match[2]) : 0));
}

export function mistakeQuestionSummary(question: GradedQuestion): { title: string; preview: string } {
  const display = gradingDisplayQuestion(question);
  const label = display.label.normalize("NFKC").replace(/\s+/g, " ");
  const section = label.match(sectionNumber);
  const remaining = section ? label.slice(section[0].length) : label;
  const item = remaining.match(itemNumber);
  const bareItem = section && remaining.match(/^(\d{1,3})$/);
  const type = item ? remaining.slice(0, item.index).replace(/[、，,：:·\s]+$/g, "") : "";
  const parts: string[] = [];
  if (section) parts.push(`第${displayNumber(section[1] || section[2])}大题`);
  if (item) {
    const unit = section && item[2] === "题" ? "小题" : item[2];
    parts.push(`第${displayNumber(item[1])}${unit}`);
  } else if (bareItem) {
    parts.push(`第${displayNumber(bareItem[1])}小题`);
  } else if (/^\d{1,3}$/.test(label)) {
    parts.push(`第${displayNumber(label)}题`);
  }
  if (type && type.length <= 18 && /^[\p{L}\p{N} -]+$/u.test(type)) parts.push(type);
  const stem = display.question.replace(/\s+/g, " ");
  const preview = stem.length > 120 ? stem.slice(0, 120).trimEnd() + "…" : stem;
  return { title: parts.join(" · ") || (label === "小练习复测题" ? "小练习复测题" : "题号未识别"), preview };
}
