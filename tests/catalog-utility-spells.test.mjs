import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openStore} from '../server/store.mjs';
import {validateCatalog} from '../server/catalog.mjs';
const read=name=>JSON.parse(readFileSync(new URL('../catalog/'+name,import.meta.url),'utf8'));
const bundle=read('srd51-utility-spells.json'),manifest=read('srd51-utility-spells.coverage.json');
test('utility spell subset has audited IDs, page references and 2014 metadata',()=>{
 const entries=validateCatalog(bundle);assert.equal(entries.length,10);assert.equal(manifest.expectedSubsetCount,10);assert.equal(manifest.completeGameCatalog,false);
 assert.deepEqual(entries.map(e=>e.id).sort(),manifest.entries.map(e=>e.id).sort());
 for(const e of entries){const audit=manifest.entries.find(a=>a.id===e.id);assert.equal(e.ruleset,'5e-2014');assert.equal(e.source.usage,'cc-by-4.0');assert.match(e.source.attribution,/Wizards of the Coast/);assert.equal(e.name.en,audit.nameEn);assert.ok(e.source.url.endsWith('#page='+audit.pages[0]));assert.ok(e.name.ru&&e.source.changes&&e.source.version);}
 const get=slug=>entries.find(e=>e.id.endsWith(':'+slug));
 assert.equal(get('vicious-mockery').spell.level,0);assert.match(get('vicious-mockery').text,/1d4/);assert.match(get('vicious-mockery').text,/4d4/);
 assert.equal(get('detect-magic').spell.ritual,true);assert.equal(get('detect-magic').spell.concentration,true);assert.equal(get('mage-hand').spell.concentration,false);
 assert.equal(get('mending').spell.castingTime,'1 минута');assert.deepEqual(get('minor-illusion').spell.components,['M','S']);assert.equal(get('feather-fall').spell.range.feet,60);assert.match(get('feather-fall').spell.castingTime,/реакция/);
});
test('new subset extends existing spells without replacement and repeated import has no side effects',()=>{
 const s=openStore(':memory:');try{
 const old=read('srd51-spells.json');s.catalog.importEntries(old,{apply:true});const before=s.read();
 assert.equal(s.catalog.importEntries(bundle).added,10);assert.equal(s.catalog.coverage().structuredSpells,2);
 assert.equal(s.catalog.importEntries(bundle,{apply:true}).added,10);assert.equal(s.catalog.importEntries(bundle,{apply:true}).unchanged,10);assert.equal(s.catalog.coverage().structuredSpells,12);
 assert.equal(s.catalog.search(new URLSearchParams('kind=spell&level=0')).total,8);assert.equal(s.catalog.search(new URLSearchParams('kind=spell&level=1')).total,4);
 assert.equal(s.catalog.importEntries(old,{apply:true}).unchanged,2);assert.deepEqual(s.read(),before);
 }finally{s.close();}
});

test('SRD inventory counts prepared and exact installed records without claiming full D&D coverage',()=>{
 const index=read('srd51-spells.index.json');assert.equal(index.count,319);assert.equal(index.entries.length,319);assert.equal(new Set(index.entries.map(e=>e.id)).size,319);
 assert.equal(index.entries[0].nameEn,'Acid Arrow');assert.equal(index.entries.at(-1).nameEn,'Zone of Truth');
 for(const e of index.entries)assert.ok(e.page>=114&&e.page<=193);
 const s=openStore(':memory:');try{
 assert.deepEqual([s.catalog.coverage().scopes.srd51Spells.expected,s.catalog.coverage().scopes.srd51Spells.prepared,s.catalog.coverage().scopes.srd51Spells.installed],[319,12,0]);
 const altered=structuredClone(bundle.entries[0]);altered.text='Locally changed';s.catalog.importEntries({schemaVersion:1,entries:[altered]},{apply:true});assert.equal(s.catalog.coverage().scopes.srd51Spells.installed,0);
 s.catalog.importEntries({schemaVersion:1,entries:bundle.entries.slice(1)},{apply:true});assert.equal(s.catalog.coverage().scopes.srd51Spells.installed,9);assert.equal(s.catalog.coverage().expectedTotal,null);assert.equal(s.catalog.coverage().complete,false);
 }finally{s.close();}
});

test('spell inventory distinguishes missing, installable, installed and conflicting records without modifying progress',()=>{
 const s=openStore(':memory:');try{
 const before=s.read(), index=s.catalog.spellInventory();assert.equal(index.entries.length,319);assert.equal(index.entries.filter(e=>e.status==='prepared').length,12);assert.equal(index.entries.filter(e=>e.status==='missing').length,307);
 const changed=structuredClone(bundle.entries[0]);changed.text='Personal revision';s.catalog.importEntries({schemaVersion:1,entries:[changed]},{apply:true});s.catalog.importEntries({schemaVersion:1,entries:bundle.entries.slice(1)},{apply:true});
 const result=s.catalog.spellInventory();assert.equal(result.entries.filter(e=>e.status==='installed').length,9);assert.equal(result.entries.find(e=>e.id===changed.id).status,'conflict');assert.equal(result.entries.filter(e=>e.status==='prepared').length,2);assert.ok(result.entries.find(e=>e.status==='missing').nameRu===null);assert.deepEqual(s.read(),before);
 }finally{s.close();}
});
