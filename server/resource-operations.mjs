import {AppError} from './state.mjs';
import {readCharacterSheet,saveCharacterSheet} from './character-sheet.mjs';
import {readInventory,changeCharges} from './inventory.mjs';

const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const fail=message=>{throw new AppError(422,message);};
const id=value=>typeof value==='string'&&/^[a-zA-Z0-9-]{1,80}$/.test(value);
export function validateResourceCommand(input){
 if(!exact(input,['mutationId','expectedRevision','context','resource','delta','before','maximum']))fail('Неверные поля операции ресурса');
 if(!exact(input.context,['campaignId','characterId','sessionId'])||!Object.values(input.context).every(id))fail('Нужен контекст операции');
 const r=input.resource;
 if(!r||!['hp','slot','inspiration','counter','charges'].includes(r.kind))fail('Неизвестный ресурс');
 const keys=r.kind==='slot'?['kind','level']:r.kind==='counter'?['kind','counterId']:r.kind==='charges'?['kind','catalogId','unit']:['kind'];
 if(!exact(r,keys))fail('Неверные поля ресурса');
 if(r.kind==='slot'&&![1,2,3].includes(r.level))fail('Неверный круг шаблона');
 if(r.kind==='counter'&&!id(r.counterId))fail('Неверный счётчик');
 if(r.kind==='charges'&&(typeof r.catalogId!=='string'||!/^[a-z0-9][a-z0-9:._-]{2,119}$/.test(r.catalogId)||!Number.isSafeInteger(r.unit)||r.unit<0||r.unit>998))fail('Неверный экземпляр предмета');
 if(!Number.isSafeInteger(input.delta)||!input.delta||Math.abs(input.delta)>10000)fail('Нужно ненулевое целое приращение до 10000');
 if(!Number.isSafeInteger(input.maximum)||input.maximum<0||input.maximum>10000||!Number.isSafeInteger(input.before)||input.before<0||input.before>input.maximum)fail('Неверный ожидаемый остаток');
 return {context:{campaignId:input.context.campaignId,characterId:input.context.characterId,sessionId:input.context.sessionId},resource:Object.fromEntries(keys.map(k=>[k,r[k]])),delta:input.delta,before:input.before,maximum:input.maximum};
}
export function resourceBalance(db,current,resource){
 const sheet=current.characterSheet;
 if(resource.kind==='hp')return {value:current.state.hp,maximum:current.state.maxHp,title:'Хиты'};
 if(resource.kind==='slot'||resource.kind==='inspiration'){
  if(sheet)throw new AppError(409,'Ресурсы шаблона недоступны для собственного класса');
  return resource.kind==='slot'?{value:current.state.slots[resource.level],maximum:[4,3,2][resource.level-1],title:resource.level+' круг'}:{value:current.state.inspiration,maximum:4,title:'Вдохновение'};
 }
 if(resource.kind==='counter'){
  const counter=readCharacterSheet(db,current.context.characterId)?.counters.find(c=>c.id===resource.counterId);
  if(!counter)throw new AppError(409,'Счётчик больше не существует');
  return {value:counter.current,maximum:counter.max,title:counter.name};
 }
 const item=readInventory(db,current.context.characterId).find(item=>item.catalogId===resource.catalogId),value=item?.chargeCounts?.[resource.unit],maximum=(item?.entry.item||item?.entry.artifact)?.charges?.max;
 if(!item||resource.unit>=item.quantity||!Number.isSafeInteger(value)||!Number.isSafeInteger(maximum))throw new AppError(409,'Экземпляр или известный остаток зарядов недоступен');
 return {value,maximum,title:'Заряды: '+item.entry.name.ru};
}
// Caller owns the transaction and durable mutation receipt. Never reorder or sum
// operations: clamped HP changes do not commute, and absolute edits must conflict.
export function applyResourceCommand(db,current,payload,mutationId,writeState){
 if(Object.keys(payload.context).some(k=>payload.context[k]!==current.context[k]))throw new AppError(409,'Активная игра изменилась');
 const balance=resourceBalance(db,current,payload.resource);
 if(balance.value!==payload.before||balance.maximum!==payload.maximum)throw new AppError(409,'Остаток или максимум ресурса изменился. Нужна сверка очереди');
 let after=balance.value+payload.delta;
 if(payload.resource.kind==='hp')after=Math.max(0,Math.min(balance.maximum,after));
 else if(after<0||after>balance.maximum)throw new AppError(409,'Приращение выходит за пределы ресурса');
 const next=structuredClone(current.state),r=payload.resource;
 if(r.kind==='counter'){
  const sheet=readCharacterSheet(db,current.context.characterId);sheet.counters.find(c=>c.id===r.counterId).current=after;
  saveCharacterSheet(db,{characterId:current.context.characterId,sheet},mutationId,current.context.characterId);
 }else if(r.kind==='charges'){
  changeCharges(db,{characterId:current.context.characterId,catalogId:r.catalogId,unit:r.unit,operation:payload.delta<0?'spend':'recover',amount:Math.abs(payload.delta)},mutationId,current.context.characterId);
 }else{
  if(r.kind==='hp')next.hp=after;else if(r.kind==='slot')next.slots[r.level]=after;else next.inspiration=after;
  writeState(next);
 }
 return {state:next,label:balance.title+': '+balance.value+' → '+after};
}
