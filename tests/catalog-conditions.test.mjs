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
    assert.equal(store.catalog.importEntries(bundle).added, 4);
    assert.equal(store.catalog.coverage().total, 0);
    assert.equal(store.catalog.importEntries({ ...bundle, entries: [...bundle.entries].reverse() }, { apply: true }).added, 4);
    assert.equal(store.catalog.importEntries(bundle, { apply: true }).unchanged, 4);
    assert.deepEqual(store.read(), before);
    assert.equal(store.catalog.coverage().structuredMechanics, 4);
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
      e => e.mechanic.category = 'rest', e => e.mechanic.level = 1,
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
