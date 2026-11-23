import assert from "node:assert/strict";
import test from "node:test";
import {lookupBooks} from "../src/server/reading/catalog";
import {lookupXinhua,xinhuaCandidates,xinhuaBook} from "../src/server/reading/catalog-xinhua";
import {isBookCollection,isbn13} from "../src/domain/book-query";
const isbn="9787000000001",id="110000100000001";
const query={kind:"isbn" as const,value:isbn};
const entities=(s:string)=>s.replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;");
const card=(key:string,title:string)=>`<li class="product js-product " data-id="${key}"><p class="product-desc"><a href="//item.xhsd.com/items/${key}">${title}</a></p><ul><li>ignored</li></ul></li>`;
const search=(title="模拟·故事",key=id)=>`<ul class="shop-search-items-img-type">${card(key,title)}</ul>`;
const item=(overrides:Record<string,unknown>={})=>`<div class="item-title" data-id="${id}" data-item="${entities(JSON.stringify({id:Number(id),name:"模拟·故事",itemCode:isbn,otherAttributes:[{otherAttributes:[{attrKey:"作者",attrVal:"模拟作者"},{attrKey:"出版社",attrVal:"模拟出版社"},{attrKey:"页数",attrVal:"123"}]}],...overrides}))}"></div>`;
const html=(s:string)=>new Response(s,{headers:{"Content-Type":"text/html; charset=utf-8"}});
test("Chinese ISBN/title queries use the reachable public catalog before international catalogs",async()=>{
 for(const value of [isbn,"模拟故事"]){
  const urls:string[]=[];const request:typeof fetch=async(input,init)=>{const url=String(input);urls.push(url);assert.equal(init?.redirect,"error");return url.startsWith("https://search.xhsd.com/")?html(search()):html(item());};
  const result=await lookupBooks(value,request);assert.equal(urls.length,2);assert.equal(result[0].title,"模拟·故事");assert.equal(result[0].isbn,isbn);assert.equal(result[0].totalPages,123);assert.equal(result[0].publisher,"模拟出版社");assert.equal(result[0].sourceUrl,"https://item.xhsd.com/items/"+id);
 }
});
test("search filtering ignores recommendations and malicious ids, bounds candidate pages",()=>{
 const page=`<ul class="shop-search-items-img-type">${card("1/evil","模拟故事")}${card("110000100000002","无关推荐")}${Array.from({length:7},(_,i)=>card("11000010000000"+i,"模拟·故事"+i)).join("")}</ul>`;
 assert.deepEqual(xinhuaCandidates(page,{kind:"title",value:"模拟故事"}),["110000100000000","110000100000001","110000100000002"]);
 assert.deepEqual(xinhuaCandidates(search("不相关"),{kind:"title",value:"模拟故事"}),[]);
 assert.throws(()=>xinhuaCandidates("<html>Verify you are human</html>",query),/Unrecognized/);
});
test("book identity and actual ISBN must match; merchandise and alternate editions are excluded",()=>{
 assert.equal(xinhuaBook(item({itemCode:"9780000000002"}),id,query),null);
 assert.equal(xinhuaBook(item({itemCode:"NOT_A_BOOK"}),id,query),null);
 assert.throws(()=>xinhuaBook(item({id:110000100000002}),id,query),/identity mismatch/);
 assert.throws(()=>xinhuaBook("<html>challenge</html>",id,query),/Unrecognized/);
 assert.equal(xinhuaBook(item(),id,{kind:"title",value:"无关书名"}),null);
});
test("set metadata is labelled by title and never uses all-volume pages for a single reading book",()=>{
 assert.equal(isBookCollection("模拟故事（全七册）"),true);assert.equal(isBookCollection("模拟故事单册"),false);
 assert.equal(xinhuaBook(item({name:"模拟故事（全七册）"}),id,query)!.totalPages,null);
 assert.equal(isbn13("0306406152"),"9780306406157");
});
test("a failed detail page does not suppress valid results; all failed pages remain service failure",async()=>{
 const request:typeof fetch=async input=>{const url=String(input);if(url.startsWith("https://search.xhsd.com/"))return html(`<ul class="shop-search-items-img-type">${card("110000100000002","模拟故事")}${card(id,"模拟故事")}</ul>`);if(url.endsWith(id))return html(item());throw Error("offline");};
 assert.equal((await lookupXinhua(query,request)).length,1);
 await assert.rejects(lookupXinhua(query,async input=>String(input).includes("search.xhsd")?html(search()):html("changed layout")),/unavailable/);
});
