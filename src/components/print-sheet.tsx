"use client";
import { BackLabel } from "./back-label";

import { useState } from "react";
import { Printer } from "lucide-react";
import { practice, practiceAnswers } from "@/domain/demo";

export function PrintSheet() {
  const [answers, setAnswers] = useState(false);
  return <main className="print-page">
    <div className="print-toolbar"><a href="/"><BackLabel>返回学习首页</BackLabel></a><label><input type="checkbox" checked={answers} onChange={(e) => setAnswers(e.target.checked)} /> 附答案页</label><button className="button primary" onClick={() => window.print()}><Printer size={17} /> 打开系统打印</button></div>
    <article className="paper">
      <div className="paper-brand">小步学习 / 数学专项练习</div><h1>把每一步，算清楚</h1>
      <p>小数加减法与单位换算 · 四年级 · 共 4 题</p>
      <div className="paper-fields">姓名：____________　日期：____________　任务：DEMO-MATH-001</div>
      <div className="paper-note">示例练习单。认真写下计算过程，完成后可拍照上传。此版本尚未接入自动批改与自动匹配。</div>
      {practice.map((question, index) => <section className="paper-question" key={question}><h2>{index + 1}. {question}</h2><div className="answer-space" /></section>)}
      <footer>做完后想一想：哪一步需要特别留意？________________________________</footer>
    </article>
    {answers && <article className="paper answer-page"><div className="paper-brand">小步学习 / 参考答案</div><h1>完成后，再来核对</h1>{practiceAnswers.map((answer, index) => <p key={answer}>{index + 1}. {answer}</p>)}<p>示例参考答案。订正时请同时检查计算过程。</p></article>}
    <p className="print-help">当前使用浏览器系统打印；直接发送到家庭打印机将在设备验证后接入。</p>
  </main>;
}
