// Durable, ordered commands. This queue deliberately stops on revision conflicts;
// clamped damage/healing and absolute edits must never be silently rebased.
const SkazResourceQueue = (() => {
 const clone=value=>JSON.parse(JSON.stringify(value));
 const sameContext=(a,b)=>a&&b&&['campaignId','characterId','sessionId'].every(k=>typeof a[k]==='string'&&a[k]===b[k]);
 function balance(snapshot,r){
  if(r.kind==='cast')return SkazCasting.balance(snapshot,r.operation==='restore'?r.receipt.cost:r.command?.cost??r.cost??null);
  if(['hp','health'].includes(r.kind))return {value:snapshot.state.hp,maximum:snapshot.state.maxHp};
  if(r.kind==='slot'||r.kind==='inspiration'){
   if(snapshot.characterSheet)throw new Error('Используй счётчики своего класса');
   return r.kind==='slot'&&[1,2,3].includes(r.level)?{value:snapshot.state.slots[r.level],maximum:[4,3,2][r.level-1]}:r.kind==='inspiration'?{value:snapshot.state.inspiration,maximum:4}:null;
  }
  if(r.kind==='counter'){const c=snapshot.characterSheet?.counters.find(c=>c.id===r.counterId);return c?{value:c.current,maximum:c.max}:null;}
  if(r.kind==='charges'){const item=snapshot.inventory?.find(item=>item.catalogId===r.catalogId);return item&&Number.isSafeInteger(r.unit)&&r.unit>=0&&r.unit<item.quantity?{value:item.chargeCounts?.[r.unit],maximum:(item.entry.item||item.entry.artifact)?.charges?.max}:null;}
  return null;
 }
 function projectOne(snapshot,command){
  if(!sameContext(snapshot.context,command.context))throw new Error('Очередь относится к другой игре');
  const b=balance(snapshot,command.resource);
  if(!b||!Number.isSafeInteger(b.value)||!Number.isSafeInteger(b.maximum)||b.value!==command.before||b.maximum!==command.maximum||!Number.isSafeInteger(command.delta)||(!command.delta&&!(command.resource.kind==='health'&&command.resource.operation==='temporary'))||Math.abs(command.delta)>10000)throw new Error('Остаток ресурса требует сверки');
  if(command.resource.kind==='cast'){if(command.delta!==1)throw Error('Неверная команда сотворения');const r=command.resource;if(r.operation==='restore'){if(!command.targetMutationId)throw Error('Нужна цель отмены');return SkazCasting.restore(snapshot,r.receipt);}if(command.targetMutationId||r.operation!=='cast')throw Error('Неверное сотворение');return SkazCasting.project(snapshot,r.command).snapshot;}
  if(command.resource.kind==='health'){
   if(command.resource.operation==='restore'&&!command.targetMutationId)throw new Error('Отмена требует исходную операцию');
   const next=clone(snapshot);Object.assign(next.state,SkazHealth.project(snapshot.state.hp,snapshot.state.maxHp,snapshot.state.tempHp||0,command.resource,command.delta,snapshot.state.concentration,snapshot.state.concentrationChecks||[],command.mutationId,SkazHealth.deathState(snapshot.state.hp,snapshot.state.deathSaves)));return next;
  }
  if(command.resource.kind==='hp'&&command.delta<0&&(snapshot.state.tempHp||0)>0)throw new Error('Обнови страницу: урон должен учитывать временные хиты');
  let value=b.value+command.delta;
  if(command.targetMutationId&&(value<0||value>b.maximum))throw new Error('Отмена выйдет за границы ресурса');
  if(command.resource.kind==='hp')value=Math.max(0,Math.min(b.maximum,value));
  else if(value<0||value>b.maximum)throw new Error('Ресурс выйдет за допустимые границы');
  const next=clone(snapshot),r=command.resource;
  if(r.kind==='hp')next.state.hp=value;else if(r.kind==='slot')next.state.slots[r.level]=value;else if(r.kind==='inspiration')next.state.inspiration=value;
  else if(r.kind==='counter')next.characterSheet.counters.find(c=>c.id===r.counterId).current=value;
  else next.inventory.find(item=>item.catalogId===r.catalogId).chargeCounts[r.unit]=value;
  return next;
 }
 class Queue {
  constructor(storage,key){this.storage=storage;this.key=key;this.data=null;const raw=storage.getItem(key);if(raw){let data;try{data=JSON.parse(raw);this.validate(data);}catch{throw new Error('Сохранённая очередь повреждена. Сохрани её копию перед восстановлением');}this.data=data;}}
  validate(data){
   if(data?.schemaVersion!==1||!data.baseline?.state||!Number.isSafeInteger(data.baseline.revision)||data.baseline.revision<0||!Array.isArray(data.commands)||data.commands.length>1000)throw new Error('Неверный формат очереди');
   let projected=data.baseline;const ids=new Set();
   for(const [i,command] of data.commands.entries()){
    if(typeof command.mutationId!=='string'||!/^[a-zA-Z0-9-]{8,80}$/.test(command.mutationId)||ids.has(command.mutationId)||command.expectedRevision!==data.baseline.revision+i)throw new Error('Нарушен порядок очереди');
    if(command.targetMutationId!==undefined&&(typeof command.targetMutationId!=='string'||!/^[a-zA-Z0-9-]{8,80}$/.test(command.targetMutationId)||command.targetMutationId===command.mutationId))throw new Error('Неверная цель отмены');
    const time=data.createdAt?.[command.mutationId];if(time!==undefined&&(typeof time!=='string'||!Number.isFinite(Date.parse(time))))throw new Error('Неверное время операции');
    ids.add(command.mutationId);projected=projectOne(projected,command);
   }
  }
  persist(data){this.validate(data);const raw=JSON.stringify(data);if(raw.length>2*1024*1024)throw new Error('Очередь слишком велика. Сначала отправь накопленные изменения');this.storage.setItem(this.key,raw);this.data=data;}
  resetBaseline(snapshot){if(this.length)throw new Error('Сначала отправь или явно разбери очередь');this.persist({schemaVersion:1,baseline:clone(snapshot),commands:[]});}
  archiveAndReset(snapshot,archiveKey){
   if(!this.length||typeof archiveKey!=='string'||!archiveKey.startsWith(this.key+':archive:')||this.storage.getItem(archiveKey)!==null)throw new Error('Нужен новый архив этой очереди');
   const next={schemaVersion:1,baseline:clone(snapshot),commands:[]};this.validate(next);
   this.storage.setItem(archiveKey,JSON.stringify(this.data));
   this.persist(next);
  }
  get length(){return this.data?.commands.length||0;}
  get head(){return this.length?clone(this.data.commands[0]):null;}
  get snapshot(){if(!this.data)return null;return this.data.commands.reduce(projectOne,clone(this.data.baseline));}
  enqueue(resource,delta,mutationId,targetMutationId){
   if(!this.data)throw new Error('Сначала открой сохранённую игру');
   const snapshot=this.snapshot;if(resource.kind==='cast'&&!resource.operation)resource={kind:'cast',operation:'cast',command:SkazCasting.prepare(snapshot,resource.catalogId,resource.cost??null)};const b=balance(snapshot,resource);if(!b)throw new Error('Ресурс недоступен');
   if(resource.kind==='health')resource={kind:'health',operation:resource.operation,temporaryBefore:resource.temporaryBefore,concentrationBefore:snapshot.state.concentration,checksBefore:clone(snapshot.state.concentrationChecks||[]),deathBefore:SkazHealth.deathState(snapshot.state.hp,snapshot.state.deathSaves),...(['pass','fail'].includes(resource.operation)?{checkId:resource.checkId}:{}),...(resource.operation==='restore'?{hpAfter:resource.hpAfter,tempAfter:resource.tempAfter,concentrationAfter:resource.concentrationAfter,checksAfter:clone(resource.checksAfter||[]),deathAfter:resource.deathAfter||SkazHealth.deathState(resource.hpAfter)}:{})};
   const command={mutationId,expectedRevision:this.data.baseline.revision+this.length,context:clone(snapshot.context),resource:clone(resource),delta,before:b.value,maximum:b.maximum,...(targetMutationId?{targetMutationId}:{})};
   projectOne(snapshot,command);this.persist({...this.data,createdAt:{...this.data.createdAt,[mutationId]:new Date().toISOString()},commands:[...this.data.commands,command]});return clone(command);
  }
  undoInfo(targetId){
   const target=this.data?.commands.find(c=>c.mutationId===targetId);
   if(!target||target.targetMutationId||this.data.commands.some(c=>c.targetMutationId===targetId))throw new Error('Операция уже отменена или отправлена');
   const later=this.data.commands.slice(this.data.commands.indexOf(target)+1);
   if(later.some(c=>SkazHealth.overlaps(c.resource,target.resource)&&(['health','cast'].includes(c.resource.kind)||['health','cast'].includes(target.resource.kind))))throw new Error('После действия менялось здоровье. Нужна сверка');
   if(target.resource.kind==='cast'){const before=this.data.commands.slice(0,this.data.commands.indexOf(target)).reduce(projectOne,clone(this.data.baseline)),receipt=SkazCasting.project(before,target.resource.command).receipt;SkazCasting.restore(this.snapshot,receipt);if(receipt.cost===null&&!receipt.changesFocus)throw Error('Заговор не изменил ресурсы');return {resource:{kind:'cast',operation:'restore',receipt},delta:1};}
   if(target.resource.kind==='health'){
    const snapshot=this.snapshot,after=SkazHealth.project(target.before,target.maximum,target.resource.temporaryBefore,target.resource,target.delta,target.resource.concentrationBefore,target.resource.checksBefore,target.mutationId,target.resource.deathBefore);
    if(snapshot.state.hp!==after.hp||(snapshot.state.tempHp||0)!==after.tempHp||snapshot.state.maxHp!==target.maximum||target.before===after.hp&&target.resource.temporaryBefore===after.tempHp&&target.resource.concentrationBefore===after.concentration&&JSON.stringify(target.resource.checksBefore||[])===JSON.stringify(after.concentrationChecks||[])&&JSON.stringify(target.resource.deathBefore)===JSON.stringify(after.deathSaves))throw new Error('Здоровье изменилось или операция ничего не изменила');
    return {resource:{kind:'health',operation:'restore',temporaryBefore:after.tempHp,hpAfter:target.before,tempAfter:target.resource.temporaryBefore,concentrationBefore:snapshot.state.concentration,concentrationAfter:target.resource.concentrationBefore,checksAfter:clone(target.resource.checksBefore||[]),deathAfter:target.resource.deathBefore},delta:1};
   }
   const after=target.resource.kind==='hp'?Math.max(0,Math.min(target.maximum,target.before+target.delta)):target.before+target.delta;
   const delta=target.before-after,b=balance(this.snapshot,target.resource);
   if(!delta||!b||b.maximum!==target.maximum||b.value+delta<0||b.value+delta>b.maximum)throw new Error('Отмена выйдет за границы ресурса');
   return {resource:clone(target.resource),delta};
  }
  enqueueUndo(targetId,mutationId){const inverse=this.undoInfo(targetId);return this.enqueue(inverse.resource,inverse.delta,mutationId,targetId);}
  acknowledge(command,payload){
   if(!this.head||JSON.stringify(command)!==JSON.stringify(this.head))throw new Error('Нарушен порядок подтверждений');
   const receipt=payload.resourceReceipt;if((command.targetMutationId||['health','cast'].includes(command.resource.kind))&&!receipt)throw new Error('Сервер не подтвердил связь отмены');
   const verified=receipt&&receipt.mutationId===command.mutationId&&sameContext(receipt.context,command.context)&&JSON.stringify(receipt.resource)===JSON.stringify(command.resource)&&receipt.before===command.before&&receipt.maximum===command.maximum&&receipt.delta===command.delta&&receipt.targetMutationId===command.targetMutationId&&Number.isSafeInteger(receipt.revision)&&receipt.revision>command.expectedRevision&&payload.revision>=receipt.revision;
   if(receipt&&!verified)throw new Error('Подтверждение относится к другой операции. Очередь сохранена');
   if(!sameContext(command.context,payload.context)||(!verified&&payload.revision!==command.expectedRevision+1))throw new Error('После отправки игра изменилась. Очередь сохранена для сверки');
   const expected=projectOne(this.data.baseline,command),actual={...clone(payload),inventory:payload.inventory??expected.inventory,spellbook:payload.spellbook??expected.spellbook};
   const before=balance(expected,command.resource),after=balance(actual,command.resource);
   if(command.resource.kind==='cast'){const r=command.resource;if(actual.state.concentration!==expected.state.concentration||JSON.stringify(actual.state.concentrationChecks||[])!==JSON.stringify(expected.state.concentrationChecks||[]))throw Error('Сервер не подтвердил концентрацию');if(r.operation==='cast'&&JSON.stringify(receipt.casting)!==JSON.stringify(SkazCasting.project(this.data.baseline,r.command).receipt))throw Error('Неверная квитанция сотворения');}
   if(!after||after.value!==before.value||after.maximum!==before.maximum)throw new Error('Сервер не подтвердил ожидаемый результат');
   if(command.resource.kind==='health'&&Object.hasOwn(command.resource,'deathBefore')&&(JSON.stringify(actual.state.deathSaves)!==JSON.stringify(expected.state.deathSaves)||JSON.stringify(receipt.deathAfter)!==JSON.stringify(expected.state.deathSaves)))throw new Error('Сервер не подтвердил спасброски от смерти');
   if(command.resource.kind==='health'&&Object.hasOwn(command.resource,'checksBefore')&&(JSON.stringify(actual.state.concentrationChecks||[])!==JSON.stringify(expected.state.concentrationChecks||[])||JSON.stringify(receipt.checksAfter)!==JSON.stringify(expected.state.concentrationChecks)))throw new Error('Сервер не подтвердил вопросы концентрации');
   if(command.resource.kind==='health'&&((actual.state.tempHp||0)!==expected.state.tempHp||receipt.tempAfter!==expected.state.tempHp||actual.state.concentration!==expected.state.concentration||receipt.concentrationAfter!==expected.state.concentration))throw new Error('Сервер не подтвердил временные хиты');
   if(verified&&receipt.after!==after.value)throw new Error('Подтверждение ресурса не совпало с остатком');
   this.persist({schemaVersion:1,baseline:actual,createdAt:Object.fromEntries(Object.entries(this.data.createdAt||{}).filter(([id])=>id!==command.mutationId)),commands:this.data.commands.slice(1).map((next,i)=>({...next,expectedRevision:payload.revision+i}))});
  }
 }
 return Queue;
})();
