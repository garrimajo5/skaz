import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bundledCatalog } from '../server/bundled-catalog.mjs';
const read = name => JSON.parse(readFileSync(new URL('../catalog/' + name, import.meta.url), 'utf8').replace(/^\uFEFF/, ''));
const proposal = read('gaming-sets-canonical-proposal-2014.json');

test('Basic Rules resolves both SRD omissions without granting SRD licensing or losing observation identity', () => {
  const tools = read('tools-canonical-proposal-2014.json');
  const observations = read('dndsu-equipment-discovery.json').articles.flatMap(article => article.records);
  assert.equal(proposal.records.length, 2);
  assert.deepEqual(new Set(proposal.records.map(row => row.observationId)), new Set(tools.unmatched.map(row => row.observationId)));
  assert.equal(proposal.source.license, 'not-established');
  assert.equal(proposal.source.title, 'Basic Rules (2014)');
  assert.ok(proposal.source.url.includes('basic-rules-2014'));
  for (const row of proposal.records) {
    const original = observations.find(observation => observation.observationId === row.observationId);
    assert.equal(row.observedName, original.name);
    assert.equal(row.observedPrice, original.priceText);
    assert.equal(row.costCp, 100);
    assert.equal(row.observedPrice, '1 зм');
    assert.equal(row.fullRules, 'unverified');
    assert.ok(row.proposedCanonicalId.startsWith('basic-rules:2014:item:'));
  }
});

test('combined proposal covers exactly 186 observed identities with no duplicate runtime gaming sets', () => {
  const all = ['armor', 'weapon', 'tools', 'gear', 'gaming-sets'].flatMap(group => read(group + '-canonical-proposal-2014.json').records);
  assert.equal(all.length, 186);
  assert.equal(new Set(all.map(row => row.observationId)).size, 186);
  assert.equal(new Set(all.map(row => row.proposedCanonicalId)).size, 186);
  const live = new Set(bundledCatalog().bundle.entries.map(row => row.id));
  assert.ok(proposal.records.every(row => !live.has(row.proposedCanonicalId)));
});
