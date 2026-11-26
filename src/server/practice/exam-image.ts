import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { cropGeometry, type Region } from "./exam-local-reading";

export type ExamView="NorthWest"|"NorthEast"|"SouthWest"|"SouthEast"|Region;
const convert=promisify(execFile);
export async function examImage(path:string,pageId:string,corner?:ExamView) {
  let crop=typeof corner==="string"?["-gravity",corner,"-crop","56%x56%+0+0","+repage"]:[];
  if(Array.isArray(corner)){
    const {stdout:size}=await convert("/usr/bin/identify",["-ping","-format","%w %h %[orientation]",path+"[0]"],{timeout:15000});
    const [w,h,orientation]=size.trim().split(/\s+/);
    const swapped=["LeftTop","RightTop","RightBottom","LeftBottom"].includes(orientation);
    const geometry=cropGeometry(corner,Number(swapped?h:w),Number(swapped?w:h));
    crop=["-gravity","NorthWest","-crop",geometry,"+repage"];
  }
  const {stdout}=await convert("/usr/bin/convert",["-limit","memory","64MiB","-limit","map","128MiB","-limit","disk","512MiB",path+"[0]","-auto-orient",...crop,"-resize",corner?"1600x1800>":"1800x2400>","-background","white","-alpha","remove","-strip","-quality","85","jpeg:-"],{encoding:"buffer",timeout:60000,maxBuffer:3*1024*1024});
  return {fileId:corner?pageId+"-"+corner:pageId,mimeType:"image/jpeg" as const,base64:stdout.toString("base64")};
}
