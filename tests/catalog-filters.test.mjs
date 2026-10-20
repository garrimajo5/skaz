import test from 'node:test';
import assert from 'node:assert/strict';
import {openStore} from '../server/store.mjs';
import {createApp} from '../server/app.mjs';
import {readFileSync} from 'node:fs';
const read=name=>JSON.parse(readFileSync(new URL('../catalog/'+name+'.json',import.meta.url),'utf8'));
function setup(){const store=openStore(':memory:');for(const file of ['srd51-spells','srd51-items','srd51-monsters'])store.catalog.importEntries(read(file),{apply:true});return store;}

test('challenge ranges compare fractions numerically, include boundaries and exclude unknown statistics',()=>{
 const s=openStore(':memory:');try{
 const base=read('srd51-monsters').entries[0],values=['0','1/8','1/4','1/2','2','10'];const entries=values.map((cr,i)=>({...structuredClone(base),id:'range:monster:'+i,name:{ru:'Диапазон '+i,en:'Range '+i},monster:{...base.monster,challenge:cr}}));const unknown={...structuredClone(base),id:'range:unknown'};delete unknown.monster;s.catalog.importEntries({schemaVersion:1,entries:[...entries,unknown]},{apply:true});const before=s.read(),search=q=>s.catalog.search(new URLSearchParams('kind=monster&'+q));
 assert.deepEqual(search('challengeMin=1%2F8&challengeMax=1%2F2').entries.map(e=>e.monster.challenge),['1/8','1/4','1/2']);assert.deepEqual(search('challengeMin=0&challengeMax=0').entries.map(e=>e.monster.challenge),['0']);assert.deepEqual(search('challengeMax=2').entries.map(e=>e.monster.challenge),['0','1/8','1/4','1/2','2']);assert.equal(search('challengeMin=1%2F2').total,3);assert.equal(search('challenge=1%2F4').total,1);
 const page=search('challengeMin=1%2F8&challengeMax=2&limit=1&offset=1');assert.equal(page.total,4);assert.equal(page.entries[0].monster.challenge,'1/4');assert.deepEqual(s.read(),before);assert.deepEqual(s.history(),[]);
 for(const q of ['challengeMin=1/2&challengeMax=1/4','challenge=1&challengeMax=2','challenge=0&challengeMin=0','challengeMin=','challengeMax=0.25','challengeMin=01','challengeMax=31','challengeMin=1/3','challengeMax=NaN','challengeMin=1e1','challengeMin=1&challengeMin=2'])assert.throws(()=>search(q),{status:400},q);
 for(const q of ['challengeMin=0','kind=spell&challengeMax=2','kind=item&challengeMin=1/8'])assert.throws(()=>s.catalog.search(new URLSearchParams(q)),{status:400},q);
 }finally{s.close();}
});

test('HTTP challenge bounds combine with type, size and text without changing progress',async t=>{
 const s=openStore(':memory:'),preview=s.catalog.previewBundled();s.catalog.installBundled({version:preview.version});const before=s.read(),app=createApp(s);await new Promise(r=>app.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>app.close(r));s.close();});const base='http://127.0.0.1:'+app.address().port+'/api/catalog';
 const result=await fetch(base+'?kind=monster&monsterType=ooze&size=large&challengeMin=2&challengeMax=4').then(r=>r.json());assert.deepEqual(result.entries.map(e=>e.name.en).sort(),['Black Pudding','Gelatinous Cube','Ochre Jelly']);assert.equal((await fetch(base+'?kind=monster&challengeMin=2&challengeMax=1')).status,400);assert.equal((await fetch(base+'?kind=monster&challengeMax=4',{headers:{Origin:'https://foreign.invalid'}})).status,403);assert.deepEqual(s.read(),before);
});
test('structured filters combine with bilingual name, category and pagination, exclude missing metadata',()=>{
 const s=setup();try{
 const base=read('srd51-spells').entries[0];const zero={...structuredClone(base),id:'test:cantrip',name:{ru:'Тестовый заговор',en:'Test cantrip'}};zero.spell.level=0;
 const missing={...structuredClone(base),id:'test:no-level',name:{ru:'Нет уровня',en:'Unknown level'}};delete missing.spell;
 s.catalog.importEntries({schemaVersion:1,entries:[zero,missing]},{apply:true});
 const search=q=>s.catalog.search(new URLSearchParams(q));
 assert.equal(search('kind=spell&level=0').entries[0].id,'test:cantrip');assert.equal(search('kind=spell&level=1').total,2);assert.equal(search('kind=spell').total,4);
 assert.equal(search('kind=spell&level=1&q=HEALING').total,1);assert.equal(search('kind=spell&level=1&q=лечение').total,1);
 const first=search('kind=spell&level=1&limit=1');const second=search('kind=spell&level=1&limit=1&offset=1');assert.equal(first.total,2);assert.notEqual(first.entries[0].id,second.entries[0].id);
 assert.equal(search('kind=monster&challenge=1%2F4').total,2);assert.equal(search('kind=monster&challenge=0').total,0);
 assert.equal(search('kind=item&rarity=common').entries[0].name.en,'Potion of Healing');assert.equal(search('kind=item&rarity=legendary').total,0);
 }finally{s.close();}
});
test('invalid, duplicate and cross-category filters are rejected rather than silently ignored',()=>{
 const s=setup();try{for(const q of ['level=1','kind=item&level=1','kind=spell&level=01','kind=spell&level=-1','kind=spell&level=10','kind=spell&level=','kind=spell&level=1&level=2','kind=monster&challenge=0.25','kind=monster&challenge=31','kind=monster&challenge=1/3','kind=item&rarity=artifact','kind=artifact&rarity=legendary','kind=spell&level=1&rarity=rare','kind=monster&challenge=1/4&challenge=1/2'])assert.throws(()=>s.catalog.search(new URLSearchParams(q)),{status:400},q);}finally{s.close();}
});
test('HTTP catalog exposes structured filters and preserves progress',async t=>{
 const s=setup(),before=s.read(),app=createApp(s);await new Promise(r=>app.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>app.close(r));s.close();});
 const url=`http://127.0.0.1:${app.address().port}/api/catalog`;
 const value=await fetch(url+'?kind=monster&challenge=1%2F4').then(r=>r.json());assert.equal(value.total,2);assert.equal((await fetch(url+'?kind=spell&level=9')).status,200);assert.equal((await fetch(url+'?kind=spell&level=99')).status,400);const inventory=await fetch(url+'/spell-inventory').then(r=>r.json());assert.equal(inventory.entries.length,319);assert.equal(inventory.entries.filter(e=>e.status==='installed').length,2);assert.equal((await fetch(url+'/spell-inventory',{headers:{Origin:'https://foreign.example'}})).status,403);assert.deepEqual(s.read(),before);
});

test('spell school and explicit false flags intersect, exclude unknown fields and retain stable paging',()=>{
 const s=openStore(':memory:');try{const p=s.catalog.previewBundled();s.catalog.installBundled({version:p.version});
 const raw=structuredClone(read('srd51-spells').entries[0]);raw.id='test:unknown:spell';delete raw.spell;s.catalog.importEntries({schemaVersion:1,entries:[raw]},{apply:true});const before=s.read();
 const search=q=>s.catalog.search(new URLSearchParams(q));
 const ritual=search('kind=spell&level=1&school=divination&ritual=true&concentration=false');assert.deepEqual(ritual.entries.map(e=>e.name.en).sort(),['Comprehend Languages','Identify','Speak with Animals']);
 const noConc=search('kind=spell&concentration=false&limit=100');assert.ok(noConc.total>0);assert.ok(noConc.entries.every(e=>e.spell?.concentration===false));assert.ok(!noConc.entries.some(e=>e.id===raw.id));
 const first=search('kind=spell&ritual=true&limit=1'),second=search('kind=spell&ritual=true&limit=1&offset=1');assert.equal(first.total,second.total);assert.notEqual(first.entries[0].id,second.entries[0].id);
 assert.equal(search('kind=spell&level=0&ritual=true').total,0);assert.equal(search('kind=spell&school=abjuration&ritual=false&q=shield').total,2);
 for(const q of ['school=illusion','kind=item&ritual=true','kind=spell&school=unknown','kind=spell&school=','kind=spell&ritual=0','kind=spell&ritual=False','kind=spell&concentration=','kind=spell&concentration=true&concentration=false','kind=spell&school=illusion&school=evocation'])assert.throws(()=>search(q),{status:400},q);
 assert.deepEqual(s.read(),before);
 }finally{s.close();}
});

test('bestiary type and size intersect with challenge, exclude unknown metadata and reject invalid scopes',()=>{
 const s=openStore(':memory:');try{const p=s.catalog.previewBundled();s.catalog.installBundled({version:p.version});const before=s.read();
 const raw=structuredClone(read('srd51-monsters').entries[0]);raw.id='test:unknown:monster';delete raw.monster;s.catalog.importEntries({schemaVersion:1,entries:[raw]},{apply:true});
 const search=q=>s.catalog.search(new URLSearchParams(q));
 assert.deepEqual(search('kind=monster&monsterType=beast&size=medium&challenge=1%2F8').entries.map(e=>e.name.en).sort(),['Mastiff','Pony']);
 assert.equal(search('kind=monster&monsterType=undead&q=Skeleton').total,1);
 assert.equal(search('kind=monster&monsterType=beast&size=gargantuan').total,0);
 assert.ok(search('kind=monster&size=small').entries.every(e=>e.monster?.size==='small'));
 const a=search('kind=monster&monsterType=beast&limit=1'),b=search('kind=monster&monsterType=beast&limit=1&offset=1');assert.equal(a.total,b.total);assert.notEqual(a.entries[0].id,b.entries[0].id);
 for(const q of ['monsterType=beast','kind=spell&monsterType=beast','kind=monster&monsterType=unknown','kind=monster&size=','kind=monster&size=Large','kind=item&size=large','kind=monster&size=small&size=large'])assert.throws(()=>search(q),{status:400},q);
 assert.deepEqual(s.read(),before);
 }finally{s.close();}
});

test('item type and attunement false are exact, combinable with rarity, and exclude unstructured entries',()=>{
 const s=openStore(':memory:');try{const p=s.catalog.previewBundled();s.catalog.installBundled({version:p.version});const before=s.read();
 const unknown=structuredClone(read('srd51-items').entries[0]);unknown.id='test:unknown:item';delete unknown.item;s.catalog.importEntries({schemaVersion:1,entries:[unknown]},{apply:true});
 const search=q=>s.catalog.search(new URLSearchParams(q));
 assert.deepEqual(search('kind=item&itemType=ring&attunement=false&rarity=uncommon').entries.map(e=>e.name.en),['Ring of Swimming','Ring of Water Walking']);
 assert.equal(search('kind=item&itemType=potion&attunement=false').total,4);assert.equal(search('kind=item&itemType=potion&attunement=true').total,0);
 const a=search('kind=item&attunement=false&limit=1'),b=search('kind=item&attunement=false&limit=1&offset=1');assert.equal(a.total,b.total);assert.notEqual(a.entries[0].id,b.entries[0].id);
 assert.ok(search('kind=item&attunement=false&limit=100').entries.every(e=>e.item?.attunement===false));
 for(const q of ['itemType=ring','kind=artifact&itemType=ring','kind=spell&attunement=false','kind=item&itemType=other','kind=item&attunement=0','kind=item&attunement=','kind=item&attunement=true&attunement=false'])assert.throws(()=>search(q),{status:400},q);
 assert.deepEqual(s.read(),before);
 }finally{s.close();}
});
