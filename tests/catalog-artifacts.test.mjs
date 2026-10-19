import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openStore } from '../server/store.mjs';
const read = file => JSON.parse(readFileSync(new URL('../catalog/' + file, import.meta.url), 'utf8'));
const bundle = read('srd51-artifacts.json'), spells = read('srd51-spells.json');

test('artifact dependency, preview and replay preserve progress and category coverage', () => {
  const store = openStore(':memory:');
  try {
    const before = store.read();
    assert.throws(() => store.catalog.importEntries(bundle, { apply: true }), { status: 422 });
    assert.equal(store.catalog.coverage().total, 0);
    store.catalog.importEntries(spells, { apply: true });
    assert.equal(store.catalog.importEntries(bundle).added, 1);
    assert.equal(store.catalog.coverage().categories.artifact, 0);
    assert.equal(store.catalog.importEntries(bundle, { apply: true }).added, 1);
    assert.equal(store.catalog.importEntries(bundle, { apply: true }).unchanged, 1);
    const orb = store.catalog.search(new URLSearchParams({ kind: 'artifact', q: 'Orb' })).entries[0];
    assert.equal(orb.artifact.charges.max, 7);
    assert.equal(orb.artifact.attunement, true);
    assert.match(orb.source.url, /#page=252$/);
    assert.equal(store.catalog.coverage().structuredArtifacts, 1);
    assert.equal(store.catalog.coverage().complete, false);
    assert.deepEqual(store.read(), before);
    const changed = structuredClone(bundle); changed.entries[0].artifact.charges.max = 8;
    assert.throws(() => store.catalog.importEntries(changed, { apply: true }), { status: 409 });
  } finally { store.close(); }
});

test('artifact invalid charges, types and cross-kind fields reject an entire batch', () => {
  const store = openStore(':memory:');
  try {
    for (const mutate of [
      e => e.artifact.charges.max = '7', e => e.artifact.charges.max = 0,
      e => e.artifact.charges.max = 1.5, e => e.artifact.charges.max = Infinity,
      e => e.artifact.charges.max = 10001, e => e.artifact.charges.recharge = '',
      e => e.artifact.charges.current = 7, e => e.artifact.attunement = 'true',
      e => e.artifact.type = 'unknown', e => e.kind = 'item',
      e => e.source.usage = 'reference-only',
    ]) {
      const bad = structuredClone(bundle.entries[0]); mutate(bad);
      assert.throws(() => store.catalog.importEntries({ schemaVersion: 1, entries: [...spells.entries, bad] }, { apply: true }), { status: 422 });
      assert.equal(store.catalog.coverage().total, 0);
    }
    const noCharges = structuredClone(bundle.entries[0]); delete noCharges.artifact.charges;
    store.catalog.importEntries({ schemaVersion: 1, entries: [noCharges, ...spells.entries] }, { apply: true });
    assert.equal(store.catalog.search(new URLSearchParams({ kind: 'artifact' })).entries[0].artifact.charges, undefined);
  } finally { store.close(); }
});
