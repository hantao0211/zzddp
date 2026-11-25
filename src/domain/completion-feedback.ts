export const feedbackReasons = {
  numbering: "只是编号跳了",
  correction: "这是订正练习",
  writing: "这里已经写了",
  other: "其他完成情况",
} as const;

export type FeedbackReason = keyof typeof feedbackReasons;
export type CompletionFeedback = {
  token: string;
  latest?: {
    id: string;
    reason: FeedbackReason;
    note: string;
    learned?: string[];
    status: "pending" | "reviewed" | "interrupted" | "confirmed";
  };
};
