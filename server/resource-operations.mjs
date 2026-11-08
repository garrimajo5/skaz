import Health from '../client/health.js';
import {AppError} from './state.mjs';
import {readCharacterSheet,saveCharacterSheet} from './character-sheet.mjs';
import {readInventory,changeCharges} from './inventory.mjs';

const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const fail=message=>{throw new AppError(422,message);};
const id=value=>typeof value==='string'&&/^[a-zA-Z0-9-]{1,80}$/.test(value);
export function validateResourceCommand(input){
 if(!exact(input,['mutationId','expectedRevision','context','resource','delta','before','maximum',...(Object.hasOwn(input||{},'targetMutationId')?['targetMutationId']:[])]))fail('Неверные поля операции ресурса');
 if(!exact(input.context,['campaignId','characterId','sessionId'])||!Object.values(input.context).every(id))fail('Нужен контекст операции');
 if(Object.hasOwn(input,'targetMutationId')&&(!id(input.targetMutationId)||input.targetMutationId===input.mutationId))fail('Неверная цель отмены');
 const r=input.resource;
 if(!r||!['health','hp','slot','inspiration','counter','charges'].includes(r.kind))fail('Неизвестный ресурс');
 const keys=r.kind==='health'?['kind','operation','temporaryBefore','concentrationBefore',...(Object.hasOwn(r,'checksBefore')?['checksBefore']:[]),...(Object.hasOwn(r,'deathBefore')?['deathBefore']:[]),...(['pass','fail'].includes(r.operation)?['checkId']:[]),...(r.operation==='restore'?['hpAfter','tempAfter','concentrationAfter',...(Object.hasOwn(r,'checksBefore')?['checksAfter']:[]),...(Object.hasOwn(r,'deathBefore')?['deathAfter']:[])]:[])]:r.kind==='slot'?['kind','level']:r.kind==='counter'?['kind','counterId']:r.kind==='charges'?['kind','catalogId','unit']:['kind'];
 if(!exact(r,keys))fail('Неверные поля ресурса');
 if(r.kind==='health'&&([r.concentrationBefore,...(r.operation==='restore'?[r.concentrationAfter]:[])].some(c=>c!==null&&(typeof c!=='string'||!c.trim()||c.length>200))||!['damage','heal','temporary','restore','pass','fail','critical-damage','death-success','death-failure','death-1','death-20','death-stabilize'].includes(r.operation)||!Number.isSafeInteger(r.temporaryBefore)||r.temporaryBefore<0||r.temporaryBefore>9999||input.delta<0||r.operation==='restore'&&!input.targetMutationId))fail('Неверная операция здоровья');
 if(r.kind==='health'&&Object.hasOwn(r,'checksBefore'))for(const entries of [r.checksBefore,...(r.operation==='restore'?[r.checksAfter]:[])])if(!Array.isArray(entries)||entries.length>100)fail('Неверный список проверок');
 if(r.kind==='health'&&['pass','fail'].includes(r.operation)&&(!id(r.checkId)||input.delta!==1||!Object.hasOwn(r,'checksBefore')))fail('Неверное решение проверки');
 if(r.kind==='slot'&&![1,2,3].includes(r.level))fail('Неверный круг шаблона');
 if(r.kind==='counter'&&!id(r.counterId))fail('Неверный счётчик');
 if(r.kind==='charges'&&(typeof r.catalogId!=='string'||!/^[a-z0-9][a-z0-9:._-]{2,119}$/.test(r.catalogId)||!Number.isSafeInteger(r.unit)||r.unit<0||r.unit>998))fail('Неверный экземпляр предмета');
 if(!Number.isSafeInteger(input.delta)||(!input.delta&&!(r.kind==='health'&&r.operation==='temporary'))||Math.abs(input.delta)>10000)fail('Нужно ненулевое целое приращение до 10000');
 if(!Number.isSafeInteger(input.maximum)||input.maximum<0||input.maximum>10000||!Number.isSafeInteger(input.before)||input.before<0||input.before>input.maximum)fail('Неверный ожидаемый остаток');
 return {context:{campaignId:input.context.campaignId,characterId:input.context.characterId,sessionId:input.context.sessionId},resource:Object.fromEntries(keys.map(k=>[k,r[k]])),delta:input.delta,before:input.before,maximum:input.maximum,...(input.targetMutationId?{targetMutationId:input.targetMutationId}:{})};
}
export function resourceBalance(db,current,resource){
 const sheet=current.characterSheet;
 if(['hp','health'].includes(resource.kind))return {value:current.state.hp,maximum:current.state.maxHp,title:'Хиты'};
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
 if(payload.resource.kind==='hp'&&payload.delta<0&&(current.state.tempHp||0)>0)throw new AppError(409,'Обнови страницу: урон должен учитывать временные хиты');
 if(['health','hp'].includes(payload.resource.kind)&&current.state.concentrationChecks?.length&&!Object.hasOwn(payload.resource,'checksBefore'))throw new AppError(409,'Обнови страницу: есть вопросы концентрации');
 if(['health','hp'].includes(payload.resource.kind)&&current.state.deathSaves!==undefined&&!Object.hasOwn(payload.resource,'deathBefore'))throw new AppError(409,'Обнови страницу: сохранены спасброски от смерти');
 let after=balance.value+payload.delta,health;
 if(payload.resource.kind==='health'){try{health=Health.project(current.state.hp,current.state.maxHp,current.state.tempHp||0,payload.resource,payload.delta,current.state.concentration,current.state.concentrationChecks||[],mutationId,Health.deathState(current.state.hp,current.state.deathSaves));}catch(error){throw new AppError(409,error.message);}after=health.hp;}
 if(payload.resource.kind==='hp')after=Math.max(0,Math.min(balance.maximum,after));
 else if(!health&&(after<0||after>balance.maximum))throw new AppError(409,'Приращение выходит за пределы ресурса');
 const next=structuredClone(current.state),r=payload.resource;
 if(r.kind==='counter'){
  const sheet=readCharacterSheet(db,current.context.characterId);sheet.counters.find(c=>c.id===r.counterId).current=after;
  saveCharacterSheet(db,{characterId:current.context.characterId,sheet},mutationId,current.context.characterId);
 }else if(r.kind==='charges'){
  changeCharges(db,{characterId:current.context.characterId,catalogId:r.catalogId,unit:r.unit,operation:payload.delta<0?'spend':'recover',amount:Math.abs(payload.delta)},mutationId,current.context.characterId);
 }else{
  if(health)Object.assign(next,health);else if(r.kind==='hp')next.hp=after;else if(r.kind==='slot')next.slots[r.level]=after;else next.inspiration=after;
  writeState(next);
 }
 return {state:next,after,health,title:balance.title,label:balance.title+': '+balance.value+' → '+after};
}
