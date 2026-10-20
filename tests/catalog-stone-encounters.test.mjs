import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {openStore} from '../server/store.mjs';import {validateCatalog} from '../server/catalog.mjs';
const read=name=>JSON.parse(readFileSync(new URL('../catalog/'+name,import.meta.url),'utf8'));
const pack=read('srd51-stone-encounters.json'),manifest=read('srd51-stone-encounters.coverage.json');
test('stone creatures retain petrification timing and the adamantine exception from 2014',()=>{
 const entries=validateCatalog(pack);assert.equal(entries.length,2);assert.equal(manifest.expectedSubsetCount,2);assert.equal(manifest.completeGameCatalog,false);
 assert.deepEqual(entries.map(e=>[e.name.en,e.monster.armorClass,e.monster.hitPoints,e.monster.challenge,e.monster.xp]),[['Basilisk',15,52,'3',700],['Gargoyle',15,52,'2',450]]);
 for(const e of entries){const row=manifest.entries.find(r=>r.id===e.id);assert.equal(e.ruleset,'5e-2014');assert.equal(row.nameEn,e.name.en);assert.equal(e.source.url,manifest.sourceUrl+'#page='+row.pages[0]);assert.equal(e.source.usage,'cc-by-4.0');assert.match(e.source.changes,/не официальный перевод/);}
 const [basilisk,gargoyle]=entries;assert.match(basilisk.text,/начинает ход в пределах 30 футов.*видят друг друга/);assert.match(basilisk.text,/В конце своего следующего хода/);assert.match(basilisk.text,/не застигнута врасплох/);assert.match(basilisk.text,/отражение.*при ярком свете/);assert.match(gargoyle.text,/немагических атак, не являющихся адамантиновыми/);assert.equal(gargoyle.monster.speed.fly,60);assert.equal(gargoyle.monster.type,'elemental');
});
test('stone import repeats safely and all spell and condition references resolve',()=>{
 const s=openStore(':memory:');try{const before=s.read(),p=s.catalog.previewBundled();s.catalog.installBundled({version:p.version});assert.equal(s.catalog.importEntries(pack,{apply:true}).unchanged,2);
 for(const entry of pack.entries){const found=s.catalog.lookup(new URLSearchParams({id:entry.id}));assert.deepEqual(found.related.map(e=>e.id).sort(),entry.links.toSorted());}
 assert.deepEqual(s.read(),before);assert.deepEqual(s.history(),[]);
 }finally{s.close();}
});
