import type { GradedQuestion, GradingReading } from "./grading";

function answer(text: string) {
  return text.normalize("NFKC").trim().replace(/^([\p{Script=Han}]+)\((?:写了?|抄写)?[两二2]遍\)$/u, "$1");
}

function readable(text: string) {
  return !!text && !/^(?:[_?？—\s]+|未作答|空白|无|未知|不详)$|无法确定|未辨清|无法辨认|无法识别|看不清|无法独立确定/.test(text);
}

type Observation = Pick<GradingReading, "verdict" | "confidence" | "studentAnswer" | "expectedAnswer">;
export function matchingCorrectAnswer(a: Observation, b: Observation) {
  const value = answer(a.studentAnswer);
  return a.verdict === "correct" && b.verdict === "correct" && a.confidence !== "low" && b.confidence !== "low"
    && readable(value) && value === answer(b.studentAnswer) && value === answer(a.expectedAnswer) && value === answer(b.expectedAnswer);
}

function quote(text: string) {
  return "「" + [...text].slice(0, 28).join("") + ([...text].length > 28 ? "…" : "") + "」";
}

/** Settle completed objective reviews from the two independent, question-specific observations. */
export function settleReviewedQuestion(q: GradedQuestion, readings: GradingReading[]): GradedQuestion {
  if (q.kind !== "objective" || q.verdict !== "uncertain") return q;
  const a = readings.find(r => r.stage === "focusOne"), b = readings.find(r => r.stage === "focusTwo");
  if (!a || !b) return q;
  const x = answer(a.studentAnswer), y = answer(b.studentAnswer);
  const u = answer(a.expectedAnswer), v = answer(b.expectedAnswer);
  const bothCorrect = a.verdict === "correct" && b.verdict === "correct";
  if (matchingCorrectAnswer(a, b) && x === answer(q.studentAnswer)) return { ...q, verdict: "correct", verification: "agreed",
    confidence: a.confidence === "high" || b.confidence === "high" ? "high" : "medium",
    studentAnswer: x, expectedAnswer: u, explanation: "正确。", cause: "原因待确认", causeExplanation: "", nextStep: "" };

  const points: string[] = [];
  if (q.studentAnswer === "手写字暂未辨清") points.push("手写字的笔画没有辨清。");
  if (bothCorrect && x !== y && x === u && y === v) points.push("两次都判对，核对的内容分别是" + quote(x) + "和" + quote(y) + "。");
  else if (x !== y) points.push("两次读到的作答分别为" + quote(x || "未读到作答") + "和" + quote(y || "未读到作答") + "。");
  if (/缺少词表|缺少.*拼音/.test(u + v)) points.push("缺少听写词表或拼音，无法核对目标词。");
  else if (!readable(u) || !readable(v)) points.push("未取得可核对的参考答案。");
  else if (u !== v && !(x === u && y === v)) points.push("两次复核给出的参考答案分别为" + quote(u) + "和" + quote(v) + "。");
  else if (u === v && x === y && x !== u && readable(x)) points.push("识读作答为" + quote(x) + "，参考答案为" + quote(u) + "，复核未能证实这处差异是作答错误。");

  if (a.verdict === "wrong" && b.verdict === "wrong" && q.studentAnswer !== "手写字暂未辨清") {
    // A specific suspected error belongs with the items needing attention.
    const issue = a.explanation.trim().split(/[。！\n]/u)[0].slice(0, 96);
    const account = issue || ("复核读到的作答是" + quote(x || y) + "，参考答案是" + quote(u || v));
    return { ...q, explanation: "复核指出的可能问题：" + account + "。" + points.join("") };
  }
  if ((!readable(x) && !readable(y)) || (a.verdict === "blank" && b.verdict === "blank")) {
    return { ...q, explanation: points[0] || "两次复核都未读到可核对的作答。" };
  }
  if (!points.length) {
    const observed = [a, b].find(r => r.verdict !== "correct" && r.explanation && !/^(?:正确|答对了)[。！]?$/.test(r.explanation));
    if (observed) points.push(observed.explanation.split(/[。！\n]/u)[0].slice(0, 96) + "。");
    else points.push("两次复核都读到" + quote(x || y) + "，但未能可靠核实原图上的作答。");
  }
  return { ...q, verdict: "passedWithNote", explanation: points.join(""), cause: "原因待确认", causeExplanation: "", nextStep: "" };
}
