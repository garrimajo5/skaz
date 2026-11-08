import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import{readFile}from'node:fs/promises';
const sheetSource=await readFile(new URL('../client/character-sheet.js',import.meta.url),'utf8');
const source=await readFile(new URL('../client/play.js',import.meta.url),'utf8');
function harness({quests=[],questFailure=false}={}){const elements=new Map(),handlers={},requests=[],reads=[],spends=[],memory=new Map();let snapshot='a',owner='hero-a',html='';const lists=['spells','items','quests'].map(kind=>({dataset:{playList:kind},scrollTop:0}));const get=id=>{if(!elements.has(id))elements.set(id,{innerHTML:'',value:'',textContent:'',open:true});return elements.get(id);};
 const context=vm.createContext({page:'play',state:{profile:{name:'Hero'},journal:[],notes:[]},sessionStorage:{getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v)},queueMicrotask,URLSearchParams,AbortSignal,
 document:{getElementById:get,querySelectorAll:selector=>selector==='[data-play-list]'?lists:[],addEventListener:(event,fn)=>handlers[event]=fn},modal:value=>{html=value;get('dialog').open=true;},closeModal:()=>get('dialog').open=false,toast(){},go:value=>context.page=value,
 SkazCatalog:{readSnapshot:(...args)=>reads.push(args)},SkazStorage:{snapshotKey:()=>snapshot,contextKey:()=>owner,stats:()=>({armorClass:14,initiative:2,speed:30,abilities:{str:8,dex:14,con:14,int:12,wis:10,cha:18}}),sheet:()=>null,editable:()=>true,spellbookData:()=>new Promise(resolve=>requests.push({kind:'book',resolve})),questsData:async()=>{if(questFailure)throw Error('offline');return {quests};},inventoryData:()=>new Promise(resolve=>requests.push({kind:'items',resolve})),spendInventoryOne:async(...args)=>spends.push(args)},fetch:()=>new Promise(resolve=>requests.push({kind:'search',resolve}))});vm.runInContext(sheetSource,context);vm.runInContext(source,context);return{api:vm.runInContext('SkazPlay',context),get,requests,reads,spends,memory,lists,scroll:(index,top)=>{lists[index].scrollTop=top;handlers.scroll({target:lists[index]});},html:()=>html,concentration:value=>context.state.concentration=value,context:(s,o=s)=>{snapshot=s;owner=o;},page:()=>context.page,click:(id,dataset={})=>handlers.click({target:{closest:()=>({id,dataset})}})};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
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
 await h.click('',{playRead:'spell',id:'Long'});assert.equal(h.reads[0][0].id,'Long');h.context('different');await h.click('',{playSpellScope:'combat'});assert.match(h.get('play-content').innerHTML,/data-id="Long"/);
});

 test('only the recorded concentration spell receives an active marker',async()=>{const h=harness(),a=spell('Bless'),b=spell('Aid');a.entry.spell.concentration=true;h.concentration('Bless');await loaded(h,[a,b]);assert.equal((h.get('play-content').innerHTML.match(/is-concentrating/g)||[]).length,1);assert.match(h.get('play-content').innerHTML,/◉ действует/);h.concentration('Aid');await h.click('',{playSpellScope:'all'});assert.doesNotMatch(h.get('play-content').innerHTML,/is-concentrating/);});
