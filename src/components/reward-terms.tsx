import type {ReactNode} from "react";
import type {Reward} from "@/domain/reading";
import {money,type RewardContract} from "@/domain/growth-economy";

type Terms = Reward | RewardContract;

export function offerDate(day:string|null){
  return day ? day.split("-").map(Number).join("/") : "长期有效";
}

export function rewardFrequency(r:Terms){
  return [
    r.monthLimit && `每月限${r.monthLimit}次`,
    r.yearLimit && `每年限${r.yearLimit}次`,
  ].filter(Boolean).join(" · ") || "不限次数";
}

export function TermRow({label,children}:{label:string;children:ReactNode}){
  return <div><dt>{label}</dt><dd>{children}</dd></div>;
}

export function RewardTerms({reward:r,history=false}:{reward:Terms;history?:boolean}){
  const usage="usage" in r ? r.usage : undefined;
  const used=usage && [
    r.monthLimit && `本月已用 ${usage.monthCount ?? 0} 次`,
    r.yearLimit && `今年已用 ${usage.yearCount ?? 0} 次`,
  ].filter(Boolean).join(" · ");
  return <>
    <dl className="reward-facts">
      <TermRow label="兑换频率">{rewardFrequency(r)}{used&&<small>{used}</small>}</TermRow>
      {history&&r.startsOn&&<TermRow label="开始申请">{offerDate(r.startsOn)}</TermRow>}
      <TermRow label="申请截止">{offerDate(r.expiresOn)}</TermRow>
      {!!r.version && !("legacy" in r && r.legacy) && <TermRow label="使用期限">家长同意后 {r.useDays} 天内使用</TermRow>}
      {!!r.valueCents&&<TermRow label="单次上限">{money(r.valueCents)} 元</TermRow>}
      {r.kind==="shopping"&&r.monthlyBudgetCents!=null&&<TermRow label="每月额度">{money(r.monthlyBudgetCents)} 元</TermRow>}
      {!!r.version&&!history&&<TermRow label="当前约定">第{r.version}版</TermRow>}
    </dl>
    {r.description&&<p className="reward-description-full">{r.description}</p>}
    {r.changeReason&&<p className="reading-parent-note"><strong>家长更正</strong>　{r.changeReason}</p>}
  </>;
}
