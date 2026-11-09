// Delivered bytes, not estimates from source files or browser timing claims.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createArtLibrary} from '../server/art-library.mjs';

export const limits={thumbnail:32*1024,card:384*1024};
export function measureArt(library,{ids=null,budgets=limits}={}){
 for(const role of ['thumbnail','card'])if(!Number.isSafeInteger(budgets[role])||budgets[role]<1)throw Error('Invalid byte budget');
 const index=library.index(),byId=new Map(index.entries.map(e=>[e.id,e]));
 if(byId.size!==index.entries.length)throw Error('Duplicate art ID');
 const selected=ids===null?[...byId.keys()]:[...new Set(ids)];
 for(const id of selected)if(!byId.has(id))throw Error('No accepted artwork for '+id);
 const violations=[],entries=[],unique=new Map();
 for(const id of selected.sort()){
  const files={};
  for(const role of ['thumbnail','card']){
   const file=byId.get(id).files[role];
   let bytes=unique.get(file.url);
   if(bytes===undefined){const response=library.read(file.url);if(!response)throw Error('Missing delivered art: '+id);bytes=response.bytes.length;unique.set(file.url,bytes);}
   files[role]={bytes,width:file.width,height:file.height};
   if(bytes>budgets[role])violations.push({id,role,bytes,limit:budgets[role]});
  }
  entries.push({id,files});
 }
 const summary=Object.fromEntries(['thumbnail','card'].map(role=>{
  const sizes=entries.map(e=>e.files[role].bytes).sort((a,b)=>a-b);
  return [role,{count:sizes.length,totalBytes:sizes.reduce((a,b)=>a+b,0),maxBytes:sizes.at(-1)??0,p95Bytes:sizes[Math.max(0,Math.ceil(sizes.length*.95)-1)]??0,limitBytes:budgets[role]}];
 }));
 return {schemaVersion:1,measurement:'in-process delivered PNG bytes; not browser network or offline cache',encoder:index.encoder,recipe:index.recipe,acceptedCount:index.entries.length,selectedCount:entries.length,summary,uniqueFiles:unique.size,uniqueBytes:[...unique.values()].reduce((a,b)=>a+b,0),serverCache:library.stats(),violations,entries};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const base=fileURLToPath(new URL('../',import.meta.url));
 const manifest=JSON.parse(readFileSync(resolve(base,'catalog/art-manifest.json'),'utf8'));
 const report=measureArt(createArtLibrary(manifest,{base}));
 const json=JSON.stringify(report,null,2)+'\n';
 const target=resolve(base,'catalog/art-budget.json');
 if(process.argv.includes('--write'))writeFileSync(target,json);
 if(process.argv.includes('--check')&&readFileSync(target,'utf8').replaceAll('\r\n','\n')!==json)throw Error('Stale art-budget.json; run --write with the documented encoder');
 console.log(JSON.stringify({...report,entries:undefined},null,2));
 if(report.violations.length)process.exitCode=1;
}
