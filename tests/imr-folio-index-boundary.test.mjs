import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { build, inputs, reviewBoundary, verifyPublisherContents } from '../scripts/review-imr-folio-index-boundary-2014.mjs';

const loadInputs = () => inputs.map(path => JSON.parse(readFileSync(new URL('../'+path, import.meta.url))));

test('the two publication partitions and the current and historical Folio counts stay separate', () => {
  const result = build();
  const saved = JSON.parse(readFileSync(new URL('../catalog/imr-folio-index-boundary-2014.json', import.meta.url)));
  assert.deepEqual(result, saved);
  assert.deepEqual(result.counts, {
    indexRows: 56,
    displayedOwnSourceRows: 26,
    ownRowsWithoutNameCandidates: 20,
    ownRowsWithOriginalImrObservations: 5,
    displayedReferenceRows: 30,
    referenceRowsWithoutNameCandidates: 10,
    folioPrintContentsRows: 18,
    folioHistoricalDigitalDescription: 17,
    folioCurrentFilterRows: 18,
    folioCurrentDisplayedOwnSourceRows: 17,
    sharedDigitalCards: 1,
  });
  assert.equal(result.approvedDenominator, null);
  assert.equal(result.publisherProduct.scope, 'Encounter Builder availability');
  assert.equal(result.publisherProduct.appendix.fullBodyRead, false);
  const needle = result.unresolvedFolioIdentity;
  assert.equal(needle.observationId, 'dndsu:bestiary:17367');
  assert.equal(needle.printedChallengeRating, needle.digitalChallengeRating);
  assert.notEqual(needle.printedName, needle.digitalName);
  assert.equal(needle.identityConfirmed, false);
});

test('Eye of Fear and Flame is one digital URL with two index memberships and original 206 attribution', () => {
  const { sharedDigitalCards, ownPublisherRows } = build();
  assert.equal(sharedDigitalCards.length, 1);
  const eye = sharedDigitalCards[0];
  assert.equal(eye.digitalName, 'Eye of Fear and Flame');
  assert.deepEqual(eye.seenInPublications, ['161', '206']);
  assert.deepEqual(eye.folioObservationCandidates[0].originalSourceIds, ['206']);
  assert.deepEqual(eye.observationCandidates[0].originalSourceIds, ['206']);
  assert.equal(eye.printedEquivalent, null);
  assert.equal(eye.canonicalId, null);
  assert.equal(ownPublisherRows.find(row => row.cardUrl === eye.cardUrl).hasObservationWithImrSource, false);
});

test('same-name Boggle and Redcap pairs keep their two distinct source versions', () => {
  const { displayedReferences } = build();
  for (const name of ['Boggle', 'Redcap']) {
    const rows = displayedReferences.filter(row => row.digitalName === name);
    assert.equal(new Set(rows.map(row => row.cardUrl)).size, 2);
    assert.equal(new Set(rows.map(row => row.displayedSource)).size, 2);
    assert.ok(rows.every(row => row.sourceVersionCandidates.length === 2));
  }
});

test('a repeated URL, changed edition label, or accepted canonical identity blocks the report', () => {
  for (const change of [
    imr => { imr.records[1].cardUrl = imr.records[0].cardUrl; },
    (_imr, folio) => {
      folio.digitalIndexEvidence.rows.find(row => row.digitalName === 'Eye of Fear and Flame').displayedSource =
        "Mordenkainen's Fiendish Folio Volume 1";
    },
    (_imr, folio) => { folio.digitalIndexEvidence.rows[0].canonicalId = 'invented'; folio.accepted = true; },
    (_imr, _folio, versions) => { versions.rows[0].automaticMerge = true; },
    (_imr, folio) => { folio.needleEvidence.identityConfirmed = true; },
  ]) {
    const args = loadInputs();
    change(...args);
    assert.throws(() => reviewBoundary(...args));
  }
  assert.throws(() => verifyPublisherContents(Buffer.from('Shop page')), /SHA-256 mismatch/);
});
