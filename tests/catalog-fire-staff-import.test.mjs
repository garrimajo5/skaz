import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {openStore} from '../server/store.mjs';
import {readScopeBundle} from '../scripts/catalog-audit-inputs.mjs';

const readCatalog = file => JSON.parse(readFileSync(new URL('../catalog/'+file,import.meta.url),'utf8'));

test('Staff of Fire previews and imports with verified references and manual instance charges',()=>{
 const {staff,ordinaryCast} = readCatalog('staff-of-fire-casting-evidence-2014.json');
 const pack = readCatalog('srd51-fire-staff.json');
 const [source] = pack.entries;
 const coverage = readCatalog('srd51-fire-staff.coverage.json');
 const store = openStore(':memory:');
 try {
  const initial = store.read();
  store.catalog.importEntries(readScopeBundle(),{apply:true});
  const lookup = () => store.catalog.lookup(new URLSearchParams({id:source.id})).entry;
  assert.throws(lookup,{status:404});
  assert.equal(store.catalog.importEntries(pack).added,1);
  assert.throws(lookup,{status:404});
  assert.equal(store.catalog.importEntries(pack,{apply:true}).added,1);
  assert.equal(store.catalog.importEntries(pack,{apply:true}).unchanged,1);
  assert.deepEqual(store.read(),initial);
  const entry = lookup();
  assert.equal(entry.source.url,staff.url);
  assert.equal(entry.source.usage,'cc-by-4.0');
  assert.deepEqual(coverage.entries,[{id:entry.id,nameEn:entry.name.en,pages:[243]}]);
  assert.equal(entry.item.type,'staff');
  assert.equal(entry.item.attunement,true);
  assert.equal(entry.item.charges.max,10);
  const spells = entry.links.filter(link=>link.includes(':spell:'));
  assert.deepEqual(spells,ordinaryCast.options.map(option=>option.spellId));
  for(const option of ordinaryCast.options){
   const linked = store.catalog.lookup(new URLSearchParams({id:option.spellId})).entry;
   assert.equal(linked.spell.level,option.castLevel);
   assert.equal(linked.spell.concentration,option.concentration);
  }

  const command = fields => ({
   mutationId:randomUUID(),expectedRevision:store.read().revision,
   characterId:initial.context.characterId,catalogId:entry.id,...fields,
  });
  store.addInventory(command({quantity:1}));
  const staffInstance = () => store.inventory().entries.find(row=>row.catalogId===entry.id);
  assert.equal(staffInstance().chargeCounts,undefined);
  const unknown = store.read();
  assert.throws(()=>store.changeCharges(command({unit:0,operation:'spend',amount:1})),{status:422});
  assert.deepEqual(store.read(),unknown);
  store.changeCharges(command({unit:0,operation:'set',amount:7}));
  store.changeCharges(command({unit:0,operation:'spend',amount:3}));
  assert.deepEqual(staffInstance().chargeCounts,[4]);
  store.changeCharges(command({unit:0,operation:'set',amount:11}));
  assert.deepEqual(staffInstance().chargeCounts,[11]);

  assert.equal(store.read().state.concentration,initial.state.concentration);
  assert.deepEqual(store.read().state.slots,initial.state.slots);
  assert.equal(store.read().state.hp,initial.state.hp);
 } finally {
  store.close();
 }
});
