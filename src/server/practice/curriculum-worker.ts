import { record, failureCode } from "../diagnostics/events";
import {createHash} from "node:crypto";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {mkdtemp,readFile,rm} from "node:fs/promises";
import {join} from "node:path";
import {CurriculumIndexSchema} from "../../domain/practice";
import {HomeworkExecution} from "../homework/execution";
import {HomeworkError} from "../homework/store";
import type {StructuredAI,AIImage} from "../ai/provider";
import {CurriculumStore,type IndexJob} from "./materials";
const exec=promisify(execFile);
export class CurriculumWorker{
 private execution:HomeworkExecution;private running=false;
 constructor(readonly materials:CurriculumStore,ai:()=>StructuredAI){this.execution=new HomeworkExecution(materials.practice.homework,ai);materials.practice.db.prepare("UPDATE curriculum_index_jobs SET status='failed',note='服务重启，原件已保存，可以重试所选页。' WHERE status='running'").run();}
 async tick(){if(this.running)return false;this.running=true;let job:IndexJob|undefined,temporary:string|undefined;const s=this.materials.practice;
 try{job=s.homework.transaction(()=>{const j=s.db.prepare("SELECT * FROM curriculum_index_jobs WHERE status='queued' AND attempts<2 ORDER BY rowid LIMIT 1").get() as IndexJob|undefined;if(!j)return;s.db.prepare("UPDATE curriculum_index_jobs SET status='running',attempts=attempts+1 WHERE id=?").run(j.id);return{...j,attempts:j.attempts+1};});if(!job)return false;
 const file=this.materials.file(job.file_id),material=this.materials.material(file.material_id),input=this.materials.path(file.id);temporary=await mkdtemp(join(this.materials.directory,"render-"));const images:AIImage[]=[];
 const run=(command:string,args:string[])=>exec(command,args,{timeout:60000,maxBuffer:256*1024,env:{...process.env,MAGICK_THREAD_LIMIT:"1"}});
 if(file.mime==="application/pdf"){const info=await run("/usr/bin/pdfinfo",[input]);const pages=Number(info.stdout.match(/^Pages:\s+(\d+)/m)?.[1]||0);if(job.last>pages)throw new HomeworkError(400,"所选页码超过PDF范围，请核对原件页码。");}
 for(let page=job.first;page<=job.last;page++){let source=input;
 if(file.mime==="application/pdf"){const prefix=join(temporary,"page-"+page);await run("/usr/bin/pdftoppm",["-f",String(page),"-l",String(page),"-scale-to","2000","-singlefile","-jpeg",input,prefix]);source=prefix+".jpg";}
 else if(file.mime==="image/heic"){source=join(temporary,"heic.jpg");await run("/usr/bin/heif-convert",[input,source]);}
 const output=join(temporary,"scaled-"+page+".jpg");await run("/usr/bin/convert",["-limit","memory","64MiB","-limit","map","128MiB","-limit","disk","512MiB",source+"[0]","-auto-orient","-resize","1600x2200>","-background","white","-alpha","remove","-strip","-quality","82",output]);
 const bytes=await readFile(output);if(bytes.length>2000000)throw new HomeworkError(400,"所选页面过大，请换成清晰分开的单页照片。");images.push({fileId:file.id+"-p"+page,mimeType:"image/jpeg",base64:bytes.toString("base64")});}
 const ai=this.execution.forJob(undefined,undefined,{date:s.today(),title:"课程资料整理："+material.title,runId:job.id,attempt:job.attempts});
 const cacheKey="curriculum-index-v1:"+createHash("sha256").update(JSON.stringify({subject:material.subject,grade:material.grade,semester:material.semester,scope:material.scope,unit:material.unit,first:job.first,last:job.last,images:images.map(i=>createHash("sha256").update(i.base64).digest("hex"))})).digest("hex");
 const value=await this.execution.cached(cacheKey,async()=>{const value=await ai.run("index_curriculum",CurriculumIndexSchema,{subject:material.subject,scope:material.scope,grade:material.grade,semester:material.semester,selectedUnit:material.unit,pages:images.map((i,n)=>({fileId:i.fileId,page:job!.first+n})),instructions:"只整理本次实际提供的页面，保留题干、要求、知识说明和页码，不虚构未提供的教材内容或标准答案。看不清的地方记入uncertainties。不要提取学生姓名、学号、住址等与课程内容无关的信息。"},images);
 if(value.subject&&value.subject!==material.subject)throw new HomeworkError(409,"页面科目与所选资料分类不同，请先核对分类再整理。");
 if(value.pages.length!==images.length||new Set(value.pages.map(p=>p.page)).size!==images.length||value.pages.some(p=>p.page<job!.first||p.page>job!.last))throw new HomeworkError(409,"所选页面与整理结果未完整对应，本次未发布课程内容。");
 return value;});
 if(this.materials.material(material.id).revision!==material.revision)throw new HomeworkError(409,"资料分类刚更新，请按当前分类重试，本次未发布旧内容。");
 s.homework.transaction(()=>{for(const p of value.pages)s.db.prepare("INSERT INTO curriculum_pages VALUES(?,?,?,?,?,?) ON CONFLICT(file_id,page) DO UPDATE SET text=excluded.text,unit=excluded.unit,knowledge=excluded.knowledge WHERE NOT EXISTS(SELECT 1 FROM curriculum_page_edits e WHERE e.file_id=excluded.file_id AND e.page=excluded.page)").run(material.id,file.id,p.page,p.text,value.unit||material.unit,JSON.stringify(value.knowledgePoints));s.db.prepare("UPDATE curriculum_index_jobs SET status='done',note=? WHERE id=?").run(value.uncertainties.join("；"),job!.id);});return true;
 }catch(e){record({ event: "curriculum.index", error: true, code: failureCode(e) });if(job)s.db.prepare("UPDATE curriculum_index_jobs SET status='failed',note=? WHERE id=?").run(e instanceof HomeworkError?e.message:"所选页面尚未整理完成，原件已保存，可以重试或选择更清晰的页面。",job.id);return !!job;}
 finally{if(temporary)await rm(temporary,{recursive:true,force:true});this.running=false;}}
}
