import type {CatalogBook} from "../../domain/reading";
export async function lookupBooks(query:string,request:typeof fetch=fetch):Promise<CatalogBook[]>{
 const q=/^(?:\d[ -]?){9,12}[\dXx]$/.test(query)?"isbn:"+query.replace(/[ -]/g,""):"intitle:"+query;
 const response=await request("https://www.googleapis.com/books/v1/volumes?"+new URLSearchParams({q,maxResults:"6",printType:"books"}),{signal:AbortSignal.timeout(8000)});if(!response.ok)throw Error("Catalog unavailable");
 const data=await response.json() as {items?:{id?:string;volumeInfo?:{title?:string;authors?:string[];industryIdentifiers?:{type:string;identifier:string}[];publisher?:string;pageCount?:number;description?:string}}[]};
 return(data.items||[]).flatMap(v=>{const b=v.volumeInfo;if(!b?.title||!v.id||!/^[\w-]{1,80}$/.test(v.id))return[];return[{id:v.id,title:b.title.slice(0,150),author:(b.authors||[]).join("、").slice(0,150),isbn:(b.industryIdentifiers?.find(i=>i.type==="ISBN_13")||b.industryIdentifiers?.find(i=>i.type==="ISBN_10"))?.identifier.slice(0,20)||"",publisher:(b.publisher||"").slice(0,150),totalPages:Number.isInteger(b.pageCount)&&b.pageCount!>0&&b.pageCount!<=20000?b.pageCount!:null,description:(b.description||"").replace(/<[^>]*>/g,"").slice(0,1800),sourceUrl:"https://books.google.com/books?id="+encodeURIComponent(v.id)}];});
}
