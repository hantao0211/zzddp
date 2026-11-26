import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { inkDetailSheet } from "./exam-ink-detail";
import { cropGeometry, type Region } from "./exam-local-reading";

export type ExamView="NorthWest"|"NorthEast"|"SouthWest"|"SouthEast"|Region;
const convert=promisify(execFile);
export async function examImage(path:string,pageId:string,corner?:ExamView,pencil=false) {
  let crop=typeof corner==="string"?["-gravity",corner,"-crop","56%x56%+0+0","+repage"]:[];
  if(Array.isArray(corner)){
    const {stdout:size}=await convert("/usr/bin/identify",["-ping","-format","%w %h %[orientation]",path+"[0]"],{timeout:15000});
    const [w,h,orientation]=size.trim().split(/\s+/);
    const swapped=["LeftTop","RightTop","RightBottom","LeftBottom"].includes(orientation);
    const geometry=cropGeometry(corner,Number(swapped?h:w),Number(swapped?w:h));
    crop=["-gravity","NorthWest","-crop",geometry,"+repage"];
  }
  const input=["-limit","memory","64MiB","-limit","map","128MiB","-limit","disk","512MiB",path+"[0]","-auto-orient",...crop];
  if(pencil){
    const {stdout}=await convert("/usr/bin/convert",[...input,"-background","white","-alpha","remove","-colorspace","sRGB","-resize","1600x1600>","-depth","8","ppm:-"],
      {encoding:"buffer",timeout:60000,maxBuffer:8*1024*1024});
    const sheet=inkDetailSheet(stdout);
    if(sheet)return {fileId:pageId+"-ink",mimeType:"image/png" as const,base64:sheet.toString("base64")};
  }
  // The colour matrix lightens red markings while keeping neutral graphite at the same intensity.
  const rendering=pencil
    ? ["-color-matrix","3 -1 -1  3 -1 -1  3 -1 -1","-colorspace","Gray","-contrast-stretch","0.25%x1%","-resize","1400x1000"]
    : ["-resize",corner?"1600x1800>":"1800x2400>"];
  const {stdout}=await convert("/usr/bin/convert",[...input,...rendering,"-background","white","-alpha","remove","-strip","-quality","85","jpeg:-"],{encoding:"buffer",timeout:60000,maxBuffer:3*1024*1024});
  return {fileId:corner?pageId+"-"+corner:pageId,mimeType:"image/jpeg" as const,base64:stdout.toString("base64")};
}
