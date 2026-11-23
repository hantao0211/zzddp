// Deliberate, audited one-time application of the family-approved plan.
import {readFileSync} from "node:fs";
import {saveStudentProfile} from "../src/server/reading/student-profile";
import {resolve} from "node:path";
import {ReadingStore} from "../src/server/reading/store";
import {installFamilyPlan} from "../src/server/reading/family-plan";
const directory=process.argv[2];
if(!directory||!process.argv.includes("--apply-approved-plan"))throw Error("Specify a reading directory and --apply-approved-plan after backing up the family state.");
if(resolve(directory)!==directory||!directory.endsWith("/reading"))throw Error("Expected an absolute reading directory.");
const store=new ReadingStore(directory);
try{const result=installFamilyPlan(store,"system:authorized-family-plan");const index=process.argv.indexOf("--profile-file");if(index>=0){const file=process.argv[index+1];if(!file||!file.startsWith("/"))throw Error("Expected an absolute private profile file.");saveStudentProfile(store,JSON.parse(readFileSync(file,"utf8")),"system:user-provided-profile");}console.log(JSON.stringify(result));}finally{store.close();}
