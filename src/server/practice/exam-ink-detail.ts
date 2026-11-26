import { crc32, deflateSync } from "node:zlib";

type Box={left:number;right:number;top:number;bottom:number};

// Render the coloured annotation beside the remaining graphite at the same scale.
export function inkDetailSheet(ppm:Buffer):Buffer|undefined{
  const header=/^P6\s+(\d+)\s+(\d+)\s+255\s/.exec(ppm.toString("ascii",0,64));
  if(!header)throw Error("无法读取局部图像。");
  const w=Number(header[1]), h=Number(header[2]), rgb=ppm.subarray(header[0].length);
  if(rgb.length!==w*h*3)throw Error("局部图像不完整。");
  const red=new Uint8Array(w*h);
  for(let i=0;i<red.length;i++){
    const r=rgb[i*3],g=rgb[i*3+1],b=rgb[i*3+2];
    red[i]=Number(r-g>14&&r-b>12);
  }
  const visited=red.slice(), stack=new Int32Array(red.length), boxes:Box[]=[];
  for(let i=0;i<visited.length;i++){
    if(!visited[i])continue;
    let count=0,n=1,left=w,right=0,top=h,bottom=0;
    stack[0]=i;visited[i]=0;
    while(n){
      const at=stack[--n],x=at%w,y=Math.floor(at/w);
      count++;left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        const other=at+dy*w+dx;
        if(x+dx<0||x+dx>=w||y+dy<0||y+dy>=h||!visited[other])continue;
        stack[n++]=other;visited[other]=0;
      }
    }
    if(count>=10&&right-left>=4&&bottom-top>=4)boxes.push({left,right,top,bottom});
  }
  if(!boxes.length||boxes.length>24)return;
  const panelWidth=250,rowHeight=100,width=2*panelWidth,height=boxes.length*rowHeight;
  const rows=Buffer.alloc((1+width*3)*height,255);
  for(let y=0;y<height;y++)rows[y*(1+width*3)]=0;
  for(const [row,box] of boxes.entries()){
    const scale=Math.max(10,box.right-box.left,box.bottom-box.top)/58;
    const cx=(box.left+box.right)/2,cy=(box.top+box.bottom)/2;
    const samples:number[]=[];
    for(let y=0;y<rowHeight;y+=4)for(let x=0;x<panelWidth;x+=4){
      const sx=Math.round(cx+(x-panelWidth/2)*scale),sy=Math.round(cy+(y-rowHeight/2)*scale);
      if(sx>=0&&sx<w&&sy>=0&&sy<h)samples.push(rgb[(sy*w+sx)*3+1]);
    }
    samples.sort((a,b)=>a-b);
    const paper=samples[Math.floor(samples.length*.8)]??230;
    for(let y=0;y<rowHeight-2;y++)for(let x=0;x<panelWidth;x++){
      const sx=Math.round(cx+(x-panelWidth/2)*scale),sy=Math.round(cy+(y-rowHeight/2)*scale);
      if(sx<0||sx>=w||sy<0||sy>=h)continue;
      const i=sy*w+sx,at=(row*rowHeight+y)*(width*3+1)+1+x*3;
      rgb.copy(rows,at,i*3,i*3+3);
      const gray=red[i]?245:Math.max(0,Math.min(250,245-2.5*(paper-rgb[i*3+1])));
      rows.fill(Math.round(gray),at+panelWidth*3,at+panelWidth*3+3);
    }
  }
  const chunk=(name:string,bytes:Buffer)=>{
    const data=Buffer.concat([Buffer.from(name),bytes]),len=Buffer.alloc(4),crc=Buffer.alloc(4);
    len.writeUInt32BE(bytes.length);crc.writeUInt32BE(crc32(data));
    return Buffer.concat([len,data,crc]);
  };
  const size=Buffer.alloc(13);size.writeUInt32BE(width);size.writeUInt32BE(height,4);size[8]=8;size[9]=2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",size),chunk("IDAT",deflateSync(rows)),chunk("IEND",Buffer.alloc(0))]);
}
