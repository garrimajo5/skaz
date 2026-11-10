import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {openStore} from '../server/store.mjs';
import {validateCatalog} from '../server/catalog.mjs';
import {bundledCatalog} from '../server/bundled-catalog.mjs';
const read=name=>JSON.parse(readFileSync(new URL('../catalog/'+name,import.meta.url)));
const pack=read('srd51-legendary-utilities.json'),coverage=read('srd51-legendary-utilities.coverage.json');
test('legendary utilities retain exact 2014 limits and are items, not artifacts',()=>{
 const [scarab,glue,solvent]=validateCatalog(pack);assert.equal(coverage.expectedSubsetCount,3);assert.equal(coverage.completeGameCatalog,false);
 for(const [i,e]of pack.entries.entries()){assert.equal(e.kind,'item');assert.equal(e.item.rarity,'legendary');assert.equal(e.source.usage,'cc-by-4.0');assert.equal(e.source.url,coverage.sourceUrl+'#page='+coverage.entries[i].pages[0]);}
 assert.equal(scarab.item.attunement,true);assert.equal(scarab.item.charges.max,12);assert.match(scarab.item.charges.recharge,/не предусмотрено/);
 assert.match(scarab.text,/спасброски против заклинаний/);assert.match(scarab.text,/против заклинания некромантии или вредоносного эффекта нежити/);assert.match(scarab.text,/реакцией потратить 1 заряд/);assert.match(scarab.text,/Последний израсходованный заряд уничтожает/);
 assert.equal(glue.item.attunement,false);assert.equal(solvent.item.attunement,false);assert.match(glue.text,/1d6 \+ 1 унций/);assert.match(glue.text,/1 минуту/);assert.match(glue.text,/масло эфирности/);assert.match(solvent.text,/Действием/);assert.match(solvent.text,/до 1 квадратного фута/);
 assert.ok(glue.links.includes(solvent.id));assert.ok(solvent.links.includes(glue.id));
});
test('three additions preserve every installed card and game and support cyclic links on repeat',()=>{
 const s=openStore(':memory:');try{
 const ids=new Set(pack.entries.map(e=>e.id));const previous=validateCatalog({schemaVersion:1,entries:bundledCatalog().bundle.entries.filter(e=>!ids.has(e.id))});
 s.catalog.importEntries({schemaVersion:1,entries:previous},{apply:true});const before=s.read(),history=s.history();
 const p=s.catalog.previewBundled();assert.equal(p.added,3);assert.equal(p.updated,0);s.catalog.installBundled({version:p.version});
 assert.equal(s.catalog.importEntries(pack,{apply:true}).unchanged,3);assert.deepEqual(s.read(),before);assert.deepEqual(s.history(),history);
 for(const e of previous)assert.deepEqual(s.catalog.lookup(new URLSearchParams({id:e.id})).entry,e);
 const related=s.catalog.lookup(new URLSearchParams({id:pack.entries[1].id})).related;assert.ok(related.some(e=>e.id===pack.entries[2].id));
 }finally{s.close();}
});
test('scarab inventory preserves twelve reference charges without inventing current charges; replay never duplicates or changes health',()=>{
 const s=openStore(':memory:');try{
 s.catalog.installBundled({version:s.catalog.previewBundled().version});const before=s.read();
 const req={mutationId:randomUUID(),expectedRevision:before.revision,characterId:before.context.characterId,catalogId:pack.entries[0].id,quantity:1};
 s.addInventory(req);assert.equal(s.addInventory(req).replayed,true);assert.deepEqual(s.read().state,before.state);
 const entries=s.inventory().entries.filter(e=>e.catalogId===req.catalogId);assert.equal(entries.length,1);assert.equal(entries[0].entry.item.charges.max,12);assert.equal(entries[0].chargeCounts,undefined);
 }finally{s.close();}
});
test('game transfer retains mutually linked adhesive cards and scarab reference charges',()=>{
 const source=openStore(':memory:'),target=openStore(':memory:');try{
 source.catalog.installBundled({version:source.catalog.previewBundled().version});
 for(const entry of pack.entries){const before=source.read();source.addInventory({mutationId:randomUUID(),expectedRevision:before.revision,characterId:before.context.characterId,catalogId:entry.id,quantity:1});}
 const file=JSON.parse(JSON.stringify(source.exportActive(12))),request={mutationId:randomUUID(),expectedRevision:target.read().revision,destination:'new-campaign',file};
 target.importActive(request);assert.equal(target.importActive(request).replayed,true);
 assert.deepEqual(target.inventory().entries,source.inventory().entries);
 assert.ok(file.catalog.entries.some(e=>e.id==='srd51:2014:spell:wish'));
 assert.deepEqual(target.exportActive(12).catalog,file.catalog);
 }finally{source.close();target.close();}
});
