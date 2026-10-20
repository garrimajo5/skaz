import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openStore} from '../server/store.mjs';
import {validateCatalog} from '../server/catalog.mjs';
const read=name=>JSON.parse(readFileSync(new URL('../catalog/'+name,import.meta.url),'utf8'));
const pack=read('srd51-elementals.json'),manifest=read('srd51-elementals.coverage.json');
test('elementals and awakened plants retain distinct statistics, provenance and summon links',()=>{
 const entries=validateCatalog(pack),get=en=>entries.find(e=>e.name.en===en);
 assert.equal(entries.length,6);assert.equal(manifest.expectedSubsetCount,6);assert.equal(manifest.completeGameCatalog,false);
 assert.deepEqual(entries.map(e=>e.id).sort(),manifest.entries.map(e=>e.id).sort());
 for(const e of entries){const ref=manifest.entries.find(x=>x.id===e.id);assert.equal(e.source.url,manifest.sourceUrl+'#page='+ref.pages[0]);assert.equal(e.source.usage,'cc-by-4.0');assert.match(e.source.attribution,/Wizards of the Coast/);assert.equal(e.name.en,ref.nameEn);}
 assert.deepEqual(get('Air Elemental').monster.speed,{walk:0,fly:90});assert.match(get('Air Elemental').text,/с парением/);
 assert.equal(get('Earth Elemental').monster.hitPoints,126);assert.match(get('Earth Elemental').text,/Уязвимость к звуку/);
 assert.match(get('Fire Elemental').text,/1 урона холодом/);assert.match(get('Water Elemental').text,/освобождение Сл 14/);assert.match(get('Water Elemental').text,/Силы Сл 15/);
 assert.equal(get('Awakened Shrub').monster.xp,10);assert.equal(get('Awakened Tree').monster.challenge,'2');
 const s=openStore(':memory:');try{const before=s.read(),p=s.catalog.previewBundled();s.catalog.installBundled({version:p.version});assert.equal(s.catalog.importEntries(pack,{apply:true}).unchanged,6);
 const elementals=s.catalog.search(new URLSearchParams({kind:'monster',monsterType:'elemental',challenge:'5'}));assert.equal(elementals.total,4);
 const plants=s.catalog.search(new URLSearchParams({kind:'monster',monsterType:'plant'}));assert.equal(plants.total,6);assert.deepEqual(plants.entries.map(e=>e.name.en).sort(),['Awakened Shrub','Awakened Tree','Shambling Mound','Shrieker','Treant','Violet Fungus']);
 const spells=read('srd51-level-five.json').entries;for(const [name,count] of [['Conjure Elemental',4],['Awaken',2]]){const spell=spells.find(e=>e.name.en===name);const linked=entries.filter(e=>spell.links.includes(e.id));assert.equal(linked.length,count);}
 assert.deepEqual(s.read(),before);assert.deepEqual(s.history(),[]);
 }finally{s.close();}
});
