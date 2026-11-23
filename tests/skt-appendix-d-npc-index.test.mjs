import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL('../' + path, import.meta.url));
const report = JSON.parse(read('catalog/skt-appendix-d-npc-index-2014.json'));
const getPinned = path => {
  const raw = read(path);
  assert.equal(createHash('sha256').update(raw).digest('hex'), report.inputSha256[path]);
  return JSON.parse(raw);
};
const namedBlocks = report.namedStatBlockPages.flatMap(page => page.cards);

test('Appendix D accounts for all 22 blank-CR cards with two different printed roles', () => {
  const index = getPinned('catalog/skt-public-index-2014.json');
  const shared = getPinned(report.publisherAppendixSource);
  const blankCrCards = index.pages.flatMap(page => page.rows).filter(card => card.challengeRating === '');
  assert.equal(report.printedCardKind, 'individually-printed-npc-stat-block');
  assert.equal(namedBlocks.length, 18);
  assert.equal(shared.namedCards.length, 4);
  const byUrl = new Map(
    [...namedBlocks, ...shared.namedCards].map(card => [card.indexCardUrl, card.name])
  );
  assert.equal(byUrl.size, 22);
  for (const card of blankCrCards) {
    assert.equal(byUrl.get(card.cardUrl), card.digitalName);
  }
  assert.equal(blankCrCards.length, byUrl.size);
});

test('nine pages keep two named stat blocks each and preserve the 18 original source observations', () => {
  const { records } = getPinned('catalog/scope-register-2014.json');
  const byId = new Map(records.map(row => [row.id, row]));
  assert.deepEqual(report.namedStatBlockPages.map(({ pdfPage }) => pdfPage), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  for (const page of report.namedStatBlockPages) {
    assert.equal(page.printedPage, page.pdfPage + 246);
    assert.equal(page.cards.length, 2);
  }
  assert.equal(new Set(namedBlocks.map(card => card.secondaryObservationId)).size, 18);
  for (const card of namedBlocks) {
    const observation = byId.get(card.secondaryObservationId);
    assert.equal(observation.names.en, card.name);
    assert.deepEqual(observation.sourceIds, ['132']);
  }
  assert.equal(report.digitalCardEquivalence, 'unverified');
  assert.equal(report.appTextReusePermission, 'not-established');
  assert.equal(report.approvedDenominator, null);
});
