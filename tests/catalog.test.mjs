import test from 'node:test';
import assert from 'node:assert/strict';
import { openStore } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';
const entry = (id = 'personal:test') => ({ id, ruleset: '5e-2014', kind: 'mechanic', name: { ru: 'Тестовая механика', en: 'Test mechanic' }, source: { url: 'https://example.com/rules', title: 'Test fixture', version: '1', usage: 'personal', terms: 'Synthetic test data' }, text: 'Synthetic fixture only', links: [] });
const bundle = (...entries) => ({ schemaVersion: 1, entries });

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
