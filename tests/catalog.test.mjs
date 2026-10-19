import test from 'node:test';
import assert from 'node:assert/strict';
import { openStore } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';
import { readFileSync } from 'node:fs';
const srd = JSON.parse(readFileSync(new URL('../catalog/srd51-spells.json', import.meta.url), 'utf8'));
const entry = (id = 'personal:test') => ({ id, ruleset: '5e-2014', kind: 'mechanic', name: { ru: 'Тестовая механика', en: 'Test mechanic' }, source: { url: 'https://example.com/rules', title: 'Test fixture', version: '1', usage: 'personal', terms: 'Synthetic test data' }, text: 'Synthetic fixture only', links: [] });
const bundle = (...entries) => ({ schemaVersion: 1, entries });

test('description search is opt-in, literal, case-insensitive and combines with paging and kind',()=>{
 const s=openStore(':memory:');try{
  const a=entry('personal:a'),b=entry('personal:b'),c=entry('personal:c');
  a.text='Редкое СЛОВО и 50%_ [x]';b.text='Ещё редкое слово';c.source.terms='редкое слово';
  s.catalog.importEntries(bundle(a,b,c),{apply:true});const before=s.read();
  assert.equal(s.catalog.search(new URLSearchParams({q:'редкое слово'})).total,0);
  const result=s.catalog.search(new URLSearchParams({q:'редкое слово',scope:'text',kind:'mechanic',limit:'1',offset:'1'}));
  assert.equal(result.total,2);assert.equal(result.entries[0].id,'personal:b');
  for(const q of ['50%_', '[x]'])assert.equal(s.catalog.search(new URLSearchParams({q,scope:'text'})).total,1);
  assert.equal(s.catalog.search(new URLSearchParams({q:'Test mechanic',scope:'text'})).total,3);
  assert.equal(s.catalog.search(new URLSearchParams({scope:'text'})).total,3);
  for(const scope of ['', 'all','TEXT'])assert.throws(()=>s.catalog.search(new URLSearchParams({scope})),{status:400});
  assert.throws(()=>s.catalog.search(new URLSearchParams('scope=name&scope=text')),{status:400});
  assert.deepEqual(s.read(),before);assert.deepEqual(s.history(),[]);
 }finally{s.close();}
});

test('checked SRD subset imports repeatedly without touching progress and preserves provenance', () => {
  const store = openStore(':memory:');
  try {
    const before = store.read();
    assert.equal(store.catalog.importEntries(srd).added, 2);
    assert.equal(store.catalog.coverage().total, 0);
    assert.equal(store.catalog.importEntries(srd, { apply: true }).added, 2);
    const reordered = structuredClone(srd);
    reordered.entries.reverse();
    reordered.entries.forEach(e => e.spell.components.reverse());
    assert.equal(store.catalog.importEntries(reordered, { apply: true }).unchanged, 2);
    assert.deepEqual(store.read(), before);
    const found = store.catalog.search(new URLSearchParams({ q: 'Healing Word' })).entries[0];
    assert.equal(found.spell.range.feet, 60);
    assert.match(found.source.attribution, /Wizards of the Coast LLC/);
    assert.match(found.source.changes, /не официальный перевод/);
    assert.equal(store.catalog.coverage().openlyLicensed, 2);
    assert.equal(store.catalog.coverage().structuredSpells, 2);
    assert.equal(store.catalog.coverage().complete, false);
  } finally { store.close(); }
});

test('invalid spell numbers, enums, licensing and cross-kind fields reject the whole batch', () => {
  const store = openStore(':memory:');
  try {
    const mutations = [
      e => e.spell.level = '1', e => e.spell.level = -1, e => e.spell.level = 10,
      e => e.spell.level = 1.5, e => e.spell.range = { type: 'feet', feet: 0 },
      e => e.spell.range = { type: 'feet', feet: Infinity }, e => e.spell.range = { type: 'touch', feet: 5 },
      e => e.spell.components = ['V', 'V'], e => e.spell.school = 'unknown',
      e => e.spell.ritual = 'false', e => e.spell.damage = 4,
      e => e.kind = 'monster', e => delete e.source.attribution, e => delete e.source.changes,
      e => e.source.usage = 'reference-only',
    ];
    for (const mutate of mutations) {
      const bad = structuredClone(srd.entries[0]); mutate(bad);
      assert.throws(() => store.catalog.importEntries(bundle(srd.entries[1], bad), { apply: true }), { status: 422 });
      assert.equal(store.catalog.coverage().total, 0);
    }
  } finally { store.close(); }
});

test('catalog preview, replay, conflict and broken links are atomic', () => {
  const store = openStore(':memory:');
  try {
    const a = entry(), b = { ...entry('personal:other'), links: [a.id] };
    assert.equal(store.catalog.importEntries(bundle(a, b)).added, 2);
    assert.equal(store.catalog.coverage().total, 0);
    assert.equal(store.catalog.importEntries(bundle(b, a), { apply: true }).added, 2);
    assert.equal(store.catalog.importEntries(bundle(a, b), { apply: true }).unchanged, 2);
    assert.throws(() => store.catalog.importEntries(bundle(entry('personal:new'), { ...a, text: 'changed' }), { apply: true }), { status: 409 });
    assert.throws(() => store.catalog.importEntries(bundle({ ...entry('personal:new'), links: ['missing:entry'] }), { apply: true }), { status: 422 });
    assert.equal(store.catalog.coverage().total, 2);
    assert.equal(store.read().revision, 0);
  } finally { store.close(); }
});

test('catalog rejects wrong editions, duplicates, unknown numeric fields and unsafe sources', () => {
  const store = openStore(':memory:');
  try {
    const a = entry();
    for (const invalid of [
      bundle(a, a), bundle({ ...a, ruleset: '5e-2024' }),
      bundle({ ...a, level: -1 }), bundle({ ...a, name: { ru: 42, en: 'x' } }),
      bundle({ ...a, source: { ...a.source, url: 'javascript:alert(1)' } }),
      bundle({ ...a, source: { ...a.source, url: 'https://next.dnd.su/spells/' } }),
      bundle({ ...a, source: { ...a.source, usage: 'reference-only' } }),
      bundle({ ...a, links: [a.id] }),
    ]) assert.throws(() => store.catalog.importEntries(invalid, { apply: true }), { status: 422 });
    assert.equal(store.catalog.coverage().total, 0);
  } finally { store.close(); }
});

test('catalog API supports Russian/English search, filters, pagination and honest coverage', async t => {
  const store = openStore(':memory:');
  store.catalog.importEntries(bundle(entry(), { ...entry('personal:spell'), kind: 'spell' }), { apply: true });
  const app = createApp(store);
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => app.close(resolve)); store.close(); });
  const base = `http://127.0.0.1:${app.address().port}/api/catalog`;
  for (const q of ['ТЕСТОВАЯ', 'TEST']) {
    const found = await fetch(`${base}?q=${encodeURIComponent(q)}&kind=spell`).then(r => r.json());
    assert.equal(found.total, 1);
    assert.equal(found.entries[0].id, 'personal:spell');
  }
  const page = await fetch(`${base}?limit=1&offset=1`).then(r => r.json());
  assert.equal(page.total, 2); assert.equal(page.entries.length, 1);
  for (const query of ['limit=-1', 'offset=1.5', 'kind=unknown', 'limit=0', 'q=x&q=y', 'ruleset=2024']) assert.equal((await fetch(`${base}?${query}`)).status, 400);
  const coverage = await fetch(`${base}/coverage`).then(r => r.json());
  assert.equal(coverage.complete, false); assert.equal(coverage.expectedTotal, null);
  assert.equal(coverage.categories.monster, 0);
});
