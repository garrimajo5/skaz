import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openStore } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';
const bundle = JSON.parse(readFileSync(new URL('../catalog/srd51-conditions.json', import.meta.url), 'utf8'));

test('condition package validates cross-record dependencies and replays without changing progress', () => {
  const store = openStore(':memory:');
  try {
    const before = store.read();
    const grappled = bundle.entries.find(e => e.name.en === 'Grappled');
    assert.throws(() => store.catalog.importEntries({ schemaVersion: 1, entries: [grappled] }, { apply: true }), { status: 422 });
    assert.equal(store.catalog.coverage().total, 0);
    assert.equal(store.catalog.importEntries(bundle).added, 15);
    assert.equal(store.catalog.coverage().total, 0);
    assert.equal(store.catalog.importEntries({ ...bundle, entries: [...bundle.entries].reverse() }, { apply: true }).added, 15);
    assert.equal(store.catalog.importEntries(bundle, { apply: true }).unchanged, 15);
    assert.deepEqual(store.read(), before);
    assert.equal(store.catalog.coverage().structuredMechanics, 15);
    assert.equal(store.catalog.coverage().complete, false);
    const changed = structuredClone(bundle); changed.entries[0].mechanic.effects[0] = 'Changed rule';
    assert.throws(() => store.catalog.importEntries(changed, { apply: true }), { status: 409 });
  } finally { store.close(); }
});

test('invalid condition effects and categories reject the entire package', () => {
  const store = openStore(':memory:');
  try {
    for (const mutate of [
      e => e.mechanic.effects = [], e => e.mechanic.effects = [''],
      e => e.mechanic.effects = [123], e => e.mechanic.effects = ['x', ' x '],
      e => e.mechanic.effects = ['x'.repeat(2001)],
      e => e.mechanic.effects = Array.from({ length: 31 }, (_, i) => String(i)),
      e => e.mechanic.category = 'unknown-section', e => e.mechanic.level = 1,
      e => e.kind = 'spell', e => e.source.usage = 'reference-only',
    ]) {
      const bad = structuredClone(bundle.entries[0]); mutate(bad);
      assert.throws(() => store.catalog.importEntries({ schemaVersion: 1, entries: [bundle.entries[1], bad] }, { apply: true }), { status: 422 });
      assert.equal(store.catalog.coverage().total, 0);
    }
  } finally { store.close(); }
});

test('condition search API returns rules and related condition ID', async t => {
  const store = openStore(':memory:'); store.catalog.importEntries(bundle, { apply: true });
  const app = createApp(store);
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => app.close(resolve)); store.close(); });
  const base = `http://127.0.0.1:${app.address().port}/api/catalog`;
  for (const q of ['ЗАХВАТ', 'grappled']) {
    const result = await fetch(`${base}?kind=mechanic&q=${encodeURIComponent(q)}`).then(r => r.json());
    assert.equal(result.total, 1);
    assert.equal(result.entries[0].mechanic.effects.length, 3);
    assert.deepEqual(result.entries[0].links, ['srd51:2014:mechanic:incapacitated']);
    assert.match(result.entries[0].source.url, /#page=358$/);
  }
});


test('expanded conditions retain old IDs and add eleven without rewriting installed records',()=>{
 const store=openStore(':memory:');try{
  const old={schemaVersion:1,entries:bundle.entries.slice(0,4)};store.catalog.importEntries(old,{apply:true});
  const before=store.read(),result=store.catalog.importEntries(bundle,{apply:true});assert.equal(result.added,11);assert.equal(result.unchanged,4);assert.deepEqual(store.read(),before);
  const manifest=JSON.parse(readFileSync(new URL('../catalog/srd51-conditions.coverage.json',import.meta.url),'utf8'));
  assert.equal(manifest.expectedRecords,15);assert.deepEqual([...bundle.entries.map(e=>e.id)].sort(),manifest.expectedIds);
  assert.deepEqual(bundle.entries.map(e=>e.name.en).sort(),['Blinded','Charmed','Deafened','Exhaustion','Frightened','Grappled','Incapacitated','Invisible','Paralyzed','Petrified','Poisoned','Prone','Restrained','Stunned','Unconscious'].sort());
  for(const e of bundle.entries){assert.equal(e.ruleset,'5e-2014');assert.equal(e.source.usage,'cc-by-4.0');assert.match(e.source.url,/#page=35[89]$/);for(const link of e.links)assert.ok(manifest.expectedIds.includes(link));}
  const exhaustion=bundle.entries.find(e=>e.name.en==='Exhaustion');assert.equal(exhaustion.mechanic.effects.filter(e=>/^Уровень [1-6]:/.test(e)).length,6);assert.match(exhaustion.text,/пищу и питьё/);
  const unconscious=bundle.entries.find(e=>e.name.en==='Unconscious');assert.deepEqual(unconscious.links,['srd51:2014:mechanic:incapacitated','srd51:2014:mechanic:prone']);
  assert.throws(()=>openMissingDependency(unconscious),{status:422});
 }finally{store.close();}
});
function openMissingDependency(entry){const store=openStore(':memory:');try{return store.catalog.importEntries({schemaVersion:1,entries:[entry]},{apply:true});}finally{store.close();}}


test('catalog lookup resolves named dependencies by ID and rejects ambiguous requests',async t=>{
 const store=openStore(':memory:');store.catalog.importEntries(bundle,{apply:true});const app=createApp(store);await new Promise(r=>app.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>app.close(r));store.close();});
 const base=`http://127.0.0.1:${app.address().port}/api/catalog/entry`,id='srd51:2014:mechanic:unconscious';
 const result=await fetch(base+'?'+new URLSearchParams({id})).then(r=>r.json());assert.equal(result.entry.id,id);assert.deepEqual(result.related.map(e=>e.name.en),['Incapacitated','Prone']);
 for(const query of ['', '?id=a&id=b','?id=valid:id&extra=1'])assert.equal((await fetch(base+query)).status,400);
 assert.equal((await fetch(base+'?id=missing:entry')).status,404);assert.equal((await fetch(base+'?id=..%2Fbad')).status,422);
});
