import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {openStore} from '../server/store.mjs';import {validateCatalog} from '../server/catalog.mjs';
const read=name=>JSON.parse(readFileSync(new URL('../catalog/'+name,import.meta.url),'utf8')),pack=read('srd51-humanoid-encounters.json'),manifest=read('srd51-humanoid-encounters.coverage.json');
test('four humanoids retain 2014 equipment, conditional damage and precise action restrictions',()=>{
 const entries=validateCatalog(pack);assert.equal(entries.length,4);assert.equal(manifest.expectedSubsetCount,4);assert.equal(manifest.completeGameCatalog,false);assert.equal(new Set(manifest.entries.map(e=>e.id)).size,4);
 assert.deepEqual(entries.map(e=>[e.name.en,e.monster.armorClass,e.monster.hitPoints,e.monster.challenge,e.monster.xp]),[['Bugbear',16,27,'1',200],['Gnoll',15,22,'1/2',100],['Hobgoblin',18,11,'1/2',100],['Lizardfolk',15,22,'1/2',100]]);
 for(const e of entries){const row=manifest.entries.find(r=>r.id===e.id);assert.equal(row.nameEn,e.name.en);assert.equal(e.ruleset,'5e-2014');assert.equal(e.monster.type,'humanoid');assert.equal(e.source.usage,'cc-by-4.0');assert.equal(e.source.url,manifest.sourceUrl+'#page='+row.pages[0]);assert.match(e.source.attribution,/Wizards of the Coast/);assert.match(e.text,/щит/);}
 const get=name=>entries.find(e=>e.name.en===name);assert.match(get('Bugbear').text,/уже включена/);assert.match(get('Bugbear').text,/врасплох.*в первом раунде/);assert.match(get('Bugbear').text,/9 \(2d6 \+ 2\).*5 \(1d6 \+ 2\)/);assert.match(get('Gnoll').text,/до 0 рукопашной атакой в свой ход/);assert.match(get('Gnoll').text,/до половины своей скорости/);assert.match(get('Hobgoblin').text,/один раз за ход/);assert.match(get('Hobgoblin').text,/не недееспособен/);assert.match(get('Lizardfolk').text,/каждая разным оружием/);assert.match(get('Lizardfolk').text,/15 минут/);
});
test('humanoid import repeats safely and fractional challenge and condition links remain readable',()=>{
 const s=openStore(':memory:');try{const before=s.read(),p=s.catalog.previewBundled();s.catalog.installBundled({version:p.version});assert.equal(s.catalog.importEntries(pack,{apply:true}).unchanged,4);
 const found=s.catalog.search(new URLSearchParams({kind:'monster',challenge:'1/2',limit:'100'})).entries;for(const en of ['Gnoll','Hobgoblin','Lizardfolk'])assert.ok(found.some(e=>e.name.en===en));
 const hob=s.catalog.lookup(new URLSearchParams({id:'srd51:2014:monster:hobgoblin'}));assert.equal(hob.related[0].id,'srd51:2014:mechanic:incapacitated');assert.deepEqual(s.read(),before);assert.deepEqual(s.history(),[]);
 }finally{s.close();}
});
