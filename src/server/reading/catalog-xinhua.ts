import {z} from "zod";
import type {CatalogBook} from "../../domain/reading";
import {isbn13,isBookCollection,validISBN} from "../../domain/book-query";
import {catalogText} from "./catalog-response";

// Read only the public search cards and embedded bibliographic JSON. No scripts, account or shopping APIs.
function entities(text:string):string {
 return text.replace(/&(#x[\da-f]+|#\d+|quot|apos|amp|lt|gt|nbsp);/gi,(entity,key:string)=>{
  if(key.startsWith("#")){const n=key[1].toLowerCase()==="x"?parseInt(key.slice(2),16):Number(key.slice(1));return n>0&&n<=0x10ffff?String.fromCodePoint(n):"";}
  return ({quot:'"',apos:"'",amp:"&",lt:"<",gt:">",nbsp:" "} as Record<string,string>)[key.toLowerCase()]??entity;
 });
}
const plain=(html:string)=>entities(html.replace(/<[^>]*>/g," ")).replace(/\s+/g," ").trim();
const normalized=(text:string)=>text.normalize("NFKC").replace(/[^\p{L}\p{N}]/gu,"").toLowerCase();
export function xinhuaCandidates(html:string,query:{kind:"isbn"|"title";value:string}):string[]{
 // The catalog omits its result list entirely on an explicit empty search.
 if(/class=["'][^"']*\bicon-empty-search\b[^"']*["']/.test(html)){
  const description=html.match(/<p\b[^>]*\bclass=["']desc["'][^>]*>([^<]*没有找到与[^<]*)<\/p>/)?.[1];
  if(description && plain(description)===`抱歉，没有找到与“${query.value}”相关的商品`)return [];
 }
 if(!/class=["'][^"']*\bshop-search-items-img-type\b/.test(html))throw new Error("Unrecognized catalog search page");
 const ids:string[]=[];
 for(const card of html.matchAll(/<li\b[^>]*\bclass=["'][^"']*\bjs-product\b[^"']*["'][^>]*>[\s\S]*?(?=<li\b[^>]*\bclass=["'][^"']*\bjs-product\b|$)/g)){
  const id=card[0].match(/^<li\b[^>]*\bdata-id=["'](\d{6,20})["']/)?.[1];
  const title=plain(card[0].match(/<p\b[^>]*\bclass=["'][^"']*\bproduct-desc\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/)?.[1]||"");
  if(id&&title&&(query.kind==="isbn"||normalized(title).includes(normalized(query.value)))&&!ids.includes(id))ids.push(id);
  if(ids.length>=3)break;
 }
 return ids;
}
const attribute=z.object({attrKey:z.string(),attrVal:z.string()});
const itemSchema=z.object({id:z.union([z.number().int().positive().safe(),z.string().regex(/^\d{6,20}$/)]),name:z.string().trim().min(1),itemCode:z.string(),otherAttributes:z.array(z.object({otherAttributes:z.array(attribute)}))});
export function xinhuaBook(html:string,id:string,query:{kind:"isbn"|"title";value:string}):CatalogBook|null {
 const tag=html.match(/<div\b[^>]*\bclass=["'][^"']*\bitem-title\b[^"']*["'][^>]*>/)?.[0];
 const raw=tag?.match(/\bdata-item="([^"]+)"/)?.[1]||tag?.match(/\bdata-item='([^']+)'/)?.[1];
 if(!raw)throw new Error("Unrecognized catalog item page");
 const data=itemSchema.parse(JSON.parse(entities(raw)));if(String(data.id)!==id)throw new Error("Catalog item identity mismatch");
 const isbn=data.itemCode.replace(/[-\s]/g,"").toUpperCase();
 if(!validISBN(isbn))return null; // Exclude merchandise and ambiguous identifiers.
 if(query.kind==="isbn"&&isbn13(isbn)!==isbn13(query.value))return null;
 if(query.kind==="title"&&!normalized(data.name).includes(normalized(query.value)))return null;
 const fields=new Map(data.otherAttributes.flatMap(g=>g.otherAttributes).map(a=>[a.attrKey,a.attrVal]));
 const n=Number(fields.get("页数"));
 return {id:"xinhua_"+id,title:data.name.slice(0,150),author:(fields.get("作者")||"").slice(0,150),isbn,publisher:(fields.get("出版社")||"").slice(0,150),totalPages:!isBookCollection(data.name)&&Number.isInteger(n)&&n>0&&n<=20000?n:null,description:"",sourceUrl:"https://item.xhsd.com/items/"+id};
}
export async function lookupXinhua(query:{kind:"isbn"|"title";value:string},request:typeof fetch):Promise<CatalogBook[]>{
 const signal=AbortSignal.timeout(6000);
 const html=await catalogText("https://search.xhsd.com/search?"+new URLSearchParams({keyword:query.value}),request,signal);
 const ids=xinhuaCandidates(html,query);if(!ids.length)return[];
 const results=await Promise.allSettled(ids.map(async id=>xinhuaBook(await catalogText("https://item.xhsd.com/items/"+id,request,signal),id,query)));
 const valid=results.filter((r):r is PromiseFulfilledResult<CatalogBook|null>=>r.status==="fulfilled");
 if(!valid.length)throw new Error("Catalog item pages unavailable");
 const seen=new Set<string>();return valid.flatMap(r=>{if(!r.value||seen.has(r.value.isbn))return[];seen.add(r.value.isbn);return[r.value];});
}
