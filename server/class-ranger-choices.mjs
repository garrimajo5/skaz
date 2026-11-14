import {isDeepStrictEqual} from 'node:util';
// SRD 5.1 p36, Natural Explorer. Pure selection plan, not a persisted grant.
// The seven SRD terrains are intentionally not extended with PHB-only options.
const terrains=[['arctic','Арктика'],['coast','Побережье'],['desert','Пустыня'],['forest','Лес'],['grassland','Луга'],['mountain','Горы'],['swamp','Болото']];
const levels=[1,6,10];
export function rangerTerrainOptions(){return terrains.map(([id,name])=>({id,name,sourcePage:36}));}
export function planRangerTerrainChoice({classId,level,terrainId,previousTerrainIds}){
 if(classId!=='ranger'||!levels.includes(level))throw new Error('Местность выбирает следопыт на уровне 1, 6 или 10');
 const required=levels.indexOf(level),allowed=new Set(terrains.map(([id])=>id));
 if(!Array.isArray(previousTerrainIds)||previousTerrainIds.length!==required||new Set(previousTerrainIds).size!==required||previousTerrainIds.some(id=>!allowed.has(id)))throw new Error('Нужно явно подтвердить все разные прежние местности');
 if(!allowed.has(terrainId)||previousTerrainIds.includes(terrainId))throw new Error('Выбери новую местность из списка SRD');
 return {ruleset:'5e-2014',classId,level,choiceId:'ranger:'+level+':favored-terrain',sourcePage:36,terrainId,confirmedPrevious:[...previousTerrainIds].sort(),applied:false};
}
// Revalidation is deliberately pure; a future transaction must read authoritative
// history and bind explicit confirmations before treating this as provenance.
export function validateRangerTerrainPlan(value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Нужен план выбора местности');
 const expected=planRangerTerrainChoice({classId:value.classId,level:value.level,terrainId:value.terrainId,previousTerrainIds:value.confirmedPrevious});
 if(!isDeepStrictEqual(value,expected))throw new Error('План местности изменён или не соответствует источнику');
 return expected;
}

const enemyTypes=[['aberrations','Аберрации'],['beasts','Звери'],['celestials','Небожители'],['constructs','Конструкты'],['dragons','Драконы'],['elementals','Элементали'],['fey','Феи'],['fiends','Исчадия'],['giants','Великаны'],['monstrosities','Монстры'],['oozes','Слизи'],['plants','Растения'],['undead','Нежить']];
export function rangerEnemyTypeOptions(){return enemyTypes.map(([id,name])=>({id,name,sourcePage:35}));}
// A type never determines a language: different creatures of one type speak
// different languages (or none). Humanoid race pairs need a separate model.
export function planRangerEnemyTypeChoice({classId,level,typeId,previousTypeIds}){
 const at=[1,6,14].indexOf(level),allowed=new Set(enemyTypes.map(([id])=>id));
 if(classId!=='ranger'||at<0)throw new Error('Избранный враг выбирается следопытом на уровне 1, 6 или 14');
 if(!Array.isArray(previousTypeIds)||previousTypeIds.length!==at||new Set(previousTypeIds).size!==at||previousTypeIds.some(id=>!allowed.has(id)))throw new Error('Нужно подтвердить прежние типы; пары гуманоидных рас требуют отдельной сверки');
 if(!allowed.has(typeId)||previousTypeIds.includes(typeId))throw new Error('Выбери новый тип врага из SRD; гуманоиды не выбираются целым типом');
 return {ruleset:'5e-2014',classId,level,choiceId:'ranger:'+level+':favored-enemy-and-language',sourcePage:35,typeId,confirmedPrevious:[...previousTypeIds].sort(),language:null,requiresLanguageReview:true,applied:false};
}
