import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';
const bundle = JSON.parse(readFileSync(new URL('../catalog/srd51-items.json', import.meta.url), 'utf8'));

test('SRD item variants persist, replay and remain separate from character progress', () => {
  const dir = mkdtempSync(join(tmpdir(), 'skaz-items-'));
  let store = openStore(join(dir, 'test.sqlite'));
  try {
    const before = store.read();
    assert.equal(store.catalog.importEntries(bundle).added, 5);
    assert.equal(store.catalog.coverage().total, 0);
    assert.equal(store.catalog.importEntries(bundle, { apply: true }).added, 5);
    store.close(); store = openStore(join(dir, 'test.sqlite'));
    assert.equal(store.catalog.importEntries({ ...bundle, entries: [...bundle.entries].reverse() }, { apply: true }).unchanged, 5);
    assert.deepEqual(store.read(), before);
    const potions = store.catalog.search(new URLSearchParams({ q: 'Potion of', kind: 'item' })).entries;
    assert.equal(potions.length, 4);
    assert.deepEqual(potions.map(e => e.item.healing.diceCount).sort((a,b) => a-b), [2,4,8,10]);
    assert.equal(potions.find(e => e.name.en === 'Potion of Supreme Healing').item.healing.bonus, 20);
    const cloak = store.catalog.search(new URLSearchParams({ q: 'Плащ' })).entries[0];
    assert.equal(cloak.item.attunement, true);
    assert.equal(store.catalog.coverage().structuredItems, 5);
    assert.equal(store.catalog.coverage().categories.artifact, 0);
    assert.equal(store.catalog.coverage().complete, false);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('invalid item types, dice, tuning and categories reject the entire import', () => {
  const store = openStore(':memory:');
  try {
    const mutations = [
      e => e.item.healing.diceCount = '2', e => e.item.healing.diceCount = 0,
      e => e.item.healing.diceCount = 2.5, e => e.item.healing.diceCount = 101,
      e => e.item.healing.diceSides = 7, e => e.item.healing.bonus = -1,
      e => e.item.healing.bonus = NaN, e => e.item.healing.bonus = Infinity,
      e => delete e.item.healing.bonus, e => e.item.healing.extra = 1,
      e => e.item.type = 'unknown', e => e.item.rarity = 'artifact',
      e => e.item.attunement = 'false', e => e.item.attunementRequirement = 'wizard',
      e => e.item.type = 'weapon', e => e.kind = 'spell', e => e.kind = 'artifact',
      e => e.source.usage = 'reference-only', e => e.item.weight = -1,
    ];
    for (const mutate of mutations) {
      const bad = structuredClone(bundle.entries[0]); mutate(bad);
      assert.throws(() => store.catalog.importEntries({ schemaVersion: 1, entries: [bundle.entries[4], bad] }, { apply: true }), { status: 422 });
      assert.equal(store.catalog.coverage().total, 0);
    }
    store.catalog.importEntries(bundle, { apply: true });
    const changed = structuredClone(bundle); changed.entries[0].item.healing.bonus = 3;
    assert.throws(() => store.catalog.importEntries(changed, { apply: true }), { status: 409 });
    assert.equal(store.catalog.search(new URLSearchParams({ q: 'Potion of Healing' })).entries[0].item.healing.bonus, 2);
  } finally { store.close(); }
});

test('item API exposes verified formulas, licensing and coverage', async t => {
  const store = openStore(':memory:');
  store.catalog.importEntries(bundle, { apply: true });
  const app = createApp(store);
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => app.close(resolve)); store.close(); });
  const base = `http://127.0.0.1:${app.address().port}/api/catalog`;
  const found = await fetch(`${base}?kind=item&q=Supreme`).then(r => r.json());
  assert.equal(found.total, 1);
  assert.deepEqual(found.entries[0].item.healing, { diceCount: 10, diceSides: 4, bonus: 20 });
  assert.equal(found.entries[0].source.usage, 'cc-by-4.0');
  assert.match(found.entries[0].source.url, /#page=234$/);
  const coverage = await fetch(`${base}/coverage`).then(r => r.json());
  assert.equal(coverage.structuredItems, 5);
  assert.equal(coverage.openlyLicensed, 5);
});
