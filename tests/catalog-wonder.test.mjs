import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {openStore} from '../server/store.mjs';
import {validateCatalog} from '../server/catalog.mjs';
const read=name=>JSON.parse(readFileSync(new URL('../catalog/'+name,import.meta.url),'utf8'));
const pack=read('srd51-wonder.json'),manifest=read('srd51-wonder.coverage.json');

test('Wonder source ranges cover d100 once and animal ranges remain a separate roll',()=>{
 const entries=validateCatalog(pack);assert.equal(entries.length,7);assert.equal(manifest.expectedSubsetCount,7);assert.equal(manifest.completeGameCatalog,false);
 assert.deepEqual(entries.map(e=>e.id),manifest.entries.map(e=>e.id));
 for(const e of entries){const ref=manifest.entries.find(x=>x.id===e.id);assert.equal(e.source.url,manifest.sourceUrl+'#page='+ref.pages[0]);assert.equal(e.source.usage,'cc-by-4.0');}
 const wonder=entries.find(e=>e.name.en==='Wand of Wonder');
 const ranges=[...wonder.text.matchAll(/^(\d{2})–(\d{2}|100):/gm)].map(m=>[Number(m[1]),Number(m[2])]);
 assert.deepEqual(ranges,manifest.wonderRanges);assert.equal(ranges.length,22);
 for(const group of [ranges,manifest.animalRanges])assert.deepEqual(group.flatMap(([a,b])=>Array.from({length:b-a+1},(_,i)=>i+a)),Array.from({length:100},(_,i)=>i+1));
 assert.match(wonder.text,/01–25 носорог, 26–50 слон, 51–100 крыса/);
 assert.match(wonder.text,/провал|Провал/);assert.match(wonder.text,/Провал на 5 или больше/);assert.match(wonder.text,/1d4 × 10/);
 assert.deepEqual(entries.filter(e=>e.kind==='monster').map(e=>[e.name.en,e.monster.hitPoints,e.monster.challenge]),[['Elephant',76,'4'],['Rhinoceros',45,'2'],['Rat',1,'0']]);
 for(const [i,e] of entries.filter(e=>e.name.en.startsWith('Wand of the War Mage')).entries()){
  assert.equal(e.item.rarity,['uncommon','rare','very-rare'][i]);assert.equal(e.item.charges,undefined);assert.equal(e.item.attunementRequirement,'Заклинатель');assert.match(e.text,/Бонус не добавляется к Сл/);
 }
});

test('Wonder dependencies transfer with the saved item without rolling or creating game creatures',()=>{
 const source=openStore(':memory:'),target=openStore(':memory:');try{
  const original=source.read();source.catalog.installBundled({version:source.catalog.previewBundled().version});
  assert.equal(source.catalog.importEntries(pack,{apply:true}).unchanged,7);
  source.addInventory({mutationId:randomUUID(),expectedRevision:original.revision,characterId:original.context.characterId,catalogId:'srd51:2014:item:wand-of-wonder',quantity:1});
  assert.deepEqual(source.read().state,original.state);
  const file=source.exportActive(6);
  for(const name of ['Elephant','Rhinoceros','Rat','Greater Restoration','Petrified'])assert.ok(file.catalog.entries.some(e=>e.name.en===name),name);
  const request={mutationId:randomUUID(),expectedRevision:0,destination:'new-campaign',file};
  target.importActive(request);assert.equal(target.importActive(request).replayed,true);assert.deepEqual(target.inventory().entries,source.inventory().entries);assert.deepEqual(target.read().state,original.state);
  assert.throws(()=>target.catalog.importEntries(pack,{apply:true}),{status:422}); // War Mage requires Cover, outside Wonder's closure.
  target.catalog.importEntries({schemaVersion:1,entries:[source.catalog.lookup(new URLSearchParams({id:'srd51:2014:mechanic:cover'})).entry]},{apply:true});
  assert.equal(target.catalog.importEntries(pack,{apply:true}).added,3);
 }finally{source.close();target.close();}
});

test('Wonder import missing its animal links leaves both catalog and game unchanged',()=>{
 const s=openStore(':memory:');try{
  const before=s.read();assert.throws(()=>s.catalog.importEntries({schemaVersion:1,entries:pack.entries.filter(e=>e.kind==='item')},{apply:true}),{status:422});assert.equal(s.catalog.coverage().total,0);assert.deepEqual(s.read(),before);
 }finally{s.close();}
});
