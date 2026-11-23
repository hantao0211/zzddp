// Public bibliographic queries only; no household database, images, sessions or model calls.
import {lookupBooks} from "../../src/server/reading/catalog";
for(const query of process.argv.slice(2)){
 const started=Date.now();const origins:string[]=[];
 const request:typeof fetch=async(input,init)=>{origins.push(new URL(String(input)).origin);return fetch(input,init);};
 try{const items=await lookupBooks(query,request);console.log(JSON.stringify({query,milliseconds:Date.now()-started,items,origins}));}
 catch(e){console.log(JSON.stringify({query,error:String(e),origins}));process.exitCode=1;}
}
