import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openStore} from '../server/store.mjs';
import {validateCatalog} from '../server/catalog.mjs';
const read=name=>JSON.parse(readFileSync(new URL('../catalog/'+name,import.meta.url),'utf8'));
const pack=read('srd51-steeds.json'),manifest=read('srd51-steeds.coverage.json');
test('Find Steed links all five reviewed base beasts without applying summoned changes to catalog data',()=>{
 const entries=validateCatalog(pack),spell=read('srd51-level-two.json').entries.find(e=>e.name.en==='Find Steed');
 assert.equal(entries.length,5);assert.equal(manifest.expectedSubsetCount,5);assert.equal(manifest.completeGameCatalog,false);
 assert.deepEqual([...spell.links].sort(),entries.map(e=>e.id).sort());
 for(const e of entries){assert.equal(e.monster.type,'beast');assert.ok(e.monster.abilities.int<6);assert.equal(e.source.usage,'cc-by-4.0');const ref=manifest.entries.find(r=>r.id===e.id);assert.ok(e.source.url.endsWith('#page='+ref.pages[0]));assert.match(e.text,/исходную форму/);}
 const horse=entries.find(e=>e.name.en==='Warhorse');assert.equal(horse.monster.hitPoints,19);assert.equal(horse.monster.speed.walk,60);assert.equal(horse.monster.challenge,'1/2');assert.equal(horse.monster.xp,100);assert.match(horse.text,/Сл 14/);
 const camel=entries.find(e=>e.name.en==='Camel');assert.equal(camel.monster.armorClass,9);assert.match(camel.text,/2 \(1d4\) дробящего/);
});
test('steed dependencies resolve in bundled install, replay does not duplicate, fractional challenge search works',()=>{
 const s=openStore(':memory:');try{const before=s.read();assert.throws(()=>s.catalog.importEntries(pack,{apply:true}),{status:422});assert.equal(s.catalog.coverage().total,0);
 const p=s.catalog.previewBundled();s.catalog.installBundled({version:p.version});assert.equal(s.catalog.importEntries(pack,{apply:true}).unchanged,5);
 const found=s.catalog.search(new URLSearchParams('kind=monster&challenge=1%2F8&limit=100')).entries;
 for(const name of ['Pony','Mastiff','Camel'])assert.ok(found.some(e=>e.name.en===name));
 const detail=s.catalog.lookup(new URLSearchParams({id:'srd51:2014:spell:find-steed'}));assert.equal(detail.related.length,5);assert.ok(detail.related.every(e=>e.kind==='monster'));
 assert.deepEqual(s.read(),before);assert.deepEqual(s.history(),[]);
 }finally{s.close();}
});
