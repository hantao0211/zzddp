import type { ChatMessage } from "./assistant";

const formatLabel = { written: "书面", oral: "口头", reading: "朗读或阅读", other: "其他" };
const changeLabel = { none: "未修改清单", pending: "待确认，尚未保存", confirmed: "已确认保存", undone: "已撤销" };

export function exportAssistantConversation(input: { date: string; messages: ChatMessage[]; draft: string; pendingQuestion: string; error: string; draftPhotoCount?: number; activeMemoryIds?: string[] }) {
  const lines = ["小步学习 · 小助手对话", `作业日期：${input.date || "未选择"}`, `导出时间：${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}（北京时间）`, ""];
  for (const message of input.messages) {
    lines.push(`【${message.role === "user" ? "我" : "小助手"}】`, message.content);
    if (message.photos?.length) lines.push(`附带图片：${message.photos.length} 张（文本导出不含图片原件）。`);
    if (message.photoReview?.requested) lines.push(`照片复核：本次查看 ${message.photoReview.providedPages} 页，共 ${message.photoReview.totalAvailablePages} 页可供查看。`);
    for (const memory of message.memoriesSaved || []) {
      lines.push(`提炼的知识：${memory.summary}`, `记忆依据：${memory.sourceQuote}`);
      if (input.activeMemoryIds) lines.push(`记忆当前状态：${input.activeMemoryIds.includes(memory.id) ? "仍在使用" : "已停用或被更新"}`);
    }
    for (const notice of message.memoryNotices || []) lines.push(`记忆提示：${notice}`);
    if (message.gradePreview) {
      const review = message.gradePreview;
      lines.push(review.label + (review.applied ? " · 已确认更正" : " · 待家长确认"), review.verdict === "record" ? "签名记录：" + review.original : "原答判定：" + (review.verdict === "wrong" ? "错误" : "正确"), review.evidence);
      if (review.correction) lines.push("卷面订正：" + review.correction);
    }
    if (message.proposal) {
      const proposal = message.proposal;
      const label = (value: typeof proposal.before) => `${value.subject || "科目未定"} · ${value.title}\n${value.requirement}\n形式：${formatLabel[value.format]}`;
      lines.push(`修改状态：${changeLabel[message.changeStatus || "pending"]}`, `原清单：${label(proposal.before)}`, `拟修改：${label(proposal.after)}`, `我的说明：${proposal.userQuote}`);
      if (proposal.resolves.length) lines.push(`对应疑问：\n${proposal.resolves.join("\n")}`);
    } else if (message.changeStatus) lines.push(`清单状态：${changeLabel[message.changeStatus]}`);
    lines.push("");
  }
  if (input.pendingQuestion) lines.push("【正在等待回答的问题】", input.pendingQuestion, "");
  if (input.draft.trim()) lines.push("【输入框内容（尚未发送，或上次发送失败）】", input.draft.trim(), "");
  if (input.draftPhotoCount) lines.push(`【尚未发送的图片】${input.draftPhotoCount} 张（文本导出不含图片原件）。`, "");
  if (input.error) lines.push("【页面错误提示】", input.error, "");
  return lines.join("\n");
}
