import type { ReactNode } from "react";
import { CircleCheck, CircleX, CircleMinus, CircleHelp, MessageSquareText, Image, ImageOff, Images, Clock3, Minus } from "lucide-react";
const states = {
  correct: { icon: CircleCheck, label: "正确" }, wrong: { icon: CircleX, label: "错误" },
  blank: { icon: CircleMinus, label: "未作答" }, uncertain: { icon: CircleHelp, label: "未确认" },
  feedback: { icon: MessageSquareText, label: "点评" }, received: { icon: Image, label: "已收到" },
  missing: { icon: ImageOff, label: "缺照片" }, partial: { icon: Images, label: "照片不全" },
  done: { icon: CircleCheck, label: "已做完" }, pending: { icon: Clock3, label: "处理中" }, neutral: { icon: Minus, label: "暂无" },
};
export type StatusKind = keyof typeof states;
/** Shape, color and a short label work together; color alone never carries the meaning. */
export function StatusIndicator({ kind, children, className = "" }: { kind: StatusKind; children?: ReactNode; className?: string }) {
  const { icon: Icon, label } = states[kind];
  return <span className={`status-indicator status-${kind} ${className}`}><Icon aria-hidden="true" /><span>{children ?? label}</span></span>;
}
