"use client";
import { Archive, ArrowRight, BookOpen, CircleAlert, ClipboardList, Pencil } from "lucide-react";
import type { HomeworkSnapshot } from "@/domain/homework";
import {StepAmount} from "./growth-tokens";
type HomeStudyView = "grading" | "mistakes" | "practice" | "materials";

export function HomeStudyTools({ grading, homeworkReward, onNavigate }: {
  grading: HomeworkSnapshot["grading"];
  homeworkReward: HomeworkSnapshot["homeworkReward"];
  onNavigate: (view: HomeStudyView, focusFailures?: boolean) => void;
}) {
  const checked = grading && grading.correct + (grading.passedWithNote ?? 0) + grading.wrong + grading.blank + grading.uncertain + grading.feedback;
  const gradingNote = grading?.failed
    ? `${grading.failed}页批改未完成${grading.pending ? ` · ${grading.pending}页待批改` : ""}`
    : grading?.pending ? `${grading.pending}页待批改`
    : grading?.finished ? `已批改${checked}题 · ${grading.wrong}道错题${grading.passedWithNote ? ` · ${grading.passedWithNote}题通过但存疑` : ""}${grading.uncertain ? ` · ${grading.uncertain}题待确认` : ""}`
    : "上传后自动批改";
  const entries = [
    { view: "grading", title: grading?.failed ? "查看未完成原因" : "查看批改", note: gradingNote,
      Icon: grading?.failed ? CircleAlert : ClipboardList },
    { view: "mistakes", title: "我的错题本", note: "回顾原题和复测记录", Icon: BookOpen },
    { view: "practice", title: "15分钟小练习", note: "从课内错题出发", Icon: Pencil },
    { view: "materials", title: "课程资料库", note: "查看教材和练习册", Icon: Archive },
  ] as const;

  return <section className="home-study-tools" aria-labelledby="home-study-title">
    <h2 id="home-study-title">批改与练习</h2>
    <div className="home-study-entries">
      {entries.map(({ view, title, note, Icon }) => (view !== "grading" || grading?.enabled) &&
        <button type="button" className={`home-study-entry home-study-${view}`} key={view}
          aria-labelledby={`home-study-${view}-title`} aria-describedby={`home-study-${view}-note`}
          onClick={() => onNavigate(view, view === "grading" && !!grading?.failed)}>
          <span className="home-study-entry-title">
            <Icon size={18} aria-hidden="true" />
            <strong id={`home-study-${view}-title`}>{title}</strong>
            <ArrowRight size={14} aria-hidden="true" />
          </span>
          <small id={`home-study-${view}-note`}>{note}</small>
        </button>)}
    </div>
    <div className="home-study-rewards" aria-label="小脚步奖励">
      <p><span>小练习每科每天最多攒</span> <StepAmount value={2} /></p>
      {homeworkReward?.eligible && <p className="study-homework-reward" role="status">
        <span>{homeworkReward.earned ? "作业完成奖励已到账" : "当天作业全部做完，攒"}</span>
        <StepAmount value={homeworkReward.points} signed />
      </p>}
    </div>
  </section>;
}
