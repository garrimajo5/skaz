import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {openStore} from '../server/store.mjs';
import {validateCatalog} from '../server/catalog.mjs';
const bundle=JSON.parse(readFileSync(new URL('../catalog/srd51-ropes.json',import.meta.url)));
test('magic ropes preserve 2014 action, escape and physical limits',()=>{
 const [climb,entangle]=validateCatalog(bundle);
 assert.equal(climb.item.rarity,'uncommon');assert.equal(entangle.item.rarity,'rare');
 for(const e of [climb,entangle]){assert.equal(e.item.attunement,false);assert.match(e.source.url,/#page=241$/);assert.match(e.text,/КД 20, 20 хитов/);assert.match(e.text,/1 хит каждые 5 минут/);assert.match(e.text,/При 0 хитов уничтожается/);}
 assert.match(climb.text,/3000 фунтов/);assert.match(climb.text,/50 футов/);assert.match(climb.text,/10 футов в этот ход и каждый следующий ваш ход/);
 assert.match(entangle.text,/спасбросок Ловкости Сл 15/);assert.match(entangle.text,/проверку Силы или Ловкости Сл 15/);assert.match(entangle.text,/Бонусным действием вторая команда/);
 assert.deepEqual(entangle.links,['srd51:2014:mechanic:restrained']);
});
test('bundled ropes resolve links and repeated import/inventory commands do not duplicate or apply effects',()=>{
 const s=openStore(':memory:');try{
 const preview=s.catalog.previewBundled();s.catalog.installBundled({version:preview.version});
 assert.equal(s.catalog.importEntries(bundle,{apply:true}).unchanged,2);
 const detail=s.catalog.lookup(new URLSearchParams({id:bundle.entries[1].id}));assert.equal(detail.related[0].id,'srd51:2014:mechanic:restrained');
 const before=s.read(),request={mutationId:randomUUID(),expectedRevision:before.revision,characterId:before.context.characterId,catalogId:bundle.entries[1].id,quantity:1};
 s.addInventory(request);assert.equal(s.addInventory(request).replayed,true);assert.deepEqual(s.read().state,before.state);
 assert.equal(s.inventory().entries.filter(e=>e.catalogId===request.catalogId).length,1);
 }finally{s.close();}
});
