import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {openStore} from '../server/store.mjs';
import {validateCatalog} from '../server/catalog.mjs';
const read=name=>JSON.parse(readFileSync(new URL('../catalog/'+name,import.meta.url),'utf8'));
const bundle=read('srd51-travel-items.json'),manifest=read('srd51-travel-items.coverage.json');
test('travel items retain provenance, attunement distinctions and important physical limits',()=>{
 const entries=validateCatalog(bundle),get=en=>entries.find(e=>e.name.en===en);assert.equal(entries.length,12);assert.equal(manifest.expectedSubsetCount,12);assert.equal(manifest.completeGameCatalog,false);
 for(const e of entries){const ref=manifest.entries.find(r=>r.id===e.id);assert.ok(ref);assert.equal(e.source.url,manifest.sourceUrl+'#page='+ref.pages[0]);assert.equal(e.source.usage,'cc-by-4.0');assert.ok(e.source.attribution&&e.source.changes);}
 assert.equal(get('Bag of Holding').item.attunement,false);assert.match(get('Bag of Holding').text,/500 фунтов/);assert.match(get('Bag of Holding').text,/64 кубических/);assert.match(get('Bag of Holding').text,/10 футов/);
 assert.equal(get('Boots of Levitation').item.rarity,'rare');assert.equal(get('Boots of Levitation').item.attunement,true);assert.deepEqual(get('Boots of Levitation').links,['srd51:2014:spell:levitate']);
 assert.equal(get('Boots of Elvenkind').item.attunement,false);assert.equal(get('Slippers of Spider Climbing').item.attunement,true);assert.match(get('Slippers of Spider Climbing').text,/скользкой/);
 assert.match(get('Broom of Flying').text,/более 200 фунтов/);assert.match(get('Boots of Speed').text,/суммарных 10 минут/);assert.equal(get('Ring of Water Walking').item.type,'ring');
 assert.match(get('Goggles of Night').text,/увеличивают его дистанцию на 60 футов/);assert.match(get('Bracers of Defense').text,/нет доспеха/);
});
test('travel item import is repeatable and adding equipment preserves resources without applying bonuses',()=>{
 const s=openStore(':memory:');try{const p=s.catalog.previewBundled();s.catalog.installBundled({version:p.version});assert.equal(s.catalog.importEntries(bundle,{apply:true}).unchanged,12);
 const before=s.read(),item=bundle.entries.find(e=>e.name.en==='Bracers of Defense');
 const request={mutationId:randomUUID(),expectedRevision:before.revision,characterId:before.context.characterId,catalogId:item.id,quantity:1};
 s.addInventory(request);assert.equal(s.addInventory(request).replayed,true);assert.deepEqual(s.read().state,before.state);
 const row=s.inventory().entries.find(e=>e.catalogId===item.id);assert.equal(row.quantity,1);
 const detail=s.catalog.lookup(new URLSearchParams({id:'srd51:2014:item:boots-of-levitation'}));assert.equal(detail.related[0].name.en,'Levitate');
 }finally{s.close();}
});
