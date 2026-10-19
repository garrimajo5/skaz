import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openStore} from '../server/store.mjs';
import {validateCatalog} from '../server/catalog.mjs';
const read=name=>JSON.parse(readFileSync(new URL('../catalog/'+name,import.meta.url),'utf8'));
const pack=read('srd51-exploration.json'),coverage=read('srd51-exploration.coverage.json');
test('exploration subset preserves 2014 limits, source pages and explicit scope',()=>{
 const entries=validateCatalog(pack);assert.equal(entries.length,13);assert.equal(coverage.expectedSubsetCount,13);assert.equal(coverage.completeGameCatalog,false);
 for(const e of entries){assert.equal(e.mechanic.category,'exploration');assert.equal(e.source.url,coverage.sourceUrl+'#page='+coverage.entries.find(x=>x.id===e.id).pages[0]);assert.equal(e.source.usage,'cc-by-4.0');assert.match(e.text,/не применяются.*автоматически/);}
 const text=name=>entries.find(e=>e.name.en===name).text;
 assert.match(text('Falling'),/1d6.*10 футов.*20d6/);
 assert.match(text('Suffocating'),/минимум 30 секунд/);assert.match(text('Suffocating'),/минимум 1 раунд/);assert.match(text('Suffocating'),/не может восстановить хиты или стабилизироваться/);
 assert.match(text('Darkvision'),/не превращает темноту в яркий свет/);
 assert.match(text('Travel Pace'),/400 футов в минуту, 4 мили в час, 30 миль в день/);assert.match(text('Travel Pace'),/200 футов в минуту, 2 мили в час, 18 миль в день/);assert.match(text('Forced March'),/девятом часу Сл 11/);assert.match(text('Mounts and Vehicles'),/до 24 часов/);
 assert.match(text('Food and Water'),/Сл 15/);assert.match(text('Food and Water'),/два уровня/);
});
test('exploration search excludes unstructured references and install does not apply survival effects',()=>{
 const s=openStore(':memory:');try{
  const before=s.read();s.catalog.installBundled({version:s.catalog.previewBundled().version});
  const result=s.catalog.search(new URLSearchParams({kind:'mechanic',mechanicCategory:'exploration'}));assert.equal(result.total,13);assert.ok(result.entries.every(e=>e.mechanic.category==='exploration'));
  assert.equal(s.catalog.importEntries(pack,{apply:true}).unchanged,13);assert.deepEqual(s.read(),before);assert.deepEqual(s.history(),[]);
  assert.throws(()=>s.catalog.search(new URLSearchParams({kind:'item',mechanicCategory:'exploration'})),{status:400});
 }finally{s.close();}
});
