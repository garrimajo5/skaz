import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import test from 'node:test';
import {createCatalog, withWhelmClarification} from '../server/catalog.mjs';

const load = name => JSON.parse(readFileSync(new URL('../catalog/'+name,import.meta.url),'utf8'));
const id = 'srd51:2014:monster:water-elemental';
const waterElemental = load('srd51-elementals.json').entries.find(entry => entry.id === id);
const conditions = load('srd51-conditions.json');

function catalogWithEntry(t, entry) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  const catalog = createCatalog(db);
  catalog.importEntries(conditions,{apply:true});
  catalog.importEntries({schemaVersion:1,entries:[entry]},{apply:true});
  return catalog;
}

test('the reviewed Whelm source follows the exact visible card in search and lookup',t => {
  const catalog = catalogWithEntry(t, waterElemental);
  const search = catalog.search(new URLSearchParams({q:'Water Elemental'}));
  const lookup = catalog.lookup(new URLSearchParams({id}));
  const before = structuredClone(lookup);
  const expected = {catalogId:id,url:'https://media.wizards.com/2018/dnd/downloads/MM-Errata.pdf#page=2'};
  assert.deepEqual(withWhelmClarification(search),{...search,whelmClarification:expected});
  assert.deepEqual(withWhelmClarification(lookup),{...lookup,whelmClarification:expected});
  assert.deepEqual(lookup,before);
  assert.equal(lookup.entry.source.url,'https://media.wizards.com/2023/downloads/dnd/SRD_CC_v5.1.pdf#page=307');
  const otherPage = catalog.search(new URLSearchParams({q:'Water Elemental',offset:'1'}));
  assert.equal(withWhelmClarification(otherPage),otherPage);
});

test('same-ID personal text and new source revisions preserve the unannotated response',t => {
  const overrides = [
    {...waterElemental,text:waterElemental.text.replace('успешной проверкой Силы Сл 14','успешным спасброском Силы Сл 14')},
    {...waterElemental,source:{...waterElemental.source,version:'other revision'}},
    {...waterElemental,source:{...waterElemental.source,url:waterElemental.source.url.replace('#page=307','#page=305')}},
  ];
  for (const entry of overrides) {
    assert.notDeepEqual(entry,waterElemental);
    const catalog = catalogWithEntry(t, entry);
    const lookup = catalog.lookup(new URLSearchParams({id}));
    assert.equal(withWhelmClarification(lookup),lookup);
    const search = catalog.search(new URLSearchParams({q:'Water Elemental'}));
    assert.equal(withWhelmClarification(search),search);
    assert.equal(lookup.entry.text,entry.text);
  }
});
