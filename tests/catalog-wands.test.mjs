import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {openStore} from '../server/store.mjs';
import {validateCatalog} from '../server/catalog.mjs';
const read=name=>JSON.parse(readFileSync(new URL('../catalog/'+name,import.meta.url),'utf8'));
const pack=read('srd51-wands.json'),manifest=read('srd51-wands.coverage.json');

test('wand metadata distinguishes three-charge tools, spellcaster requirements and last-charge destruction',()=>{
 const entries=validateCatalog(pack);assert.equal(entries.length,11);assert.equal(manifest.expectedSubsetCount,11);assert.equal(manifest.completeGameCatalog,false);
 for(const e of entries){
  const ref=manifest.entries.find(x=>x.id===e.id);assert.equal(e.name.en,ref.nameEn);assert.equal(e.source.url,manifest.sourceUrl+'#page='+ref.pages[0]);assert.equal(e.source.usage,'cc-by-4.0');assert.match(e.source.attribution,/Wizards of the Coast/);
  assert.equal(e.item.type,'wand');const simple=['Wand of Secrets','Wand of Magic Detection'].includes(e.name.en);
  assert.equal(e.item.charges.max,simple?3:7);assert.match(e.item.charges.recharge,simple?/1d3/:/1d6 \+ 1/);
  if(simple)assert.doesNotMatch(e.text,/уничтожается/);else assert.match(e.text,/на 1 .*уничтожается/);
 }
 const get=name=>entries.find(e=>e.name.en===name);
 assert.equal(get('Wand of Magic Missiles').item.attunement,false);assert.equal(get('Wand of Enemy Detection').item.attunementRequirement,undefined);
 assert.equal(get('Wand of Web').item.attunementRequirement,'Заклинатель');assert.equal(get('Wand of Polymorph').item.rarity,'very-rare');
 assert.match(get('Wand of Binding').text,/5 зарядов.*2 заряда.*Сл спасброска 17/);
 assert.match(get('Wand of Fear').text,/не совершает реакции/);assert.match(get('Wand of Fear').text,/в пределах|в пределы/);
 assert.match(get('Wand of Paralysis').text,/Телосложения Сл 15/);assert.match(get('Wand of Fireballs').text,/3-й уровень/);assert.match(get('Wand of Magic Missiles').text,/1-й уровень/);
});

test('charge definitions reject malformed quantities and retain old item and artifact contracts',()=>{
 const target=pack.entries[0];
 for(const charges of [null,[],{}, {max:0,recharge:'dawn'},{max:1.5,recharge:'dawn'},{max:'7',recharge:'dawn'}, {max:10001,recharge:'dawn'}, {max:7,recharge:''},{max:7,recharge:'dawn',current:3}]){
  assert.throws(()=>validateCatalog({schemaVersion:1,entries:[{...target,item:{...target.item,charges}}]}),{status:422});
 }
 const old=validateCatalog(read('srd51-items.json'));assert.ok(old.every(e=>!Object.hasOwn(e.item,'charges')));
 const artifact=validateCatalog(read('srd51-artifacts.json'))[0];assert.equal(artifact.artifact.charges.max,7);
 const s=openStore(':memory:');try{const bad={...target,item:{...target.item,charges:{max:-1,recharge:'dawn'}}};assert.throws(()=>s.catalog.importEntries({schemaVersion:1,entries:[read('srd51-items.json').entries[0],bad]},{apply:true}),{status:422});assert.equal(s.catalog.coverage().total,0);}finally{s.close();}
});

test('wand inventory and export retain reference charges without spending spells or charges on addition',()=>{
 const s=openStore(':memory:');try{const p=s.catalog.previewBundled();s.catalog.installBundled({version:p.version});const before=s.read();
  const id='srd51:2014:item:wand-of-web';s.addInventory({mutationId:randomUUID(),expectedRevision:before.revision,characterId:before.context.characterId,catalogId:id,quantity:1});
  assert.deepEqual(s.read().state,before.state);assert.equal(s.inventory().entries[0].entry.item.charges.max,7);
  const exported=s.exportActive(6);assert.ok(exported.catalog.entries.some(e=>e.name.en==='Web'));assert.ok(exported.catalog.entries.some(e=>e.name.en==='Concentration'));
  assert.equal(s.catalog.importEntries(pack,{apply:true}).unchanged,11);assert.deepEqual(s.exportActive(6).catalog,exported.catalog);
 }finally{s.close();}
});

test('charged item transfer preserves snapshots and dependencies, replays once and rejects a forged current balance',()=>{
 const source=openStore(':memory:'),target=openStore(':memory:');try{
  source.catalog.installBundled({version:source.catalog.previewBundled().version});
  const before=source.read();source.addInventory({mutationId:randomUUID(),expectedRevision:before.revision,characterId:before.context.characterId,catalogId:'srd51:2014:item:wand-of-web',quantity:2});
  const file=JSON.parse(JSON.stringify(source.exportActive(6)));
  const request={mutationId:randomUUID(),expectedRevision:target.read().revision,destination:'new-campaign',file};
  target.importActive(request);assert.equal(target.importActive(request).replayed,true);
  assert.equal(target.campaigns().length,2);assert.deepEqual(target.inventory().entries,source.inventory().entries);
  assert.deepEqual(target.read().state,before.state);assert.deepEqual(target.exportActive(6).catalog,file.catalog);
  const copy=structuredClone(file);copy.catalog.entries.find(e=>e.kind==='item').item.charges.current=3;
  const stable=target.read(),count=target.catalog.coverage().total;
  assert.throws(()=>target.importActive({...request,mutationId:randomUUID(),expectedRevision:stable.revision,file:copy}),{status:422});
  assert.deepEqual(target.read(),stable);assert.equal(target.campaigns().length,2);assert.equal(target.catalog.coverage().total,count);
 }finally{source.close();target.close();}
});
