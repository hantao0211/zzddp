import {Footprints} from "lucide-react";
/** A consistent visual unit for the child's earned currency. */
export function StepAmount({value,signed=false}:{value:number;signed?:boolean}){return <span className="reading-token"><Footprints size={20} aria-hidden="true"/><span>{signed&&value>0?"+":""}{value}<small>个小脚步</small></span></span>;}
