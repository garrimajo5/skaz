import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateCatalog} from '../server/catalog.mjs';
import {openStore} from '../server/store.mjs';
const read=name=>JSON.parse(readFileSync(new URL('../catalog/'+name,import.meta.url),'utf8'));
const pack=read('srd51-npc-roles.json'), manifest=read('srd51-npc-roles.coverage.json');

test('NPC roles preserve checked SRD base statistics, provenance and spell links',()=>{
  const entries=validateCatalog(pack);
  assert.equal(entries.length,6);assert.equal(manifest.expectedSubsetCount,6);assert.equal(manifest.completeGameCatalog,false);
  assert.deepEqual(entries.map(e=>[e.name.en,e.monster.armorClass,e.monster.hitPoints,e.monster.speed.walk,e.monster.challenge,e.monster.xp]),[
    ['Acolyte',10,9,30,'1/4',50],['Berserker',13,67,30,'2',450],['Commoner',10,4,30,'0',10],
    ['Knight',18,52,30,'3',700],['Priest',13,27,25,'2',450],['Spy',12,27,30,'1',200],
  ]);
  const store=openStore(':memory:');
  try {
    const before=store.read(),p=store.catalog.previewBundled();store.catalog.installBundled({version:p.version});
    for(const entry of entries) {
      const ref=manifest.entries.find(e=>e.id===entry.id);
      assert.equal(entry.source.url,manifest.sourceUrl+'#page='+ref.pages[0]);assert.equal(entry.source.usage,'cc-by-4.0');
      const detail=store.catalog.lookup(new URLSearchParams({id:entry.id}));
      assert.deepEqual(detail.related.filter(e=>e.kind==='spell').map(e=>e.name.en).sort(),[...ref.spellNamesEn].sort());
    }
    assert.equal(store.catalog.importEntries(pack,{apply:true}).unchanged,6);assert.deepEqual(store.read(),before);
    const changed=structuredClone(pack);changed.entries[4].monster.speed.walk=30;
    assert.throws(()=>store.catalog.importEntries(changed,{apply:true}),{status:409});
    assert.equal(store.catalog.lookup(new URLSearchParams({id:'srd51:2014:monster:priest'})).entry.monster.speed.walk,25);
  } finally {store.close();}
});

test('spell slots, leadership and conditional extra damage are not silently simplified',()=>{
  const get=name=>pack.entries.find(e=>e.name.en===name).text;
  assert.match(get('Acolyte'),/1-й уровень, 3 ячейки/);
  assert.match(get('Priest'),/3-й, 2 ячейки/);assert.match(get('Priest'),/бонусным действием тратит ячейку/);
  assert.match(get('Priest'),/до конца этого хода/);assert.match(get('Priest'),/1d6/);
  assert.match(get('Berserker'),/атаки против него имеют преимущество до начала его следующего хода/);
  assert.match(get('Knight'),/слышит и понимает/);assert.match(get('Knight'),/только одна кость Лидерства/);
  assert.match(get('Knight'),/видит атакующего и держит рукопашное оружие/);
  assert.match(get('Spy'),/один раз за ход/);assert.match(get('Spy'),/нет помехи/);assert.match(get('Spy'),/не два выстрела/);
});
