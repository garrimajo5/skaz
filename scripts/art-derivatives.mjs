// Deterministic pilot preparation. Originals remain untouched, including provenance chunks.
import {readFileSync,writeFileSync,mkdirSync,realpathSync,existsSync,lstatSync} from 'node:fs';
import {resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {inflateSync,deflateSync} from 'node:zlib';
import {inspectPng,crc32,sha256} from './art-registry.mjs';
const signature=Buffer.from([137,80,78,71,13,10,26,10]);
export const recipe='skaz-rgba-area-premultiplied-v1';
function chunk(type,data){const b=Buffer.alloc(data.length+12);b.writeUInt32BE(data.length);b.write(type,4);data.copy(b,8);b.writeUInt32BE(crc32(b.subarray(4,-4)),b.length-4);return b;}
function paeth(a,b,c){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;}
export function decodeSource(bytes){
 if(bytes.length>16*1024*1024||!bytes.subarray(0,8).equals(signature))throw Error('Invalid source PNG');
 const chunks=[],idat=[];let offset=8,ended=false;
 while(offset<bytes.length){
  if(offset+12>bytes.length)throw Error('Truncated source PNG');
  const n=bytes.readUInt32BE(offset);if(n>bytes.length-offset-12)throw Error('Truncated source chunk');
  const type=bytes.toString('ascii',offset+4,offset+8),data=bytes.subarray(offset+8,offset+8+n);
  if(ended||(offset===8&&type!=='IHDR'))throw Error('Invalid source chunk order');
  if(crc32(bytes.subarray(offset+4,offset+8+n))!==bytes.readUInt32BE(offset+8+n))throw Error('Source CRC mismatch');
  // This is a decode input exception, never a relaxation of the delivery validator.
  if(type!=='caBX')chunks.push(bytes.subarray(offset,offset+n+12));
  if(type==='IDAT')idat.push(data);
  if(type==='IEND')ended=true;
  offset+=n+12;
 }
 const clean=Buffer.concat([signature,...chunks]),info=inspectPng(clean);
 const channels=clean[25]===6?4:3,stride=info.width*channels;
 const raw=inflateSync(Buffer.concat(idat),{maxOutputLength:(stride+1)*info.height});
 const pixels=Buffer.alloc(stride*info.height);
 for(let y=0;y<info.height;y++)for(let x=0;x<stride;x++){
  const filter=raw[y*(stride+1)],a=x>=channels?pixels[y*stride+x-channels]:0,b=y?pixels[(y-1)*stride+x]:0,c=y&&x>=channels?pixels[(y-1)*stride+x-channels]:0;
  const predictor=[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][filter];
  pixels[y*stride+x]=(raw[y*(stride+1)+1+x]+predictor)&255;
 }
 const colorChunks=chunks.filter(b=>['sRGB','gAMA','cHRM'].includes(b.toString('ascii',4,8)));
 return {width:info.width,height:info.height,channels,pixels,colorChunks};
}
export function derivePng(bytes,maxEdge){
 if(!Number.isSafeInteger(maxEdge)||maxEdge<1||maxEdge>512)throw Error('Invalid derivative size');
 const src=decodeSource(bytes),scale=Math.min(1,maxEdge/Math.max(src.width,src.height));
 const width=Math.max(1,Math.round(src.width*scale)),height=Math.max(1,Math.round(src.height*scale));
 const raw=Buffer.alloc((width*4+1)*height),sx=src.width/width,sy=src.height/height;
 // Area averaging in premultiplied alpha prevents dark/colored fringes at transparent edges.
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const x0=x*sx,x1=(x+1)*sx,y0=y*sy,y1=(y+1)*sy;let alpha=0,r=0,g=0,b=0;
  for(let iy=Math.floor(y0);iy<Math.min(src.height,Math.ceil(y1));iy++)for(let ix=Math.floor(x0);ix<Math.min(src.width,Math.ceil(x1));ix++){
   const weight=(Math.min(x1,ix+1)-Math.max(x0,ix))*(Math.min(y1,iy+1)-Math.max(y0,iy));
   const i=(iy*src.width+ix)*src.channels,a=(src.channels===4?src.pixels[i+3]:255)*weight;
   alpha+=a;r+=src.pixels[i]*a;g+=src.pixels[i+1]*a;b+=src.pixels[i+2]*a;
  }
  const i=y*(width*4+1)+1+x*4;
  if(alpha){raw[i]=Math.round(r/alpha);raw[i+1]=Math.round(g/alpha);raw[i+2]=Math.round(b/alpha);}
  raw[i+3]=Math.round(alpha/(sx*sy));
 }
 const h=Buffer.alloc(13);h.writeUInt32BE(width);h.writeUInt32BE(height,4);h[8]=8;h[9]=6;
 return Buffer.concat([signature,chunk('IHDR',h),...src.colorChunks,chunk('IDAT',deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))]);
}
export function preparePilot(base){
 const candidates=JSON.parse(readFileSync(resolve(base,'docs/design/pilot-v1/candidates.json'))).entries;
 const boundary=realpathSync(resolve(base,'data/art-pilot-v1'))+sep;
 const out=resolve(base,'data/art-delivery');mkdirSync(out,{recursive:true});
 if(realpathSync(out)!==out)throw Error('Output must not be a symlink');
 const seen=new Set(),entries=[];
 // Validate the whole batch before writing any derivative.
 const inputs=candidates.map(e=>{
  if(!/^srd51:2014:(spell|item|artifact|monster):[a-z]+(?:-[a-z]+)*$/.test(e.id)||seen.has(e.id))throw Error('Invalid or duplicate candidate ID');seen.add(e.id);
  if(typeof e.path!=='string'||!e.path.startsWith('data/art-pilot-v1/'))throw Error('Invalid source path');
  const path=realpathSync(resolve(base,e.path));if(!path.startsWith(boundary))throw Error('Source escapes pilot directory');
  const bytes=readFileSync(path);if(sha256(bytes)!==e.sha256)throw Error('Source hash mismatch: '+e.id);
  decodeSource(bytes);return {e,bytes};
 });
 const safeWrite=(path,bytes)=>{if(existsSync(path)&&lstatSync(path).isSymbolicLink())throw Error('Symlink output file');writeFileSync(path,bytes);};
 for(const {e,bytes} of inputs){
  const slug=e.id.split(':').slice(-2).join('-'),files={};
  for(const [role,size] of [['thumbnail',96],['card',384]]){
   const output=derivePng(bytes,size),measured=inspectPng(output);
   const path=`data/art-delivery/${slug}-${role}-${measured.sha256.slice(0,16)}.png`;
   safeWrite(resolve(base,path),output);files[role]={path,...measured,derivedFrom:e.sha256,recipe};
  }
  entries.push({id:e.id,name:e.name,contentSha256:e.contentSha256,status:'pilot',source:{path:e.path,sha256:e.sha256},visualApproval:e.visualApproval??null,files});
 }
 const report={schemaVersion:1,recipe,encoder:process.versions.zlib,node:process.versions.node,entries,
  totals:Object.fromEntries(['thumbnail','card'].map(role=>[role,entries.reduce((n,e)=>n+e.files[role].bytes,0)]))};
 safeWrite(resolve(out,'manifest.json'),JSON.stringify(report,null,2)+'\n');return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const report=preparePilot(fileURLToPath(new URL('../',import.meta.url)));
 console.log(JSON.stringify({count:report.entries.length,totals:report.totals,max:Object.fromEntries(['thumbnail','card'].map(r=>[r,Math.max(...report.entries.map(e=>e.files[r].bytes))]))},null,2));
}
