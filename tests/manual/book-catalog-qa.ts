// Temporary loopback-only public catalog integration. Never opens the live family state.
import {createServer} from "node:http";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {ReadingStore} from "../../src/server/reading/store";
import {ReadingHTTP} from "../../src/server/reading/http";
const directory=mkdtempSync(join(tmpdir(),"xiaobu-catalog-qa-")),store=new ReadingStore(directory),api=new ReadingHTTP(store);
const viewer={id:"11111111-1111-4111-8111-111111111111",name:"模拟孩子",username:"qa-child",role:"child" as const};
const server=createServer(async(req,res)=>{
 if(req.method!=="POST"||!["/assistant-api/reading/lookup","/assistant-api/reading/books"].includes(req.url||"")){res.writeHead(404);res.end();return;}
 await api.handle(req,res,viewer,async()=>{let bytes=0;const chunks:Buffer[]=[];for await(const c of req){bytes+=c.length;if(bytes>10000)throw Error("Oversized QA body");chunks.push(c);}return JSON.parse(Buffer.concat(chunks).toString("utf8"));});
});
server.listen(3106,"127.0.0.1");
for(const signal of["SIGINT","SIGTERM"] as const)process.on(signal,()=>{server.closeAllConnections();server.close(()=>{store.close();rmSync(directory,{recursive:true,force:true});process.exit(0);});});
