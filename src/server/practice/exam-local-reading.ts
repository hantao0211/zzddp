import { z } from "zod";
import { observation, type Observation } from "../../domain/assessment";
import { AIServiceError } from "../ai/provider";

const coordinate=z.number().min(0).max(1000);
export const region=z.tuple([coordinate,coordinate,coordinate,coordinate])
  .refine(([left,top,right,bottom])=>left<right&&top<bottom,"无效的作答区域");
export type Region=z.infer<typeof region>;

export const paperLayout=z.object({
  coverage:z.enum(["complete","partial"]),note:z.string().max(500),metadata:z.unknown().optional(),
  targets:z.array(z.object({
    label:observation.shape.label,anchor:observation.shape.question,
    box:region,slots:z.number().int().min(1).max(80)
  })).max(80)
}).refine(p=>new Set(p.targets.map(t=>t.label.normalize("NFKC"))).size===p.targets.length,"重复的题号");

const localPart=observation.pick({question:true,studentAnswer:true,teacherMark:true,expectedAnswer:true,
  correction:true,knowledgePoints:true,cause:true,causeExplanation:true}).extend({
  part:z.string().trim().max(70),mark:z.enum(["tick","cross","blank","unmarked","unclear"])
});
export const localReadings=z.object({groups:z.array(z.object({
  targetId:z.number().int().positive(),located:z.boolean(),questions:z.array(localPart).max(80)
})).min(1).max(5)});

export type ReadingTarget=z.infer<typeof paperLayout>["targets"][number]&{targetId:number};
export function assembleReadings(targets:ReadingTarget[],readings:z.infer<typeof localReadings>){
  const groups=new Map(readings.groups.map(g=>[g.targetId,g]));
  if(readings.groups.length!==targets.length||targets.some(t=>!groups.has(t.targetId)))
    throw new AIServiceError("EXAM_GROUP_MISMATCH",true,"本组题号不齐，已保留前面读完的题。");
  const questions:Observation[]=[];
  const byTarget:Observation[][]=[];
  let partial=false;
  for(const target of targets){
    const start=questions.length;
    const group=groups.get(target.targetId)!;
    if(!group.located||!group.questions.length){
      partial=true;
      questions.push({label:target.label,question:target.anchor,studentAnswer:"",teacherMark:"",
        expectedAnswer:"",correction:"",verdict:"uncertain",confident:false,knowledgePoints:[],
        cause:"原因待确认",causeExplanation:"局部照片未定位到这题的作答。"});
      byTarget.push(questions.slice(start));
      continue;
    }
    const incomplete=group.questions.length<target.slots;
    if(incomplete)partial=true;
    for(const [i,{part,mark,...transcription}] of group.questions.entries()){
      const visibleVerdict=transcription.teacherMark.trim()?({tick:"correct",cross:"wrong",blank:"blank",unmarked:"uncertain",unclear:"uncertain"} as const)[mark]:"uncertain";
      const verdict=incomplete&&visibleVerdict==="correct"?"uncertain":visibleVerdict;
      questions.push({...transcription,label:group.questions.length===1&&!incomplete?target.label:
        target.label.slice(0,100)+" · "+(i+1)+(part?" "+part:""),
        verdict,confident:verdict!=="uncertain"});
    }
    byTarget.push(questions.slice(start));
  }
  return {questions,partial,byTarget};
}

// One printed question remains one item in the exam and in the mistake statistics.
export function questionFromParts(target:ReadingTarget,parts:Observation[]):Observation{
  if(parts.length===1)return {...parts[0],label:target.label};
  const hasError=parts.some(p=>p.verdict==="wrong"||p.verdict==="blank");
  const verdict=parts.every(p=>p.verdict==="blank")?"blank":hasError?"wrong":
    parts.length>=target.slots&&parts.every(p=>p.verdict==="correct")?"correct":"uncertain";
  const join=(field:"studentAnswer"|"teacherMark"|"correction"|"expectedAnswer",max:number)=>
    parts.flatMap((part,i)=>part[field]?[("第"+(i+1)+"处："+part[field])]:[]).join("；").slice(0,max);
  return {...parts[0],label:target.label,question:target.anchor,verdict,confident:verdict!=="uncertain",
    studentAnswer:join("studentAnswer",1200),teacherMark:join("teacherMark",500),
    correction:join("correction",1200),expectedAnswer:join("expectedAnswer",1200),
    knowledgePoints:[...new Set(parts.flatMap(p=>p.knowledgePoints))].slice(0,8),
    cause:"原因待确认",causeExplanation:""};
}

export function cropGeometry([left,top,right,bottom]:Region,width:number,height:number){
  const x=Math.max(0,Math.floor((left-15)*width/1000));
  const y=Math.max(0,Math.floor((top-12)*height/1000));
  const endX=Math.min(width,Math.ceil((right+15)*width/1000));
  const endY=Math.min(height,Math.ceil((bottom+12)*height/1000));
  return (endX-x)+"x"+(endY-y)+"+"+x+"+"+y;
}
