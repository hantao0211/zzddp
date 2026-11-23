import assert from "node:assert/strict";
import test from "node:test";
import {operationLabels,withOperationFeedback,subscribeOperationFeedback,resetOperationFeedback,type OperationFeedback} from "../src/services/operation-feedback";

test("feedback announces foreground writes immediately, confirms only server acknowledgement and stays quiet for polling and searches",async()=>{
 const events:(OperationFeedback|null)[]=[],unsubscribe=subscribeOperationFeedback(event=>events.push(event));
 try {
  let finish!:(v:number)=>void;const pending=withOperationFeedback(operationLabels("reading/logs","POST"),()=>new Promise<number>(resolve=>finish=resolve));
  assert.equal(events.length,1);assert.equal(events[0]?.phase,"pending");finish(7);assert.equal(await pending,7);assert.equal(events[1]?.phase,"success");
  for(const [path,method] of [["reading/state","GET"],["reading/lookup","POST"],["/assistant-api/learning/state?date=2026-11-23","GET"],["learning/uploads","POST"],["session","POST"]])assert.equal(operationLabels(path,method),null);
  await withOperationFeedback(null,async()=>"quiet");assert.equal(events.length,2);
 } finally {unsubscribe();}
});
test("failed and uncertain writes report the actual error, never success; a switched account receives no stale completion",async()=>{
 const events:(OperationFeedback|null)[]=[],unsubscribe=subscribeOperationFeedback(event=>events.push(event));
 try {
  const error=new Error("未收到服务器确认，请先查看记录。");
  await assert.rejects(withOperationFeedback(operationLabels("reading/redemptions","POST"),async()=>{throw error;}),e=>e===error);
  assert.deepEqual(events.map(e=>e?.phase),["pending","error"]);assert.equal(events[1]?.message,error.message);
  let finish!:()=>void;const pending=withOperationFeedback(operationLabels("reading/books","POST"),()=>new Promise<void>(resolve=>finish=resolve));
  resetOperationFeedback();const length=events.length;finish();await pending;assert.equal(events.length,length);assert.equal(events.at(-1),null);
 } finally {unsubscribe();}
});
