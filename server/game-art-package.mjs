// Lossless container for the explicitly enabled personal-art capability.
// Legacy v12 import deliberately rejects this wrapper rather than losing files.
import {AppError} from './state.mjs';
import {validateTransfer} from './transfer.mjs';
import {validatePersonalArtTransfer} from './personal-art-transfer.mjs';
const fail=message=>{throw new AppError(422,message);};
export const gameArtPackageMaxBytes=64*1024*1024;
export function validateGameArtPackage(value){
 const keys=['app','schemaVersion','ruleset','game','personalArt'];
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k))||value.app!=='skaz-game-with-art'||![1,2,3].includes(value.schemaVersion)||value.ruleset!=='5e-2014')fail('Нужен пакет игры с личными изображениями СКАЗ v1, v2 или v3.');
 if(value.game?.schemaVersion!==(value.schemaVersion===1?12:value.schemaVersion===2?13:14))fail('Версия игры не соответствует версии пакета изображений.');
 if(Buffer.byteLength(JSON.stringify(value))>gameArtPackageMaxBytes)fail('Слишком большой пакет игры с изображениями.');
 const game=validateTransfer(value.game),art=validatePersonalArtTransfer(value.personalArt),ids=new Set(game.entries.map(e=>e.id));
 if(art.some(entry=>!ids.has(entry.catalogId)))fail('В пакете отсутствует запись каталога личного изображения.');
 return {game,art};
}
export function gameArtPackage(game,personalArt,{lookup}={}){
 // Clone inputs so filling a dependency closure never modifies the caller's export.
 const result={app:'skaz-game-with-art',schemaVersion:game.schemaVersion===14?3:game.schemaVersion===13?2:1,ruleset:'5e-2014',game:structuredClone(game),personalArt:structuredClone(personalArt)};
 const normalized=validateTransfer(result.game),art=validatePersonalArtTransfer(result.personalArt);
 const entries=new Map(normalized.entries.map(entry=>[entry.id,entry]));
 const pending=art.map(entry=>entry.catalogId);
 while(pending.length){
  const id=pending.pop();if(entries.has(id))continue;
  const entry=typeof lookup==='function'?lookup(id):null;
  if(!entry||entry.id!==id)fail('Не найдена запись каталога для переноса изображения: '+id);
  if(entries.size>=10000)fail('Слишком большой каталог пакета изображений.');
  const copy=structuredClone(entry);entries.set(id,copy);
  if(!Array.isArray(copy.links))fail('Неверные связи каталога изображения.');
  pending.push(...copy.links);
 }
 result.game.catalog.entries=[...entries.values()].sort((a,b)=>a.id.localeCompare(b.id,'en'));
 validateGameArtPackage(result);return result;
}
