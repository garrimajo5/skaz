import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,realpathSync,statSync,lstatSync,readdirSync,existsSync} from 'node:fs';
import {resolve,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {inflateSync} from 'node:zlib';
import {bundledCatalog} from '../server/bundled-catalog.mjs';

export const kinds=['spell','item','artifact','monster'];
export const sha256=data=>createHash('sha256').update(data).digest('hex');
const root=fileURLToPath(new URL('../',import.meta.url));
const json=value=>JSON.stringify(value,null,2)+'\n';
const fail=message=>{throw Error(message);};
const text=value=>typeof value==='string'&&value.trim().length>0&&value.length<=2000;
export function inventory(entries=bundledCatalog().bundle.entries){
 const seen=new Set();
 return entries.filter(e=>kinds.includes(e.kind)).map(e=>{
  if(!text(e.id)||seen.has(e.id))fail('Duplicate or invalid catalog ID: '+e.id);
  seen.add(e.id);if(e.ruleset!=='5e-2014')fail('Unsupported edition: '+e.id);
  return {id:e.id,kind:e.kind,ruleset:e.ruleset,name:e.name,source:e.source,
   contentSha256:sha256(JSON.stringify(e))};
 }).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
}
export function crc32(bytes){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let j=0;j<8;j++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
// Deliberately narrow ingestion format. Re-encode other formats before review.
// CRC, exact structure and bounded decompression prevent header-only acceptance.
export function inspectPng(bytes){
 if(bytes.length>16*1024*1024||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))fail('Invalid PNG signature/size');
 let offset=8,width,height,channels,ended=false,started=false,closed=false;const data=[];
 while(offset<bytes.length){
  if(offset+12>bytes.length)fail('Truncated PNG');const n=bytes.readUInt32BE(offset);
  if(n>bytes.length-offset-12)fail('Truncated PNG chunk');
  const type=bytes.toString('ascii',offset+4,offset+8),part=bytes.subarray(offset+8,offset+8+n);
  if(crc32(bytes.subarray(offset+4,offset+8+n))!==bytes.readUInt32BE(offset+8+n))fail('PNG checksum mismatch');
  if(offset===8&&type!=='IHDR')fail('Missing PNG header');
  if(type==='IHDR'){
   if(width!==undefined||n!==13)fail('Invalid PNG header');width=part.readUInt32BE(0);height=part.readUInt32BE(4);
   if(width<1||height<1||width>2048||height>2048||part[8]!==8||![2,6].includes(part[9])||part[10]||part[11]||part[12])fail('PNG must be 8-bit RGB/RGBA, non-interlaced, <=2048');
   channels=part[9]===2?3:4;
  }else if(type==='IDAT'){if(closed)fail('Non-contiguous PNG data');started=true;data.push(part);}
  else if(type==='IEND'){if(n||!started)fail('Invalid PNG end');ended=true;offset+=12;break;}
  else {if(started)closed=true;if(!['sRGB','gAMA','cHRM','pHYs'].includes(type))fail('Unsupported PNG chunk (metadata/active content): '+type);
   if((type==='sRGB'&&(n!==1||part[0]>3))||(type==='gAMA'&&(n!==4||!part.readUInt32BE(0)))||(type==='cHRM'&&n!==32)||(type==='pHYs'&&(n!==9||part[8]>1)))fail('Invalid PNG ancillary chunk');}
  offset+=n+12;
 }
 if(!ended||offset!==bytes.length)fail('Missing PNG end or trailing bytes');
 const stride=width*channels+1,expected=stride*height;
 const compressed=Buffer.concat(data),decoded=inflateSync(compressed,{maxOutputLength:expected+1,info:true}),raw=decoded.buffer;
 if(decoded.engine.bytesWritten!==compressed.length)fail('Trailing compressed PNG bytes');
 if(raw.length!==expected)fail('PNG decoded size mismatch');
 for(let y=0;y<height;y++)if(raw[y*stride]>4)fail('Invalid PNG row filter');
 return {width,height,bytes:bytes.length,sha256:sha256(bytes)};
}
function checkFile(file,base,role){
 if(!file||typeof file.path!=='string'||!/^assets\/art\/[a-z0-9/_-]+\.png$/.test(file.path)||file.path.includes('//'))fail('Unsafe art path');
 const path=resolve(base,file.path),actual=realpathSync(path),boundary=resolve(realpathSync(base),'assets/art')+sep;
 if(!actual.startsWith(boundary)||!statSync(actual).isFile())fail('Art file escapes repository');
 if(statSync(actual).size>16*1024*1024)fail('Art file too large');
 const measured=inspectPng(readFileSync(actual));
 for(const key of ['width','height','bytes','sha256'])if(file[key]!==measured[key])fail('Art metadata mismatch: '+key);
 if(role==='thumbnail'&&(measured.width>256||measured.height>256))fail('Thumbnail exceeds 256 px');
 return measured;
}
export function validate(manifest,entries=inventory(),base=root){
 if(manifest?.schemaVersion!==1||manifest.ruleset!=='5e-2014'||!Array.isArray(manifest.entries))fail('Invalid art manifest');
 const expected=new Map(entries.map(e=>[e.id,e]));if(expected.size!==entries.length)fail('Duplicate inventory ID');
 const used=new Set(),files=new Set(),hashOwners=new Map(),errors=[],statuses={accepted:[],pilot:[],draft:[],placeholder:[]};
 for(const item of manifest.entries){try{
  if(!item||!expected.has(item.id))fail('Unknown catalog ID');
  if(used.has(item.id))fail('Duplicate art ID');used.add(item.id);
  if(item.contentSha256!==expected.get(item.id).contentSha256)fail('Stale catalog snapshot');
  if(!Object.hasOwn(statuses,item.status))fail('Invalid status');
  if(!Number.isSafeInteger(item.version)||item.version<1)fail('Invalid art version');
  if(!item.crop||!['x','y'].every(k=>Number.isFinite(item.crop[k])&&item.crop[k]>=0&&item.crop[k]<=1))fail('Invalid crop point');
  const p=item.provenance;
  if(!p||!['original','generated','licensed'].includes(p.method)||!['author','source','usage','attribution','reviewedBy'].every(k=>text(p[k])))fail('Missing image provenance');
  if(item.status==='accepted'&&(!text(item.review?.by)||!text(item.review?.evidence)))fail('Missing visual acceptance');
  for(const role of ['original','thumbnail']){
   const f=item.files?.[role],m=checkFile(f,base,role);files.add(f.path);
   if(role==='original'){
    if(hashOwners.has(m.sha256)&&hashOwners.get(m.sha256)!==item.id)fail('Identical artwork reused for different IDs');
    hashOwners.set(m.sha256,item.id);
   }
  }
  statuses[item.status].push(item.id);
 }catch(e){errors.push({id:item?.id??null,error:e.message});}}
 // Unreferenced files usually mean a forgotten ID or stale production output.
 const walk=dir=>{if(!existsSync(dir))return;if(lstatSync(dir).isSymbolicLink()){errors.push({id:null,error:'Symlink art directory'});return;}for(const d of readdirSync(dir,{withFileTypes:true})){
  const path=resolve(dir,d.name);if(d.isSymbolicLink()){errors.push({id:null,error:'Symlink in art directory'});continue;}
  if(d.isDirectory())walk(path);else {const name=relative(base,path).split(sep).join('/');if(!files.has(name))errors.push({id:null,error:'Unreferenced art file: '+name});}
 }};walk(resolve(base,'assets/art'));
 for(const list of Object.values(statuses))list.sort();
 const accepted=new Set(statuses.accepted),missing=entries.filter(e=>!used.has(e.id)).map(e=>e.id).sort();
 return {schemaVersion:1,ruleset:'5e-2014',total:entries.length,
  counts:Object.fromEntries(kinds.map(kind=>[kind,{total:entries.filter(e=>e.kind===kind).length,accepted:entries.filter(e=>e.kind===kind&&accepted.has(e.id)).length}])),
  statuses,missing,uncovered:entries.filter(e=>!accepted.has(e.id)).map(e=>e.id).sort(),errors,
  complete:errors.length===0&&accepted.size===entries.length};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const entries=inventory(),manifest=JSON.parse(readFileSync(resolve(root,'catalog/art-manifest.json'),'utf8'));
 const report=validate(manifest,entries);
 if(process.argv.includes('--write')){writeFileSync(resolve(root,'catalog/art-inventory.json'),json(entries));writeFileSync(resolve(root,'catalog/art-coverage.json'),json(report));}
 else for(const [file,value]of [['art-inventory.json',entries],['art-coverage.json',report]])if(readFileSync(resolve(root,'catalog',file),'utf8').replaceAll('\r\n','\n')!==json(value))report.errors.push({id:null,error:'Stale generated '+file+'; run --write'});
 console.log(JSON.stringify({total:report.total,counts:report.counts,missing:report.missing.length,complete:report.complete,errors:report.errors},null,2));
 if(report.errors.length||(process.argv.includes('--complete')&&!report.complete))process.exitCode=1;
}
