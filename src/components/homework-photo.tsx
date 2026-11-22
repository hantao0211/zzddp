"use client";
import { pagePhotoUrl } from "@/services/homework-photo";
export function HomeworkPhoto({pageId,alt,size="screen"}:{pageId:string;alt:string;size?:"thumb"|"screen"}) {
  return <img src={pagePhotoUrl(pageId,size)} alt={alt} loading="lazy" decoding="async" onError={e=>{if(e.currentTarget.src.includes("?size="))e.currentTarget.src=pagePhotoUrl(pageId,"full");}} />;
}
