import {AppError} from './state.mjs';
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k));
const fail=message=>{throw new AppError(422,message);};
const label=(value,empty=false)=>{if(typeof value!=='string'||value.length>80||(!empty&&!value.trim()))fail('Нужно название до 80 символов');return value.trim();};
export function validateCharacterSheet(value){
 if(!exact(value,['ruleset','ancestry','className','subclass','level','counters'])||value.ruleset!=='5e-2014')fail('Нужен ручной лист D&D 2014');
 if(!Number.isSafeInteger(value.level)||value.level<1||value.level>20)fail('Уровень: целое число 1–20');
 if(!Array.isArray(value.counters)||value.counters.length>20)fail('Не более 20 счётчиков');
 const ids=new Set(),names=new Set();
 const counters=value.counters.map(counter=>{
  if(!exact(counter,['id','name','current','max'])||typeof counter.id!=='string'||!/^[a-zA-Z0-9-]{8,80}$/.test(counter.id)||ids.has(counter.id))fail('Неверный или повторный ID счётчика');
  const name=label(counter.name),key=name.toLocaleLowerCase('ru');if(names.has(key))fail('Названия счётчиков должны различаться');ids.add(counter.id);names.add(key);
  if(!Number.isSafeInteger(counter.max)||counter.max<0||counter.max>9999||!Number.isSafeInteger(counter.current)||counter.current<0||counter.current>counter.max)fail('Остаток счётчика: целое от 0 до максимума, максимум до 9999');
  return {id:counter.id,name,current:counter.current,max:counter.max};
 });
 return {ruleset:'5e-2014',ancestry:label(value.ancestry,true),className:label(value.className),subclass:label(value.subclass,true),level:value.level,counters};
}
export function setupCharacterSheets(db){db.exec(`CREATE TABLE IF NOT EXISTS character_sheets(character_id TEXT PRIMARY KEY REFERENCES characters(id),sheet_json TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS character_sheet_changes(mutation_id TEXT PRIMARY KEY REFERENCES changes(mutation_id) DEFERRABLE INITIALLY DEFERRED,character_id TEXT NOT NULL REFERENCES characters(id),before_json TEXT NOT NULL,after_json TEXT NOT NULL)`);}
export function readCharacterSheet(db,characterId){const row=db.prepare('SELECT sheet_json FROM character_sheets WHERE character_id=?').get(characterId);return row?validateCharacterSheet(JSON.parse(row.sheet_json)):null;}
export function validateSheetCommand(input){if(!exact(input,['mutationId','expectedRevision','characterId','sheet'])||typeof input.characterId!=='string'||!/^[a-zA-Z0-9-]{8,80}$/.test(input.characterId))fail('Неверные поля команды ручного листа');return {characterId:input.characterId,sheet:input.sheet===null?null:validateCharacterSheet(input.sheet)};}
export function writeCharacterSheet(db,characterId,sheet){if(sheet===null)db.prepare('DELETE FROM character_sheets WHERE character_id=?').run(characterId);else db.prepare('INSERT INTO character_sheets VALUES (?,?) ON CONFLICT(character_id) DO UPDATE SET sheet_json=excluded.sheet_json').run(characterId,JSON.stringify(validateCharacterSheet(sheet)));}
export function saveCharacterSheet(db,payload,mutationId,activeId){if(payload.characterId!==activeId)throw new AppError(409,'Активный персонаж изменился');const before=readCharacterSheet(db,activeId);writeCharacterSheet(db,activeId,payload.sheet);db.prepare('INSERT INTO character_sheet_changes VALUES (?,?,?,?)').run(mutationId,activeId,JSON.stringify(before),JSON.stringify(payload.sheet));}
export function validateCounterCommand(input){if(!exact(input,['mutationId','expectedRevision','characterId','counterId','delta'])||![input.characterId,input.counterId].every(id=>typeof id==='string'&&/^[a-zA-Z0-9-]{8,80}$/.test(id))||![1,-1].includes(input.delta))fail('Нужны ID героя, счётчика и изменение −1 или +1');return {characterId:input.characterId,counterId:input.counterId,delta:input.delta};}
export function changeCharacterCounter(db,payload,mutationId,activeId){
 if(payload.characterId!==activeId)throw new AppError(409,'Активный персонаж изменился');
 const sheet=readCharacterSheet(db,activeId),counter=sheet?.counters.find(c=>c.id===payload.counterId);if(!counter)throw new AppError(404,'Счётчик не найден');
 const next=counter.current+payload.delta;if(next<0||next>counter.max)throw new AppError(409,'Остаток выйдет за пределы счётчика');counter.current=next;
 saveCharacterSheet(db,{characterId:activeId,sheet},mutationId,activeId);
}
