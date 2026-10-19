import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openStore} from '../server/store.mjs';
import {createApp} from '../server/app.mjs';
import {validateCatalog} from '../server/catalog.mjs';
const read=name=>JSON.parse(readFileSync(new URL('../catalog/'+name,import.meta.url),'utf8'));
const pack=read('srd51-core-rules.json'),manifest=read('srd51-core-rules.coverage.json');

test('selected core rules have stable provenance, edition-specific limits and resolvable links',()=>{
 const entries=validateCatalog(pack),get=id=>entries.find(e=>e.id.endsWith(':'+id));
 assert.equal(entries.length,8);assert.equal(manifest.expectedSubsetCount,8);assert.equal(manifest.completeGameCatalog,false);
 assert.deepEqual(entries.map(e=>e.id).sort(),manifest.entries.map(e=>e.id).sort());
 for(const e of entries){const ref=manifest.entries.find(x=>x.id===e.id);assert.equal(e.name.en,ref.nameEn);assert.equal(e.source.url,manifest.sourceUrl+'#page='+ref.pages[0]);assert.equal(e.source.usage,'cc-by-4.0');assert.match(e.source.attribution,/Wizards of the Coast/);assert.ok(e.source.changes);assert.ok(e.mechanic.effects.every(x=>e.text.includes(x)));}
 assert.match(get('concentration').text,/каждый источник/);assert.match(get('concentration').text,/Сл 10 или половина/);
 assert.match(get('bonus-action-spell').text,/тому же ходу, а не всему раунду/);assert.match(get('ritual-casting').text,/на 10 минут больше/);
 assert.match(get('longer-casting').text,/ячейка не расходуется/);assert.match(get('spell-components').text,/компонент с указанной ценой нужен сам/);
 assert.match(get('death-saving-throws').text,/Натуральная 1 означает два провала/);assert.match(get('long-rest').text,/половины их общего числа/);
 const s=openStore(':memory:');try{const before=s.read();assert.throws(()=>s.catalog.importEntries(pack,{apply:true}),{status:422});assert.equal(s.catalog.coverage().total,0);
 const preview=s.catalog.previewBundled();s.catalog.installBundled({version:preview.version});assert.equal(s.catalog.importEntries({...pack,entries:[...pack.entries].reverse()},{apply:true}).unchanged,8);
 assert.deepEqual(s.read(),before);assert.deepEqual(s.history(),[]);
 }finally{s.close();}
});

test('mechanic sections reject invalid structure atomically while preserving condition compatibility',()=>{
 const s=openStore(':memory:');try{
 for(const mutate of [e=>e.mechanic.category='general',e=>e.mechanic.category='',e=>e.mechanic.effects=[],e=>e.mechanic.effects=['same',' same '],e=>e.mechanic.extra=true,e=>e.kind='item']){
 const e=structuredClone(pack.entries[2]);mutate(e);assert.throws(()=>s.catalog.importEntries({schemaVersion:1,entries:[pack.entries[4],e]},{apply:true}),{status:422});assert.equal(s.catalog.coverage().total,0);
 }
 const old=read('srd51-conditions.json');assert.equal(s.catalog.importEntries(old,{apply:true}).added,15);assert.equal(s.catalog.importEntries(old,{apply:true}).unchanged,15);
 }finally{s.close();}
});

test('mechanic section HTTP filter excludes unstructured references and rejects cross-category or duplicate values',async t=>{
 const s=openStore(':memory:');const p=s.catalog.previewBundled();s.catalog.installBundled({version:p.version});const app=createApp(s);await new Promise(r=>app.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>app.close(r));s.close();});
 const base=`http://127.0.0.1:${app.address().port}/api/catalog?`;
 for(const [section,count] of [['condition',15],['spellcasting',5],['combat',11],['rest',2]]){
 const response=await fetch(base+new URLSearchParams({kind:'mechanic',mechanicCategory:section}));assert.equal(response.status,200);const data=await response.json();assert.equal(data.total,count);assert.ok(data.entries.every(e=>e.mechanic.category===section));
 }
 const search=await fetch(base+new URLSearchParams({kind:'mechanic',mechanicCategory:'rest',q:'короткий'})).then(r=>r.json());assert.equal(search.total,1);assert.equal(search.entries[0].name.en,'Short Rest');
 for(const q of ['mechanicCategory=rest','kind=spell&mechanicCategory=rest','kind=mechanic&mechanicCategory=','kind=mechanic&mechanicCategory=unknown','kind=mechanic&mechanicCategory=rest&mechanicCategory=combat'])assert.equal((await fetch(base+q)).status,400);
});
