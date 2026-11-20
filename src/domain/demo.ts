import type { LearningState, MaterialKind, Subject } from "./contracts";

export const DEMO_DAY = "2026-11-18";

export function makeDemoState(): LearningState {
  return {
    version: 1,
    tasks: [
      { id: "math", subject: "数学", title: "小数的加法和减法", description: "练习册第 32–33 页 · 注意小数点对齐", completed: false, uploaded: false },
      { id: "english", subject: "英语", title: "Unit 4 词汇与句型", description: "抄写词汇，完成配套练习第 18 页", completed: true, uploaded: true },
      { id: "chinese", subject: "语文", title: "课文阅读与课后练习", description: "完成课后第 2、3 题，再读一遍喜欢的段落", completed: false, uploaded: false },
    ],
    materials: [
      { id: "memo-sample", name: "今日作业备忘录", kind: "备忘录", subject: "数学", date: DEMO_DAY, sample: true, fileIds: [], filenames: ["备忘录示例"] },
      { id: "english-sample", name: "Unit 4 词汇与句型", kind: "每日作业", subject: "英语", date: DEMO_DAY, taskId: "english", sample: true, fileIds: [], filenames: ["英语作业示例"] },
      { id: "math-sample", name: "数学单元练习", kind: "试卷", subject: "数学", date: "2026-11-16", sample: true, fileIds: [], filenames: ["数学试卷示例"] },
    ],
    reviewDone: [], reflection: "", rewardRequests: [],
  };
}

export const mistakes = [
  { id: "decimal", subject: "数学" as Subject, tag: "小数计算", title: "小数点对齐，再认真算一遍", question: "计算：12.5 − 3.78", answer: "8.72", wrong: "9.28", reason: "示例分析：可能没有将相同数位对齐，需要通过复测确认。", hint: "把 12.5 写成 12.50，小数点对齐后，从最低位开始减。", date: "11 月 16 日", progress: "待复习" },
  { id: "unit", subject: "数学" as Subject, tag: "长度单位", title: "先统一单位，再比较大小", question: "比较大小：2.4 米 ○ 240 厘米", answer: "=", wrong: ">", reason: "示例分析：可能直接比较了数字，尚未统一长度单位。", hint: "1 米是 100 厘米，把 2.4 米换算成厘米试试看。", date: "11 月 15 日", progress: "待复测" },
  { id: "english-word", subject: "英语" as Subject, tag: "词汇拼写", title: "记住 library 的字母顺序", question: "补全单词：图书馆 l _ b r a r y", answer: "i", wrong: "e", reason: "示例分析：这次拼写有误，是否稳定掌握还需要再次观察。", hint: "完整单词是 library，可以分成 li / bra / ry 帮助记忆。", date: "11 月 14 日", progress: "待复习" },
];

export const practice = [
  "用竖式计算：14.6 − 5.82", "用竖式计算：7.35 + 12.8", "在 ○ 里填入 >、< 或 =：3.2 米 ○ 320 厘米", "小林有 20 元，买文具花了 8.75 元，还剩多少元？",
];
export const practiceAnswers = ["8.78", "20.15", "=", "11.25 元"];
export const materialKinds: MaterialKind[] = ["备忘录", "每日作业", "试卷", "专项练习"];
export const subjects: Subject[] = ["数学", "英语", "语文"];

export function summarize(state: LearningState) {
  return {
    total: state.tasks.length,
    completed: state.tasks.filter((t) => t.completed).length,
    uploaded: state.tasks.filter((t) => t.uploaded).length,
    reviewed: new Set(state.reviewDone).size,
  };
}

export function attachMaterial(state: LearningState, material: LearningState["materials"][number]): LearningState {
  const existing = state.materials.some((m) => m.id === material.id);
  if (existing) return state;
  return {
    ...state,
    materials: [material, ...state.materials],
    tasks: state.tasks.map((task) => task.id === material.taskId ? { ...task, uploaded: true } : task),
  };
}
