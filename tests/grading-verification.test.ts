import test from "node:test";
import assert from "node:assert/strict";
import { equivalentAnswer, GradingVerificationSchema, GradingQuestionSchema, type GradedQuestion } from "../src/domain/grading";
import { blindGradingQuestions, reconcileFocusedQuestion } from "../src/domain/grading-verification";
import { gradingDisplayQuestion, gradingTakeaway, mistakeQuestionSummary } from "../src/domain/grading-display";
const first = { ...GradingQuestionSchema.parse({ kind: "objective", studentAnswer: "挡地", expectedAnswer: "当地", label: "第9题：当地", question: "第9题词语默写，曾识别挡地", evidence: [{ fileId: "synthetic-page", page: 1, excerpt: "被误识为挡地" }], verdict: "wrong", confidence: "medium", explanation: "字形看不清", knowledgePoints: ["词语默写"], cause: "书写或单位", causeExplanation: "误判偏旁", nextStep: "订正" }), id: "synthetic-question" };
const check = { ...first, confidence: "high" as const, questionId: first.id };
test("blind verification receives only location hints, not the original OCR, expected word, explanation or answer-bearing labels", () => {
 const input = blindGradingQuestions([first]);
 assert.deepEqual(input, [{ questionId: first.id, locator: { order: 1, numbers: ["9"], part: null, pages: [{ fileId: "synthetic-page", page: 1 }] } }]);
 assert.doesNotMatch(JSON.stringify(input), /挡地|当地|误判|被误识|字形看不清|studentAnswer|expectedAnswer/);
 const second = { ...first, id: "another-question", label: "第10题（2）涂色" };
 assert.equal(blindGradingQuestions([first, second], [second])[0].locator.order, 2);
 assert.equal(blindGradingQuestions([first, second], [second])[0].locator.part, "涂色");
 assert.deepEqual(blindGradingQuestions([first, second], [second])[0].locator.numbers, ["10", "2"]);
});
test("uncertain Chinese glyphs cannot become verified wrong from repeated full-page OCR; independent correct readings and unrelated arithmetic still resolve", () => {
 const disputed = reconcileFocusedQuestion(first, check, check, "语文");
 assert.equal(disputed.verdict, "uncertain"); assert.equal(disputed.verification, "uncertain"); assert.equal(disputed.studentAnswer, "手写字暂未辨清"); assert.equal(disputed.causeExplanation, ""); assert.doesNotMatch(disputed.nextStep, /订正写|三遍/);
 const right = { ...check, verdict: "correct" as const, studentAnswer: "当地" };
 assert.equal(reconcileFocusedQuestion(first, right, right, "语文").verdict, "correct");
 const clear = { ...first, confidence: "high" as const };assert.equal(reconcileFocusedQuestion(clear, check, check, "语文").verdict,"wrong");
 const math = { ...first, studentAnswer: "6", expectedAnswer: "5", label: "第1题", question: "2+3=?", cause: "计算错误" as const, knowledgePoints: ["整数加法"] }, mathCheck = { ...math, confidence: "high" as const, questionId: math.id };
 assert.equal(reconcileFocusedQuestion(math, mathCheck, mathCheck, "数学").verdict, "wrong");
});
test("readable explanations hide only internal reference IDs and retain question numbers and numerical answers", () => {
 const q = { ...first, verification: "agreed" as const, explanation: "据本页图片（synthetic-page）第9题，答案19/20；synthetic-question。" } as GradedQuestion;
 const display = gradingDisplayQuestion(q);
 assert.equal(display.explanation,"据本页图片第9题，答案19/20；。"); assert.ok(q.explanation.includes("synthetic-page"), "display formatting never rewrites the original audit/evidence");
});

test("mistake summaries normalize legacy question labels and keep excerpts separate", () => {
 const examples = [
  ["四、8", "第4大题 · 第8小题"],
  ["七、３", "第7大题 · 第3小题"],
  ["五、 3", "第5大题 · 第3小题"],
  ["第6题", "第6题"],
  ["三、 单项选择 第8题", "第3大题 · 第8小题 · 单项选择"],
  ["三、选择题第6题", "第3大题 · 第6小题 · 选择题"],
  ["句型第2句 Write the complete answer.", "第2句 · 句型"],
  ["一、 看音标写单词 第2题（/test/）", "第1大题 · 第2小题 · 看音标写单词"],
  ["四、 短语翻译 第4题 Translate this very long sentence", "第4大题 · 第4小题 · 短语翻译"],
  ["订正第十行", "第10行 · 订正"],
  ["第十二大题 · 第03小题", "第12大题 · 第3小题"],
  ["小练习复测题", "小练习复测题"],
  ["无法辨认题号的内容", "题号未识别"],
 ];
 for (const [label, title] of examples) {
  const q: GradedQuestion = { ...first, verification: "agreed", label, question: "Read the sentence.\nChoose an answer.（synthetic-page）" };
  assert.deepEqual(mistakeQuestionSummary(q), { title, preview: "Read the sentence. Choose an answer." });
 }
 const long: GradedQuestion = { ...first, verification: "agreed", question: "Test example. ".repeat(35) };
 assert.ok(mistakeQuestionSummary(long).preview.endsWith("…"));
});

import { settleReviewedQuestion } from "../src/domain/grading-decision";
test("completed blind readings settle matching answers and report the specific remaining doubt", () => {
 const q: GradedQuestion = { ...first, studentAnswer: "春（两遍）", verdict: "uncertain", verification: "uncertain" };
 const a = { ...check, studentAnswer: "春（两遍）", expectedAnswer: "春", confidence: "medium", verdict: "correct", stage: "focusOne" } as const;
 const b = { ...a, studentAnswer: "春", stage: "focusTwo" } as const;
 assert.equal(settleReviewedQuestion(q, [a,b]).verdict, "correct");
 assert.equal(settleReviewedQuestion(q, [a]).verdict, "uncertain");
 const word = settleReviewedQuestion(q,[a,{...b,studentAnswer:"春天",expectedAnswer:"春天"}]);
 assert.equal(word.verdict,"passedWithNote");
 assert.match(word.explanation,/「春」和「春天」/);
 const noKey = {...a,expectedAnswer:"无法确定（缺少词表）",verdict:"uncertain"} as const;
 assert.match(settleReviewedQuestion(q,[noKey,{...noKey,stage:"focusTwo"}]).explanation,/缺少听写词表/);
 const noList = {...noKey,expectedAnswer:"未提供词表"};
 const unavailable = settleReviewedQuestion(q,[noList,{...noList,stage:"focusTwo",expectedAnswer:"未提供词表，无法独立确认"}]);
 assert.doesNotMatch(unavailable.explanation,/参考答案分别|「未提供词表/);
 const flagged = { ...a, verdict: "wrong", studentAnswer: "6", expectedAnswer: "5", explanation: "加法算多了一。" } as const;
 const possibleError = settleReviewedQuestion(q,[flagged,{...flagged,stage:"focusTwo",expectedAnswer:"五"}]);
 assert.equal(possibleError.verdict,"uncertain"); assert.match(possibleError.explanation,/加法算多了一/);
 const unreadable = {...noKey,studentAnswer:"未辨清"};
 assert.equal(settleReviewedQuestion(q,[unreadable,{...unreadable,stage:"focusTwo"}]).verdict,"uncertain");
 for(const [x,y] of [["1,23","12,3"],["US","us"],["a part","apart"]]){
   assert.equal(settleReviewedQuestion({...q,studentAnswer:x},[{...a,studentAnswer:x,expectedAnswer:x},{...b,studentAnswer:y,expectedAnswer:y}]).verdict,"passedWithNote");
 }
});

test("numeric fill-ins keep each slot, including a denominator", () => {
 const question = "3/8 里有（ ）个 1/（ ），再添（ ）个 1/8 就是 1。";
 const original = { ...first, question, studentAnswer:"3，8，8", expectedAnswer:"3，8，5", confidence:"high" as const };
 const read = GradingVerificationSchema.shape.checks.element.parse({ ...check, studentAnswer:"3, 8, 8", expectedAnswer:"3, 8, 5" });
 const complete = reconcileFocusedQuestion(original, read, {...read,studentAnswer:"3,8,8"}, "数学");
 assert.equal(complete.verdict,"wrong");
 assert.equal(gradingTakeaway(complete),"第3空填了 8，应填 5。");
 const partial = {...read,studentAnswer:"3,8",expectedAnswer:"3,5"};
 assert.equal(reconcileFocusedQuestion(original,partial,partial,"数学").verdict,"uncertain");
 assert.equal(reconcileFocusedQuestion({...original,question:"3/8 里有（ ）个 1/8，再添（ ）个 1/8 就是 1。"},partial,partial,"数学").verdict,"wrong");
 assert.equal(equivalentAnswer("1,23","12,3"),false);
});

test("side-by-side calculations use the numbered subquestion and its own result", () => {
 const q = { ...first, label:"A级第3题(2)", question:"巧算：(2) 7/8-2/8。", verdict:"uncertain" as const, verification:"uncertain" as const };
 assert.equal(blindGradingQuestions([q])[0].locator.printedLabel,q.label);
 const one = { ...GradingVerificationSchema.shape.checks.element.parse(check), stage:"verification", studentAnswer:"7/8-2/8=4/8", expectedAnswer:"5/8" } as const;
 const two = { ...one, stage:"focusOne", studentAnswer:"=4/8" } as const;
 const mixed = { ...one, stage:"focusTwo", studentAnswer:"9，4/8",expectedAnswer:"9，5/8",confidence:"medium" } as const;
 const checked=settleReviewedQuestion(q,[one,two,mixed]);
 assert.equal(checked.verdict,"wrong"); assert.equal(checked.studentAnswer,"4/8"); assert.equal(checked.expectedAnswer,"5/8");
 assert.equal(settleReviewedQuestion(q,[one,{...two,studentAnswer:"3/8"},mixed]).verdict,"uncertain");
 assert.equal(settleReviewedQuestion({...q,question:"填空：（ ），（ ）。"},[one,two,mixed]).verdict,"uncertain");
 assert.equal(settleReviewedQuestion(q,[one,{...two,expectedAnswer:"1/2"},{...mixed}]).verdict,"uncertain");
 assert.equal(reconcileFocusedQuestion(q,mixed,mixed,"数学").verdict,"uncertain");
});
