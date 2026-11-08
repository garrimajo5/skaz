// Durable, ordered commands. This queue deliberately stops on revision conflicts;
// clamped damage/healing and absolute edits must never be silently rebased.
const SkazResourceQueue = (() => {
 const clone=value=>JSON.parse(JSON.stringify(value));
 const sameContext=(a,b)=>a&&b&&['campaignId','characterId','sessionId'].every(k=>typeof a[k]==='string'&&a[k]===b[k]);
 function balance(snapshot,r){
  if(r.kind==='hp')return {value:snapshot.state.hp,maximum:snapshot.state.maxHp};
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
  if(!b||!Number.isSafeInteger(b.value)||!Number.isSafeInteger(b.maximum)||b.value!==command.before||b.maximum!==command.maximum||!Number.isSafeInteger(command.delta)||!command.delta||Math.abs(command.delta)>10000)throw new Error('Остаток ресурса требует сверки');
  let value=b.value+command.delta;
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
  enqueue(resource,delta,mutationId){
   if(!this.data)throw new Error('Сначала открой сохранённую игру');
   const snapshot=this.snapshot,b=balance(snapshot,resource);if(!b)throw new Error('Ресурс недоступен');
   const command={mutationId,expectedRevision:this.data.baseline.revision+this.length,context:clone(snapshot.context),resource:clone(resource),delta,before:b.value,maximum:b.maximum};
   projectOne(snapshot,command);this.persist({...this.data,createdAt:{...this.data.createdAt,[mutationId]:new Date().toISOString()},commands:[...this.data.commands,command]});return clone(command);
  }
  acknowledge(command,payload){
   if(!this.head||JSON.stringify(command)!==JSON.stringify(this.head))throw new Error('Нарушен порядок подтверждений');
   const receipt=payload.resourceReceipt;
   const verified=receipt&&receipt.mutationId===command.mutationId&&sameContext(receipt.context,command.context)&&JSON.stringify(receipt.resource)===JSON.stringify(command.resource)&&receipt.before===command.before&&receipt.maximum===command.maximum&&receipt.delta===command.delta&&Number.isSafeInteger(receipt.revision)&&receipt.revision>command.expectedRevision&&payload.revision>=receipt.revision;
   if(receipt&&!verified)throw new Error('Подтверждение относится к другой операции. Очередь сохранена');
   if(!sameContext(command.context,payload.context)||(!verified&&payload.revision!==command.expectedRevision+1))throw new Error('После отправки игра изменилась. Очередь сохранена для сверки');
   const expected=projectOne(this.data.baseline,command),actual={...clone(payload),inventory:payload.inventory??expected.inventory};
   const before=balance(expected,command.resource),after=balance(actual,command.resource);
   if(!after||after.value!==before.value||after.maximum!==before.maximum)throw new Error('Сервер не подтвердил ожидаемый результат');
   if(verified&&receipt.after!==after.value)throw new Error('Подтверждение ресурса не совпало с остатком');
   this.persist({schemaVersion:1,baseline:actual,createdAt:Object.fromEntries(Object.entries(this.data.createdAt||{}).filter(([id])=>id!==command.mutationId)),commands:this.data.commands.slice(1).map((next,i)=>({...next,expectedRevision:payload.revision+i}))});
  }
 }
 return Queue;
})();
