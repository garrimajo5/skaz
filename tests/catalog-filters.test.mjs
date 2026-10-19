import test from 'node:test';
import assert from 'node:assert/strict';
import {openStore} from '../server/store.mjs';
import {createApp} from '../server/app.mjs';
import {readFileSync} from 'node:fs';
const read=name=>JSON.parse(readFileSync(new URL('../catalog/'+name+'.json',import.meta.url),'utf8'));
function setup(){const store=openStore(':memory:');for(const file of ['srd51-spells','srd51-items','srd51-monsters'])store.catalog.importEntries(read(file),{apply:true});return store;}
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
