import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../client/spellbook.js',import.meta.url),'utf8');
function harness(){let key='hero:0';const tasks=[],requests=[],edits=[],handlers={},region={innerHTML:'',setAttribute(){}};
 const context=vm.createContext({queueMicrotask:fn=>tasks.push(fn),document:{addEventListener:(n,f)=>handlers[n]=f,getElementById:()=>region},render:()=>{},SkazStorage:{snapshotKey:()=>key,contextKey:()=>key.split(':')[0],spellbookData:()=>new Promise((resolve,reject)=>requests.push({resolve,reject})),editSpell:(...args)=>edits.push(args)}});vm.runInContext(source,context);
 return{tasks,requests,edits,region,view:()=>vm.runInContext('SkazSpellbook.view()',context),setKey:v=>key=v,draft:(q,scope='all',level='')=>handlers.change({target:{form:{id:'personal-spell-search',elements:{q:{value:q},scope:{value:scope},level:{value:level}}}}}),click:(id,dataset={})=>handlers.click({target:{closest:()=>({id,dataset})}}),search:(q,scope='all',level='')=>handlers.submit({target:{id:'personal-spell-search',elements:{q:{value:q},scope:{value:scope},level:{value:level}}},preventDefault(){}})};
}
const settle=()=>new Promise(r=>setImmediate(r));
const item=(i=0)=>({catalogId:'spell:'+i,status:i%2?'prepared':'known',entry:{id:'spell:'+i,kind:'spell',name:{ru:'Заклинание '+i,en:'Magic '+i},spell:{level:i%3,castingTime:'<action>',duration:'1 минута',concentration:false,ritual:true}}});
test('personal spellbook searches RU/EN, filters exact status and zero level, paginates, escapes text',async()=>{
 const h=harness();h.view();h.tasks.shift()();h.requests[0].resolve({entries:Array.from({length:15},(_,i)=>item(i))});await settle();
 assert.match(h.region.innerHTML,/1–12 из 15/);assert.match(h.region.innerHTML,/&lt;action&gt;/);assert.doesNotMatch(h.region.innerHTML,/<action>/);h.click('personal-spell-next');assert.match(h.region.innerHTML,/13–15 из 15/);
 h.search('MAGIC','prepared');assert.match(h.region.innerHTML,/1–7 из 7/);h.search('заклинание','all','0');assert.match(h.region.innerHTML,/1–5 из 5/);h.click('',{personalSpell:'spell:0'});assert.equal(h.edits[0][0].id,'spell:0');assert.equal(h.edits[0][1],'known');assert.equal(typeof h.edits[0][2],'function');
});
test('personal book rejects late character data and stale edit clicks, clears filters when switching hero',async()=>{
 const h=harness();h.view();h.tasks.shift()();h.search('old','known','0');h.setKey('new:0');h.view();h.tasks.shift()();h.requests[1].resolve({entries:[item(1)]});await settle();const current=h.region.innerHTML;assert.match(current,/Заклинание 1/);h.requests[0].resolve({entries:[item(0)]});await settle();assert.equal(h.region.innerHTML,current);h.setKey('third:0');h.click('',{personalSpell:'spell:1'});assert.equal(h.edits.length,0);
});
test('book keeps page after revision, clamps after removal, and separates missing metadata',async()=>{
 const h=harness();h.view();h.tasks.shift()();let entries=Array.from({length:13},(_,i)=>item(i));h.requests[0].resolve({entries});await settle();h.click('personal-spell-next');
 h.setKey('hero:1');h.view();h.tasks.shift()();h.requests[1].resolve({entries});await settle();assert.match(h.region.innerHTML,/13–13 из 13/);
 h.setKey('hero:2');h.view();h.tasks.shift()();entries=entries.slice(0,12);delete entries[0].entry.spell;h.requests[2].resolve({entries});await settle();assert.match(h.region.innerHTML,/1–12 из 12/);h.search('','all','unknown');assert.match(h.region.innerHTML,/Характеристики не указаны/);assert.match(h.region.innerHTML,/1–1 из 1/);
});
test('book retry distinguishes empty list from no matches',async()=>{
 const h=harness();h.view();h.tasks.shift()();h.requests[0].reject(new Error('<offline>'));await settle();assert.match(h.region.innerHTML,/&lt;offline&gt;/);h.click('personal-spell-retry');h.requests[1].resolve({entries:[]});await settle();assert.match(h.region.innerHTML,/книга пока пуста/);
 h.setKey('hero:1');h.view();h.tasks.shift()();h.requests[2].resolve({entries:[item()]});await settle();h.search('missing');assert.match(h.region.innerHTML,/Заклинания не найдены/);
});

test('unfinished search survives rerenders and same-character updates but resets when switching hero',async()=>{
 const h=harness();h.view();h.tasks.shift()();h.requests[0].resolve({entries:[item()]});await settle();h.draft('Магия <draft>','prepared','0');
 assert.match(h.view(),/value="Магия &lt;draft&gt;"/);assert.match(h.view(),/value="prepared" selected/);assert.match(h.view(),/value="0" selected/);assert.match(h.region.innerHTML,/Заклинание 0/);
 h.setKey('hero:1');assert.match(h.view(),/Магия &lt;draft&gt;/);h.setKey('other:0');assert.doesNotMatch(h.view(),/draft|value="prepared" selected/);
});
