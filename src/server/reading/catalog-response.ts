const origins=new Set(["https://www.googleapis.com","https://openlibrary.org","https://search.xhsd.com","https://item.xhsd.com"]);
export async function catalogText(url:string,request:typeof fetch,signal=AbortSignal.timeout(4000)){
 const target=new URL(url);if(!origins.has(target.origin)||target.username||target.password)throw new Error("Unexpected catalog origin");
 const response=await request(url,{signal,redirect:"error",headers:{Accept:"application/json, text/html;q=0.9","User-Agent":"XiaobuLearning/1.0 (low-volume book metadata lookup)"}});
 if(!response.ok)throw new Error("Catalog unavailable");
 const reader=response.body?.getReader();if(!reader)throw new Error("Empty catalog response");
 const chunks:Uint8Array[]=[];let bytes=0;
 try{for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>512000)throw new Error("Catalog response too large");chunks.push(part.value);}}finally{await reader.cancel();reader.releaseLock();}
 return Buffer.concat(chunks).toString("utf8");
}
