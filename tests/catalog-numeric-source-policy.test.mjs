import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { applyNumericSourcePolicy } from '../scripts/catalog-numeric-source-policy.mjs';

const paths = ['catalog/dndsu-source-register.json', 'catalog/scope-register-2014.json', 'catalog/numeric-source-publisher-evidence.json'];
const raw = paths.map(path => readFileSync(new URL('../' + path, import.meta.url), 'utf8').replace(/\r\n/g, '\n'));
const inputs = raw.map(text => JSON.parse(text));
const fixture = () => structuredClone(inputs);

test('numeric source policy reproduces pinned evidence without changing observations or accepting unknown sources', () => {
  const original = JSON.stringify(inputs);
  const result = applyNumericSourcePolicy(...inputs);
  const saved = JSON.parse(readFileSync(new URL('../catalog/numeric-source-scope-policy-2014.json', import.meta.url), 'utf8'));
  const { inputSha256, ...report } = saved;
  assert.deepEqual(result, report);
  assert.deepEqual(inputSha256, Object.fromEntries(paths.map((path, index) => [path, createHash('sha256').update(raw[index]).digest('hex')])));
  assert.equal(JSON.stringify(inputs), original);
  assert.deepEqual(result.summary, { observedSources: 70, reviewedSources: 9, observedPages: 4973, affectedPages: 9, excludedPages: 9, mixedSourcePages: 0 });
  assert.equal(result.approvedDenominator, null);
  assert.equal(result.complete, false);
  assert.equal(result.records.filter(row => row.disposition === 'not-reviewed-by-this-audit').length, 61);
  assert.ok(result.affectedPages.every(row => row.originalInclusion === 'excluded-homebrew'));
  assert.ok(result.affectedPages.every(row => !row.included && row.fullRules === 'unverified'));
});

test('mixed official candidate and excluded author requires review instead of excluding the whole identity', () => {
  const [sources, scope, evidence] = fixture();
  scope.records = [{ id: 'synthetic:mixed', sourceIds: ['102', '179'], inclusion: 'candidate-2014' }];
  const result = applyNumericSourcePolicy(sources, scope, evidence);
  assert.equal(result.summary.excludedPages, 0);
  assert.equal(result.summary.mixedSourcePages, 1);
  assert.equal(result.affectedPages[0].disposition, 'needs-mixed-source-review');
  assert.deepEqual(result.affectedPages[0].sourceIds, ['102', '179']);
  assert.deepEqual(result.affectedPages[0].excludedSourceIds, ['179']);
});

test('unknown, duplicated or renamed bibliography evidence fails rather than silently applying a decision', () => {
  for (const mutate of [
    ([sources]) => sources.sources.push(sources.sources[0]),
    ([,, evidence]) => evidence.records.push(evidence.records[0]),
    ([,, evidence]) => evidence.records[0].sourceId = 'unknown',
    ([,, evidence]) => evidence.records[0].observedTitle = 'Different book',
    ([,, evidence]) => evidence.records[0].publicationKind = 'official',
    ([,, evidence]) => evidence.records[0].evidenceUrl = '',
    ([, scope]) => scope.records.push(scope.records[0]),
    ([, scope]) => scope.records[0].sourceIds = ['179', '179'],
  ]) {
    const args = fixture(); mutate(args);
    assert.throws(() => applyNumericSourcePolicy(...args));
  }
});

test('two excluded sources remain excluded, while empty or unreviewed sources never become official', () => {
  const [sources, scope, evidence] = fixture();
  scope.records = [
    { id: 'synthetic:excluded', sourceIds: ['179', '190'], inclusion: 'candidate-2014' },
    { id: 'synthetic:unknown', sourceIds: ['not-reviewed'], inclusion: 'needs-source-review' },
    { id: 'synthetic:empty', sourceIds: [], inclusion: 'needs-source-review' },
  ];
  const result = applyNumericSourcePolicy(sources, scope, evidence);
  assert.equal(result.summary.observedPages, 3);
  assert.equal(result.summary.affectedPages, 1);
  assert.equal(result.affectedPages[0].disposition, 'excluded-by-owner-source-policy');
  assert.deepEqual(result.affectedPages[0].excludedSourceIds, ['179', '190']);
});

test('eligible core publications do not certify page text and require edition plus publisher evidence', () => {
  const report = applyNumericSourcePolicy(...inputs);
  assert.deepEqual(report.records.filter(row => row.disposition === 'eligible-publication-records-need-review').map(row => row.sourceId), ['101', '102', '103', '109', '116', '117']);
  assert.ok(report.records.filter(row => row.editionEvidenceUrl).every(row => row.exactTextVersion === 'unverified' && row.reusePermission === 'not-established'));
  for (const [key, value] of [['publisher', 'Other publisher'], ['ruleset', '5e-2024'], ['editionEvidenceUrl', '']]) {
    const args = fixture();
    args[2].records.find(row => row.sourceId === '101')[key] = value;
    assert.throws(() => applyNumericSourcePolicy(...args), /official 2014 publication evidence/);
  }
});
