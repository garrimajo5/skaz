import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {openStore} from '../server/store.mjs';
import {validateCatalog} from '../server/catalog.mjs';
import {bundledCatalog} from '../server/bundled-catalog.mjs';
const pack=JSON.parse(readFileSync(new URL('../catalog/srd51-oils.json',import.meta.url)));
test('2014 oils retain application, size and duration limits without automatic drinking effects',()=>{
 const [ethereal,slippery]=validateCatalog(pack);
 assert.equal(ethereal.item.rarity,'rare');assert.equal(slippery.item.rarity,'uncommon');
 for(const e of [ethereal,slippery]){assert.equal(e.item.attunement,false);assert.match(e.text,/10 минут/);assert.match(e.text,/Среднего или меньшего/);assert.match(e.text,/ещё один флакон/);assert.match(e.text,/вручную/);assert.equal(e.item.charges,undefined);assert.ok(e.links.includes('srd51:2014:item:sovereign-glue'));}
 assert.match(ethereal.text,/на 1 час/);assert.match(ethereal.text,/не выпивают/);assert.ok(ethereal.links.includes('srd51:2014:spell:etherealness'));
 assert.match(slippery.text,/действием/);assert.match(slippery.text,/10 футов/);assert.equal(slippery.text.match(/8 часов/g).length,2);assert.ok(slippery.links.includes('srd51:2014:spell:grease'));assert.ok(slippery.links.includes('srd51:2014:spell:freedom-of-movement'));
});
test('installing oils is additive and repeat-safe without changing game or prior catalog',()=>{
 const s=openStore(':memory:');try{
 const ids=new Set(pack.entries.map(e=>e.id));const previous=validateCatalog({schemaVersion:1,entries:bundledCatalog().bundle.entries.filter(e=>!ids.has(e.id))});
 s.catalog.importEntries({schemaVersion:1,entries:previous},{apply:true});const before=s.read(),history=s.history();const p=s.catalog.previewBundled();assert.equal(p.added,2);assert.equal(p.updated,0);s.catalog.installBundled({version:p.version});assert.equal(s.catalog.importEntries(pack,{apply:true}).unchanged,2);assert.deepEqual(s.read(),before);assert.deepEqual(s.history(),history);
 for(const e of previous)assert.deepEqual(s.catalog.lookup(new URLSearchParams({id:e.id})).entry,e);
 }finally{s.close();}
});
test('oil inventory and linked reference cards survive v12 transfer without applying spell effects',()=>{
 const s=openStore(':memory:'),t=openStore(':memory:');try{
 s.catalog.installBundled({version:s.catalog.previewBundled().version});const original=s.read().state;
 for(const entry of pack.entries){const before=s.read();s.addInventory({mutationId:randomUUID(),expectedRevision:before.revision,characterId:before.context.characterId,catalogId:entry.id,quantity:2});}
 assert.deepEqual(s.read().state,original);const file=JSON.parse(JSON.stringify(s.exportActive(12)));t.importActive({mutationId:randomUUID(),expectedRevision:t.read().revision,destination:'new-campaign',file});assert.deepEqual(t.inventory().entries,s.inventory().entries);assert.deepEqual(t.exportActive(12).catalog,file.catalog);
 for(const id of pack.entries.flatMap(e=>e.links))assert.ok(file.catalog.entries.some(e=>e.id===id));
 }finally{s.close();t.close();}
});
