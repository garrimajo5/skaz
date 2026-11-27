import {bundledCatalog} from '../server/bundled-catalog.mjs';
const profileRulesSource=await readFile(new URL('../client/profile-rules.js',import.meta.url),'utf8');
import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import{readFile}from'node:fs/promises';
const castingSource=await readFile(new URL('../client/casting.js',import.meta.url),'utf8');
const factsSource=await readFile(new URL('../client/spell-facts.js',import.meta.url),'utf8');
const artSource=await readFile(new URL('../client/art.js',import.meta.url),'utf8');
const itemChargesSource=await readFile(new URL('../client/item-charges.js',import.meta.url),'utf8');
const sheetSource=await readFile(new URL('../client/character-sheet.js',import.meta.url),'utf8');
const presentationSource=await readFile(new URL('../client/play-presentation.js',import.meta.url),'utf8');
const source=await readFile(new URL('../client/play.js',import.meta.url),'utf8');
function harness({spellLearning=null,questRequest=null,dialog=null,environment={}}={}){const elements=new Map(dialog?[['dialog',dialog]]:[]),handlers={},requests=[],reads=[],spends=[],casts=[],chargeEdits=[],memory=new Map();let snapshot='a',owner='hero-a',html='';const lists=['spells','items','scopes'].map(kind=>({dataset:{playList:kind},scrollTop:0,scrollLeft:0}));const get=id=>{if(!elements.has(id))elements.set(id,{innerHTML:'',value:'',textContent:'',open:true,querySelector:()=>null,focus(){},setAttribute(name,value){this[name]=value;}});return elements.get(id);};
 const context=vm.createContext({...environment,structuredClone,CSS:{escape:String},crypto:{randomUUID:()=> 'test-manual-cast'},page:'play',location:{protocol:'http:'},state:{profile:{name:'Hero'},journal:[],notes:[],hp:20,maxHp:38,slots:{1:0,2:2,3:1}},sessionStorage:{getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v)},queueMicrotask,URLSearchParams,AbortSignal,
 document:{body:{closest:()=>null},getElementById:get,querySelectorAll:selector=>selector==='[data-play-list]'?lists:[],addEventListener:(event,fn)=>handlers[event]=fn},modal:value=>{html=value;get('dialog').open=true;},closeModal:()=>get('dialog').open=false,toast(){},go:value=>context.page=value,
 SkazCatalog:{readSnapshot:(...args)=>reads.push(args)},SkazStorage:{spellLearningMode:()=>spellLearning,snapshotKey:()=>snapshot,contextKey:()=>owner,stats:()=>({armorClass:14,initiative:2,speed:30,abilities:{str:8,dex:14,con:14,int:12,wis:10,cha:18}}),sheet:()=>null,editable:()=>true,canResource:()=>true,castSpell:(...args)=>casts.push(args),editCharges:item=>chargeEdits.push(item),spellbookData:()=>new Promise((resolve,reject)=>requests.push({kind:'book',resolve,reject})),questsData:questRequest,inventoryData:()=>new Promise((resolve,reject)=>requests.push({kind:'items',resolve,reject})),spendInventoryOne:async(...args)=>spends.push(args)},fetch:url=>new Promise(resolve=>requests.push({kind:'search',url,resolve}))});vm.runInContext(castingSource,context);vm.runInContext(factsSource,context);const facts=vm.runInContext('SkazSpellFacts',context),factsCalls=[],summary=facts.summary;facts.summary=(...args)=>{factsCalls.push(args);return summary(...args);};vm.runInContext(artSource,context);vm.runInContext(itemChargesSource,context);vm.runInContext(profileRulesSource,context);vm.runInContext(sheetSource,context);vm.runInContext(presentationSource,context);vm.runInContext(source,context);return{factsCalls,document:context.document,setResourceLists:lists=>{context.SkazStorage.playResourceLists=()=>lists;},setSession:(active,title)=>{context.SkazStorage.currentSession=()=>active;context.SkazStorage.sessionTitle=()=>title;},setSlots:v=>context.state.slots=v,setHp:v=>context.state.hp=v,setSheet:v=>context.SkazStorage.sheet=()=>v,api:vm.runInContext('SkazPlay',context),get,requests,reads,spends,casts,chargeEdits,memory,lists,scroll:(index,position)=>{const list=lists[index];list[list.dataset.playList==='scopes'?'scrollLeft':'scrollTop']=position;handlers.scroll({target:list});},html:()=>html,concentration:value=>context.state.concentration=value,context:(s,o=s)=>{snapshot=s;owner=o;},page:()=>context.page,selectCast:(id,value)=>handlers.change({target:{dataset:{playCastSelect:id},value}}),click:(id,dataset={},button={id,dataset})=>handlers.click({target:{closest:()=>button}})};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('play art keeps spell circle, stable action IDs and item quantity independent of image loading',async()=>{
 const h=harness(),s=spell('fireball',3);s.entry.kind='spell';s.entry.spell.castingTime='1 действие';
 const item={catalogId:'potion',quantity:2,entry:{id:'potion',kind:'item',name:{ru:'Potion'},item:{type:'potion'}}};
 await loaded(h,[s],[item]);const html=h.get('play-content').innerHTML;
 assert.match(html,/data-skaz-art="fireball"/);assert.match(html,/aria-label="3 круг">3/);assert.match(html,/data-play-cast="fireball"/);
 assert.match(html,/data-skaz-art="potion"/);assert.match(html,/×2/);assert.match(html,/data-play-spend="potion"[^>]*><small class="play-price-caption" aria-hidden="true">Цена<\/small><small class="play-cost">1 предмет<\/small><span class="play-command-label">Списать<\/span>/);
 assert.equal(h.requests.filter(r=>r.kind==='search').length,0);assert.equal(h.casts.length,0);assert.equal(h.spends.length,0);
 await h.click('',{playRead:'item',id:'potion'});assert.equal(h.reads[0][0],item.entry);
});
test('one charged item presents its numeric remainder and shared maximum without treating zero as unknown',async()=>{
 const h=harness();
 const item=(id,value)=>({catalogId:id,quantity:1,chargeCounts:[value],entry:{id,kind:'item',name:{ru:id},item:{type:'wand',charges:{max:7}}}});
 await loaded(h,[],[item('zero',0),item('remaining',4),item('exception',8),item('unknown',null)]);
 const html=h.get('play-content').innerHTML;
 for(const [value,compact] of [[0,'0/7'],[4,'4/7'],[8,'8/7']]){
  assert.ok(html.includes('заряды '+value+' из 7'));
  assert.ok(html.includes('aria-hidden="true">×1 · '+compact+'</span>'));
 }
 assert.ok(html.includes('заряды не указаны'));
 assert.equal((html.match(/Указать заряды/g)||[]).length,2);
 assert.equal(h.chargeEdits.length,0);
});
test('Quick Access shows a single charged item without rounding, aggregating copies or retaining an old hero result',async()=>{
 const item=(id='one',count=4,quantity=1,maximum=7)=>({
  catalogId:id,quantity,chargeCounts:[count],
  entry:{id,kind:'item',name:{ru:id},item:{type:'wand',charges:{max:maximum}}}
 });
 for(const [entries,copy,marks,filled] of [
  [[item('<one>')],/4 <small>\/ 7<\/small>/,7,4],
  [[item('zero',0)],/0 <small>\/ 7<\/small>/,7,0],
  [[item('over',8)],/8 <small>\/ 7<\/small>/,7,7],
  [[item('unknown',null)],/Не указаны/,0,0],
  [[item('large',11,1,30)],/11 <small>\/ 30<\/small>/,0,0],
  [[item('copies',4,2)],/^$/,0,0],
  [[item('one'),item('other')],/^$/,0,0],
 ]){
  const h=harness(),summary=h.get('play-quick-item-charges');
  let writes=0,html='';
  Object.defineProperty(summary,'innerHTML',{
   get:()=>html,set(value){html=value;writes++;}
  });
  await loaded(h,[],entries);
  assert.match(summary.innerHTML,copy);
  assert.doesNotMatch(summary.innerHTML,/<one>/);
  assert.equal((summary.innerHTML.match(/<\/span>/g)||[]).length,marks===0?(summary.innerHTML?1:0):marks+1);
  const confirmedWrites=writes;
  h.api.view();
  assert.equal(writes,confirmedWrites);
  assert.equal((summary.innerHTML.match(/class="filled"/g)||[]).length,filled);
  h.context('new hero');h.api.view();await tick();
  assert.equal(summary.innerHTML,'');
 }
});

const spell=(id,level=1,status='prepared')=>({catalogId:id,status,entry:{id,name:{ru:id,en:id},spell:{level}}});
async function loaded(h,book=[],items=[]){h.api.view();await tick();h.requests.find(r=>r.kind==='book').resolve({entries:book});h.requests.find(r=>r.kind==='items').resolve({entries:items});await tick();}

test('play lists expose all fourteen prepared spells and consumables without pagination',async()=>{
 const h=harness();const items=Array.from({length:14},(_,i)=>({catalogId:'item'+i,quantity:1,entry:{name:{ru:'Potion '+i},item:{type:'potion'}}}));
 await loaded(h,[...Array.from({length:14},(_,i)=>spell('Spell '+i)),spell('Cantrip',0,'known'),spell('Unprepared',2,'known')],items);
 const html=h.get('play-content').innerHTML;assert.match(html,/Cantrip/);assert.doesNotMatch(html,/Unprepared|data-play-page|Назад|Дальше|Импорт|Демо/);
 for(let i=0;i<14;i++){assert.ok(html.includes('data-id="Spell '+i+'"'));assert.ok(html.includes('data-play-spend="item'+i+'"'));}
 assert.match(html,/tabindex="0" role="region"/);
});
test('empty play panels have one preparation action and no blank list or pager',async()=>{
 const h=harness();await loaded(h);const html=h.get('play-content').innerHTML;
 assert.equal((html.match(/class="panel play-empty"/g)||[]).length,3);assert.doesNotMatch(html,/class="play-list"|data-play-page/);
 await h.click('',{playPrepare:'spells'});assert.equal(h.page(),'spells');
});

test('the first confirmed game list is usable while the other list waits',async()=>{
 const potion={catalogId:'potion',quantity:2,entry:{name:{ru:'Зелье'},item:{type:'potion'}}};
 const supply={book:{entries:[spell('Готовый заговор',0,'known')]},items:{entries:[potion]}};
 for(const waiting of ['book','items']){
  const h=harness(),root=h.get('play-content');
  h.api.view();await tick();
  const confirmed=waiting==='book'?'items':'book';
  h.requests.find(r=>r.kind===confirmed).resolve(supply[confirmed]);await tick();
  assert.match(root.innerHTML,confirmed==='book'?/Готовый заговор/:/data-play-spend="potion"/);
  assert.match(root.innerHTML,waiting==='book'?/Открываем книгу заклинаний/:/Открываем расходники/);
  assert.doesNotMatch(root.innerHTML,waiting==='book'?/data-play-prepare="spells"/:/data-play-prepare="inventory"/);
  assert.doesNotMatch(root.innerHTML,/id="play-retry"/);
  h.requests.find(r=>r.kind===waiting).resolve(supply[waiting]);await tick();
  assert.match(root.innerHTML,/Готовый заговор/);
  assert.match(root.innerHTML,/data-play-spend="potion"/);
  assert.doesNotMatch(root.innerHTML,/Открываем книгу заклинаний|Открываем расходники/);
 }
});

test('a later list response restores keyboard focus on already known empty-list actions',async()=>{
 for(const [known,section] of [['book','spells'],['items','inventory']]){
  const h=harness(),doc=h.document,root=h.get('play-content');
  const id='play-prepare-'+section;
  const makeButton=()=>({id,dataset:{playPrepare:section},closest:()=>root,focus(){doc.activeElement=this;}});
  let button,markup='';
  Object.defineProperty(root,'innerHTML',{get:()=>markup,set(value){
   if(button&&doc.activeElement===button)doc.activeElement=doc.body;
   markup=value;button=markup.includes('id="'+id+'"')?makeButton():undefined;
  }});
  doc.querySelector=s=>s==='.play-screen #'+id?button:null;
  h.get('dialog').open=false;
  h.api.view();await tick();
  h.requests.find(r=>r.kind===known).resolve({entries:[]});await tick();
  button.focus();const original=button;
  h.requests.find(r=>r.kind!==known).resolve({entries:[]});await tick();
  assert.notEqual(button,original);
  assert.equal(doc.activeElement,button);
 }
});

test('an explicit denied fragment clears already shown lists and suppresses late successes',async()=>{
 for(const order of ['success-first','denial-first']){
  const h=harness(),root=h.get('play-content');
  h.api.view();await tick();
  const book=h.requests.find(r=>r.kind==='book'),items=h.requests.find(r=>r.kind==='items');
  const success=()=>book.resolve({entries:[spell('Список до отзыва')]});
  const denial=()=>items.reject(Object.assign(Error('access changed'),{status:403}));
  if(order==='success-first'){success();await tick();assert.match(root.innerHTML,/Список до отзыва/);denial();}
  else{denial();await tick();success();}
  await tick();
  assert.match(root.innerHTML,/Игровые списки недоступны/);
  assert.doesNotMatch(root.innerHTML,/Список до отзыва|data-play-cast|data-play-spend/);
 }
});

test('the working book or inventory remains available and retries only the failed list',async()=>{
 const potion={catalogId:'potion',quantity:2,entry:{name:{ru:'Зелье'},item:{type:'potion'}}};
 for(const missing of ['book','items']){
  const h=harness(),root=h.get('play-content');
  h.api.view();await tick();
  const supply={book:{entries:[spell('Available spell')]},items:{entries:[potion]}};
  for(const request of h.requests){
   if(request.kind===missing)request.reject(Object.assign(Error('temporarily unavailable'),{status:503}));
   else request.resolve(supply[request.kind]);
  }
  await tick();
  const kept=missing==='book'?/data-play-spend="potion"/:/Available spell/;
  const badHeading=missing==='book'?/Книга заклинаний недоступна/:/Расходники недоступны/;
  const hiddenPreparation=missing==='book'?/data-play-prepare="spells"/:/data-play-prepare="inventory"/;
  assert.match(root.innerHTML,kept);
  assert.match(root.innerHTML,badHeading);
  assert.ok(root.innerHTML.search(kept)<root.innerHTML.search(badHeading));
  assert.doesNotMatch(root.innerHTML,hiddenPreparation);
  await h.click('play-retry');await tick();
  assert.match(root.innerHTML,kept);
  assert.match(root.innerHTML,/Повторяем загрузку/);
  assert.ok(root.innerHTML.search(kept)<root.innerHTML.indexOf('Повторяем загрузку'));
  assert.match(root.innerHTML,/<button id="play-retry"[^>]* disabled>/);
  assert.equal(h.requests.length,3);
  assert.equal(h.requests.at(-1).kind,missing);
  h.requests.at(-1).resolve(supply[missing]);await tick();
  assert.match(root.innerHTML,/data-play-spend="potion"/);
  assert.match(root.innerHTML,/Available spell/);
  assert.doesNotMatch(root.innerHTML,/play-retry|Повторяем загрузку/);
 }
});

test('resource updates keep a completed partial error and restart only a pending peer read',async()=>{
 for(const missing of ['book','items']){
  const h=harness(),root=h.get('play-content');
  const potion={catalogId:'potion',quantity:2,entry:{name:{ru:'Potion'},item:{type:'potion'}}};
  const lists={book:[spell('Prepared spell')],items:[potion],status:'ready'};
  const partial=missing==='book'?/Расходники и заряды/:/Prepared spell/;
  const main={querySelector:()=>({querySelector:()=>null})};
  root.querySelectorAll=()=>[];
  h.document.createElement=()=>({content:{querySelectorAll:()=>[],querySelector:()=>null}});
  h.setResourceLists(lists);
  h.api.view();
  await tick();
  for(const read of h.requests){
   if(read.kind===missing)read.reject(Object.assign(Error('unavailable'),{status:503}));
   else read.resolve({entries:lists[read.kind]});
  }
  await tick();
  const rendered=root.innerHTML;
  assert.match(rendered,partial);
  assert.match(rendered,/id="play-retry"/);

  h.context('optimistic-resource','hero-a');
  assert.equal(h.api.updateResources(main),true);
  assert.equal(root.innerHTML,rendered);
  assert.equal(h.requests.length,2);

  await h.click('play-retry');
  const obsolete=h.requests.at(-1);
  assert.equal(obsolete.kind,missing);
  const waiting=root.innerHTML;
  h.context('changing-resource','hero-a');
  assert.equal(h.api.updateResources(main),true);
  assert.equal(h.requests.length,3);
  h.context('confirmed-resource','hero-a');
  assert.equal(h.api.updateResources(main,true),true);
  assert.equal(root.innerHTML,waiting);
  assert.equal(h.requests.length,4);
  const current=h.requests.at(-1);
  assert.equal(current.kind,missing);
  obsolete.reject(Object.assign(Error('previous revision'),{status:409}));
  await tick();
  assert.equal(root.innerHTML,waiting);
  current.reject(Object.assign(Error('access revoked for this snapshot'),{status:403}));
  await tick();
  assert.match(root.innerHTML,/Игровые списки недоступны/);
  assert.doesNotMatch(root.innerHTML,/data-play-read/);
  assert.equal(h.api.updateResources(main),false);
 }
});

test('resource updates retain an unchanged recent note after normalizing its icon',async()=>{
 const h=harness({environment:{SkazIcons:{mount:node=>{node.iconReady=true;}}}});
 const root=h.get('play-content'),selector='[data-play-recent]';
 await loaded(h,[],[]);
 root.querySelectorAll=()=>[];
 const previous={tagName:'SECTION',text:'Расшифрованная заметка',isEqualNode(other){return other.iconReady&&other.text===this.text;},replaceWith(other){this.replacement=other;}};
 root.querySelector=id=>id===selector?previous:null;
 const fresh={tagName:'SECTION',text:'Расшифрованная заметка',iconReady:false};
 h.document.createElement=()=>({content:{querySelectorAll:()=>[],querySelector:id=>id===selector?fresh:null}});
 h.setResourceLists({book:[],items:[],status:'ready'});
 h.context('next-resource','hero-a');
 const main={querySelector:()=>({querySelector:()=>null})};
 assert.equal(h.api.updateResources(main),true);
 assert.equal(fresh.iconReady,true);
 assert.equal(previous.replacement,undefined);
 fresh.text='Другая заметка';
 fresh.iconReady=false;
 assert.equal(h.api.updateResources(main,true),true);
 assert.equal(previous.replacement,fresh);
 assert.equal(fresh.iconReady,true);
});

test('access denial or a mismatched revision hides both lists even when the other read succeeded',async()=>{
 for(const status of [401,403,404,409]){
  const h=harness(),root=h.get('play-content');
  h.api.view();await tick();
  h.requests[0].resolve({entries:[spell('Previous snapshot')]});
  h.requests[1].reject(Object.assign(Error('unsafe snapshot'),{status}));
  await tick();
  assert.match(root.innerHTML,/Игровые списки недоступны/);
  assert.doesNotMatch(root.innerHTML,/Previous snapshot/);
 }
});

test('a denied retry removes previously visible items from the same snapshot',async()=>{
 const h=harness(),root=h.get('play-content'),potion={catalogId:'potion',quantity:1,entry:{name:{ru:'Зелье'},item:{type:'potion'}}};
 h.api.view();await tick();
 h.requests[0].reject(Object.assign(Error('temporary'),{status:503}));
 h.requests[1].resolve({entries:[potion]});await tick();
 assert.match(root.innerHTML,/data-play-spend="potion"/);
 await h.click('play-retry');await tick();
 h.requests.at(-1).reject(Object.assign(Error('denied'),{status:403}));await tick();
 assert.match(root.innerHTML,/Игровые списки недоступны/);
 assert.doesNotMatch(root.innerHTML,/data-play-spend/);
});

test('available consumables precede the spell preparation action when the book is empty',async()=>{
 const h=harness();
 await loaded(h,[],[{catalogId:'potion',quantity:2,entry:{name:{ru:'Potion'},item:{type:'potion'}}}]);
 const html=h.get('play-content').innerHTML;
 assert.ok(html.indexOf('data-play-spend="potion"')>=0);
 assert.ok(html.indexOf('data-play-spend="potion"')<html.indexOf('data-play-prepare="spells"'));
 assert.doesNotMatch(html,/Игровые списки недоступны/);
});

test('retry keeps focus in the list while loading, restores retry on failure and respects a later focus move',async()=>{
 const h=harness(),document=h.document,root=h.get('play-content'),dialog=h.get('dialog');
 dialog.open=false;
 const outside={closest:()=>null};
 let markup='';
 const retry={id:'play-retry',dataset:{},closest:()=>root,focus:()=>{document.activeElement=retry;}};
 Object.assign(root,{id:'play-content',dataset:{},closest:()=>root,focus:()=>{document.activeElement=root;}});
 Object.defineProperty(root,'innerHTML',{
  get:()=>markup,
  set(value){
   if(document.activeElement===retry)document.activeElement=document.body;
   markup=value;
  }
 });
 const element=document.getElementById;
 document.getElementById=id=>id==='play-retry'?(markup.includes('id="play-retry"')?retry:null):element(id);
 document.querySelector=selector=>{
  if(selector==='.play-screen #play-retry')return document.getElementById('play-retry');
  if(selector==='.play-screen #play-content')return root;
  return null;
 };
 const retryClick=async()=>{
  retry.focus();
  await h.click('play-retry',{},retry);
  assert.equal(document.activeElement,root);
 };
 h.api.view();
 await tick();
 for(const request of h.requests.slice(-2))request.reject(Error('offline'));
 await tick();
 await retryClick();
 for(const request of h.requests.slice(-2))request.reject(Error('still offline'));
 await tick();
 assert.equal(document.activeElement,retry);
 await retryClick();
 document.activeElement=outside;
 for(const request of h.requests.slice(-2))request.reject(Error('offline again'));
 await tick();
 assert.equal(document.activeElement,outside);
 await retryClick();
 const [book,items]=h.requests.slice(-2);
 book.resolve({entries:[spell('Ready')]});
 items.resolve({entries:[]});
 await tick();
 assert.match(markup,/Ready/);
 assert.equal(document.activeElement,root);
});

test('play loading drops responses after context changes and clears previous lists',async()=>{
 const h=harness();h.api.view();await tick();h.context('b');h.api.view();await tick();h.requests[0].resolve({entries:[spell('Old private')]});h.requests[1].resolve({entries:[]});await tick();assert.doesNotMatch(h.get('play-content').innerHTML,/Old private/);h.requests[2].resolve({entries:[spell('New')]});h.requests[3].resolve({entries:[]});await tick();assert.match(h.get('play-content').innerHTML,/New/);
});
test('play cards read saved snapshots and stale controls cannot spend another hero item',async()=>{
 const h=harness(),item={catalogId:'potion',quantity:2,entry:{name:{ru:'Potion'},item:{type:'potion'}}};await loaded(h,[spell('<unsafe>')],[item]);assert.match(h.get('play-content').innerHTML,/&lt;unsafe&gt;/);
 await h.click('',{playRead:'item',id:'potion'});assert.equal(h.reads[0][0],item.entry);assert.equal(h.reads[0][2](),true);await h.click('',{playSpend:'potion'});assert.equal(h.spends.length,1);assert.equal(h.spends[0][1],'a');h.context('other');assert.equal(h.reads[0][2](),false);await h.click('',{playSpend:'potion'});assert.equal(h.spends.length,1);
});
test('play mode is remembered only in tab storage and preparation remains reachable',async()=>{const h=harness();assert.equal(h.api.mode(),'prepare');h.api.remember('play');assert.equal(h.api.mode(),'play');await h.click('play-edit');assert.equal(h.page(),'hero');h.api.remember('hero');assert.equal(h.api.mode(),'prepare');});
test('play search does not show a late private result after context changed',async()=>{const h=harness();await loaded(h);await h.click('play-search');h.get('play-search-query').value='Shield';const search=h.get('play-search-form').onsubmit({preventDefault(){}});h.context('other');h.requests.find(r=>r.kind==='search').resolve({ok:true,json:async()=>({entries:[{name:{ru:'Secret',en:'Secret'}}]})});await search;assert.doesNotMatch(h.get('play-search-results').innerHTML,/Secret/);});

test('reopening play search invalidates the previous request even in the same character snapshot',async()=>{const h=harness();await loaded(h);await h.click('play-search');h.get('play-search-query').value='Old';const first=h.get('play-search-form').onsubmit({preventDefault(){}});await h.click('play-search');h.requests.find(r=>r.kind==='search').resolve({ok:true,json:async()=>({entries:[{name:{ru:'Old result',en:'Old'}}]})});await first;assert.doesNotMatch(h.get('play-search-results').innerHTML,/Old result/);});
test('leaving a loading play screen permits a new load on return',async()=>{const h=harness();h.api.view();await tick();h.api.remember('hero');h.api.remember('play');h.api.view();await tick();assert.equal(h.requests.length,4);h.requests[0].resolve({entries:[spell('Stale')]});h.requests[1].resolve({entries:[]});h.requests[2].resolve({entries:[spell('Fresh')]});h.requests[3].resolve({entries:[]});await tick();assert.match(h.get('play-content').innerHTML,/Fresh/);assert.doesNotMatch(h.get('play-content').innerHTML,/Stale/);});


test('Quick Access only loads spells and consumables, with quests in their own section',async()=>{
 let requests=0;
 const h=harness({questRequest:()=>{requests++;}});
 await loaded(h,[spell('Action')],[{catalogId:'potion',quantity:2,entry:{name:{ru:'Potion'},item:{type:'potion'}}}]);
 assert.equal(requests,0);
 assert.match(h.get('play-content').innerHTML,/data-play-spend/);
 assert.doesNotMatch(h.get('play-content').innerHTML,/play-quests|Задания/);
});

test('add spell search requests spells only and omits other hits',async()=>{
 const h=harness();
 h.api.findSpell(()=>{});
 h.get('play-search-query').value='Свет';
 const search=h.get('play-search-form').onsubmit({preventDefault(){}});
 const request=h.requests.find(item=>item.kind==='search');
 assert.match(request.url,/kind=spell/);
 request.resolve({ok:true,json:async()=>({entries:[{kind:'item',name:{ru:'Предмет',en:''}},{kind:'spell',name:{ru:'Свет',en:'Light'}}]})});
 await search;
 assert.match(h.get('play-search-results').innerHTML,/Свет/);
 assert.doesNotMatch(h.get('play-search-results').innerHTML,/Предмет/);
});

test('resource refresh retains list position for the same hero and discards it for another hero',async()=>{
 const h=harness();await loaded(h,[spell('A')]);h.scroll(0,210);h.scroll(1,80);h.scroll(2,77);
 h.context('revision-b','hero-a');h.api.view();await tick();h.requests.at(-2).resolve({entries:[spell('B')]});h.requests.at(-1).resolve({entries:[]});await tick();assert.equal(h.lists[0].scrollTop,210);assert.equal(h.lists[1].scrollTop,80);assert.equal(h.lists[2].scrollLeft,77);
 h.context('revision-c','hero-b');h.api.view();await tick();h.requests.at(-2).resolve({entries:[spell('C')]});h.requests.at(-1).resolve({entries:[]});await tick();assert.equal(h.lists[0].scrollTop,0);assert.equal(h.lists[1].scrollTop,0);assert.equal(h.lists[2].scrollLeft,0);
});

test('filter redraw preserves horizontal focus position before a queued scroll event fires',async()=>{
 const h=harness();
 await loaded(h,[spell('A')]);
 const root=h.get('play-content');
 const scopes=h.lists[2];
 scopes.scrollWidth=405;
 scopes.clientWidth=328;
 scopes.scrollLeft=77;
 root.querySelector=selector=>selector==='[data-play-list="scopes"]'?scopes:null;
 let html=root.innerHTML;
 Object.defineProperty(root,'innerHTML',{
  get:()=>html,
  set:value=>{html=value;scopes.scrollLeft=0;},
 });
 await h.click('',{playSpellScope:'all'});
 assert.equal(scopes.scrollLeft,77);
 assert.match(root.innerHTML,/data-play-spell-scope="all" aria-pressed="true"/);
});

test('a scope change patches visible spell rows and keeps the current filter controls',async()=>{
 const h=harness(),root=h.get('play-content');
 const immediate=spell('Cast now',0),slow=spell('Cast later',0);
 immediate.entry.spell.castingTime='1 действие';
 slow.entry.spell.castingTime='1 минута';
 await loaded(h,[immediate,slow]);
 const before=root.innerHTML,nextRows=[{id:'new-spell-row'}];
 const list={scrollTop:19,replaceChildren(...children){this.children=children;}};
 const choice=id=>({id:'',dataset:{playSpellScope:id},setAttribute(name,value){this[name]=value;}});
 const combat=choice('combat'),exploration=choice('exploration');
 const section={querySelector:()=>list,querySelectorAll:()=>[combat,exploration]};
 const draft={content:{querySelector:()=>({childNodes:nextRows})}};
 h.document.createElement=()=>draft;
 exploration.closest=()=>section;
 exploration.focus=options=>{exploration.focusOptions=options;};
 await h.click('',exploration.dataset,exploration);
 assert.equal(root.innerHTML,before);
 assert.match(draft.innerHTML,/Cast later/);
 assert.doesNotMatch(draft.innerHTML,/Cast now/);
 assert.deepEqual(list.children,nextRows);
 assert.equal(list.scrollTop,0);
 assert.equal(combat['aria-pressed'],'false');
 assert.equal(exploration['aria-pressed'],'true');
 assert.equal(exploration.focusOptions.preventScroll,true);
});

test('every bundled SRD spell has an explicit casting group; long casting never enters combat',async()=>{
 const {readdir}=await import('node:fs/promises'),api=harness().api,entries=new Map();
 for(const name of await readdir(new URL('../catalog/',import.meta.url))){if(!name.endsWith('.json')||name.endsWith('.coverage.json'))continue;const data=JSON.parse(await readFile(new URL('../catalog/'+name,import.meta.url),'utf8'));for(const e of Array.isArray(data.entries)?data.entries:[])if(e.spell&&e.id.startsWith('srd51:'))entries.set(e.id,e);}
 assert.equal(entries.size,319);const counts={action:0,bonus:0,reaction:0,long:0};
 for(const e of entries.values()){const group=api.castingGroup(e.spell);assert.ok(Object.hasOwn(counts,group),e.id);counts[group]++;if(group==='long'){assert.equal(api.inSpellScope(e.spell,'combat'),false,e.id);assert.equal(api.inSpellScope(e.spell,'exploration'),true,e.id);}assert.equal(api.inSpellScope(e.spell,'all'),true);}
 assert.deepEqual(counts,{action:242,bonus:14,reaction:4,long:59});
 const mixed={castingTime:'1 действие или 8 часов'};assert.equal(api.castingGroup(mixed),'action');assert.equal(api.inSpellScope(mixed,'combat'),true);assert.equal(api.inSpellScope(mixed,'exploration'),true);
 assert.equal(api.castingGroup({castingTime:'1 bonus action'}),'bonus');assert.equal(api.castingGroup({castingTime:'1 reaction, when hit'}),'reaction');assert.equal(api.castingGroup({castingTime:'10 minutes'}),'long');assert.equal(api.castingGroup({castingTime:'Особое время'}),'other');assert.equal(api.castingGroup(null),'other');
});

test('combat and exploration filters retain rituals, unknown entries and stable IDs without changing state',async()=>{
 const h=harness(),make=(id,time,ritual=false)=>({...spell(id),entry:{...spell(id).entry,spell:{level:1,castingTime:time,ritual}}});
 await loaded(h,[make('Fast','1 действие'),make('Ritual','1 действие',true),make('Long','10 минут'),make('Bonus','1 бонусное действие'),make('<Unknown>','?')]);
 let html=h.get('play-content').innerHTML;assert.doesNotMatch(html,/data-id="Long"/);assert.match(html,/data-id="Ritual"/);assert.match(html,/Прочее/);assert.match(html,/&lt;Unknown&gt;/);
 await h.click('',{playSpellScope:'exploration'});html=h.get('play-content').innerHTML;assert.match(html,/data-id="Long"/);assert.match(html,/data-id="Ritual"/);assert.doesNotMatch(html,/data-id="Fast"|data-id="Bonus"/);
 await h.click('',{playSpellScope:'all'});assert.match(h.get('play-content').innerHTML,/data-id="Fast"/);assert.equal(h.spends.length,0);
 await h.click('',{playSpellScope:'bonus'});
 html=h.get('play-content').innerHTML;
 assert.match(html,/data-id="Bonus"/);
 assert.doesNotMatch(html,/data-id="Fast"|data-id="Long"/);
 await h.click('',{playSpellScope:'all'});
 await h.click('',{playRead:'spell',id:'Long'});assert.equal(h.reads[0][0].id,'Long');h.context('different');await h.click('',{playSpellScope:'combat'});assert.match(h.get('play-content').innerHTML,/data-id="Long"/);
});

test('wide action styling follows the casting group without replacing its label',async()=>{
 const h=harness();
 const action=spell('Fast'), bonus=spell('Quick'), reaction=spell('Interrupt');
 action.entry.spell.castingTime='1 действие';
 bonus.entry.spell.castingTime='1 бонусное действие';
 reaction.entry.spell.castingTime='1 реакция';
 await loaded(h,[action,bonus,reaction]);
 await h.click('',{playSpellScope:'all'});
 const html=h.get('play-content').innerHTML;
 assert.match(html,/data-play-action-kind="action"><button[^>]*data-id="Fast"/);
 assert.match(html,/data-play-action-kind="bonus"><button[^>]*data-id="Quick"/);
 assert.match(html,/data-play-action-kind="reaction"><button[^>]*data-id="Interrupt"/);
 assert.match(html,/>Бонусное действие<\/small>/);
});

 test('only the recorded concentration spell receives an active marker',async()=>{const h=harness(),a=spell('Bless'),b=spell('Aid');a.entry.spell.concentration=true;h.concentration('Bless');await loaded(h,[a,b]);assert.equal((h.get('play-content').innerHTML.match(/is-concentrating/g)||[]).length,1);assert.match(h.get('play-content').innerHTML,/data-ui-icon="focus"><\/span> действует/);h.concentration('Aid');await h.click('',{playSpellScope:'all'});assert.doesNotMatch(h.get('play-content').innerHTML,/is-concentrating/);});

test('cast form offers lowest available circle, warns on replacement and submits once; stale form cannot cast',async()=>{
 const h=harness(),entry=spell('Focus',1);entry.entry.spell.concentration=true;await loaded(h,[entry]);h.concentration('Old focus');await h.click('',{playCast:'Focus'});assert.match(h.html(),/Сменит концентрацию «Old focus»/);assert.match(h.html(),/Ячейка 2 круга/);assert.doesNotMatch(h.html(),/<select/);h.get('play-cast-form').onsubmit({preventDefault(){}});h.get('play-cast-form').onsubmit({preventDefault(){}});assert.equal(h.casts.length,1);assert.equal(JSON.stringify(h.casts[0]),JSON.stringify(['Focus',{kind:'slot',level:2},'a']));
 await h.click('',{playCast:'Focus'});h.context('other');h.get('play-cast-form').onsubmit({preventDefault(){}});assert.equal(h.casts.length,1);
});
test('cantrip casts directly with null cost',async()=>{const h=harness();await loaded(h,[spell('Cantrip',0)]);await h.click('',{playCast:'Cantrip'});assert.equal(h.html(),'');assert.equal(h.casts[0][1],null);});


test('one tap uses lowest available slot, a chosen higher circle costs two taps and stale choices are rejected',async()=>{
 const h=harness();await loaded(h,[spell('Shield',1)]);await h.click('',{playCast:'Shield'});assert.equal(h.html(),'');assert.equal(JSON.stringify(h.casts[0][1]),JSON.stringify({kind:'slot',level:2}));
 await h.click('',{playCastLevel:'Shield',level:'3'});assert.equal(h.casts.length,1);await h.click('',{playCast:'Shield'});assert.equal(h.casts[1][1].level,3);
 h.setSlots({1:0,2:1,3:0});await h.click('',{playCast:'Shield'});assert.equal(h.casts[2][1].level,2);
 h.setSlots({1:0,2:0,3:0});await h.click('',{playCast:'Shield'});assert.equal(h.casts.length,3);h.setSlots({2:2});h.setHp(0);await h.click('',{playCast:'Shield'});assert.equal(h.casts.length,3);
 h.setHp(10);h.context('other');await h.click('',{playCast:'Shield'});assert.equal(h.casts.length,3);
});

test('exhausted casting opens an explicit manual form with no required agreement or automatic focus change',async()=>{
 const h=harness(),item=spell('Manual Focus',2);
 item.entry.spell.concentration=true;
 await loaded(h,[item]);h.setSlots({1:1,2:0,3:0});h.concentration('Existing focus');
 await h.click('',{playCast:'Manual Focus'});
 assert.match(h.html(),/Доступно 0 ячеек для 2 круга и выше/);
 assert.match(h.html(),/Ячейки, концентрация и эффекты остаются как есть/);
 assert.match(h.html(),/Согласовано с мастером \(необязательно\)/);
 assert.doesNotMatch(h.html(),/<select|Сменит концентрацию/);
 assert.equal(h.casts.length,0);
 h.get('play-manual-cast-reason').value='  Внешний ресурс  ';
 h.get('play-manual-cast-agreed').checked=false;
 const form=h.get('play-manual-cast-form');
 form.onsubmit({preventDefault(){}});
 form.onsubmit({preventDefault(){}});
 assert.equal(h.casts.length,1);
 const [id,cost,key]=h.casts[0];
 assert.equal(id,'Manual Focus');assert.equal(key,'a');
 assert.equal(cost.kind,'manual');assert.equal(cost.level,2);assert.equal(cost.agreed,false);
 assert.equal(cost.reason,'Внешний ресурс');assert.ok(Number.isSafeInteger(cost.at));
});
test('manual casting remains explicit and has no native select',async()=>{
 const h=harness();h.setSheet({level:5,counters:[{id:'manual-slot',name:'Мой ресурс',current:2,max:3}]});await loaded(h,[spell('Manual',2)]);await h.click('',{playCast:'Manual'});assert.equal(h.casts.length,0);assert.match(h.html(),/Мой ресурс/);assert.match(h.html(),/data-cast-circle="2"/);assert.doesNotMatch(h.html(),/<select/);h.get('play-cast-form').onsubmit({preventDefault(){}});assert.equal(JSON.stringify(h.casts[0][1]),JSON.stringify({kind:'counter',counterId:'manual-slot',level:2}));
});

test('unknown charges ask for an explicit value and cannot open another hero editor',async()=>{
 const h=harness(),item={catalogId:'wand',quantity:2,chargeCounts:[0,null],entry:{id:'wand',name:{ru:'Палочка'},artifact:{charges:{max:7}}}};
 await loaded(h,[],[item]);
 const html=h.get('play-content').innerHTML;
 assert.match(html,/class="play-balance-full">×2 · заряды 0 \/ не указаны/);
 assert.match(html,/class="play-balance-short" aria-hidden="true">×2 · 0 \/ \?/);
 assert.match(html,/aria-label="Указать заряды: Палочка"/);
 await h.click('',{playCharges:'wand'});assert.equal(h.chargeEdits[0],item);assert.equal(item.chargeCounts[1],null);
 h.context('other');await h.click('',{playCharges:'wand'});assert.equal(h.chargeEdits.length,1);
});
test('compact slot picker sets the same circle for later casting and rejects stale or unavailable picks',async()=>{
 const h=harness();
 await loaded(h,[spell('Shield',1)]);
 assert.match(h.get('play-content').innerHTML, /<select[^>]+data-play-cast-select="Shield"/);
 assert.match(h.get('play-content').innerHTML, /value="2" aria-label="2 круг · осталось 2" selected/);
 h.selectCast('Shield','3');
 assert.match(h.get('play-content').innerHTML, /value="3" aria-label="3 круг · осталось 1" selected/);
 assert.equal(h.casts.length,0);
 h.selectCast('Shield','9');
 await h.click('',{playCast:'Shield'});
 assert.equal(h.casts[0][1].level,3);
 h.context('second');
 h.selectCast('Shield','2');
 await h.click('',{playCast:'Shield'});
 assert.equal(h.casts.length,1);
});
test('choosing a circle patches the current controls instead of refreshing the game list',async()=>{
 const patches=[];
 const h=harness({environment:{SkazUI:{patchButton:(prior,next)=>patches.push([prior,next])}}});
 const item=spell('Shield',1),root=h.get('play-content');
 await loaded(h,[item]);
 const priorMarkup=root.innerHTML;
 const previousCast={tagName:'BUTTON',isEqualNode:()=>false},updatedCast={tagName:'BUTTON'};
 const priorLevel={tagName:'BUTTON',dataset:{level:'3'}},updatedLevel={dataset:{level:'3'}};
 const option=(value,defaultSelected,label)=>({value,defaultSelected,label,getAttribute(){return this.label;},setAttribute(name,text){this.label=text;}});
 const picker={value:'2',options:[option('2',true,'2 круг · осталось 2'),option('3',false,'3 круг · осталось 1')]};
 const nextPicker={value:'3',options:[option('2',false,'2 круг · осталось 1'),option('3',true,'3 круг · осталось 1')]};
 const controls={querySelectorAll:()=>[priorLevel],querySelector:selector=>({
  '[data-play-cast-select]':picker,
  '[data-play-cast]':previousCast,
 })[selector]};
 const draft={content:{
  querySelectorAll:()=>[updatedLevel],
  querySelector:selector=>selector==='[data-play-cast-select]'?nextPicker:updatedCast,
 }};
 h.document.createElement=()=>draft;
 let focusOptions;
 const button={id:'',dataset:{playCastLevel:'Shield',level:'3'},closest:()=>controls,focus:options=>{focusOptions=options;}};
 await h.click('',button.dataset,button);
 assert.match(draft.innerHTML,/data-level="3" aria-pressed="true"/);
 assert.equal(patches.length,2);
 assert.equal(patches[0][0],priorLevel);
 assert.equal(patches[0][1],updatedLevel);
 assert.equal(patches[1][0],previousCast);
 assert.equal(patches[1][1],updatedCast);
 assert.equal(picker.value,'3');
 assert.deepEqual(picker.options.map(option=>option.defaultSelected),[false,true]);
 assert.equal(picker.options[0].label,'2 круг · осталось 1');
 assert.equal(focusOptions.preventScroll,true);
 assert.equal(root.innerHTML,priorMarkup);
 assert.equal(h.casts.length,0);
 await h.click('',{playCast:'Shield'});
 assert.equal(h.casts[0][1].level,3);
});

test('missing charge array is unknown rather than empty or full',async()=>{
 const h=harness();await loaded(h,[],[{catalogId:'wand',quantity:1,entry:{name:{ru:'Палочка'},item:{charges:{max:7}}}}]);
 assert.match(h.get('play-content').innerHTML,/заряды не указаны/);assert.match(h.get('play-content').innerHTML,/Указать заряды/);assert.equal(h.chargeEdits.length,0);
});

test('known policy includes learned leveled spells while prepared policy excludes them',async()=>{
 for(const mode of ['known','prepared',null]){
 const h=harness({spellLearning:mode});await loaded(h,[spell('learned-only',1,'known'),spell('legacy-prepared',1,'prepared')]);
 const html=h.get('play-content').innerHTML;assert.match(html,/legacy-prepared/);
 if(mode==='known'){assert.match(html,/learned-only/);assert.match(html,/Заклинания и заговоры/);assert.doesNotMatch(html,/Подготовленные/);}
 else assert.doesNotMatch(html,/learned-only/);
 }
});

test('empty known spell list offers adding known spells, prepared policies keep preparation',async()=>{
 for(const spellLearning of ['known','prepared','spellbook',null]){
  const h=harness({spellLearning});await loaded(h);const html=h.get('play-content').innerHTML;
  assert.match(html,spellLearning==='known'?/Добавить известные заклинания/:/Подготовить заклинания/);
  if(spellLearning==='known')assert.doesNotMatch(html,/Подготовить/);
  await h.click('',{playPrepare:'spells'});assert.equal(h.page(),'spells');
 }
});

test('play scales cantrips for the level-five template shown in the header',async()=>{
 const h=harness(),entry=bundledCatalog().bundle.entries.find(e=>e.id==='srd51:2014:spell:acid-splash');
 await loaded(h,[{catalogId:entry.id,status:'known',entry}]);
 assert.equal(h.factsCalls.at(-1)[1],5);
 assert.match(h.get('play-content').innerHTML,/спас ЛОВ · 2к6 кислота/);
 assert.match(h.api.view(),/5 уровень/);
});

test('play passes actual total level to shared facts at every cantrip boundary, with base fallback for unknown',async()=>{
 const actual=bundledCatalog().bundle.entries.find(e=>e.id==='srd51:2014:spell:acid-splash');
 for(const[level,expected]of[[4,'1к6'],[5,'2к6'],[10,'2к6'],[11,'3к6'],[16,'3к6'],[17,'4к6'],[undefined,'1к6 кислота (база)'],[null,'1к6 кислота (база)']]){
  const h=harness();h.setSheet({level,counters:[]});await loaded(h,[{catalogId:actual.id,status:'known',entry:actual}]);
  const html=h.get('play-content').innerHTML;assert.equal(h.factsCalls.at(-1)[0],actual);assert.equal(h.factsCalls.at(-1)[1],level);assert.ok(html.includes('спас ЛОВ · '+expected));
  assert.equal(h.casts.length,0);assert.equal(h.spends.length,0);
 }
});

test('play preserves metadata, reading and actions when same-ID personal text has no trusted summary',async()=>{
 const actual=structuredClone(bundledCatalog().bundle.entries.find(e=>e.id==='srd51:2014:spell:acid-splash'));actual.source.usage='personal';actual.text+=' Личное правило: 9d20.';
 const h=harness();h.setSheet({level:17,counters:[]});await loaded(h,[{catalogId:actual.id,status:'known',entry:actual}]);const html=h.get('play-content').innerHTML;
 assert.doesNotMatch(html,/спас ЛОВ|4к6 кислота/);assert.match(html,/60 фт/);assert.ok(html.includes('data-play-cast="'+actual.id+'"'));await h.click('',{playRead:'spell',id:actual.id});assert.equal(h.reads[0][0],actual);assert.equal(h.casts.length,0);
});

test('quick access has one resource mount and keeps actor identity in its status band',()=>{
 const h=harness(),html=h.api.view();
 assert.match(html,/<h1>Быстрый доступ<\/h1>/);
 assert.match(html,/<p class="play-section-caption" aria-hidden="true">Командная панель<\/p>\s*<h2>Быстрые действия<\/h2>/);
 assert.match(html,/<p class="play-section-caption" aria-hidden="true">Остаток<\/p>\s*<h2 id="play-resources-title">Ресурсы<\/h2>/);
 assert.match(html,/aria-label="Состояние активного персонажа"[\s\S]*<strong>Hero<\/strong>/);
 assert.match(html,/<strong>20<span> \/ 38<\/span>/);
 assert.equal((html.match(/id="play-quick-slot"/g)||[]).length,1);
 assert.match(html,/id="play-history"/);
 h.setHp('18" onfocus="bad');
 const safe=h.api.view();
 assert.match(safe,/value="18&quot; onfocus=&quot;bad"/);
 assert.doesNotMatch(safe,/" onfocus="bad"/);
});

test('Quick Access and preparation share an identical actor strip, with combat tools beside it',()=>{
 const h=harness();
 h.setSheet({className:'Wizard',subclass:'Conjuration',level:6});
 const presentation=vm.runInNewContext(presentationSource+'\nSkazPlayPresentation',{});
 const view={actor:h.api.actorView(),title:'Character',content:'<article>Profile</article>'};
 const start='<div class="play-actor-strip">';
 const play=h.api.view();
 assert.ok(play.includes(start));
 const strip=play.split(start)[1].split('<div class="play-actor-tools"')[0];
 assert.ok(presentation.prepare(view).includes(start+strip+'</div>'));
 assert.doesNotMatch(presentation.prepare(view),/id="play-summons"/);
 assert.doesNotMatch(presentation.prepare({...view,mapOnly:true}),/play-actor-strip|play-quick-slot/);
});

test('hero band renders the saved subclass, escapes it and omits the separator for an empty subclass',()=>{
 const h=harness();
 const sheet={className:'Волшебник',level:3,subclass:'Школа <Прорицания>'};
 h.setSheet(sheet);
 assert.equal(h.api.actorIdentity().subclass,sheet.subclass);
 const html=h.api.view();
 assert.match(html,/Волшебник · 3 уровень<span class="play-hero-subclass"> · Школа &lt;Прорицания&gt;<\/span>/);
 assert.doesNotMatch(html,/<Прорицания>/);
 h.setSheet({...sheet,subclass:''});
 assert.doesNotMatch(h.api.view(),/play-hero-subclass/);
});

test('Quick Access keeps the real session number, title and legacy fallback',()=>{
 const h=harness();
 h.setSession({name:'<Маяк>',number:8},'Сохранённое название');
 assert.match(h.api.view(),/<p class="play-session">Сессия 08 · &lt;Маяк&gt;<\/p>/);
 h.setSession({name:'',number:2},'Сессия 2');
 assert.match(h.api.view(),/<p class="play-session">Сессия 02<\/p>/);
 h.setSession({name:'Сторожка',number:null},'Сторожка');
 assert.match(h.api.view(),/<p class="play-session">Сторожка<\/p>/);
 h.setSession({name:'Текущая игра',number:-1},'Текущая игра');
 assert.match(h.api.view(),/<p class="play-session">Текущая игра<\/p>/);
});

test('a retained workspace refresh updates session and hero without remounting actions',()=>{
 const h=harness();
 const actor=h.api.actorView();
 const action='<button data-campaign-action="return-game">В игру</button>';
 let replacements=0,captionWrites=0,session=actor.session;
 const caption={get textContent(){return session;},set textContent(next){session=next;captionWrites++;}};
 const header={querySelector:selector=>selector==='.play-session'?caption:null};
 const element=markup=>({
  markup,icons:false,
  isEqualNode(next){return this.markup===next.markup&&this.icons===next.icons;},
  replaceWith(next){band=next;replacements++;}
 });
 let band=element('');
 const fakeDocument={createElement(tag){
  assert.equal(tag,'template');
  return {content:{firstElementChild:null},set innerHTML(markup){this.content.firstElementChild=element(markup);}};
 }};
 const screen={querySelector:selector=>selector==='.play-heading > div'?header:selector==='.play-hero-band'?band:null};
 const presentation=vm.runInNewContext(presentationSource+'\nSkazPlayPresentation',{
  document:fakeDocument,SkazIcons:{mount(next){next.icons=true;}}
 });
 const updated={...actor,session:'Сессия 02 · <Север>',hp:14,concentration:'Сопротивление'};
 presentation.refreshActor(screen,updated);
 const mounted=band;
 presentation.refreshActor(screen,updated);
 assert.equal(caption.textContent,'Сессия 02 · <Север>');
 assert.equal(captionWrites,1);
 assert.match(band.markup,/<strong>14<span> \/ 38<\/span>/);
 assert.equal(band.icons,true);
 assert.equal(replacements,1);
 assert.equal(band,mounted);
 assert.equal(Object.hasOwn(screen,'innerHTML'),false);
 const html=presentation.prepare({actor,title:'Кампания',titleId:'campaign-title',actions:action,content:'<section id="campaign-content"></section>'});
 assert.match(html,/<h1 id="campaign-title" tabindex="-1">Кампания<\/h1>/);
 assert.ok(html.includes(action));
});

test('cast price follows the selected command, with distinct free and manual paths',async()=>{
 const h=harness(),free=spell('Free',0),paid=spell('Paid',1),exhausted=spell('Exhausted',4);
 paid.entry.spell.castingTime='1 действие';
 await loaded(h,[free,paid,exhausted]);
 let html=h.get('play-content').innerHTML;
 assert.match(html,/Применить: Free · Без ячейки/);
 assert.match(html,/Сотворить: Paid · 1 ячейка · 2 круг/);
 assert.match(html,/Записать вручную: Exhausted · нет ячеек 4\+/);
 await h.click('',{playCastLevel:'Paid',level:'3'});
 html=h.get('play-content').innerHTML;
 assert.match(html,/Сотворить: Paid · 1 ячейка · 3 круг/);
 assert.match(html,/data-level="3" aria-pressed="true" aria-label="3 круг · осталось 1"/);
 assert.match(html,/<small class="play-price-caption" aria-hidden="true">Цена<\/small><small class="play-cost">1 ячейка<\/small><span class="play-command-label">Сотворить<\/span>/);
 assert.match(html,/<h3 class="play-action-heading">Действие<\/h3>/);
 assert.match(html,/<small class="play-action-kind" aria-hidden="true">Действие<\/small><strong>Paid<\/strong>/);
 assert.doesNotMatch(html,/<small class="play-price-caption" aria-hidden="true">Цена<\/small><small class="play-cost">нет ячеек/);
 await h.click('',{playCast:'Paid'});
 assert.equal(h.casts[0][1].level,3);
 h.setSheet({level:5,counters:[{current:1}]});
 await h.click('',{playSpellScope:'all'});
 assert.match(h.get('play-content').innerHTML,/Сотворить: Paid · Выбор счётчика/);
 assert.equal(h.casts.length,1);
});

test('returning to game search focuses the re-rendered result only in the captured context',async()=>{
 const h=harness();
 await loaded(h);
 const focused=[],scrolled=[];
 let buttons,renderCount=0;
 const select=h.document.querySelectorAll;
 h.document.querySelectorAll=selector=>{
  if(selector!=='[data-play-search-result]')return select(selector);
  const render=++renderCount;
  buttons=['0','1'].map(index=>({
   dataset:{playSearchResult:index},
   focus:options=>focused.push([render,index,options.preventScroll]),
   scrollIntoView:options=>scrolled.push([render,index,options.block]),
  }));
  return buttons;
 };
 await h.click('play-search');
 h.get('play-search-query').value='fire';
 const search=h.get('play-search-form').onsubmit({preventDefault(){}});
 const entries=[{name:{ru:'Первый',en:'First'}},{name:{ru:'Второй',en:'Second'}}];
 h.requests.find(r=>r.kind==='search').resolve({ok:true,json:async()=>({entries})});
 await search;
 assert.deepEqual(focused,[]);
 buttons[1].onclick();
 assert.equal(h.reads[0][0],entries[1]);
 const back=h.reads[0][1];
 back();
 assert.match(h.html(),/value="fire"/);
 assert.deepEqual(focused,[[2,'1',true]]);
 assert.deepEqual(scrolled,[[2,'1','nearest']]);
 assert.equal(h.requests.filter(r=>r.kind==='search').length,1);
 h.context('another-hero');
 const before=h.html();
 back();
 assert.equal(h.html(),before);
 assert.equal(renderCount,2);
 assert.equal(focused.length,1);
});

test('game search leaves the input mounted and skips results for a replaced draft',async()=>{
 const h=harness();
 await loaded(h);
 await h.click('play-search');
 const field=h.get('play-search-query'),list=h.get('play-search-results'),status=h.get('play-search-status');
 const original=h.html();
 const submit=()=>h.get('play-search-form').onsubmit({preventDefault(){}});
 field.value='fire';
 const first=submit();
 assert.match(original,/id="play-search-status" role="status"/);
 assert.match(status.textContent,/Ищем/);
 field.value='fireball';
 h.requests.filter(r=>r.kind==='search').at(-1).resolve({
  ok:true,json:async()=>({entries:[{name:{ru:'Старый результат',en:'Old result'}}]}),
 });
 await first;
 assert.equal(field.value,'fireball');
 assert.equal(h.html(),original);
 assert.match(status.textContent,/Запрос изменён/);
 assert.doesNotMatch(list.innerHTML,/Old result/);
 const second=submit();
 h.requests.filter(r=>r.kind==='search').at(-1).resolve({
  ok:true,json:async()=>({entries:[{name:{ru:'Огненный шар',en:'Fireball'}}]}),
 });
 await second;
 assert.match(list.innerHTML,/Fireball/);
 assert.equal(status.textContent,'Показано результатов: 1.');
 assert.equal(status.className,'visually-hidden');
 assert.equal(h.html(),original);
 assert.equal(field.value,'fireball');
});

test('editing game search clears displayed results and invalidates a pending lookup', async () => {
 const h=harness();
 await loaded(h);
 await h.click('play-search');
 const field=h.get('play-search-query'), list=h.get('play-search-results'), status=h.get('play-search-status');
 const submit=()=>h.get('play-search-form').onsubmit({preventDefault(){}});
 const searches=()=>h.requests.filter(r=>r.kind==='search');
 const complete=entry=>searches().at(-1).resolve({ok:true,json:async()=>({entries:[entry]})});
 const old={name:{ru:'Опознание',en:'Identify'}}, current={name:{ru:'Волшебная стрела',en:'Magic Missile'}};
 field.value='Identify';
 const initial=submit();
 complete(old);
 await initial;
 assert.match(list.innerHTML,/Identify/);
 field.value='  Identify ';
 field.oninput();
 assert.match(list.innerHTML,/Identify/);
 field.value='Magic Missile';
 field.oninput();
 assert.equal(list.innerHTML,'');
 assert.match(status.textContent,/Запрос изменён/);
 assert.equal(searches().length,1);
 const stale=submit();
 field.value='';
 field.oninput();
 assert.match(status.textContent,/Введи название/);
 complete(current);
 await stale;
 assert.equal(list.innerHTML,'');
 assert.match(status.textContent,/Введи название/);
 field.value='Magic Missile';
 field.oninput();
 const fresh=submit();
 complete(current);
 await fresh;
 assert.match(list.innerHTML,/Magic Missile/);
 assert.doesNotMatch(list.innerHTML,/Identify/);
 assert.equal(searches().length,3);
});

test('game search uses the visual viewport only while it is reduced without zoom',async()=>{
 const windowEvents=new Map(),viewportEvents=new Map(),dialogEvents=new Map();
 const attributes=new Map(),rules=new Map();
 const dialog={
  open:false,
  searchPanel:true,
  querySelector:selector=>selector==='#play-search-panel'&&dialog.searchPanel?{}:null,
  setAttribute:(name,value)=>attributes.set(name,value),
  getAttribute:name=>attributes.get(name)??null,
  hasAttribute:name=>attributes.has(name),
  removeAttribute:name=>attributes.delete(name),
  style:{setProperty:(name,value)=>rules.set(name,value),removeProperty:name=>rules.delete(name)},
  addEventListener:(name,fn)=>dialogEvents.set(name,fn),
 };
 const visualViewport={
  height:311.8,offsetTop:138.4,scale:1,
  addEventListener:(name,fn)=>viewportEvents.set(name,fn),
 };
 const environment={
  visualViewport,innerHeight:568,
  addEventListener:(name,fn)=>windowEvents.set(name,fn),
 };
 const h=harness({dialog,environment});
 await loaded(h);
 await h.click('play-search');
 assert.ok(attributes.has('data-play-search-viewport'));
 assert.equal(rules.get('--play-search-top'),'139px');
 assert.equal(rules.get('--play-search-height'),'311px');
 visualViewport.offsetTop=49.2;
 viewportEvents.get('scroll')();
 assert.equal(rules.get('--play-search-top'),'50px');
 const field=h.get('play-search-query'),form=h.get('play-search-form');
 field.value='fire';
 h.document.activeElement=field;
 let buttonFocused=false;
 form.querySelector=()=>({focus:()=>{buttonFocused=true;}});
 visualViewport.height=71;
 viewportEvents.get('resize')();
 assert.equal(attributes.get('data-play-search-viewport'),'compact');
 const response=form.onsubmit({preventDefault(){}});
 assert.equal(buttonFocused,true);
 h.requests.at(-1).resolve({ok:true,json:async()=>({entries:[]})});
 await response;
 visualViewport.scale=1.5;
 viewportEvents.get('resize')();
 assert.equal(attributes.size,0);
 assert.equal(rules.size,0);
 visualViewport.scale=1;
 windowEvents.get('resize')();
 assert.ok(attributes.has('data-play-search-viewport'));
 dialog.searchPanel=false;
 viewportEvents.get('resize')();
 assert.equal(attributes.size,0);
 dialog.searchPanel=true;
 viewportEvents.get('resize')();
 dialog.open=false;
 dialogEvents.get('close')();
 assert.equal(rules.size,0);
 assert.equal(attributes.size,0);
});

test('a manual battle starts at one, advances and ends in place',async()=>{
 const h=harness({environment:{render:()=>assert.fail('The round controls should update without rendering Quick Access')}});
 const toggle=h.get('play-battle-toggle'),round=h.get('play-next-round');
 assert.match(h.api.view(),/Начать бой/);
 await h.click('play-battle-toggle');
 assert.equal(toggle['aria-pressed'],'true');
 assert.equal(round.hidden,false);
 assert.match(h.api.view(),/Завершить бой[\s\S]*Раунд 1/);
 await h.click('play-next-round');
 assert.match(round['aria-label'],/Текущий раунд 2/);
 assert.match(h.api.view(),/Раунд 2/);
 await h.click('play-battle-toggle');
 assert.equal(toggle['aria-pressed'],'false');
 assert.equal(round.hidden,true);
 assert.match(h.api.view(),/id="play-next-round" hidden/);
});

test('switching a summon stays in its session and keeps hero actions isolated',async()=>{
 const h=harness({environment:{render(){}}});
 const key='skaz-play-battle-v1:'+JSON.stringify(['local','hero-a']);
 h.memory.set(key,JSON.stringify({round:1,selected:null,summons:[{id:'owl',name:'Сова',hp:0,maxHp:2},{id:'fey',name:'Фея',hp:3,maxHp:4}]}));
 assert.match(h.api.view(),/Призывы · 2/);
 await h.click('play-actor-next');
 assert.equal(h.api.summonActive(),true);
 assert.match(h.api.view(),/Сова[\s\S]*0 \/ 2/);
 await h.click('play-actor-next');
 assert.match(h.api.view(),/Фея[\s\S]*3 \/ 4/);
 await h.click('play-actor-next');
 assert.equal(h.api.summonActive(),false);
 h.context('new','other-session');
 assert.doesNotMatch(h.api.view(),/play-actor-next|Раунд 1/);
});

test('settling a hero resource keeps only the displayed summon for the current game',()=>{
 const h=harness();
 const key=id=>'skaz-play-battle-v1:'+JSON.stringify(['local',id]);
 const battle=(id)=>JSON.stringify({round:1,selected:id,summons:[{id,name:'Guard',hp:1,maxHp:2}]});
 h.memory.set(key('hero-a'),battle('guard'));
 assert.match(h.api.view(),/data-play-summon-id="guard"/);
 const displayed={dataset:{playSummonId:'guard'}};
 const main={querySelector:selector=>selector==='.play-screen'?displayed:null};
 h.context('after-slot','hero-a');
 assert.equal(h.api.updateResources(main,true),true);
 displayed.dataset.playSummonId='old';
 assert.equal(h.api.updateResources(main,true),false);
 displayed.dataset.playSummonId='guard';
 h.memory.set(key('hero-b'),battle('guard'));
 h.context('another-game','hero-b');
 assert.equal(h.api.updateResources(main,true),false);
});

test('a stale summon dialog cannot select or remove a summon in the new session',async()=>{
 const h=harness({environment:{render(){}}});
 const key=id=>'skaz-play-battle-v1:'+JSON.stringify(['local',id]);
 const state=(id,name)=>JSON.stringify({round:1,selected:id,summons:[{id,name,hp:1,maxHp:2}]});
 h.memory.set(key('hero-a'),state('summon-a','Сова'));
 h.memory.set(key('hero-b'),state('summon-b','Фея'));
 h.api.view();
 await h.click('play-summons');
 const callback=h.get('play-summon-dialog').onclick;
 h.context('b','hero-b');
 callback({target:{closest:()=>({id:'play-remove-summon',dataset:{}})}});
 callback({target:{closest:()=>({id:'',dataset:{playSelectSummon:''}})}});
 assert.equal(h.memory.get(key('hero-b')),state('summon-b','Фея'));
 assert.match(h.api.view(),/Фея/);
});
