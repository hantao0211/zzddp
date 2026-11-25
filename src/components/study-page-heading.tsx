import { useId, type ReactNode } from "react";
import { CalendarDays } from "lucide-react";

/** Keep the title, one-line note, and right-hand status steady across the four tabs. */
export function StudyPageHeading({title,subtitle,aside,className=""}:{title:string;subtitle:ReactNode;aside:ReactNode;className?:string}) {
  return <div className={`study-page-heading ${className}`}>
    <div className="study-page-heading-copy"><h1>{title}</h1><div className="study-page-subtitle">{subtitle}</div></div>
    <div className="study-page-heading-aside">{aside}</div>
  </div>;
}

/** Stable date display while retaining the platform's accessible date picker. */
export function StudyHeadingDate({value,onChange}:{value:string;onChange:(value:string)=>void}) {
  const weekdayId = useId();
  const day = new Date(value + "T00:00:00Z").getUTCDay();
  const weekday = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][day];
  return <label className="hw-date journal-date study-heading-badge study-heading-date">
    <span>作业日期</span>
    <CalendarDays aria-hidden="true"/>
    <time dateTime={value} aria-hidden="true">{value.replaceAll("-","/")}<small id={weekdayId}>{weekday}</small></time>
    <input type="date" aria-label="作业日期" aria-describedby={weekdayId} value={value} onChange={event=>{if(event.target.value)onChange(event.target.value);}}/>
  </label>;
}
