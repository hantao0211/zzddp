import assert from "node:assert/strict";
import test from "node:test";
import {parseBookQuery,validISBN,BookQueryError} from "../src/domain/book-query";
import {lookupBooks} from "../src/server/reading/catalog";
const response=(data:unknown)=>new Response(JSON.stringify(data),{headers:{"Content-Type":"application/json"}});
test("ISBN check digits distinguish printing codes from ISBNs, retain numeric book titles",()=>{
 assert.deepEqual(parseBookQuery("1984"),{kind:"title",value:"1984"});
 assert.deepEqual(parseBookQuery("ＩＳＢＮ：９７８－０－０００－０００００－２"),{kind:"isbn",value:"9780000000002"});
 assert.deepEqual(parseBookQuery("ISBN-10: 0-306-40615-2"),{kind:"isbn",value:"0306406152"});
 assert.equal(validISBN("080442957X"),true);
 for(const input of ["01-2024-1017","ISBN 123","9780000000003","0120241017","97800000000022","1234567890123"]){assert.throws(()=>parseBookQuery(input),BookQueryError);}
});
test("bad ISBN is rejected before any external request",async()=>{
 let calls=0;const request:typeof fetch=async()=>{calls++;return response({});};
 await assert.rejects(lookupBooks("01-2024-1017",request),BookQueryError);assert.equal(calls,0);
});
test("catalog outage falls back to exact ISBN metadata from Open Library",async()=>{
 const urls:string[]=[];const request:typeof fetch=async(input,init)=>{const url=String(input);urls.push(url);assert.equal(init?.redirect,"error");if(url.startsWith("https://www.googleapis.com/"))throw Error("simulated connection failure");assert.equal(new URL(url).searchParams.get("bibkeys"),"ISBN:9780000000002");return response({"ISBN:9780000000002":{title:"模拟书名",authors:[{name:"模拟作者"}],publishers:[{name:"模拟出版社"}],number_of_pages:150,url:"https://untrusted.example/"}});};
 const found=await lookupBooks("9780000000002",request);assert.equal(urls.length,2);assert.equal(found[0].publisher,"模拟出版社");assert.equal(found[0].totalPages,150);assert.equal(found[0].sourceUrl,"https://openlibrary.org/isbn/9780000000002");
});
test("title fallback never combines version metadata across editions or accepts external URLs",async()=>{
 const request:typeof fetch=async input=>String(input).startsWith("https://www.googleapis.com/")?response({totalItems:0}):response({docs:[{key:"/works/OL123W",title:"模拟书名",author_name:["作者"],isbn:["9780000000002"],publisher:["不同版本出版社"],number_of_pages_median:999},{key:"https://untrusted.example/book",title:"拒绝此链接"}]});
 const found=await lookupBooks("模拟书名",request);assert.equal(found.length,1);assert.equal(found[0].isbn,"");assert.equal(found[0].publisher,"");assert.equal(found[0].totalPages,null);assert.equal(found[0].sourceUrl,"https://openlibrary.org/works/OL123W");
});
test("no matches and total service failure remain distinct, responses are bounded",async()=>{
 assert.deepEqual(await lookupBooks("模拟书名",async()=>response({items:[],docs:[]})),[]);
 let calls=0;await assert.rejects(lookupBooks("模拟书名",async()=>{calls++;throw Error("offline");}),/Catalog unavailable/);assert.equal(calls,3);
 assert.deepEqual(await lookupBooks("模拟书名",async input=>String(input).includes("googleapis")?response({items:[]}):new Response("broken JSON")),[]);
 await assert.rejects(lookupBooks("模拟书名",async()=>new Response("x".repeat(512001))),/Catalog unavailable/);
});
