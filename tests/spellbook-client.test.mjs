import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const uiSource=await readFile(new URL('../client/ui.js',import.meta.url),'utf8');
const source=await readFile(new URL('../client/spellbook.js',import.meta.url),'utf8');
function harness(preparedDefault=false){let firstView=true,key='hero:0';const tasks=[],requests=[],edits=[],handlers={},region={innerHTML:'',setAttribute(){}};
 const context=vm.createContext({queueMicrotask:fn=>tasks.push(fn),document:{addEventListener:(n,f)=>handlers[n]=f,getElementById:()=>region},render:()=>{},SkazStorage:{snapshotKey:()=>key,contextKey:()=>key.split(':')[0],spellbookData:()=>new Promise((resolve,reject)=>requests.push({resolve,reject})),editSpell:(...args)=>edits.push(args)}});vm.runInContext(uiSource,context);vm.runInContext(source,context);
 return{tasks,requests,edits,region,view:()=>{let html=vm.runInContext('SkazSpellbook.view()',context);if(firstView&&!preparedDefault){firstView=false;handlers.click({target:{closest:()=>({dataset:{bookScope:'all'}})}});html=vm.runInContext('SkazSpellbook.view()',context);}return html;},setKey:v=>key=v,draft:(q,scope='all',level='',flags={})=>handlers.change({target:{form:{id:'personal-spell-search',elements:{q:{value:q},scope:{value:scope},level:{value:level},ritual:{value:flags.ritual||''},concentration:{value:flags.concentration||''}}}}}),click:(id,dataset={})=>handlers.click({target:{closest:()=>({id,dataset})}}),search:(q,scope='all',level='',flags={})=>handlers.submit({target:{id:'personal-spell-search',elements:{q:{value:q},scope:{value:scope},level:{value:level},ritual:{value:flags.ritual||''},concentration:{value:flags.concentration||''}}},preventDefault(){}})};
}
const settle=()=>new Promise(r=>setImmediate(r));
const item=(i=0)=>({catalogId:'spell:'+i,status:i%2?'prepared':'known',entry:{id:'spell:'+i,kind:'spell',name:{ru:'Заклинание '+i,en:'Magic '+i},spell:{level:i%3,castingTime:'<action>',range:{type:'feet',feet:60},duration:'1 минута',concentration:false,ritual:true}}});
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
 h.setKey('hero:1');assert.match(h.view(),/Магия &lt;draft&gt;/);h.setKey('other:0');assert.doesNotMatch(h.view(),/draft/);assert.match(h.view(),/value="prepared" selected/);
});

test('personal ritual and concentration filters intersect and do not treat unknown metadata as false',async()=>{
 const h=harness();h.view();h.tasks.shift()();const a=item(0),b=item(1),unknown=item(2);b.entry.spell.concentration=true;delete unknown.entry.spell;
 h.requests[0].resolve({entries:[a,b,unknown]});await settle();h.search('','all','',{ritual:'true',concentration:'false'});assert.match(h.region.innerHTML,/1–1 из 1/);assert.match(h.region.innerHTML,/Заклинание 0/);assert.doesNotMatch(h.region.innerHTML,/Заклинание 1|Заклинание 2/);
 h.draft('','all','',{ritual:'false',concentration:'true'});assert.match(h.view(),/value="false" selected/);h.setKey('hero:1');assert.match(h.view(),/value="true" selected/);
 h.tasks.shift()();h.requests[1].resolve({entries:[a,b,unknown]});await settle();assert.match(h.region.innerHTML,/Заклинание 0/);
 h.search('','all','',{ritual:'false'});assert.match(h.region.innerHTML,/Заклинания не найдены/);h.click('personal-spell-reset');assert.doesNotMatch(h.view(),/value="false" selected|value="true" selected/);
 h.setKey('other:0');h.search('stale','prepared','0',{concentration:'true'});assert.doesNotMatch(h.view(),/stale|value="true" selected/);
});

test('book groups circles before name and keeps inline descriptions escaped',async()=>{
 const h=harness();h.view();h.tasks.shift()();const a=item(2),b=item(1),c=item(0);a.entry.text='<script>unsafe</script>';h.requests[0].resolve({entries:[a,b,c]});await settle();
 const html=h.region.innerHTML;assert.ok(html.indexOf('Заклинание 0')<html.indexOf('Заклинание 1'));assert.ok(html.indexOf('Заклинание 1')<html.indexOf('Заклинание 2'));assert.match(html,/Заговоры/);assert.match(html,/book-description/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>|\[object Object\]/);assert.match(html,/60 фт/);
});


test('book starts with prepared spells, explicit scope changes retain query and reset restores prepared',async()=>{
 const h=harness(true);assert.match(h.view(),/data-book-scope="prepared" aria-pressed="true"/);h.tasks.shift()();h.requests[0].resolve({entries:[item(0),item(1),item(2)]});await settle();assert.match(h.region.innerHTML,/Заклинание 1/);assert.doesNotMatch(h.region.innerHTML,/Заклинание 0|Заклинание 2/);
 h.click('',{bookScope:'all'});h.view();h.search('Magic 2','all');assert.match(h.region.innerHTML,/Заклинание 2/);h.click('',{bookScope:'prepared'});h.view();h.search('Magic 2','prepared');assert.match(h.region.innerHTML,/Заклинания не найдены/);
 h.click('personal-spell-reset');assert.match(h.view(),/data-book-scope="prepared" aria-pressed="true"/);assert.match(h.view(),/book-row/);assert.doesNotMatch(h.view(),/catalog-card/);
});

test('known caster book merges legacy prepared and known without rewriting edit status',async()=>{
 const h=harness(true);h.view();h.tasks.shift()();h.requests[0].resolve({spellLearning:'known',entries:[item(0),item(1)]});await settle();
 assert.match(h.region.innerHTML,/Заклинание 0/);assert.match(h.region.innerHTML,/Заклинание 1/);
 const html=h.view();assert.doesNotMatch(html,/Подготовлено|подготовка|Изучено/);assert.match(html,/Известно/);
 h.click('',{personalSpell:'spell:1'});assert.equal(h.edits[0][1],'prepared');
 h.click('personal-spell-reset');assert.match(h.view(),/data-book-scope="known" aria-pressed="true"/);
 h.setKey('cleric:0');h.view();h.tasks.shift()();h.requests[1].resolve({spellLearning:'prepared',entries:[item(0),item(1)]});await settle();
 assert.match(h.view(),/Подготовлено/);assert.doesNotMatch(h.region.innerHTML,/Заклинание 0/);
});
