import {z} from "zod";
import type {CatalogBook} from "../../domain/reading";
import {catalogText} from "./catalog-response";
import {lookupXinhua} from "./catalog-xinhua";
import {parseBookQuery,isbn13} from "../../domain/book-query";

// Fixed public catalog origins only. Never send family records, images or model credentials.
const text = z.string().catch("");
const names = z.array(z.string()).catch([]);
const googleData = z.object({items:z.array(z.object({id:text,volumeInfo:z.object({title:text,authors:names,publisher:text,pageCount:z.number().nullish(),description:text,industryIdentifiers:z.array(z.object({type:z.string(),identifier:z.string()})).catch([])}).optional()})).default([])});
const openSearchData = z.object({docs:z.array(z.object({key:text,title:text,author_name:names}))});
const openBook = z.object({title:text,authors:z.array(z.object({name:text})).catch([]),publishers:z.array(z.object({name:text})).catch([]),number_of_pages:z.number().nullish()});
const pageCount = (n:unknown) => typeof n === "number" && Number.isInteger(n) && n > 0 && n <= 20000 ? n : null;
const json=async(url:string,request:typeof fetch)=>JSON.parse(await catalogText(url,request)) as unknown;
export async function lookupBooks(query:string,request:typeof fetch=fetch):Promise<CatalogBook[]>{
  const parsed=parseBookQuery(query);let succeeded=false;
  if((parsed.kind==="isbn"&&isbn13(parsed.value).startsWith("9787"))||(parsed.kind==="title"&&/\p{Script=Han}/u.test(parsed.value))){
    try{const items=await lookupXinhua(parsed,request);succeeded=true;if(items.length)return items;}catch{/* Public Chinese catalog unavailable; retain independent fallbacks. */}
  }
  try {
    const q=parsed.kind==="isbn"?"isbn:"+parsed.value:'intitle:"'+parsed.value.replace(/["\\]/g," ")+'"';
    const data=googleData.parse(await json("https://www.googleapis.com/books/v1/volumes?"+new URLSearchParams({q,maxResults:"6",printType:"books"}),request));
    succeeded=true;
    const items:CatalogBook[]=data.items.slice(0,6).flatMap(v=>{const b=v.volumeInfo;if(!b?.title||!v.id||!/^[\w-]{1,80}$/.test(v.id))return[];return[{id:v.id,title:b.title.slice(0,150),author:b.authors.join("、").slice(0,150),isbn:(b.industryIdentifiers.find(i=>i.type==="ISBN_13")||b.industryIdentifiers.find(i=>i.type==="ISBN_10"))?.identifier.slice(0,20)||"",publisher:b.publisher.slice(0,150),totalPages:pageCount(b.pageCount),description:b.description.replace(/<[^>]*>/g,"").slice(0,1800),sourceUrl:"https://books.google.com/books?id="+encodeURIComponent(v.id)}];});
    if(items.length)return items;
  }catch{/* Try an independent public catalog after an outage or no result. */}
  try {
    if(parsed.kind==="isbn"){
      const key="ISBN:"+parsed.value;
      const data=z.record(z.string(),z.unknown()).parse(await json("https://openlibrary.org/api/books?"+new URLSearchParams({bibkeys:key,format:"json",jscmd:"data"}),request));
      if(!data[key])return[];
      const b=openBook.parse(data[key]);if(!b.title)return[];
      return[{id:"ol_isbn_"+parsed.value,title:b.title.slice(0,150),author:b.authors.map(a=>a.name).join("、").slice(0,150),isbn:parsed.value,publisher:b.publishers.map(p=>p.name).join("、").slice(0,150),totalPages:pageCount(b.number_of_pages),description:"",sourceUrl:"https://openlibrary.org/isbn/"+parsed.value}];
    }
    const data=openSearchData.parse(await json("https://openlibrary.org/search.json?"+new URLSearchParams({title:parsed.value,limit:"6",fields:"key,title,author_name"}),request));
    // Title search finds works, not specific editions: don't mix ISBN/publisher/page counts from different editions.
    return data.docs.slice(0,6).flatMap(b=>{const key=b.key.match(/^\/works\/(OL\d+W)$/)?.[1];if(!key||!b.title)return[];return[{id:"ol_work_"+key,title:b.title.slice(0,150),author:b.author_name.join("、").slice(0,150),isbn:"",publisher:"",totalPages:null,description:"",sourceUrl:"https://openlibrary.org/works/"+key}];});
  }catch{if(succeeded)return[];throw new Error("Catalog unavailable");}
}
