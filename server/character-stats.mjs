import {AppError} from './state.mjs';

export const templateStats=Object.freeze({abilities:Object.freeze({str:8,dex:14,con:14,int:12,wis:10,cha:18}),armorClass:14,initiative:2,speed:30});
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k));
export function validateCharacterStats(value){
  if(!exact(value,['abilities','armorClass','initiative','speed'])||!exact(value.abilities,['str','dex','con','int','wis','cha']))throw new AppError(422,'Неверные поля характеристик');
  for(const [name,min,max]of [['armorClass',0,100],['initiative',-20,40],['speed',0,1000]])if(!Number.isSafeInteger(value[name])||value[name]<min||value[name]>max)throw new AppError(422,'Неверное число: '+name);
  if(Object.values(value.abilities).some(n=>!Number.isSafeInteger(n)||n<1||n>30))throw new AppError(422,'Характеристики: целые числа 1–30');
  return {abilities:Object.fromEntries(['str','dex','con','int','wis','cha'].map(k=>[k,value.abilities[k]])),armorClass:value.armorClass,initiative:value.initiative,speed:value.speed};
}
export function setupCharacterStats(db){
  db.exec(`CREATE TABLE IF NOT EXISTS character_stats (
    character_id TEXT PRIMARY KEY REFERENCES characters(id), stats_json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS character_stats_changes (
    mutation_id TEXT PRIMARY KEY REFERENCES changes(mutation_id) DEFERRABLE INITIALLY DEFERRED,
    character_id TEXT NOT NULL REFERENCES characters(id), before_json TEXT NOT NULL, after_json TEXT NOT NULL)`);
}
export function readCharacterStats(db,characterId){
  const row=db.prepare('SELECT stats_json FROM character_stats WHERE character_id=?').get(characterId);
  return row?validateCharacterStats(JSON.parse(row.stats_json)):null;
}
export function validateStatsCommand(input){
  if(!exact(input,['mutationId','expectedRevision','characterId','stats']))throw new AppError(422,'Неверные поля команды характеристик');
  if(typeof input.characterId!=='string'||!/^[a-zA-Z0-9-]{8,80}$/.test(input.characterId))throw new AppError(422,'Неверный ID персонажа');
  return {characterId:input.characterId,stats:input.stats===null?null:validateCharacterStats(input.stats)};
}
export function writeCharacterStats(db,characterId,stats){
  if(stats===null)db.prepare('DELETE FROM character_stats WHERE character_id=?').run(characterId);
  else db.prepare('INSERT INTO character_stats VALUES (?,?) ON CONFLICT(character_id) DO UPDATE SET stats_json=excluded.stats_json').run(characterId,JSON.stringify(validateCharacterStats(stats)));
}
export function saveCharacterStats(db,payload,mutationId,activeId){
  if(payload.characterId!==activeId)throw new AppError(409,'Активный персонаж изменился');
  const before=readCharacterStats(db,activeId);writeCharacterStats(db,activeId,payload.stats);
  db.prepare('INSERT INTO character_stats_changes VALUES (?,?,?,?)').run(mutationId,activeId,JSON.stringify(before),JSON.stringify(payload.stats));
}
