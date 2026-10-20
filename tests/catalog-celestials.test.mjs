import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openStore} from '../server/store.mjs';
import {validateCatalog} from '../server/catalog.mjs';
const read=name=>JSON.parse(readFileSync(new URL('../catalog/'+name,import.meta.url),'utf8'));
const pack=read('srd51-celestials.json'),manifest=read('srd51-celestials.coverage.json');
test('celestial forms retain source statistics, innate components and legendary action costs',()=>{
 const entries=validateCatalog(pack),get=name=>entries.find(e=>e.name.en===name);
 assert.equal(entries.length,3);assert.equal(manifest.expectedSubsetCount,3);assert.equal(manifest.completeGameCatalog,false);
 for(const e of entries){const ref=manifest.entries.find(x=>x.id===e.id);assert.equal(ref.nameEn,e.name.en);assert.equal(e.source.url,manifest.sourceUrl+'#page='+ref.pages[0]);assert.equal(e.source.usage,'cc-by-4.0');assert.equal(e.monster.type,'celestial');}
 assert.deepEqual(entries.map(e=>[e.name.en,e.monster.armorClass,e.monster.hitPoints,e.monster.challenge,e.monster.xp]),[['Couatl',19,97,'4',1100],['Pegasus',12,59,'2',450],['Unicorn',12,67,'5',1800]]);
 assert.match(get('Couatl').text,/нужны только вербальные компоненты/);assert.match(get('Couatl').text,/разбудить/);assert.match(get('Couatl').text,/освобождением Сл 15/);
 assert.equal(get('Pegasus').monster.speed.fly,90);assert.match(get('Pegasus').text,/но не говорит/);
 assert.match(get('Unicorn').text,/без компонентов/);assert.match(get('Unicorn').text,/цена 2/);assert.match(get('Unicorn').text,/цена 3/);assert.match(get('Unicorn').text,/ячейка 8-го предел не повышает/);
});
test('celestial summon links eligible forms without applying spells or resources',()=>{
 const s=openStore(':memory:');try{const before=s.read(),p=s.catalog.previewBundled();s.catalog.installBundled({version:p.version});
 const detail=s.catalog.lookup(new URLSearchParams({id:'srd51:2014:spell:conjure-celestial'}));assert.deepEqual(detail.related.filter(e=>e.kind==='monster').map(e=>e.name.en),['Couatl','Pegasus','Unicorn']);assert.match(detail.entry.text,/Только ячейка 9-го/);
 assert.equal(s.catalog.search(new URLSearchParams({kind:'monster',monsterType:'celestial'})).total,6);assert.equal(s.catalog.importEntries(pack,{apply:true}).unchanged,3);
 for(const e of pack.entries)assert.equal(s.catalog.lookup(new URLSearchParams({id:e.id})).related.length,e.links.length);
 assert.deepEqual(s.read(),before);assert.deepEqual(s.history(),[]);
 }finally{s.close();}
});
