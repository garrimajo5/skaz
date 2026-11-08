import Health from '../client/health.js';
import {AppError} from './state.mjs';
import {resourceBalance} from './resource-operations.mjs';
import {inventoryInverse} from './inventory.mjs';

export function setupResourceHistory(db){
 db.exec(`CREATE TABLE IF NOT EXISTS resource_changes (
 mutation_id TEXT PRIMARY KEY REFERENCES changes(mutation_id) DEFERRABLE INITIALLY DEFERRED,
 data_json TEXT NOT NULL, undo_target TEXT UNIQUE REFERENCES resource_changes(mutation_id))`);
}
export function recordResource(db,id,payload,after,undoTarget=null){
 db.prepare('INSERT INTO resource_changes VALUES (?,?,?)').run(id,JSON.stringify({...payload,after}),undoTarget);
}
export function independentResourcesSince(db,revision,payload){
 const rows=db.prepare('SELECT r.data_json FROM changes c LEFT JOIN resource_changes r ON r.mutation_id=c.mutation_id WHERE c.revision>? ORDER BY c.revision').all(revision);
 return rows.length>0&&rows.every(row=>{
  if(!row.data_json)return false;
  const other=JSON.parse(row.data_json);
  return other.context.characterId!==payload.context.characterId||!Health.overlaps(other.resource,payload.resource);
 });
}
export function resourceReceipt(db,id){
 const row=db.prepare('SELECT r.data_json,c.revision FROM resource_changes r JOIN changes c ON c.mutation_id=r.mutation_id WHERE r.mutation_id=?').get(id);
 return row?{mutationId:id,revision:row.revision,...JSON.parse(row.data_json)}:null;
}
export function inverseResource(db,current,target){
 const row=db.prepare('SELECT r.*,c.revision FROM resource_changes r JOIN changes c ON c.mutation_id=r.mutation_id WHERE r.mutation_id=?').get(target);
 if(!row)throw new AppError(404,'Операция ресурса не найдена');
 const value=JSON.parse(row.data_json);
 if(Object.keys(current.context).some(k=>current.context[k]!==value.context[k]))throw new AppError(409,'Отмена относится к другой игре или сессии');
 if(row.undo_target||db.prepare('SELECT 1 FROM resource_changes WHERE undo_target=?').get(target))throw new AppError(409,'Эта операция уже отменена или сама является отменой');
 // Unknown/absolute operations are a barrier. Never reinterpret an older balance
 // through an absolute edit, even when it happens to have the same final value.
 if(db.prepare('SELECT 1 FROM changes c LEFT JOIN resource_changes r ON r.mutation_id=c.mutation_id WHERE c.revision>? AND r.mutation_id IS NULL LIMIT 1').get(row.revision))throw new AppError(409,'После действия были другие правки. Нужна ручная сверка');
 const balance=resourceBalance(db,current,value.resource),delta=value.before-value.after;
 const later=db.prepare('SELECT r.data_json FROM changes c JOIN resource_changes r ON r.mutation_id=c.mutation_id WHERE c.revision>?').all(row.revision).map(r=>JSON.parse(r.data_json));
 if(later.some(r=>r.context.characterId===current.context.characterId&&Health.overlaps(r.resource,value.resource)&&(r.resource.kind==='health'||value.resource.kind==='health')))throw new AppError(409,'После действия менялось здоровье. Нужна сверка');
 if(value.resource.kind==='health'){
  if(Object.hasOwn(value.resource,'deathBefore')&&JSON.stringify(current.state.deathSaves)!==JSON.stringify(value.deathAfter))throw new AppError(409,'Спасброски от смерти изменились');
  if(Object.hasOwn(value.resource,'checksBefore')&&JSON.stringify(current.state.concentrationChecks||[])!==JSON.stringify(value.checksAfter))throw new AppError(409,'Вопросы концентрации изменились');
  if(balance.maximum!==value.maximum||balance.value!==value.after||(current.state.tempHp||0)!==value.tempAfter||current.state.concentration!==value.concentrationAfter||(value.before===value.after&&value.resource.temporaryBefore===value.tempAfter&&value.resource.concentrationBefore===value.concentrationAfter&&JSON.stringify(value.resource.checksBefore||[])===JSON.stringify(value.checksAfter||[])&&JSON.stringify(value.resource.deathBefore)===JSON.stringify(value.deathAfter)))throw new AppError(409,'Здоровье изменилось или операция ничего не изменила');
  return {context:current.context,resource:{kind:'health',operation:'restore',temporaryBefore:current.state.tempHp||0,concentrationBefore:current.state.concentration,...(Object.hasOwn(value.resource,'checksBefore')?{checksBefore:current.state.concentrationChecks||[]}:{}),...(Object.hasOwn(value.resource,'deathBefore')?{deathBefore:current.state.deathSaves}:{}),hpAfter:value.before,tempAfter:value.resource.temporaryBefore,concentrationAfter:value.resource.concentrationBefore,...(Object.hasOwn(value.resource,'checksBefore')?{checksAfter:value.resource.checksBefore}:{}),...(Object.hasOwn(value.resource,'deathBefore')?{deathAfter:value.resource.deathBefore}:{})},delta:1,before:balance.value,maximum:balance.maximum};
 }
 if(!delta||balance.maximum!==value.maximum||balance.value+delta<0||balance.value+delta>balance.maximum)throw new AppError(409,'Обратное изменение не укладывается в текущие границы ресурса');
 return {context:current.context,resource:value.resource,delta,before:balance.value,maximum:balance.maximum};
}
export function historyDetail(db,row,current){
 const resource=db.prepare('SELECT * FROM resource_changes WHERE mutation_id=?').get(row.mutation_id);
 const changes=[];
 if(resource){
  const r=JSON.parse(resource.data_json);if(r.resource.kind==='health'){changes.push({resource:{kind:'hp'},before:r.before,after:r.after},{resource:{kind:'tempHp'},before:r.resource.temporaryBefore,after:r.tempAfter});if(r.deathAfter&&JSON.stringify(r.resource.deathBefore)!==JSON.stringify(r.deathAfter))changes.push({resource:{kind:'deathSaves'},before:JSON.stringify(r.resource.deathBefore),after:JSON.stringify(r.deathAfter)});if(Object.hasOwn(r.resource,'checksBefore')&&JSON.stringify(r.resource.checksBefore)!==JSON.stringify(r.checksAfter))changes.push({resource:{kind:'concentrationChecks'},before:r.resource.checksBefore.length,after:r.checksAfter.length});if(r.resource.concentrationBefore!==r.concentrationAfter)changes.push({resource:{kind:'concentration'},before:r.resource.concentrationBefore,after:r.concentrationAfter});}else changes.push({resource:{...r.resource,...(['counter','charges'].includes(r.resource.kind)&&r.title?{name:r.title}:{})},before:r.before,after:r.after});
 }else{
  const before=JSON.parse(row.before_json),after=JSON.parse(row.after_json);
  for(const key of ['hp','tempHp','maxHp','gold','inspiration'])if(before[key]!==after[key])changes.push({resource:{kind:key},before:before[key],after:after[key]});
  for(const level of [1,2,3])if(before.slots?.[level]!==after.slots?.[level])changes.push({resource:{kind:'slot',level},before:before.slots?.[level],after:after.slots?.[level]});
  const sheet=db.prepare('SELECT before_json,after_json FROM character_sheet_changes WHERE mutation_id=?').get(row.mutation_id);
  if(sheet){const a=JSON.parse(sheet.before_json)?.counters||[],b=JSON.parse(sheet.after_json)?.counters||[];for(const id of new Set([...a,...b].map(c=>c.id))){const x=a.find(c=>c.id===id),y=b.find(c=>c.id===id);if(x?.current!==y?.current||x?.max!==y?.max)changes.push({resource:{kind:'counter',counterId:id,name:y?.name||x?.name},before:x?.current??null,after:y?.current??null,beforeMax:x?.max??null,afterMax:y?.max??null});}}
  const inventory=db.prepare('SELECT before_json,after_json FROM inventory_changes WHERE mutation_id=?').get(row.mutation_id);
  if(inventory){const a=JSON.parse(inventory.before_json),b=JSON.parse(inventory.after_json);for(const id of new Set([...a,...b].map(i=>i.catalogId))){const x=a.find(i=>i.catalogId===id),y=b.find(i=>i.catalogId===id),name=(y||x).entry.name.ru;if((x?.quantity||0)!==(y?.quantity||0))changes.push({resource:{kind:'quantity',catalogId:id,name},before:x?.quantity||0,after:y?.quantity||0});for(let unit=0;unit<Math.max(x?.quantity||0,y?.quantity||0);unit++){const old=x?.chargeCounts?.[unit]??null,next=y?.chargeCounts?.[unit]??null;if(old!==next)changes.push({resource:{kind:'charges',catalogId:id,unit,name},before:old,after:next});}}}
 }
 let undoReason='Для этой записи доступна ручная сверка',canUndo=false,undoKind='resource';
 if(resource)try{inverseResource(db,current,row.mutation_id);canUndo=true;undoReason='';}catch(error){if(!(error instanceof AppError))throw error;undoReason=error.message;}
 else if(db.prepare('SELECT 1 FROM inventory_changes WHERE mutation_id=?').get(row.mutation_id))try{inventoryInverse(db,{characterId:current.context.characterId,targetMutationId:row.mutation_id},current);canUndo=true;undoReason='';undoKind='inventory';}catch(error){if(!(error instanceof AppError))throw error;undoReason=error.message;}
 return {mutationId:row.mutation_id,revision:row.revision,label:row.label,createdAt:row.created_at,changes,canUndo,undoReason,undoKind};
}
