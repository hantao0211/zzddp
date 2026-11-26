import assert from "node:assert/strict";
import test from "node:test";
import { examQuestionHeading } from "../src/domain/exam-question-heading";

test("试卷列表用原题号和已记录的知识点说明题意", () => {
  const source = { label: "2", question: "用加法交换律填空。", knowledgePoints: ["待分类", "加法交换律"] };
  assert.deepEqual(examQuestionHeading(source), {
    number: "第2题", summary: "加法交换律", preview: source.question,
  });
  for (const [label, number] of [["４（２）", "第4题（2）"], ["(1)", "第1小题"], ["B级第1题(2)", "B级第1题(2)"]]) {
    assert.equal(examQuestionHeading({ ...source, label }).number, number);
  }
});

test("缺少知识点时直接摘取本题题干，保留小数和未知题号", () => {
  assert.deepEqual(examQuestionHeading({label:"",question:"已知甲数是3.5，乙数是多少？"}), {
    number:"题号未识别",summary:"已知甲数是3.5",preview:"乙数是多少？",
  });
  assert.deepEqual(examQuestionHeading({label:"1",question:"0.8×0.5＝（ ）"}), {
    number:"第1题",summary:"0.8×0.5＝（ ）",preview:"",
  });
});
