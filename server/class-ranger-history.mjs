import {isDeepStrictEqual} from 'node:util';
import {rangerTerrainOptions,rangerEnemyTypeOptions} from './class-ranger-choices.mjs';
const terrainIds=new Set(rangerTerrainOptions().map(o=>o.id)),typeIds=new Set(rangerEnemyTypeOptions().map(o=>o.id));
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const fail=message=>{throw new Error(message);};
function label(value){if(typeof value!=='string')fail('Нужно название расы или языка');const result=value.normalize('NFKC').trim().replace(/\s+/g,' ');if(!result||result.length>80||/[<>\u0000-\u001f\u007f]/u.test(value))fail('Название должно содержать 1–80 символов без разметки');return result;}
const key=value=>value.toLocaleLowerCase('ru');
export function rangerEnemySelection(value){
 if(!exact(value,['enemy','language','rulesConfirmed'])||value.rulesConfirmed!==true)fail('Подтверди две расы или тип врага и соответствие языка правилам вашей игры');
 let enemy;
 if(exact(value.enemy,['kind','id'])&&value.enemy.kind==='type'&&typeIds.has(value.enemy.id))enemy={kind:'type',id:value.enemy.id};
 else if(exact(value.enemy,['kind','races'])&&value.enemy.kind==='humanoids'&&Array.isArray(value.enemy.races)&&value.enemy.races.length===2){
  const races=value.enemy.races.map(label).sort((a,b)=>key(a).localeCompare(key(b),'ru'));if(key(races[0])===key(races[1]))fail('Нужны две разные гуманоидные расы');enemy={kind:'humanoids',races};
 }else fail('Выбери тип врага либо две гуманоидные расы, а не всех гуманоидов');
 let language;
 if(exact(value.language,['mode'])&&value.language.mode==='none')language={mode:'none'};
 else if(exact(value.language,['mode','name'])&&value.language.mode==='spoken')language={mode:'spoken',name:label(value.language.name)};
 else fail('Укажи один язык врагов либо явно подтверди, что они не говорят');
 return {enemy,language,rulesConfirmed:true};
}
function enemyRecord(selection,acquiredLevel,confirmedAt){return {...rangerEnemySelection(selection),acquiredLevel,confirmedAt,sourcePage:35};}
function terrainRecord(id,acquiredLevel,confirmedAt){if(!terrainIds.has(id))fail('Выбери местность из SRD');return {id,acquiredLevel,confirmedAt,sourcePage:36};}
function checkDistinct(history){
 if(new Set(history.terrains.map(o=>o.id)).size!==history.terrains.length)fail('Новая местность должна отличаться от прежних');
 const seen=new Set();for(const item of history.enemies){const keys=item.enemy.kind==='type'?['type:'+item.enemy.id]:item.enemy.races.map(r=>'race:'+key(r));for(const k of keys){if(seen.has(k))fail('Новый враг не должен повторять прежний тип или расу');seen.add(k);}}
}
export function validateRangerHistory(value,level){
 if(!Number.isSafeInteger(level)||level<6||level>20||!exact(value,['terrains','enemies'])||!Array.isArray(value.terrains)||!Array.isArray(value.enemies))fail('Нужна полная история выборов следопыта с6уровня');
 const terrainLevels=[null,6,...(level>=10?[10]:[])],enemyLevels=[null,6,...(level>=14?[14]:[])];
 if(value.terrains.length!==terrainLevels.length||value.enemies.length!==enemyLevels.length)fail('Пропущен обязательный выбор следопыта');
 const expected={terrains:terrainLevels.map((at,i)=>terrainRecord(value.terrains[i]?.id,at,at??6)),enemies:enemyLevels.map((at,i)=>{const item=value.enemies[i];return enemyRecord({enemy:item?.enemy,language:item?.language,rulesConfirmed:item?.rulesConfirmed},at,at??6);})};
 if(!isDeepStrictEqual(value,expected))fail('История следопыта изменена или неверно датирована');checkDistinct(expected);return structuredClone(expected);
}
export function advanceRangerHistory(level,{terrain,enemy},previous=null){
 if(![6,10,14].includes(level))fail('Выбор следопыта недоступен на этом уровне');
 let history;
 if(level===6){
  if(previous!==null||!exact(terrain,['previousId','id'])||!exact(enemy,['previous','current']))fail('На6уровне явно подтверди прежние и новые выборы');
  history={terrains:[terrainRecord(terrain.previousId,null,6),terrainRecord(terrain.id,6,6)],enemies:[enemyRecord(enemy.previous,null,6),enemyRecord(enemy.current,6,6)]};
 }else{
  history=validateRangerHistory(previous,level-1);
  if(level===10){if(!exact(terrain,['id'])||enemy!==undefined)fail('На10уровне нужна только новая местность');history.terrains.push(terrainRecord(terrain.id,10,10));}
  else{if(terrain!==undefined||!exact(enemy,['current']))fail('На14уровне нужен новый враг и язык');history.enemies.push(enemyRecord(enemy.current,14,14));}
 }
 return validateRangerHistory(history,level);
}
