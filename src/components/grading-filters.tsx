"use client";

import { OverflowChoices } from "./overflow-choices";
import type { GradedQuestion, GradingSummary } from "@/domain/grading";

export const filterLabels = { correct: "正确", passedWithNote: "通过但存疑", wrong: "错误", blank: "未作答", uncertain: "未确认", feedback: "点评" };
export type GradingFilter = "all" | "attention" | "ungraded" | GradedQuestion["verdict"];
const order: GradingFilter[] = ["all", "attention", "wrong", "ungraded", "uncertain", "blank", "passedWithNote", "correct", "feedback"];
const labels = { ...filterLabels, all: "全部", attention: "需留意", ungraded: "未批改" };
const tones: Record<GradingFilter, string> = {
  all: "", attention: "status-in-progress", wrong: "status-wrong", ungraded: "status-in-progress",
  uncertain: "status-uncertain", blank: "status-blank", passedWithNote: "status-correct", correct: "status-correct", feedback: "status-feedback",
};

export function GradingFilters({value, onChange, summary, ungraded}: {
  value: GradingFilter; onChange: (next: GradingFilter) => void; summary: GradingSummary; ungraded: number;
}) {
  function count(key: GradingFilter) {
    if (key === "all" || key === "attention") return undefined;
    return key === "ungraded" ? ungraded : summary[key] ?? 0;
  }
  function contents(key: GradingFilter) {
    const n = count(key);
    return <span className="grade-filter-pill">{labels[key]}{n !== undefined && <span className="grade-filter-count">{n}{key === "ungraded" && "页"}</span>}</span>;
  }
  return <OverflowChoices order={order} value={value} pinned="all" onChange={onChange}
    name="按批改结果筛选" moreName="更多筛选" contents={contents} tone={key=>tones[key]}
    label={key=>key==="all"?"全部题目":key==="attention"?"先看需要留意的题":labels[key]+" "+count(key)+(key==="ungraded"?"页":"题")}/>;
}
