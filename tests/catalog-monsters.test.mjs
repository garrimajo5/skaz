import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openStore } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';
const bundle = JSON.parse(readFileSync(new URL('../catalog/srd51-monsters.json', import.meta.url), 'utf8'));

test('monster import is canonical and leaves progress untouched', () => {
  const store = openStore(':memory:');
  try {
    const before = store.read();
    assert.equal(store.catalog.importEntries(bundle).added, 2);
    assert.equal(store.catalog.coverage().total, 0);
    assert.equal(store.catalog.importEntries(bundle, { apply: true }).added, 2);
    const reordered = structuredClone(bundle);
    reordered.entries.reverse();
    for (const entry of reordered.entries) entry.monster.abilities = Object.fromEntries(Object.entries(entry.monster.abilities).reverse());
    assert.equal(store.catalog.importEntries(reordered, { apply: true }).unchanged, 2);
    assert.deepEqual(store.read(), before);
    assert.equal(store.catalog.coverage().structuredMonsters, 2);
    assert.equal(store.catalog.coverage().complete, false);
    const changed = structuredClone(bundle); changed.entries[0].monster.hitPoints++;
    assert.throws(() => store.catalog.importEntries(changed, { apply: true }), { status: 409 });
    assert.equal(store.catalog.search(new URLSearchParams({ q: 'Goblin' })).entries[0].monster.hitPoints, 7);
  } finally { store.close(); }
});

test('monster schema rejects invalid numbers, missing abilities and cross-category structures atomically', () => {
  const store = openStore(':memory:');
  try {
    const mutations = [
      e => e.monster.armorClass = '15', e => e.monster.hitPoints = 0,
      e => e.monster.hitPoints = Infinity, e => e.monster.xp = -1,
      e => e.monster.xp = 2.5, e => e.monster.challenge = 0.25,
      e => e.monster.challenge = '1/3', e => e.monster.challenge = '31',
      e => e.monster.speed.walk = -1, e => e.monster.speed.walk = NaN,
      e => e.monster.speed = {}, e => e.monster.speed.hover = true,
      e => delete e.monster.abilities.cha, e => e.monster.abilities.str = 31,
      e => e.monster.abilities.int = 0, e => e.monster.type = 'unknown',
      e => e.monster.size = 'unknown', e => e.monster.damage = 12,
      e => e.kind = 'item', e => e.source.usage = 'reference-only',
    ];
    for (const mutate of mutations) {
      const bad = structuredClone(bundle.entries[0]); mutate(bad);
      assert.throws(() => store.catalog.importEntries({ schemaVersion: 1, entries: [bundle.entries[1], bad] }, { apply: true }), { status: 422 });
      assert.equal(store.catalog.coverage().total, 0);
    }
  } finally { store.close(); }
});

test('bestiary API returns bilingual search, source and fractional challenge without coercion', async t => {
  const store = openStore(':memory:'); store.catalog.importEntries(bundle, { apply: true });
  const app = createApp(store);
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => app.close(resolve)); store.close(); });
  const base = `http://127.0.0.1:${app.address().port}/api/catalog`;
  for (const q of ['СКЕЛЕТ', 'Skeleton']) {
    const found = await fetch(`${base}?kind=monster&q=${encodeURIComponent(q)}`).then(r => r.json());
    assert.equal(found.total, 1);
    assert.equal(found.entries[0].monster.challenge, '1/4');
    assert.equal(found.entries[0].monster.abilities.con, 15);
    assert.match(found.entries[0].source.url, /#page=346$/);
  }
  const coverage = await fetch(`${base}/coverage`).then(r => r.json());
  assert.equal(coverage.structuredMonsters, 2);
  assert.equal(coverage.categories.monster, 2);
});
