// Companion bundle for personal character artwork, embedded in the opt-in game
// package. Contains normalized copies, never source URLs or source actor IDs.
import {AppError} from './state.mjs';
import {inspectPng,sha256} from '../scripts/art-registry.mjs';
export const personalTransferLimits=Object.freeze({entries:1000,bytes:32*1024*1024,fileBytes:4*1024*1024});
const fail=()=>{throw new AppError(422,'Некорректный файл личных изображений');};
function exact(value,keys){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k)))fail();}
export function validatePersonalArtTransfer(bundle){
 exact(bundle,['app','schemaVersion','ruleset','scope','entries']);
 if(bundle.app!=='skaz-personal-art'||bundle.schemaVersion!==1||bundle.ruleset!=='5e-2014'||bundle.scope!=='personal-character'||!Array.isArray(bundle.entries)||bundle.entries.length>personalTransferLimits.entries)fail();
 const ids=new Set();let total=0;
 const entries=bundle.entries.map(entry=>{
  exact(entry,['catalogId','sha256','png']);
  if(typeof entry.catalogId!=='string'||!/^[-a-zA-Z0-9:_]{1,160}$/.test(entry.catalogId)||ids.has(entry.catalogId)||typeof entry.sha256!=='string'||!(/^[a-f0-9]{64}$/).test(entry.sha256)||typeof entry.png!=='string'||!entry.png.length||entry.png.length>4*Math.ceil(personalTransferLimits.fileBytes/3)||entry.png.length%4||!(/^[A-Za-z0-9+/]*={0,2}$/).test(entry.png))fail();
  total+=entry.png.length/4*3-(entry.png.endsWith('==')?2:entry.png.endsWith('=')?1:0);
  if(total>personalTransferLimits.bytes)fail();
  const bytes=Buffer.from(entry.png,'base64');
  if(bytes.length>personalTransferLimits.fileBytes||bytes.toString('base64')!==entry.png||sha256(bytes)!==entry.sha256)fail();
  try{const info=inspectPng(bytes);if(info.width!==info.height||info.width>512)fail();}catch{fail();}
  ids.add(entry.catalogId);return {catalogId:entry.catalogId,bytes};
 });
 return entries.sort((a,b)=>a.catalogId<b.catalogId?-1:a.catalogId>b.catalogId?1:0);
}
export function personalArtTransfer(entries){
 const bundle={app:'skaz-personal-art',schemaVersion:1,ruleset:'5e-2014',scope:'personal-character',entries:entries.map(({catalogId,bytes})=>({catalogId,sha256:sha256(bytes),png:bytes.toString('base64')}))};
 validatePersonalArtTransfer(bundle);return bundle;
}
