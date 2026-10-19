import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {openStore} from '../server/store.mjs';
import {validateCatalog} from '../server/catalog.mjs';
const read=name=>JSON.parse(readFileSync(new URL('../catalog/'+name,import.meta.url),'utf8'));
const rules=read('srd51-equipment-rules.json'),items=read('srd51-protective-items.json');

test('equipment rules and items retain source coverage and nonautomatic effects',()=>{
 for(const [file,pack,count] of [['srd51-equipment-rules',rules,6],['srd51-protective-items',items,17]]){
  const entries=validateCatalog(pack),manifest=read(file+'.coverage.json');
  assert.equal(entries.length,count);assert.equal(manifest.expectedSubsetCount,count);assert.equal(manifest.completeGameCatalog,false);
  assert.deepEqual(entries.map(e=>e.id),manifest.entries.map(e=>e.id));
  for(const e of entries){const ref=manifest.entries.find(x=>x.id===e.id);assert.equal(e.name.en,ref.nameEn);assert.equal(e.source.url,manifest.sourceUrl+'#page='+ref.pages[0]);assert.equal(e.source.usage,'cc-by-4.0');assert.match(e.source.attribution,/Wizards of the Coast/);assert.match(e.text,/автоматически/);}
 }
 const byName=name=>items.entries.find(e=>e.name.en===name);
 assert.deepEqual(byName('Pearl of Power').item,{type:'wondrous',rarity:'uncommon',attunement:true,attunementRequirement:'Заклинатель'});
 assert.match(byName('Pearl of Power').text,/4-го уровня или выше.*3-й уровень/);
 assert.match(byName('Ring of Warmth').text,/−50 °F/);assert.match(byName('Ring of Warmth').text,/не иммунитет/);
 assert.equal(byName('Ring of Swimming').item.attunement,false);assert.match(byName('Cloak of the Manta Ray').text,/60 футов/);
 assert.match(byName('Adamantine Armor').text,/кроме шкурного/);assert.match(byName('Cloak of Displacement').text,/до начала твоего следующего хода/);
 const attune=rules.entries.find(e=>e.name.en==='Attunement');assert.match(attune.text,/не более чем на три/);assert.match(attune.text,/100 футов.*24 часов/);assert.match(attune.text,/если он не проклят/);
});

test('new items link to mechanics, survive inventory export and repeat without applying bonuses',()=>{
 const s=openStore(':memory:');try{
  const original=s.read(),preview=s.catalog.previewBundled();s.catalog.installBundled({version:preview.version});
  assert.deepEqual(s.read(),original);assert.equal(s.catalog.importEntries(items,{apply:true}).unchanged,17);
  assert.equal(s.catalog.importEntries(rules,{apply:true}).unchanged,6);
  const id='srd51:2014:item:pearl-of-power',detail=s.catalog.lookup(new URLSearchParams({id}));
  assert.ok(detail.related.some(e=>e.name.en==='Attunement'));
  const request={mutationId:randomUUID(),expectedRevision:s.read().revision,characterId:s.read().context.characterId,catalogId:id,quantity:1};
  s.addInventory(request);assert.equal(s.addInventory(request).replayed,true);assert.deepEqual(s.read().state,original.state);
  const file=s.exportActive(6);assert.ok(file.catalog.entries.some(e=>e.name.en==='Short Rest'));assert.ok(file.catalog.entries.some(e=>e.name.en==='Silence'));
  assert.equal(s.inventory().entries[0].entry.item.attunementRequirement,'Заклинатель');
 }finally{s.close();}
});

test('equipment subset import rolls back if a spell dependency is missing',()=>{
 const s=openStore(':memory:');try{
  assert.throws(()=>s.catalog.importEntries({schemaVersion:1,entries:[...rules.entries,...items.entries]},{apply:true}),{status:422});
  assert.equal(s.catalog.coverage().total,0);assert.equal(s.read().revision,0);
 }finally{s.close();}
});
