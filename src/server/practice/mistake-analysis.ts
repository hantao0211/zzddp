import { knowledgeGroups } from "../../domain/knowledge-groups";
import { createHash } from "node:crypto";
import { z } from "zod";
import { classifyQuestion, dimensions, type Analysis, type Dimension, type Tags, type Observation, type ExamMeta } from "../../domain/assessment";
import type { GradingResult, GradedQuestion } from "../../domain/grading";
import { inferLearningScope, type PracticeCandidate, type LearningScope, type PracticeSubject, type PracticePaper, type PracticeAnswer } from "../../domain/practice";
import { studentProfile } from "../reading/student-profile";
import { HomeworkError } from "../homework/store";
import type { PracticeStore } from "./store";

const hash=(v:unknown)=>createHash("sha256").update(JSON.stringify(v)).digest("hex");
const stageLabel=(grade:number,semester:number)=>grade+"年级"+(semester===1?"上":"下")+"学期";
const term=(date:string)=>{const month=Number(date.slice(5,7));return [Number(date.slice(0,4))-(month===1?1:0),month>=9||month===1?1:2].join("/");};
type Event={id:string;date:string;subject:string;scope:LearningScope;origin:string;tags:Tags;verdict:string;full:boolean;document:string};
type ClassifiedEvent = Event & { knowledgeGroups: string[] };
type Edited={revision:number; tags:Partial<Tags>};
const editSchema=z.object({revision:z.number().int().min(0),tags:z.partialRecord(z.enum(["stage","form","scene","knowledge","skill","cause","unit","difficulty"]),z.array(z.string().trim().min(1).max(100)).min(1).max(8))}).strict();
function period(date:string,grain:string,stage:string) {
  if(!date)return "测验日期待补充";
  if(grain==="term")return term(date).split("/")[0]+" · "+stage;
  if(grain!=="week")return date.slice(0,7);
  const d=new Date(date+"T00:00:00Z");d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);return d.toISOString().slice(0,10);
}
export class MistakeAnalysis {
  constructor(readonly store:PracticeStore){
    store.db.exec(`CREATE TABLE IF NOT EXISTS analysis_sources(run_id TEXT PRIMARY KEY,stage TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS analysis_grade_history(run_id TEXT NOT NULL,revision INTEGER PRIMARY KEY,date TEXT NOT NULL,record TEXT NOT NULL);
      CREATE TRIGGER IF NOT EXISTS analysis_grade_revision BEFORE UPDATE OF result ON grading_runs WHEN OLD.result IS NOT NULL AND OLD.result IS NOT NEW.result BEGIN INSERT INTO analysis_grade_history(run_id,date,record) VALUES(OLD.id,OLD.updated_at,OLD.result); END;
      CREATE TABLE IF NOT EXISTS analysis_tag_history(id TEXT NOT NULL,revision INTEGER NOT NULL,rules INTEGER NOT NULL,automatic TEXT NOT NULL,evidence TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(id,revision));
      CREATE INDEX IF NOT EXISTS analysis_queue_source_date ON grading_runs(active,status,date);
      CREATE TABLE IF NOT EXISTS analysis_queue(run_id TEXT PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS analysis_events(run_id TEXT NOT NULL,id TEXT NOT NULL,day TEXT NOT NULL,subject TEXT NOT NULL,page_id TEXT NOT NULL,title TEXT NOT NULL,document TEXT NOT NULL,verdict TEXT NOT NULL,full INTEGER NOT NULL,tags TEXT NOT NULL,PRIMARY KEY(run_id,id));
      CREATE INDEX IF NOT EXISTS analysis_event_dates ON analysis_events(subject,day);
      CREATE TABLE IF NOT EXISTS mistake_tag_edits(id TEXT NOT NULL,revision INTEGER NOT NULL,tags TEXT NOT NULL,actor TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(id,revision));
      CREATE TRIGGER IF NOT EXISTS analysis_grade_added AFTER INSERT ON grading_runs WHEN NEW.result IS NOT NULL BEGIN INSERT OR IGNORE INTO analysis_queue VALUES(NEW.id); END;
      CREATE TRIGGER IF NOT EXISTS analysis_grade_changed AFTER UPDATE OF result,source,active,status ON grading_runs WHEN NEW.result IS NOT NULL AND (NEW.result IS NOT OLD.result OR NEW.source IS NOT OLD.source OR NEW.active!=OLD.active OR NEW.status!=OLD.status) BEGIN INSERT OR IGNORE INTO analysis_queue VALUES(NEW.id); END;
      INSERT OR IGNORE INTO analysis_queue SELECT id FROM grading_runs WHERE result IS NOT NULL AND id NOT IN(SELECT run_id FROM analysis_sources);`);
  }
  private atomic<T>(fn:()=>T):T {
    const db=this.store.db;
    db.exec("SAVEPOINT analysis_update");
    try{const value=fn();db.exec("RELEASE analysis_update");return value;}
    catch(error){db.exec("ROLLBACK TO analysis_update; RELEASE analysis_update");throw error;}
  }
  sync(batch=32){
    const db=this.store.db,profile=studentProfile(this.store.reading),today=this.store.today();
    const runs=db.prepare("SELECT r.* FROM analysis_queue q JOIN grading_runs r ON r.id=q.run_id ORDER BY q.rowid LIMIT ?").all(batch);
    if(!runs.length)return 0;
    this.atomic(()=>{
      for(const r of runs){
        const id=String(r.id),date=String(r.date),source=JSON.parse(String(r.source));
        const semester=Number(term(date).split("/")[1]);
        const stage=profile&&term(date)===term(today)&&profile.semester===semester?stageLabel(profile.grade,semester):"待确认";
        db.prepare("INSERT OR IGNORE INTO analysis_sources VALUES(?,?)").run(id,stage);
        db.prepare("DELETE FROM analysis_events WHERE run_id=?").run(id);
        if(r.active&&r.status==="done"&&r.result){
          const snapshot=String(db.prepare("SELECT stage FROM analysis_sources WHERE run_id=?").get(id)!.stage);
          const page=this.store.homework.page(source.primaryPageId), file=page&&this.store.homework.file(page.file_id);
          const links=new Map(db.prepare("SELECT question_id,mistake_id FROM grading_occurrences WHERE run_id=?").all(id).map(row=>[String(row.question_id),String(row.mistake_id)]));
          const result=JSON.parse(String(r.result)) as GradingResult;
          for(const q of result.questions){
            const key=links.get(q.id)??hash({file:file?.sha256??source.primaryPageId,page:page?.number??1,subject:source.subject,label:q.label.normalize("NFKC").replace(/\s/g,"")});
            const tags=classifyQuestion(q.label,q.question,q.knowledgePoints??[],q.cause,snapshot,"作业",unitOf(source.title));
            const document=JSON.stringify([date,source.subject,source.taskIds?.length?source.taskIds:page?.file_id??source.primaryPageId]);
            db.prepare("INSERT OR REPLACE INTO analysis_events VALUES(?,?,?,?,?,?,?,?,?,?)").run(id,key,date,source.subject,source.primaryPageId,source.title,document,q.verification==="agreed"?q.verdict:"uncertain",Number(result.scopeComplete),JSON.stringify(tags));
          }
        }
        db.prepare("DELETE FROM analysis_queue WHERE run_id=?").run(id);
      }
    });
    return runs.length;
  }
  saveEdit(id:string,raw:unknown,actor:string){
    const input=editSchema.parse(raw),db=this.store.db;
    if(!this.store.candidates().some(c=>c.id===id))throw new HomeworkError(404,"错题已更新。");
    return this.atomic(()=>{
      const old=db.prepare("SELECT revision,tags FROM mistake_tag_edits WHERE id=? ORDER BY revision DESC LIMIT 1").get(id);
      if(Number(old?.revision??0)!==input.revision)throw new HomeworkError(409,"标签刚被修改，请重新打开。");
      db.prepare("INSERT INTO mistake_tag_edits VALUES(?,?,?,?,?)").run(id,input.revision+1,JSON.stringify(input.tags),actor,this.store.time());return {saved:true};
    });
  }
  query(candidates:PracticeCandidate[],params:URLSearchParams,subject?:PracticeSubject,scope?:LearningScope){
    this.sync();
    const db=this.store.db,events=new Map<string,ClassifiedEvent>(),wrong=new Map(candidates.map(c=>[c.id,c]));
    const edits=new Map<string,Edited>(db.prepare("SELECT id,revision,tags FROM mistake_tag_edits m WHERE revision=(SELECT MAX(revision) FROM mistake_tag_edits WHERE id=m.id)").all().map(r=>[String(r.id),{revision:Number(r.revision),tags:JSON.parse(String(r.tags))}]));
    const autoTags=new Map<string,string>();
    function add(e:Event){
      const candidate=wrong.get(e.id);
      if(candidate){
        e.scope=candidate.scope;
        const {lastVerdict}=candidate.stats;
        e.tags.state=[lastVerdict==="correct"?"最近复测通过":lastVerdict==="wrong"?"最近复测仍错":lastVerdict?"复测待确认":"暂无复测"];
      }
      if(candidate)autoTags.set(e.id,JSON.stringify(e.tags));
      Object.assign(e.tags,edits.get(e.id)?.tags);
      const record = {...e, knowledgeGroups: knowledgeGroups(e.subject, e.tags.knowledge)};
      events.set(e.date+"|"+e.id,record);
      return record;
    }
    const rows=db.prepare("SELECT a.* FROM analysis_events a JOIN grading_runs r ON r.id=a.run_id AND r.active=1 AND r.status='done' WHERE (? IS NULL OR a.subject=?) ORDER BY r.updated_at,r.rowid").all(subject??null,subject??null);
    const origins=this.store.homework.scopes.forMistakes(rows.map(r=>({id:String(r.id),first_date:String(r.day),page_id:String(r.page_id),subject:String(r.subject)})));
    for(const r of rows){
      const id=String(r.id),o=origins.get(id);
      const inherited=o?.task?.confirmed?o.task.scope:o?.upload?.confirmed?o.upload.scope:inferLearningScope(String(r.title),o?.task?.scope);
      add({id,date:String(r.day),subject:String(r.subject),scope:inherited,origin:"作业",tags:JSON.parse(String(r.tags)),verdict:String(r.verdict),full:!!r.full,document:String(r.document)});
    }
    for(const r of db.prepare("SELECT q.id,q.payload,p.exam_id,CASE WHEN NOT EXISTS(SELECT 1 FROM exam_pages other WHERE other.exam_id=p.exam_id AND (other.coverage!='complete' OR other.status!='done')) THEN 'complete' ELSE 'partial' END coverage,e.metadata FROM exam_questions q JOIN exam_pages p ON p.id=q.page_id JOIN exams e ON e.id=p.exam_id").all()){
      const q=JSON.parse(String(r.payload)) as Observation,m=JSON.parse(String(r.metadata)) as ExamMeta;
      add({id:String(r.id),date:m.date??"",subject:m.subject??"科目待补充",scope:m.scope??"unknown",origin:m.kind??"已批试卷",tags:classifyQuestion(q.label,q.question,q.knowledgePoints,q.cause,m.grade&&m.semester?stageLabel(m.grade,m.semester):m.grade?m.grade+"年级":"待确认",m.kind??"已批试卷",m.unit),verdict:q.verdict,full:r.coverage==="complete",document:String(r.exam_id)});
    }
    const retests:{id:string;date:string;subject:string;verdict:string;parents:string[];tags:Tags}[]=[];
    for(const r of db.prepare("SELECT r.*,t.paper,t.profile FROM practice_results r JOIN practice_tasks t ON t.id=r.practice_id").all()){
      const a=JSON.parse(String(r.result)) as PracticeAnswer,paper=JSON.parse(String(r.paper)) as PracticePaper;
      const q=paper.questions.find(q=>q.id===r.question_id);if(!q)continue;
      const profile=JSON.parse(String(r.profile)),id="practice:"+hash([r.practice_id,r.question_id]);
      const tags=classifyQuestion("",q.question,[q.knowledgePoint],"",stageLabel(profile.grade,profile.semester),"小练习","");
      add({id,date:String(r.date),subject:String(r.subject),scope:"curricular",origin:"小练习",tags,verdict:a.verdict,full:true,document:String(r.practice_id)});
      retests.push({id,date:String(r.date),subject:String(r.subject),verdict:a.verdict,parents:JSON.parse(String(r.sources)),tags});
    }
    const byId=new Map([...events.values()].map(e=>[e.id,e]));
    for(const c of candidates){
      if(byId.has(c.id))continue;
      const row=db.prepare("SELECT payload,page_id FROM grading_mistakes WHERE id=?").get(c.id);
      if(!row)continue;
      const q=JSON.parse(String(row.payload)) as GradedQuestion;
      const tags=classifyQuestion(q.label,c.question,c.knowledgePoints,q.cause,"待确认","作业",unitOf(c.title));
      const event:Event={id:c.id,date:c.lastDate,subject:c.subject,scope:c.scope,origin:"作业",tags,verdict:"wrong",full:false,document:String(row.page_id)};
      byId.set(c.id,add(event));
    }
    const tagHistory=db.prepare("SELECT id,revision,automatic,evidence FROM analysis_tag_history h WHERE revision=(SELECT MAX(revision) FROM analysis_tag_history WHERE id=h.id)").all();
    const history=new Map(tagHistory.map(row=>[String(row.id),row]));
    this.atomic(()=>{
      for(const candidate of candidates){
        const e=byId.get(candidate.id);if(!e)continue;
        // Keep automatic classifications independent from the family's overrides.
        const stored=autoTags.get(e.id);
        if(!stored)continue;
        const evidence=JSON.stringify({source:e.origin,title:candidate.assignmentTitle??candidate.title,question:candidate.question.slice(0,180),knowledge:candidate.knowledgePoints});
        const prior=history.get(e.id);
        if(prior?.automatic===stored && prior.evidence===evidence)continue;
        db.prepare("INSERT INTO analysis_tag_history VALUES(?,?,?,?,?,?)").run(e.id,Number(prior?.revision??0)+1,1,stored,evidence,this.store.time());
      }
    });
    const selected=dimensions.map(d=>[d,params.getAll(d)] as const).filter(([,v])=>v.length);
    const from=params.get("from"),to=params.get("to");
    const inRange=(date:string)=>(!!date||(!from&&!to))&&(!from||date>=from)&&(!to||date<=to);
    const matchesTags=(e:ClassifiedEvent)=>(!subject||e.subject===subject)&&(!scope||e.scope===scope)&&selected.every(([d,v])=>e.tags[d].some(t=>v.includes(t)) || (d==="knowledge" && e.knowledgeGroups.some(t=>v.includes(t))));
    const list=candidates.filter(c=>{const e=byId.get(c.id);return e&&matchesTags(e)&&inRange(e.date);});
    const options={} as Record<Dimension,string[]>;
    for(const d of dimensions){
      const values=candidates.flatMap(c=>{
        const e=byId.get(c.id);
        if(!e)return [];
        return d==="knowledge"?e.knowledgeGroups:e.tags[d];
      });
      options[d]=[...new Set(values)].sort();
    }
    const matchingEvents=[...events.values()].filter(matchesTags);
    const records=matchingEvents.filter(e=>inRange(e.date));
    const sourceIds=new Set(matchingEvents.map(e=>e.id)),documents=new Set<string>();
    const trends=new Map<string,Analysis["trends"][number]>(),focus=new Map<string,{wrong:number;docs:Set<string>;latest:string;ids:Set<string>}>();
    const bucket=(date:string,stage:string)=>{const key=period(date,params.get("grain")??"month",stage);let b=trends.get(key);if(!b){b={period:key,wrong:0,known:0,partial:0,passes:0,retests:0};trends.set(key,b);}return b;};
    const analysis:Analysis={wrong:0,sources:0,known:0,partial:0,unknown:0,wrongRate:null,retestCorrect:0,retestKnown:0,trends:[],focus:[]};
    for(const e of records){
      if(e.origin==="小练习")continue;
      const b=bucket(e.date,e.tags.stage[0]);
      if(e.verdict==="wrong"){
        analysis.wrong++;b.wrong++;documents.add(e.document);
        for(const key of e.knowledgeGroups){
          const v=focus.get(key)??{wrong:0,docs:new Set<string>(),latest:"",ids:new Set<string>()};
          v.wrong++;v.docs.add(e.document);v.ids.add(e.id);if(v.latest<e.date)v.latest=e.date;focus.set(key,v);
        }
      }
      if(!e.full){analysis.partial++;b.partial++;}
      if(["correct","wrong"].includes(e.verdict)){analysis.known++;b.known++;}else analysis.unknown++;
    }
    const relevant=retests.filter(r=>(r.parents.some(p=>sourceIds.has(p))||sourceIds.has(r.id))&&inRange(r.date)&&["correct","wrong"].includes(r.verdict));
    for(const r of relevant){analysis.retestKnown++;const b=bucket(r.date,r.tags.stage[0]);b.retests++;if(r.verdict==="correct"){analysis.retestCorrect++;b.passes++;}}
    analysis.sources=documents.size;analysis.wrongRate=analysis.known&&!analysis.partial?Math.round(100*analysis.wrong/analysis.known):null;
    analysis.trends=[...trends.values()].sort((a,b)=>b.period.localeCompare(a.period));
    analysis.focus=[...focus.entries()].filter(([k])=>k!=="待分类").map(([name,v])=>{const retest=relevant.filter(r=>r.parents.some(p=>v.ids.has(p)));return {name,wrong:v.wrong,sources:v.docs.size,latest:v.latest,retests:retest.length,passed:retest.filter(r=>r.verdict==="correct").length};}).sort((a,b)=>b.sources-a.sources||b.wrong-a.wrong||b.latest.localeCompare(a.latest)).slice(0,8);
    return {list,byId,edits,options,analysis,indexing:!!db.prepare("SELECT 1 FROM analysis_queue LIMIT 1").get()};
  }
}
function unitOf(title:string){return title?.match(/(?:第[一二三四五六七八九十\d]+单元|(?:Unit\s*|U)\d+)/i)?.[0]??"";}
