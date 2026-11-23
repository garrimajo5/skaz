import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { build, inputs, reviewResidual, verifyPublisherToc } from '../scripts/review-skt-index-residual-2014.mjs';

const loadInputs = () => inputs.map(path => JSON.parse(readFileSync(new URL('../'+path, import.meta.url))));

test('committed SKT report keeps both directed residuals and the source partitions', () => {
  const result = build();
  const committed = JSON.parse(readFileSync(new URL('../catalog/skt-index-residual-2014.json', import.meta.url)));
  assert.deepEqual(result, committed);
  assert.equal(result.publisherIndexRows, 105);
  assert.equal(result.publisherRowsWithBlankChallengeRating, 22);
  assert.equal(result.secondarySourceObservations, 94);
  assert.equal(result.publisherResidual.length, 16);
  assert.equal(result.secondaryResidual.length, 25);
  assert.equal(result.displayedReferences.length, 20);
  assert.equal(result.secondaryRowsWithPreviousVariantCandidate, 5);
  assert.equal(result.approvedDenominator, null);
  assert.deepEqual(result.categoryCounts, {
    'previously-documented-variant': 3,
    'index-only': 2,
    'explicit-variant-label': 6,
    'appendix-heading': 1,
    'blank-cr': 4,
  });
});

test('CR zero and blank CR survive as different values and a redirect cannot accept a stat block', () => {
  const { publisherResidual } = build();
  const child = publisherResidual.find(row => row.digitalName === 'Cloud Giant Child');
  assert.equal(child.challengeRating, '0');
  const blanks = publisherResidual.filter(row => row.category === 'blank-cr');
  assert.deepEqual(blanks.map(row => row.digitalName), ['Nimir', 'Orlekto', 'Shaldoor', 'Vaasha']);
  for (const row of blanks) {
    assert.equal(row.challengeRating, null);
    assert.equal(row.publisherWitness.fullBodyRead, false);
    assert.equal(row.standaloneStatBlockVerified, false);
  }
  assert.equal(blanks.at(-1).publisherWitness.result, 'timeout');
  assert.equal(blanks.at(-1).publisherWitness.destination, null);
  assert.ok(blanks.slice(0, -1).every(row => row.publisherWitness.result === 'redirect-to-marketplace'));
});

test('the separate Young Cloud Giant card keeps its named observation and is not grouped with the child', () => {
  const { cloudGiantComparison } = build();
  assert.equal(cloudGiantComparison.youngObservation.id, 'dndsu:bestiary:7728');
  assert.notEqual(cloudGiantComparison.young.cardUrl, cloudGiantComparison.child.cardUrl);
  assert.deepEqual([cloudGiantComparison.child.challengeRating, cloudGiantComparison.child.size], ['0', 'Medium']);
  assert.deepEqual([cloudGiantComparison.young.challengeRating, cloudGiantComparison.young.size], ['5', 'Huge']);
  assert.equal(cloudGiantComparison.mergeSupported, false);
});

test('the variant groups preserve both dwarf roles and both princess identities', () => {
  const { publisherResidual, secondaryResidual } = build();
  const dwarf = publisherResidual.find(row => row.digitalName === 'Shield Dwarf');
  const princess = publisherResidual.find(row => row.digitalName === 'Storm Giant Princess');
  assert.deepEqual(dwarf.previousCandidateObservationIds, ['dndsu:bestiary:7706', 'dndsu:bestiary:7709']);
  assert.deepEqual(princess.previousCandidateObservationIds, ['dndsu:bestiary:7762', 'dndsu:bestiary:7763']);
  assert.equal(dwarf.acceptedAlias, false);
  assert.equal(princess.acceptedAlias, false);
  const ids = [...dwarf.previousCandidateObservationIds, ...princess.previousCandidateObservationIds];
  const selected = secondaryResidual.filter(row => ids.includes(row.observationId));
  assert.deepEqual(selected.map(row => row.selectedVariantFields.armorClass), [17, 10, 11, 12]);
});

test('references keep Monster Manual attribution and never give a SKT canonical entry', () => {
  const { displayedReferences, publisherResidual } = build();
  assert.ok(displayedReferences.every(row => row.displayedSource === 'Monster Manual (2014)' &&
    row.editionAttributionEstablishedByAdventureFilter === false &&
    row.observationCandidates.every(candidate => candidate.originalSourceIds.join() === '103')));
  assert.ok(publisherResidual.every(row => row.canonicalId === null && !row.standaloneStatBlockVerified));
  const malisons = displayedReferences.filter(row => row.digitalName.startsWith('Yuan-ti Malison'));
  assert.equal(malisons.length, 4);
  assert.equal(new Set(malisons.map(row => row.cardUrl)).size, 4);
});

test('Hulking Crab has an appendix locator and the tribal spell discrepancy stays on the shaman', () => {
  const { publisherResidual, tribalSpellBoundary } = build();
  const crab = publisherResidual.find(row => row.digitalName === 'Hulking Crab');
  assert.equal(crab.publisherWitness.url, 'https://www.dndbeyond.com/sources/skt/creatures#HulkingCrab');
  assert.notEqual(crab.category, 'index-only');
  assert.equal(crab.standaloneStatBlockVerified, false);
  assert.equal(tribalSpellBoundary.sourceObservation, 'dndsu:bestiary:5606');
  assert.equal(tribalSpellBoundary.newStandaloneCreatureUnits, 0);
  assert.deepEqual([tribalSpellBoundary.primaryClaimEntries, tribalSpellBoundary.candidateSpellEntries], [22, 24]);
  assert.equal(tribalSpellBoundary.exactListVerified, false);
});

test('drops, promoted aliases and changes to input source claims fail validation', () => {
  for (const modify of [
    index => { index.originalSourceBestiaryWithoutNameCandidate.pop(); },
    index => { index.records[0].observationCandidates[0].originalSourceIds = ['132']; },
    (_index, _register, variants) => { variants.groups[0].automaticMerge = true; },
    (_index, _register, variants) => { variants.records[0].observedName += ' (other)'; },
    index => { index.records[0].canonicalId = 'invented'; },
  ]) {
    const values = loadInputs();
    modify(...values);
    assert.throws(() => reviewResidual(...values));
  }
  assert.throws(() => verifyPublisherToc(Buffer.from('Unrelated HTML')), /SHA-256 mismatch/);
});
