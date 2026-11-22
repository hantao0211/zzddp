import type { DailyReport, ExtractedHomework } from "./homework";
type Task=DailyReport["tasks"][number];
function chineseNumber(n:number) {
  const digits="零一二三四五六七八九";
  return n<10?digits[n]:n<100?`${n>=20?digits[Math.floor(n/10)]:""}十${n%10?digits[n%10]:""}`:String(n);
}
/** Decode an abbreviation from this task's actual readable heading, never from the abbreviation alone. */
export function inferTaskMeaning(task:Task,pages:ExtractedHomework["pages"]):Task {
  const alias=task.title.match(/(?:^|[^a-z])(L(?:esson)?\s*\.?\s*(\d{1,3}))(?![0-9a-z])/i);
  if(!alias||!task.evidence.length||task.evidence.length>12||task.missing.some(s=>/内容不符|科目不符|错传|不匹配|对应尚未/u.test(s)))return task;
  const number=Number(alias[2]);if(number<1||number>999)return task;
  const ids=[...new Set(task.evidence.map(e=>e.fileId))],matched=ids.map(id=>pages.find(p=>p.fileId===id));
  if(matched.some(p=>!p?.readable||p.subject!==task.subject)||task.evidence.some(e=>/内容对应尚未判清|交给.+但/u.test(e.excerpt)))return task;
  const titles=new Map<string,{fileId:string;page:number|null;excerpt:string}[]>();
  const pattern=new RegExp(`第\\s*(?:${number}|${chineseNumber(number)})\\s*课\\s*[*＊]?\\s*《([^》\\n]{1,80})》`,"gu");
  for(const page of matched){
    for(const found of page!.content.matchAll(pattern)){
      const title=found[1].trim();if(!title)continue;
      const evidence={fileId:page!.fileId,page:task.evidence.find(e=>e.fileId===page!.fileId)?.page??null,excerpt:found[0]};
      titles.set(title,[...(titles.get(title)||[]),evidence]);
    }
  }
  // Competing headings remain competing evidence, rather than becoming a permanent family rule.
  if(titles.size!==1)return task;
  const [title,evidence]=[...titles][0],abbreviation=alias[1].replace(/\s/g,"");
  const displayTitle=`第${number}课《${title}》${/练/u.test(task.title)?"练习":""}`;
  return {...task,inferredMeaning:{version:"lesson-heading-v1",abbreviation,number,title,displayTitle,description:`“${abbreviation}”根据作业课号和标题理解为第${number}课《${title}》${/练/u.test(task.title)?"的配套练习":""}。`,evidence:evidence.slice(0,12)}};
}
