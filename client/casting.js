// Shared projection for issue #20. Not connected to UI/API yet. The transaction
// layer must authenticate the owner, check revision/idempotency and persist one
// receipt; history must reject intervening overlapping writes before restore.
const SkazCasting = (() => {
 const copy=value=>JSON.parse(JSON.stringify(value));
 const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
 const reject=message=>{throw Error(message);};
 function spell(snapshot,catalogId){
  const owned=snapshot.spellbook?.find(item=>item.catalogId===catalogId);
  const entry=owned?.entry;
  if(!owned||!['known','prepared'].includes(owned.status)||entry?.id!==catalogId||entry.kind!=='spell'||entry.ruleset!=='5e-2014'||!Number.isInteger(entry.spell?.level)||entry.spell.level<0||entry.spell.level>9||typeof entry.spell.concentration!=='boolean'||typeof entry.name?.ru!=='string'||!entry.name.ru.trim()||entry.name.ru.length>200)reject('Нужно сохранённое заклинание редакции 2014');
  return {catalogId,level:entry.spell.level,concentration:entry.spell.concentration,name:entry.name.ru};
 }
 function balance(snapshot,cost){
  if(cost===null)return {value:0,maximum:0};
  if(cost?.kind==='slot'&&exact(cost,['kind','level'])&&[1,2,3].includes(cost.level)){
   if(snapshot.characterSheet)reject('Для своего класса выбери счётчик явно');
   const value=snapshot.state.slots?.[cost.level],maximum=[4,3,2][cost.level-1];
   if(!Number.isSafeInteger(value)||value<0||value>maximum)reject('Остаток ячеек требует сверки');
   return {value,maximum};
  }
  if(cost?.kind==='counter'&&exact(cost,['kind','counterId','level'])&&Number.isInteger(cost.level)&&cost.level>=1&&cost.level<=9){
   // The level is an explicit manual declaration, never guessed from a name.
   const counter=snapshot.characterSheet?.counters.find(item=>item.id===cost.counterId);
   if(!counter||!Number.isSafeInteger(counter.current)||!Number.isSafeInteger(counter.max)||counter.current<0||counter.current>counter.max||counter.max<0||counter.max>10000)reject('Счётчик ячеек требует сверки');
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
  if(cost!==null&&b.value<1)reject('Нет доступной ячейки');
  if(!Number.isSafeInteger(snapshot.state.hp)||snapshot.state.hp<=0||snapshot.state.deathSaves?.status==='dead')reject('При 0 HP сотворение недоступно');
  return {kind:'cast',context:context(snapshot),spell:metadata,cost:copy(cost),before:b.value,maximum:b.maximum,focusBefore:focus(snapshot)};
 }
 function writeCost(snapshot,cost,value){
  if(cost?.kind==='slot')snapshot.state.slots[cost.level]=value;
  if(cost?.kind==='counter')snapshot.characterSheet.counters.find(item=>item.id===cost.counterId).current=value;
 }
 function project(snapshot,command){
  if(!exact(command,['kind','context','spell','cost','before','maximum','focusBefore'])||command.kind!=='cast')reject('Неверная составная команда');
  const expected=prepare(snapshot,command.spell?.catalogId,command.cost);
  if(!equal(command,expected))reject('Заклинание, игра или ресурсы изменились');
  const next=copy(snapshot),after=command.cost===null?0:command.before-1;
  writeCost(next,command.cost,after);
  if(command.spell.concentration){next.state.concentration=command.spell.name;next.state.concentrationChecks=[];}
  const receipt={context:copy(command.context),cost:copy(command.cost),before:command.before,after,maximum:command.maximum,focusBefore:copy(command.focusBefore),focusAfter:focus(next),changesFocus:command.spell.concentration};
  return {snapshot:next,receipt};
 }
 // Only a server-owned receipt can authorize this inverse. Never accept this
 // object directly from a client as proof of an earlier successful cast.
 function restore(snapshot,receipt){
  if(!exact(receipt,['context','cost','before','after','maximum','focusBefore','focusAfter','changesFocus'])||!equal(context(snapshot),receipt.context))reject('Отмена относится к другой игре');
  const b=balance(snapshot,receipt.cost);
  if(b.value!==receipt.after||b.maximum!==receipt.maximum||!Number.isSafeInteger(receipt.before)||receipt.before<0||receipt.before>b.maximum||receipt.after!==(receipt.cost===null?0:receipt.before-1))reject('Остаток после сотворения изменился');
  if(receipt.changesFocus&&!equal(focus(snapshot),receipt.focusAfter))reject('После сотворения менялась концентрация');
  const next=copy(snapshot);writeCost(next,receipt.cost,receipt.before);
  if(receipt.changesFocus){next.state.concentration=receipt.focusBefore.concentration;next.state.concentrationChecks=copy(receipt.focusBefore.checks);}
  return next;
 }
 function touches(command,resource){
  if(resource.kind==='cast')return true;
  if(command.spell.concentration&&['health','hp','concentration','concentrationChecks'].includes(resource.kind))return true;
  const c=command.cost;
  return !!c&&(c.kind==='slot'&&resource.kind==='slot'&&c.level===resource.level||c.kind==='counter'&&resource.kind==='counter'&&c.counterId===resource.counterId);
 }
 return {prepare,project,restore,touches};
})();
if(typeof module!=='undefined')module.exports=SkazCasting;
