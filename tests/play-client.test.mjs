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
function harness({quests=[],questFailure=false,spellLearning=null}={}){const elements=new Map(),handlers={},requests=[],reads=[],spends=[],casts=[],chargeEdits=[],memory=new Map();let snapshot='a',owner='hero-a',html='';const lists=['spells','items','quests'].map(kind=>({dataset:{playList:kind},scrollTop:0}));const get=id=>{if(!elements.has(id))elements.set(id,{innerHTML:'',value:'',textContent:'',open:true});return elements.get(id);};
 const context=vm.createContext({structuredClone,CSS:{escape:String},crypto:{randomUUID:()=> 'test-manual-cast'},page:'play',location:{protocol:'http:'},state:{profile:{name:'Hero'},journal:[],notes:[],hp:20,maxHp:38,slots:{1:0,2:2,3:1}},sessionStorage:{getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v)},queueMicrotask,URLSearchParams,AbortSignal,
 document:{body:{closest:()=>null},getElementById:get,querySelectorAll:selector=>selector==='[data-play-list]'?lists:[],addEventListener:(event,fn)=>handlers[event]=fn},modal:value=>{html=value;get('dialog').open=true;},closeModal:()=>get('dialog').open=false,toast(){},go:value=>context.page=value,
 SkazCatalog:{readSnapshot:(...args)=>reads.push(args)},SkazStorage:{spellLearningMode:()=>spellLearning,snapshotKey:()=>snapshot,contextKey:()=>owner,stats:()=>({armorClass:14,initiative:2,speed:30,abilities:{str:8,dex:14,con:14,int:12,wis:10,cha:18}}),sheet:()=>null,editable:()=>true,canResource:()=>true,castSpell:(...args)=>casts.push(args),editCharges:item=>chargeEdits.push(item),spellbookData:()=>new Promise(resolve=>requests.push({kind:'book',resolve})),questsData:async()=>{if(questFailure)throw Error('offline');return {quests};},inventoryData:()=>new Promise((resolve,reject)=>requests.push({kind:'items',resolve,reject})),spendInventoryOne:async(...args)=>spends.push(args)},fetch:()=>new Promise(resolve=>requests.push({kind:'search',resolve}))});vm.runInContext(castingSource,context);vm.runInContext(factsSource,context);const facts=vm.runInContext('SkazSpellFacts',context),factsCalls=[],summary=facts.summary;facts.summary=(...args)=>{factsCalls.push(args);return summary(...args);};vm.runInContext(artSource,context);vm.runInContext(itemChargesSource,context);vm.runInContext(profileRulesSource,context);vm.runInContext(sheetSource,context);vm.runInContext(presentationSource,context);vm.runInContext(source,context);return{factsCalls,document:context.document,setSession:(active,title)=>{context.SkazStorage.currentSession=()=>active;context.SkazStorage.sessionTitle=()=>title;},setSlots:v=>context.state.slots=v,setHp:v=>context.state.hp=v,setSheet:v=>context.SkazStorage.sheet=()=>v,api:vm.runInContext('SkazPlay',context),get,requests,reads,spends,casts,chargeEdits,memory,lists,scroll:(index,top)=>{lists[index].scrollTop=top;handlers.scroll({target:lists[index]});},html:()=>html,concentration:value=>context.state.concentration=value,context:(s,o=s)=>{snapshot=s;owner=o;},page:()=>context.page,selectCast:(id,value)=>handlers.change({target:{dataset:{playCastSelect:id},value}}),click:(id,dataset={},button={id,dataset})=>handlers.click({target:{closest:()=>button}})};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('play art keeps spell circle, stable action IDs and item quantity independent of image loading',async()=>{
 const h=harness(),s=spell('fireball',3);s.entry.kind='spell';s.entry.spell.castingTime='1 действие';
 const item={catalogId:'potion',quantity:2,entry:{id:'potion',kind:'item',name:{ru:'Potion'},item:{type:'potion'}}};
 await loaded(h,[s],[item]);const html=h.get('play-content').innerHTML;
 assert.match(html,/data-skaz-art="fireball"/);assert.match(html,/aria-label="3 круг">3/);assert.match(html,/data-play-cast="fireball"/);
 assert.match(html,/data-skaz-art="potion"/);assert.match(html,/×2/);assert.match(html,/data-play-spend="potion"[^>]*><small class="play-cost">1 предмет<\/small><span class="play-command-label">Списать<\/span>/);
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
  await loaded(h,[],entries);
  assert.match(summary.innerHTML,copy);
  assert.doesNotMatch(summary.innerHTML,/<one>/);
  assert.equal((summary.innerHTML.match(/<\/span>/g)||[]).length,marks===0?(summary.innerHTML?1:0):marks+1);
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
 assert.equal((html.match(/class="panel play-empty"/g)||[]).length,4);assert.doesNotMatch(html,/class="play-list"|data-play-page/);
 await h.click('',{playPrepare:'spells'});assert.equal(h.page(),'spells');
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
 h.requests.at(-1).reject(Error('offline'));
 await tick();
 await retryClick();
 h.requests.at(-1).reject(Error('still offline'));
 await tick();
 assert.equal(document.activeElement,retry);
 await retryClick();
 document.activeElement=outside;
 h.requests.at(-1).reject(Error('offline again'));
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
test('play search does not show a late private result after context changed',async()=>{const h=harness();await loaded(h);await h.click('play-search');h.get('play-search-query').value='Shield';const search=h.get('play-search-form').onsubmit({preventDefault(){}});h.context('other');h.requests.find(r=>r.kind==='search').resolve({ok:true,json:async()=>({entries:[{name:{ru:'Secret',en:'Secret'}}]})});await search;assert.doesNotMatch(h.html(),/Secret/);});

test('reopening play search invalidates the previous request even in the same character snapshot',async()=>{const h=harness();await loaded(h);await h.click('play-search');h.get('play-search-query').value='Old';const first=h.get('play-search-form').onsubmit({preventDefault(){}});await h.click('play-search');h.requests.find(r=>r.kind==='search').resolve({ok:true,json:async()=>({entries:[{name:{ru:'Old result',en:'Old'}}]})});await first;assert.doesNotMatch(h.html(),/Old result/);});
test('leaving a loading play screen permits a new load on return',async()=>{const h=harness();h.api.view();await tick();h.api.remember('hero');h.api.remember('play');h.api.view();await tick();assert.equal(h.requests.length,4);h.requests[0].resolve({entries:[spell('Stale')]});h.requests[1].resolve({entries:[]});h.requests[2].resolve({entries:[spell('Fresh')]});h.requests[3].resolve({entries:[]});await tick();assert.match(h.get('play-content').innerHTML,/Fresh/);assert.doesNotMatch(h.get('play-content').innerHTML,/Stale/);});

test('play quest summary shows only active next steps, escapes text and tolerates quest API failure',async()=>{
 const h=harness({quests:[{status:'active',title:'<Quest>',steps:[{title:'Done',done:true},{title:'<Next>',done:false}]},{status:'completed',title:'Hidden quest',steps:[]}]});await loaded(h);
 assert.match(h.get('play-content').innerHTML,/&lt;Quest&gt;/);assert.match(h.get('play-content').innerHTML,/&lt;Next&gt;/);assert.doesNotMatch(h.get('play-content').innerHTML,/Hidden quest/);
 const offline=harness({questFailure:true});await loaded(offline,[spell('Still readable')]);assert.match(offline.get('play-content').innerHTML,/Still readable/);assert.match(offline.get('play-content').innerHTML,/Задания недоступны/);
});

test('resource refresh retains list position for the same hero and discards it for another hero',async()=>{
 const h=harness();await loaded(h,[spell('A')]);h.scroll(0,210);h.scroll(1,80);
 h.context('revision-b','hero-a');h.api.view();await tick();h.requests.at(-2).resolve({entries:[spell('B')]});h.requests.at(-1).resolve({entries:[]});await tick();assert.equal(h.lists[0].scrollTop,210);assert.equal(h.lists[1].scrollTop,80);
 h.context('revision-c','hero-b');h.api.view();await tick();h.requests.at(-2).resolve({entries:[spell('C')]});h.requests.at(-1).resolve({entries:[]});await tick();assert.equal(h.lists[0].scrollTop,0);assert.equal(h.lists[1].scrollTop,0);
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
 assert.match(html,/aria-label="Состояние активного персонажа"[\s\S]*<strong>Hero<\/strong>/);
 assert.match(html,/<strong>20<span> \/ 38<\/span>/);
 assert.equal((html.match(/id="play-quick-slot"/g)||[]).length,1);
 assert.match(html,/id="play-history"/);
 h.setHp('18" onfocus="bad');
 const safe=h.api.view();
 assert.match(safe,/value="18&quot; onfocus=&quot;bad"/);
 assert.doesNotMatch(safe,/" onfocus="bad"/);
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

test('cast price follows the selected command, with distinct free and manual paths',async()=>{
 const h=harness(),free=spell('Free',0),paid=spell('Paid',1),exhausted=spell('Exhausted',4);
 await loaded(h,[free,paid,exhausted]);
 let html=h.get('play-content').innerHTML;
 assert.match(html,/Применить: Free · Без ячейки/);
 assert.match(html,/Сотворить: Paid · 1 ячейка · 2 круг/);
 assert.match(html,/Записать вручную: Exhausted · нет ячеек 4\+/);
 await h.click('',{playCastLevel:'Paid',level:'3'});
 html=h.get('play-content').innerHTML;
 assert.match(html,/Сотворить: Paid · 1 ячейка · 3 круг/);
 assert.match(html,/data-level="3" aria-pressed="true" aria-label="3 круг · осталось 1"/);
 assert.match(html,/<small class="play-cost">1 ячейка<\/small><span class="play-command-label">Сотворить<\/span>/);
 await h.click('',{playCast:'Paid'});
 assert.equal(h.casts[0][1].level,3);
 h.setSheet({level:5,counters:[{current:1}]});
 await h.click('',{playSpellScope:'all'});
 assert.match(h.get('play-content').innerHTML,/Сотворить: Paid · Выбор счётчика/);
 assert.equal(h.casts.length,1);
});
