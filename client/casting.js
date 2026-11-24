// Shared projection for issue #20, used by the API and durable queue. The transaction
// layer must authenticate the owner, check revision/idempotency and persist one
// receipt; history must reject intervening overlapping writes before restore.
const SkazCasting = (() => {
 const copy=value=>JSON.parse(JSON.stringify(value));
 const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
 const reject=message=>{throw Error(message);};
 const manualNoteKind='manual-cast-v1';
 const validId=value=>typeof value==='string'&&/^[a-zA-Z0-9-]{8,80}$/.test(value);
 const validSpellId=value=>typeof value==='string'&&/^[a-z0-9][a-z0-9:._-]{2,119}$/.test(value);
 const validLevel=value=>Number.isInteger(value)&&value>=1&&value<=9;
 const validReason=value=>typeof value==='string'&&value.length<=500&&value===value.trim();
 const validAt=value=>Number.isSafeInteger(value)&&value>0&&value<=8640000000000000;
 function choices(snapshot,level){
  const sheet=snapshot.characterSheet;
  return {
   levels:sheet||!validLevel(level)?[]:[1,2,3].filter(n=>n>=level&&snapshot.state.slots?.[n]>0),
   counters:sheet&&validLevel(level)?sheet.counters.filter(item=>item.current>0):[],
   basis:sheet?'counters':'slots'
  };
 }
 function validateManualCost(cost){
  if(!exact(cost,['kind','level','id','at','agreed','reason'])||!validLevel(cost.level)||!validId(cost.id)||
     !validAt(cost.at)||typeof cost.agreed!=='boolean'||!validReason(cost.reason))reject('Неверные сведения ручного сотворения');
 }
 function readManualNote(note){
  if(note?.kind!==manualNoteKind)return null;
  let details;
  try{details=JSON.parse(note.text);}catch{reject('Неверная запись ручного сотворения');}
  if(!exact(details,['id','catalogId','level','basis','agreed','reason'])||!validId(details.id)||!validSpellId(details.catalogId)||
     !validLevel(details.level)||!['slots','counters'].includes(details.basis)||typeof details.agreed!=='boolean'||
     !validReason(details.reason)||!validAt(note.at)||note.time!==''||typeof note.title!=='string'||!note.title.trim()||note.title.length>200)
   reject('Неверная запись ручного сотворения');
  return details;
 }
 function manualAgreement(snapshot,catalogId,level){
  const {levels,counters,basis}=choices(snapshot,level);
  if(!validLevel(level)||levels.length||counters.length)return null;
  const latest=(snapshot.state.notes||[]).findLast(note=>{
   const item=readManualNote(note);
   return item?.catalogId===catalogId;
  });
  const item=readManualNote(latest);
  return item?.agreed&&item.level===level&&item.basis===basis?item:null;
 }
 function createManualNote(command){
  const {id,at,agreed,reason}=command.cost;
  const {catalogId,level,name}=command.spell;
  const {manualBasis:basis}=command;
  return {kind:manualNoteKind,title:name,text:JSON.stringify({id,catalogId,level,basis,agreed,reason}),at,time:''};
 }
 function noteMatches(note,expected){
  const details=readManualNote(note);
  return !!details&&equal(details,readManualNote(expected))&&note.title===expected.title&&note.at===expected.at;
 }
 function confirmsManualNote(snapshot,note,present){
  return (snapshot.state.notes||[]).filter(item=>noteMatches(item,note)).length===(present?1:0);
 }
 function spell(snapshot,catalogId){
  const owned=snapshot.spellbook?.find(item=>item.catalogId===catalogId);
  const entry=owned?.entry;
  if(!owned||!['known','prepared'].includes(owned.status)||entry?.id!==catalogId||entry.kind!=='spell'||entry.ruleset!=='5e-2014'||!Number.isInteger(entry.spell?.level)||entry.spell.level<0||entry.spell.level>9||typeof entry.spell.concentration!=='boolean'||typeof entry.name?.ru!=='string'||!entry.name.ru.trim()||entry.name.ru.length>200)reject('Нужно сохранённое заклинание редакции 2014');
  return {catalogId,level:entry.spell.level,concentration:entry.spell.concentration,name:entry.name.ru};
 }
 function balance(snapshot,cost){
  if(cost===null)return {value:0,maximum:0};
  if(cost?.kind==='manual'){validateManualCost(cost);return {value:0,maximum:0};}
  if(cost?.kind==='slot'&&exact(cost,['kind','level'])&&[1,2,3].includes(cost.level)){
   if(snapshot.characterSheet)reject('Для своего класса выбери счётчик явно');
   const value=snapshot.state.slots?.[cost.level],maximum=[4,3,2][cost.level-1];
   if(!Number.isSafeInteger(value)||value<0||value>maximum)reject('Остаток ячеек требует сверки');
   return {value,maximum};
  }
  if(cost?.kind==='counter'&&exact(cost,['kind','counterId','level'])&&Number.isInteger(cost.level)&&cost.level>=1&&cost.level<=9){
   // The level is an explicit manual declaration, never guessed from a name.
   const counter=snapshot.characterSheet?.counters.find(item=>item.id===cost.counterId);
   if(!counter||!Number.isSafeInteger(counter.current)||!Number.isSafeInteger(counter.max)||counter.current<0||counter.current>9999||counter.max<0||counter.max>10000)reject('Счётчик ячеек требует сверки');
   return {value:counter.current,maximum:counter.max};
  }
  reject('Выбери ячейку и её круг');
 }
 function context(snapshot){
  const c=snapshot.context;
  if(!exact(c,['campaignId','characterId','sessionId'])||!Object.values(c).every(x=>typeof x==='string'&&/^[a-zA-Z0-9-]{1,80}$/.test(x)))reject('Нужен контекст игры');
  return copy(c);
 }
 function focus(snapshot){return {concentration:snapshot.state.concentration,checks:copy(snapshot.state.concentrationChecks||[])};}
 function prepare(snapshot,catalogId,cost=null){
  const metadata=spell(snapshot,catalogId),b=balance(snapshot,cost);
  if(metadata.level===0&&cost!==null||metadata.level>0&&(cost===null||cost.level<metadata.level))reject('Круг ячейки не подходит заклинанию');
  let manualBasis;
  if(cost?.kind==='manual'){
   const {levels,counters,basis}=choices(snapshot,metadata.level);
   manualBasis=basis;
   if(cost.level!==metadata.level||levels.length||counters.length)reject('Доступные ресурсы изменились. Открой ручное сотворение заново');
   if((snapshot.state.notes||[]).length>=2000)reject('Личные заметки заполнены. Сохрани игру и освободи место для новой записи');
   if((snapshot.state.notes||[]).some(note=>readManualNote(note)?.id===cost.id))reject('Эта ручная запись уже существует');
  }else{
   if(cost!==null&&b.value<1)reject('Нет доступной ячейки');
   if(!Number.isSafeInteger(snapshot.state.hp)||snapshot.state.hp<=0||snapshot.state.deathSaves?.status==='dead')reject('При 0 HP сотворение недоступно');
  }
  return {kind:'cast',context:context(snapshot),spell:metadata,cost:copy(cost),before:b.value,maximum:b.maximum,focusBefore:focus(snapshot),...(manualBasis?{manualBasis}:{})};
 }
 function writeCost(snapshot,cost,value){
  if(cost?.kind==='slot')snapshot.state.slots[cost.level]=value;
  if(cost?.kind==='counter'){snapshot.characterSheet.counters.find(item=>item.id===cost.counterId).current=value;if(snapshot.characterSheet.ruleAcknowledgements)snapshot.characterSheet.ruleAcknowledgements=snapshot.characterSheet.ruleAcknowledgements.filter(a=>a.key!=='counter:'+cost.counterId);}
 }
 function project(snapshot,command){
  if(!exact(command,['kind','context','spell','cost','before','maximum','focusBefore',...(command?.cost?.kind==='manual'?['manualBasis']:[])])||command.kind!=='cast')reject('Неверная составная команда');
  const expected=prepare(snapshot,command.spell?.catalogId,command.cost);
  if(!equal(command,expected))reject('Заклинание, игра или ресурсы изменились');
  const next=copy(snapshot),manual=command.cost?.kind==='manual';
  const after=command.cost===null||manual?0:command.before-1;
  const record=manual?createManualNote(command):null;
  if(record)next.state.notes=[...(next.state.notes||[]),record];
  writeCost(next,command.cost,after);
  const changesFocus=!manual&&command.spell.concentration;
  if(changesFocus){next.state.concentration=command.spell.name;next.state.concentrationChecks=[];}
  const receipt={context:copy(command.context),cost:copy(command.cost),before:command.before,after,maximum:command.maximum,focusBefore:copy(command.focusBefore),focusAfter:focus(next),changesFocus,...(record?{record}:{})};
  return {snapshot:next,receipt};
 }
 // Only a server-owned receipt can authorize this inverse. Never accept this
 // object directly from a client as proof of an earlier successful cast.
 function restore(snapshot,receipt){
  const manual=receipt?.cost?.kind==='manual';
  if(!exact(receipt,['context','cost','before','after','maximum','focusBefore','focusAfter','changesFocus',...(manual?['record']:[])])||!equal(context(snapshot),receipt.context))reject('Отмена относится к другой игре');
  const b=balance(snapshot,receipt.cost);
  if(b.value!==receipt.after||b.maximum!==receipt.maximum||!Number.isSafeInteger(receipt.before)||receipt.before<0||receipt.before>(receipt.cost?.kind==='counter'?9999:b.maximum)||receipt.after!==(receipt.cost===null||manual?0:receipt.before-1))reject('Остаток после сотворения изменился');
  if(receipt.changesFocus&&!equal(focus(snapshot),receipt.focusAfter))reject('После сотворения менялась концентрация');
  const next=copy(snapshot);writeCost(next,receipt.cost,receipt.before);
  if(manual){
   if(!confirmsManualNote(snapshot,receipt.record,true))reject('Ручная запись изменилась. Нужна сверка');
   next.state.notes=next.state.notes.filter(note=>!noteMatches(note,receipt.record));
  }
  if(receipt.changesFocus){next.state.concentration=receipt.focusBefore.concentration;next.state.concentrationChecks=copy(receipt.focusBefore.checks);}
  return next;
 }
 function touches(command,resource){
  if(resource.kind==='cast')return true;
  if(command.cost?.kind!=='manual'&&command.spell.concentration&&['health','hp','concentration','concentrationChecks'].includes(resource.kind))return true;
  const c=command.cost;
  return !!c&&(c.kind==='slot'&&resource.kind==='slot'&&c.level===resource.level||c.kind==='counter'&&resource.kind==='counter'&&c.counterId===resource.counterId);
 }
 return {prepare,project,restore,touches,balance,choices,manualAgreement,readManualNote,confirmsManualNote};
})();
if(typeof module!=='undefined')module.exports=SkazCasting;
