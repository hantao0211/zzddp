"use client";
import { useState } from "react";
import { Save } from "lucide-react";
import type { HomeworkDayPlan } from "@/domain/homework-calendar";

const days = [{ value: 1, label: "周一" }, { value: 2, label: "周二" }, { value: 3, label: "周三" }, { value: 4, label: "周四" }, { value: 5, label: "周五" }, { value: 6, label: "周六" }, { value: 0, label: "周日" }];
export function HomeworkDaySettings({ date, plan, busy, save }: {
  date: string; plan: HomeworkDayPlan; busy: boolean;
  save: (value: { date: string; noHomework?: boolean | null; weekdays: number[] }) => void;
}) {
  const [selection, setSelection] = useState(plan.override === null ? "auto" : plan.override ? "off" : "on");
  const [weekdays, setWeekdays] = useState(plan.weekdays);
  return <form className="homework-day-settings" onSubmit={event => { event.preventDefault(); if (!busy) save({ date, weekdays, ...(!plan.hasWork ? { noHomework: selection === "auto" ? null : selection === "off" } : {}) }); }}>
    <label>这一天 · {date}<select value={plan.hasWork ? "on" : selection} onChange={event => setSelection(event.target.value)} disabled={busy || plan.hasWork}>
      <option value="auto">跟随每周安排</option><option value="off">无作业日</option><option value="on">有作业</option>
    </select></label>
    {plan.hasWork && <p className="hw-secondary">这一天已有作业资料，会继续显示作业进展。</p>}
    <fieldset disabled={busy}><legend>每周无作业日</legend><div className="homework-weekdays">{days.map(day => <label key={day.value}><input type="checkbox" checked={weekdays.includes(day.value)} onChange={event => setWeekdays(current => event.target.checked ? [...current, day.value] : current.filter(value => value !== day.value))} /><span>{day.label}</span></label>)}</div></fieldset>
    <p className="hw-secondary">孩子和家长都可以修改，家庭设备同步。已上传资料的日期继续显示作业；无作业日不会自动发放作业奖励。</p>
    <button className="button primary" disabled={busy}><Save size={17} aria-hidden="true" />{busy ? "保存中…" : "保存安排"}</button>
  </form>;
}
