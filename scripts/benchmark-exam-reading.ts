// Run in the private environment with a reviewed manifest. Only aggregate scores go to stdout.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { z } from "zod";
import { examImage } from "../src/server/practice/exam-image";
import { localReadings, region } from "../src/server/practice/exam-local-reading";
import { readAIConfiguration, VisionAI } from "../src/server/ai/provider";
import { AI_INSTRUCTIONS } from "../src/domain/ai-contracts";

const manifestSchema=z.array(z.object({path:z.string(),targets:z.array(z.object({
  label:z.string(),anchor:z.string(),box:region,finalNumber:z.boolean().default(false),answers:z.array(z.object({
    text:z.string(),mark:z.enum(["tick","cross","blank","unmarked","unclear"])
  })).min(1)
})).min(1)})).min(1);
const normalize=(s:string)=>s.normalize("NFKC").replace(/\s/g,"").trim();
async function main(){
  const [manifestFile,candidate,cacheDir,mode]=process.argv.slice(2);
  if(!manifestFile||!candidate||!cacheDir)throw Error("需要私有样本清单、同服务商候选模型名、私有结果目录。");
  const papers=manifestSchema.parse(JSON.parse(readFileSync(manifestFile,"utf8")));
  const config=readAIConfiguration();
  for(const [model,view] of [[config.model,"page"],[config.model,"crop"],[candidate,"crop"]] as const){
    let located=0,total=0,transcribed=0,matchedMark=0,falsePass=0,errors=0,calls=0;
    const ai=new VisionAI({...config,model});
    for(const paper of papers){
      const page=await examImage(paper.path,"page");
      for(let start=0;start<paper.targets.length;start+=5){
        const batch=paper.targets.slice(start,start+5);
        const targets=batch.map((t,i)=>({targetId:start+i+1,label:t.label,anchor:t.anchor,slots:t.answers.length}));
        const images=view==="page"?[page]:[];
        if(view==="crop"){
          for(const [i,t] of batch.entries())images.push(await examImage(paper.path,"target-"+targets[i].targetId,t.box));
        }
        const key=createHash("sha256").update(JSON.stringify([model,view,AI_INSTRUCTIONS.transcribe_exam_answers,targets,images])).digest("hex");
        const path=cacheDir+"/"+key+".json";
        const raw=existsSync(path)?JSON.parse(readFileSync(path,"utf8")):null;
        if(!raw&&mode==="--cached-only")throw Error("缺少已保存的识读结果。");
        if(!raw)calls++;
        const result=raw?localReadings.parse(raw):await ai.run("transcribe_exam_answers",localReadings,{targets,view,subject:"数学"},images);
        if(!raw)writeFileSync(path,JSON.stringify(result),{mode:0o600});
        for(const [i,t] of batch.entries()){
          const groups=result.groups.filter(g=>g.targetId===targets[i].targetId);
          const parts=groups.length===1&&groups[0].located&&groups[0].questions.length===t.answers.length?groups[0].questions:[];
          for(const [j,a] of t.answers.entries()){
            total++;
            if(parts[j])located++;
            const ink=normalize(parts[j]?.studentAnswer??"");
            const observed=t.finalNumber?(ink.match(/(?:^|=)([-+]?\d+(?:\.\d+)?)$/)?.[1]??ink):ink;
            if(parts[j]&&observed===normalize(a.text))transcribed++;
            if(parts[j]?.mark===a.mark)matchedMark++;
            if(a.mark==="cross"||a.mark==="blank"){errors++;if(parts[j]?.mark==="tick")falsePass++;}
          }
        }
      }
    }
    console.log(JSON.stringify({model,view,total,located,transcribed,matchedMark,errors,falsePass,calls}));
  }
}
main().catch(e=>{console.error(e.code??e.name,e.message);process.exitCode=1;});
