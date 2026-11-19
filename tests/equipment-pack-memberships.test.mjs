import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = file => JSON.parse(readFileSync(new URL('../catalog/' + file, import.meta.url), 'utf8').replace(/^\uFEFF/, ''));
const packs = read('srd51-equipment-pack-memberships.json');
const byName = name => packs.records.find(row => row.nameEn.startsWith(name));
const members = packs.records.flatMap(row => row.contents);

test('seven pack headings keep their listed prices and reference only reviewed candidate identities', () => {
  const observations = read('srd51-additional-equipment-discovery.json').records.filter(row => row.recordType === 'equipment-pack');
  const ids = new Set(['armor', 'weapon', 'tools', 'gear', 'gaming-sets'].flatMap(group => read(group + '-canonical-proposal-2014.json').records.map(row => row.proposedCanonicalId)));
  assert.equal(packs.records.length, 7);
  assert.deepEqual(new Set(packs.records.map(row => row.observationId)), new Set(observations.map(row => row.observationId)));
  assert.equal(new Set(packs.records.map(row => row.proposedCanonicalId)).size, 7);
  for (const pack of packs.records) {
    const observation = observations.find(row => row.observationId === pack.observationId);
    assert.equal(pack.listedCostGp, observation.pricing.amount);
    assert.equal(observation.pricing.currency, 'gp');
    assert.equal(pack.fullRules, 'unverified');
    assert.equal(pack.sourcePage, 70);
    assert.ok(pack.contents.every(row => row.candidateCatalogId === null || ids.has(row.candidateCatalogId)));
  }
  assert.equal(members.length, 66);
  assert.equal(members.filter(row => row.candidateCatalogId === null).length, 10);
  assert.equal(members.filter(row => row.quantity === null).length, 3);
});

test('pack quantities preserve packaged goods and prevent silent guesses for unresolved members', () => {
  const burglar = byName('Burglar').contents;
  const bearings = burglar.find(row => row.sourceName === 'ball bearings');
  assert.equal(bearings.quantity, 1);
  assert.equal(bearings.unit, 'bag of 1000');
  assert.equal(bearings.candidateCatalogId, 'srd51:2014:item:ball-bearings-bag-1000');
  const string = burglar.find(row => row.sourceName === 'string');
  assert.equal(string.quantity, 10);
  assert.equal(string.unit, 'foot');
  assert.equal(string.candidateCatalogId, null);
  assert.equal(members.filter(row => row.sourceName === 'hempen rope').length, 3);
  assert.ok(members.filter(row => row.sourceName === 'hempen rope').every(row => row.quantity === 1 && row.unit === '50-foot length'));
  assert.ok(members.filter(row => row.sourceName === 'ink').every(row => row.candidateCatalogId === null && row.quantity === 1 && row.unit === 'bottle'));
  assert.equal(byName('Scholar').contents.find(row => row.sourceName === 'small knife').candidateCatalogId, null);
  assert.ok(members.filter(row => row.quantity === null).every(row => row.note && row.unit === 'unspecified'));
  assert.ok(members.every(row => row.quantity === null || (Number.isInteger(row.quantity) && row.quantity > 0)));
  assert.equal(byName('Explorer').contents.find(row => row.sourceName === 'rations').quantity, 10);
  assert.equal(byName('Priest').contents.find(row => row.sourceName === 'rations').quantity, 2);
  assert.equal(byName('Diplomat').listedCostGp, 39);
});
