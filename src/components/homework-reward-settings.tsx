"use client";
import { useEffect, useRef, useState } from "react";
import { Footprints, Save } from "lucide-react";
import type { HomeworkRewardRules } from "@/domain/homework-reward";
import { StepAmount } from "./growth-tokens";
export function HomeworkRewardSettings({ rules, busy, save }: { rules: HomeworkRewardRules; busy: boolean; save: (rules: HomeworkRewardRules) => void }) {
  const [amount, setAmount] = useState(String(rules.dailyPoints));
  const previous = useRef(rules.dailyPoints);
  useEffect(() => { const old = String(previous.current); setAmount(current => current === old ? String(rules.dailyPoints) : current); previous.current = rules.dailyPoints; }, [rules.dailyPoints]);
  const value = Number(amount), valid = amount.trim() !== "" && Number.isInteger(value) && value >= 0 && value <= 100;
  return <section className="card homework-reward-settings"><h2><Footprints aria-hidden="true" />作业完成奖励</h2>
    <p className="reading-muted">{rules.dailyPoints ? <>当前：每天作业全部做完，攒 <StepAmount value={rules.dailyPoints} signed />。</> : "当前已关闭作业完成奖励。"}</p>
    <form onSubmit={event => { event.preventDefault(); if (valid && !busy) save({ dailyPoints: value }); }}>
      <label>每日作业奖励（个小脚步）<input type="number" inputMode="numeric" min={0} max={100} step={1} required value={amount} onChange={event => setAmount(event.target.value)} disabled={busy} /></label>
      <p className="reading-muted">设为0可关闭。每天最多奖励一次；更改适用于尚未发放的作业奖励，已到账的数量保持不变。</p>
      <button className="button primary" disabled={busy || !valid || value === rules.dailyPoints}><Save size={17} aria-hidden="true" />保存作业奖励</button>
    </form>
  </section>;
}
