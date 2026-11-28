import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {buildAdventureWordingReview, inputs, reviewAdventureWording} from '../scripts/review-d07-adventure-wording-2014.mjs';

import {adventureWordingPath,readAuditInput} from '../scripts/catalog-audit-inputs.mjs';

const read = path => JSON.parse(readFileSync(new URL('../' + path, import.meta.url)));
const input = () => inputs.map(path => JSON.parse(readAuditInput(adventureWordingPath, path)));

test('D07 evidence keeps 116 adventure observations and 20 original Monster Manual references', () => {
  const report = buildAdventureWordingReview();
  assert.deepEqual(report, read('catalog/d07-adventure-wording-rights-2014.json'));
  assert.deepEqual(report.summary, {
    uniqueObservations: 136,
    originalAdventureObservations: 116,
    uniqueMonsterManualReferences: 20,
    originalObservationsBySource: {'103': 20, '132': 94, '161': 5, '206': 17},
    observationsWithCatalogCandidates: 0,
    independentTextClearances: 0,
  });
  assert.equal(new Set(report.records.map(row => row.observationId)).size, 136);
  assert.equal(report.approvedDenominator, null);
  assert.ok(report.records.every(row => row.textReuse === 'not-established-for-reference-text'));
  const references = report.records.filter(row => row.referredToBySktCards.length);
  assert.ok(references.every(row => row.originalSourceIds.join() === '103'));
});

test('changed rights evidence or an added catalog match requires a new review', () => {
  const modifications = [
    scope => { scope.records.push(scope.records[0]); },
    (scope, _audit, skt) => {
      const id = skt.displayedReferences[0].observationCandidates[0].observationId;
      scope.records.find(row => row.id === id).sourceIds = ['132'];
    },
    scope => { scope.records.find(row => row.sourceIds.includes('132') && row.section === 'bestiary').candidateIds = ['srd51:example']; },
    (_scope, audit) => {
      audit.publications.find(row => row.id === 'numeric:206').upstreamReuseDeclaration = 'granted';
    },
  ];
  for (const change of modifications) {
    const values = input();
    change(...values);
    assert.throws(() => reviewAdventureWording(...values));
  }
});

test('home-game notice attaches only to the 18 printed blocks and never clears application reuse', () => {
  const report = buildAdventureWordingReview();
  const appendixIndex = read('catalog/skt-appendix-d-npc-index-2014.json');
  const expected = new Map(appendixIndex.namedStatBlockPages.flatMap(({pdfPage, printedPage, cards}) =>
    cards.map(card => [card.secondaryObservationId, {pdfPage, printedPage}])));
  const actual = new Map(report.records.filter(row => row.appendixDNoticeLocator)
    .map(row => [row.observationId, row.appendixDNoticeLocator]));
  assert.equal(actual.size, 18);
  assert.deepEqual(actual, expected);
  assert.equal(report.appendixDNotice.sourceId, '132');
  assert.equal(report.appendixDNotice.observedPermission, 'home-game-photocopy');
  assert.equal(report.appendixDNotice.appTextReusePermission, 'not-established');
  assert.equal(report.summary.independentTextClearances, 0);
});

test('new application permission, an unknown locator, or another source needs separate review', () => {
  const mutations = [
    (_scope, _audit, _skt, index) => { index.namedStatBlockPages.pop(); },
    (_scope, _audit, _skt, _index, composition) => {
      composition.publisherAppendix.appTextReusePermission = 'granted';
    },
    (_scope, _audit, _skt, index) => {
      index.namedStatBlockPages[0].pdfPage = 10;
      index.namedStatBlockPages[0].printedPage = 256;
    },
    (_scope, _audit, skt, index) => {
      index.namedStatBlockPages[0].cards[0].secondaryObservationId =
        skt.displayedReferences[0].observationCandidates[0].observationId;
    },
  ];
  for (const mutate of mutations) {
    const values = input();
    mutate(...values);
    assert.throws(() => reviewAdventureWording(...values), /Appendix D/);
  }
});
