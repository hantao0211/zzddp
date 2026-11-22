export type GradingStage = "inspection" | "verification" | "recheck" | "saving" | "unknown";
export const GRADING_STAGE_LABELS: Record<GradingStage, string> = { inspection: "逐题批改", verification: "独立复核", recheck: "针对性复查", saving: "保存批改结果", unknown: "旧批改记录" };
export type GradingFailure = { code: string; stage: GradingStage; failedAt: string; reason: string; nextStep: string; source: "runtime" | "server-log" };
export function gradingFailureText(code: string) {
  let reason = "这次批改处理没有完成，具体原因暂未记录。";
  let nextStep = "原件已保存，不用重新上传。可以请家长重试。";
  if (code === "INVALID_ENVELOPE") reason = "AI返回的内容未能正常解析，没能读到可用的批改回复。";
  else if (code === "INCOMPLETE_RESPONSE") reason = "AI这次的回答没有完整结束，批改结果尚未生成。";
  else if (code === "INVALID_RESULT") reason = "AI回复未符合批改记录要求，系统没有采用这次结果。";
  else if (code === "NETWORK_ERROR") reason = "连接AI服务时发生网络异常，没能收到完整回复。";
  else if (code === "HTTP_429") reason = "AI服务暂时限制了请求，批改没有完成。";
  else if (/^HTTP_5\d\d$/.test(code)) reason = "AI服务暂时不可用，批改没有完成。";
  else if (code === "HTTP_401" || code === "HTTP_403") { reason = "AI服务的访问验证没有通过。"; nextStep = "原件已保存，请家长检查服务配置后再重试。"; }
  else if (code === "BUDGET_LIMIT") { reason = "今天的作业AI额度已用完。"; nextStep = "额度恢复后自动继续；家长也可以在家庭设置中提高额度，不用重传。"; }
  else if (code === "INVALID_GRADING_EVIDENCE" || code === "DUPLICATE_GRADING_QUESTION") reason = "AI识别出的题号或照片依据没有对应好，这次结果未采用。";
  else if (code === "INVALID_GRADING_VERIFICATION" || code === "INVALID_GRADING_FOCUS") reason = "AI复核返回的题目没有完整对应，这次复核未完成。";
  else if (code === "INVALID_IMAGES") { reason = "这一批图片超过了单次AI处理范围。"; nextStep = "原件已保存，请家长检查页面数量或图片大小后再处理。"; }
  else if (code === "LOCAL_ERROR") { reason = "系统处理这页作业时出现异常，批改结果尚未保存。"; nextStep = "原件已保存，可以请家长重试；仍未完成时可联系维护人员检查。"; }
  else if (code === "SUPERSEDED") { reason = "这页作业的要求已更新，旧的批改已停止。"; nextStep = "系统会使用更新后的要求继续处理。"; }
  return { reason, nextStep };
}
