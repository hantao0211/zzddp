import { RefreshCw } from "lucide-react";
import { OverflowChoices } from "./overflow-choices";

const titles = {today:"作业清单", grading:"批改结果", mistakes:"错题本", archive:"历史资料", practice:"小练习", materials:"课程资料库"};
export type HomeworkTab = keyof typeof titles;
const tabs: HomeworkTab[] = ["today","grading","mistakes","archive","practice","materials"];
const basicTabs = tabs.filter(key=>key!=="grading" && key!=="mistakes");
const tones: Record<HomeworkTab,string> = {
  today:"status-done", grading:"status-in-progress", mistakes:"status-wrong",
  archive:"status-uncertain", practice:"status-feedback", materials:"status-missing",
};

export function HomeworkNavigation({tab, grading, change, refresh}: {
  tab: HomeworkTab; grading: boolean; change: (tab: HomeworkTab)=>void; refresh: ()=>void;
}) {
  return <nav className="homework-navigation" aria-label="学习资料导航">
    <OverflowChoices order={grading?tabs:basicTabs} value={tab} onChange={change}
      name="课业页签" moreName="更多课业页签" label={key=>titles[key]} tone={key=>tones[key]}
      contents={key=><span className="grade-filter-pill">{titles[key]}</span>} />
    <button type="button" className="homework-nav-refresh" onClick={refresh} aria-label="刷新作业状态"><RefreshCw size={17} /></button>
  </nav>;
}
