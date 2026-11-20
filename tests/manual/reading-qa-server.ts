// Isolated synthetic family only; never open the live family directories.
import {join} from "node:path";
import {scryptSync} from "node:crypto";
import {Accounts} from "../../src/server/assistant/accounts";
import {AssistantStore} from "../../src/server/assistant/store";
import {createAssistantServer} from "../../src/server/assistant/server";
import {ReadingStore} from "../../src/server/reading/store";
import {ReadingHTTP} from "../../src/server/reading/http";
import {ReadingWorker} from "../../src/server/reading/worker";
import type {StructuredAI} from "../../src/server/ai/provider";
const directory=process.env.READING_QA_DIRECTORY||"";if(!directory.endsWith("/xiaobu-reading-qa"))throw Error("Refuse non-QA state");
const accounts=new Accounts(directory),store=new ReadingStore(join(directory,"reading")),salt="ab".repeat(16);
const ai:StructuredAI={async run(task,schema,metadata){if(task==="reading_review")return schema.parse({summaryFeedback:"你讲清楚了人物遇到的困难和解决办法。",strengths:["有主要人物和事情"],nextStep:"可以再补一句事情的结果。",followUpQuestion:"你觉得他为什么找朋友帮忙？",expression:"clear",comparison:"consistent",comparisonReason:"只比较提供的片段。",evidenceQuote:"主动向朋友求助",evidenceReadable:true});if(task==="reading_dialogue"){if(!(metadata as any).reading)throw Error("Reading context missing");return schema.parse({answer:"我们就聊这次阅读。你已经说清楚了发生的事情，可以再说说你最喜欢哪个细节。",spokenAnswer:"你最喜欢哪个细节呢？",hint:null,followUpQuestion:null,sourceMaterialIds:[]});}throw Error("QA forbids unrelated tasks");}};
const worker=new ReadingWorker(store,()=>ai);worker.start();
const server=createAssistantServer({origin:"https://14.103.24.55:3443",accessHash:salt+":"+scryptSync("81746290",salt,32).toString("hex"),accounts,store:new AssistantStore(directory),reading:new ReadingHTTP(store,async()=>[{id:"synthetic-volume",title:"模拟阅读书",author:"模拟作者",isbn:"9780000000002",publisher:"模拟出版社",totalPages:40,description:"这里只是模拟简介，不是章节原文。",sourceUrl:"https://books.google.com/books?id=synthetic-volume"}]),ai:()=>ai,speech:{async transcribe(){return"今天读到主人公遇到困难后主动向朋友求助。";},async speak(){throw Error("QA does not synthesize speech");}}});server.listen(3105,"127.0.0.1");for(const signal of["SIGTERM","SIGINT"] as const)process.on(signal,()=>{worker.stop();server.close(()=>process.exit(0));});
