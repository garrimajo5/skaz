import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL('../' + path, import.meta.url));
const report = JSON.parse(read('catalog/skt-crab-index-comparison-2014.json'));

test('two superficially similar crabs have different URLs, sources and digital CRs', () => {
  const [hulking, huge] = report.records;
  for (const [path, hash] of Object.entries(report.inputSha256)) {
    assert.equal(createHash('sha256').update(read(path)).digest('hex'), hash);
  }
  const { publisherResidual } = JSON.parse(read('catalog/skt-index-residual-2014.json'));
  const original = publisherResidual.find(row => row.cardUrl === hulking.cardUrl);
  assert.deepEqual(
    [hulking.name, hulking.displayedSource, hulking.challengeRating, hulking.sourceLocator],
    [original.digitalName, original.displayedSource, original.challengeRating, original.publisherWitness.url]
  );
  assert.notEqual(hulking.cardUrl, huge.cardUrl);
  assert.deepEqual(report.records.map(row => row.challengeRating), ['5', '8']);
  assert.deepEqual(report.records.map(row => row.displayedSource), [
    "Storm King's Thunder",
    'Tales from the Yawning Portal',
  ]);
});

test('no exact-name matches are silently made into aliases or counted as accepted units', () => {
  const { records } = JSON.parse(read('catalog/scope-register-2014.json'));
  for (const card of report.records) {
    const matches = records.filter(row => row.section === 'bestiary' &&
      row.names.en?.toLowerCase() === card.name.toLowerCase());
    assert.deepEqual(card.exactSecondaryObservationIds, matches.map(row => row.id));
    assert.equal(matches.length, 0);
  }
  assert.equal(report.automaticMerge, false);
  assert.equal(report.printedEquivalence, 'unverified');
  assert.equal(report.approvedDenominator, null);
});
