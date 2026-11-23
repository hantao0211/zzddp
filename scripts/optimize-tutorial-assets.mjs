// Export web-sized copies; the generated PNG originals remain available to download.
import sharp from 'sharp';
import {readdir,stat} from 'node:fs/promises';
for(const name of await readdir('public/tutorials')){if(!name.endsWith('.png'))continue;const source='public/tutorials/'+name,target=source.replace(/\.png$/,'.webp');await sharp(source).resize({width:900,withoutEnlargement:true}).webp({quality:86}).toFile(target);console.log(name,(await stat(source)).size,'→',(await stat(target)).size);}
await sharp('public/mascot/xiaobu-rabbit.png').trim().resize({width:384,height:384,fit:'inside'}).webp({quality:88}).toFile('public/mascot/xiaobu-rabbit.webp');
