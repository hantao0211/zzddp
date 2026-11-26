import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { recapRange } from "../src/domain/growth-recap";
import { HomeworkStore } from "../src/server/homework/store";
import { ReadingStore } from "../src/server/reading/store";
import { PracticeStore } from "../src/server/practice/store";
import { growthRecap } from "../src/server/practice/growth-recap";

test("成长小结跨年周、闰月及学期界线连续",()=>{
  assert.deepEqual(recapRange("week","2027-01-01"),{start:"2026-12-28",end:"2027-01-03",next:"2027-01-04",previous:"2026-12-27"});
  assert.equal(recapRange("month","2024-02-29").end,"2024-02-29");
  assert.equal(recapRange("term","2027-01-31").start,"2026-09-01");
  assert.equal(recapRange("term","2027-02-01").end,"2027-08-31");
});

test("小结只统计期间有效作答，部分卷、签名和存疑不影响正确率，阅读去重并排除删除与兑换",()=>{
  const dir=mkdtempSync(join(tmpdir(),"recap-"));
  const homework=new HomeworkStore(join(dir,"learning")),reading=new ReadingStore(join(dir,"reading"));
  try {
    const store=new PracticeStore(homework,reading), date="2026-11-25";
    const q=(verdict:string)=>({label:"1",question:"计算。",verdict,kind:"objective"});
    const put=homework.db.prepare("INSERT INTO grading_runs(id,date,primary_page_id,source,active,status,result,created_at,updated_at) VALUES(?,?,'p',?,?,'done',?,'','')");
    function run(id:string,day:string,active:number,scopeComplete:boolean,questions:unknown[]){
      put.run(id,day,JSON.stringify({subject:"数学"}),active,JSON.stringify({scopeComplete,questions}));
    }
    run("latest",date,1,true,[q("correct"),q("wrong"),q("passedWithNote"),q("blank"),{...q("wrong"),label:"家长签名",question:"请家长签名。"}]);
    run("partial",date,1,false,[q("wrong")]);
    run("old",date,0,true,[q("wrong")]);run("previous","2026-10-30",1,true,[q("wrong")]);
    const log=reading.db.prepare(`INSERT INTO logs(id,book_id,version,date,start_page,end_page,minutes,summary,chapter,reflection,excerpt,actor_id,backfilled,created_at,updated_at,review_status,input_hash)
      VALUES(?,'book',1,?,1,3,10,'','','','','a',0,'','','done','')`);
    for(const [id,day] of [["a",date],["b",date],["c","2026-11-24"],["deleted",date],["prior","2026-10-31"]])log.run(id,day);
    reading.db.prepare("INSERT INTO deleted_reading_logs VALUES('deleted',1,'a','')").run();
    reading.db.prepare("INSERT INTO audit VALUES('mark','a','book-status:finished','book','2026-11-30T20:00:00Z')").run();
    reading.award("earned",date,4,"","daily","a");reading.award("spent",date,-3,"","redeem","a");
    const result=growthRecap(store,"2026-11-01","2026-11-30");
    assert.deepEqual(result.subjects,[{subject:"数学",judged:3,correct:1,denominator:2,pending:1}]);
    assert.deepEqual({...result.reading},{books:1,minutes:30,days:2,finished:0});
    assert.equal(result.steps,4);
    homework.db.prepare("INSERT INTO exams VALUES('exam',?,?, '')").run(JSON.stringify({date,subject:"英语"}),date);
    homework.db.exec("INSERT INTO exam_pages(id,exam_id,number,sha,bytes,status,coverage) VALUES('page','exam',1,'x',4,'done','complete')");
    homework.db.prepare("INSERT INTO exam_questions VALUES('one','page',?,'wrong',1)").run(JSON.stringify(q("wrong")));
    homework.db.prepare(`INSERT INTO practice_tasks(id,date,subject,status,stage,profile,sources,result,version,actor,created_at,updated_at)
      VALUES('practice',?,'英语','graded','grading','{}','[]',?,2,'a','','')`).run(date,JSON.stringify({scopeComplete:true}));
    const answer=homework.db.prepare("INSERT INTO practice_results VALUES('practice',?,?,'英语','curricular','[]',?,?)");
    answer.run("new",2,JSON.stringify(q("correct")),date);answer.run("old",1,JSON.stringify(q("wrong")),date);
    const english=()=>growthRecap(store,date,date).subjects.find(s=>s.subject==="英语");
    assert.deepEqual(english(),{subject:"英语",judged:2,denominator:2,correct:1,pending:0});
    homework.db.exec("UPDATE exam_pages SET coverage='partial'");
    assert.equal(english()?.denominator,1);
    homework.db.exec("UPDATE exams SET metadata='{}'");
    assert.equal(english()?.judged,1);
    assert.equal(growthRecap(store,"2026-12-01","2026-12-31").reading.finished,1);
  } finally {homework.close();reading.close();rmSync(dir,{recursive:true,force:true});}
});
