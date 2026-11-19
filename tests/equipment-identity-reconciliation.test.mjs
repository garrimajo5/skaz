import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { bundledCatalog } from '../server/bundled-catalog.mjs';
import { proposalPaths, reconcileEquipmentIdentities } from '../scripts/reconcile-equipment-identities.mjs';

const paths = ['catalog/dndsu-equipment-discovery.json', ...proposalPaths];
const raw = paths.map(path => readFileSync(new URL('../' + path, import.meta.url), 'utf8').replace(/\r\n/g, '\n'));
const [discovery, ...proposals] = raw.map(text => JSON.parse(text));
const runtime = bundledCatalog().bundle.entries;
const fixture = () => structuredClone([discovery, proposals, runtime]);

test('identity reconciliation reproduces all 186 observations and six pinned input hashes without claiming full coverage', () => {
  const saved = JSON.parse(readFileSync(new URL('../catalog/equipment-identity-reconciliation.json', import.meta.url), 'utf8'));
  const { inputSha256, ...report } = saved;
  const original = JSON.stringify([discovery, proposals]);
  assert.deepEqual(reconcileEquipmentIdentities(discovery, proposals, runtime), report);
  assert.equal(JSON.stringify([discovery, proposals]), original);
  assert.deepEqual(inputSha256, Object.fromEntries(paths.map((path, index) => [path, createHash('sha256').update(raw[index]).digest('hex')])));
  assert.deepEqual(report.summary, { observedRows: 186, matchedIdentities: 186, unresolvedIdentities: 0, resolvedOutsideInitialSource: 2, existingRuntimeIdsReused: 1,
    countsBySource: { 'System Reference Document 5.1': 184, 'Basic Rules (2014)': 2 } });
  assert.equal(report.complete, false);
  assert.equal(report.approvedDenominator, null);
});

test('initial SRD omissions stay unresolved if the Basic Rules proposal is not supplied', () => {
  const result = reconcileEquipmentIdentities(discovery, proposals.slice(0, 4), runtime);
  assert.equal(result.summary.matchedIdentities, 184);
  assert.equal(result.summary.unresolvedIdentities, 2);
  assert.equal(result.summary.resolvedOutsideInitialSource, 0);
  assert.deepEqual(new Set(result.unresolvedObservationIds), new Set(proposals[2].unmatched.map(row => row.observationId)));
});

test('lost observations, conflicting identities and accidental runtime overwrites fail explicitly', () => {
  for (const mutate of [
    ([d]) => d.articles[0].records.push(d.articles[0].records[0]),
    ([, p]) => p[0].records.pop(),
    ([, p]) => p[0].records[0].observationId = 'unknown',
    ([, p]) => p[1].records[0].proposedCanonicalId = p[0].records[0].proposedCanonicalId,
    ([, p]) => p[0].records[0].observedName = 'Changed observation',
    ([, p]) => p[0].records[0].observedPrice = '0 зм',
    ([, p]) => p[0].records[0].fullRules = 'verified',
    ([, p]) => p[0].ruleset = '5e-2024',
    ([, p]) => p[0].source.url = '',
    ([, p]) => p[3].records.find(row => row.identityDisposition).identityDisposition = undefined,
    ([, p, live]) => live.push({ id: p[0].records[0].proposedCanonicalId }),
    ([, p]) => p[2].unmatched[0].observationId = 'unknown',
  ]) {
    const args = fixture(); mutate(args);
    assert.throws(() => reconcileEquipmentIdentities(...args));
  }
});
