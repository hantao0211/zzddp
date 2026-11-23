import type { ReactNode } from "react";

/** Keep the title, one-line note, and right-hand status steady across the four tabs. */
export function StudyPageHeading({title,subtitle,aside,className=""}:{title:string;subtitle:ReactNode;aside:ReactNode;className?:string}) {
  return <div className={`study-page-heading ${className}`}>
    <div className="study-page-heading-copy"><h1>{title}</h1><div className="study-page-subtitle">{subtitle}</div></div>
    <div className="study-page-heading-aside">{aside}</div>
  </div>;
}
