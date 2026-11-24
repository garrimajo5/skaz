import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL('../' + path, import.meta.url));
const report = JSON.parse(read('catalog/xge-eepc-spell-locators-2014.json'));

test('95 XGE observations and their nine captured pages retain all original IDs and distinct URLs', () => {
  for (const [path, expected] of Object.entries(report.inputSha256)) {
    assert.equal(createHash('sha256').update(read(path)).digest('hex'), expected);
  }
  const scope = JSON.parse(read('catalog/scope-register-2014.json'));
  const expected = scope.records.filter(row => row.section === 'spells' && row.sourceIds.includes('109'));
  const byId = new Map(report.records.map(row => [row.observationId, row]));
  assert.equal(byId.size, 95);
  assert.equal(report.records.length, byId.size);
  assert.equal(expected.length, byId.size);
  assert.equal(new Set(report.records.map(row => row.cardUrl)).size, 95);
  for (const row of expected) assert.deepEqual(byId.get(row.id).originalSourceIds, row.sourceIds);
  assert.deepEqual(Object.values(report.filters).map(filter => filter.pages.map(page => page.rowCount)), [
    [20, 20, 20, 20, 15], [20, 20, 3], [0],
  ]);
});

test('43 digital links are reused without promoting printed equivalence or disputing PotA print', () => {
  const eepc = JSON.parse(read('catalog/eepc-spell-inventory-2014.json'));
  const crossListed = report.records.filter(row => row.eepcIndexPage !== null);
  assert.deepEqual(new Set(crossListed.map(row => row.observationId)),
    new Set(eepc.records.map(row => row.observationId)));
  assert.equal(crossListed.length, 43);
  assert.deepEqual(report.counts, {xgeRows: 95, eepcRows: 43, potaRows: 0, sharedDigitalUrls: 43});
  assert.equal(report.printedVersionEquivalence, 'unverified');
  assert.equal(report.directPotaAppendixRead, false);
  assert.equal(report.fullRulesVerified, false);
  assert.equal(report.textReusePermission, 'not-established');
  assert.equal(report.approvedDenominator, null);
});

test('XGE print errata binds four pages to source 109 while digital cards stay reference-only', () => {
  const path = 'catalog/xge-eepc-spell-locators-2014.json';
  const errata = JSON.parse(read('catalog/xge-spell-errata-2014.json'));
  assert.equal(errata.inputSha256[path], createHash('sha256').update(read(path)).digest('hex'));
  assert.equal(errata.publisherSource.version, '1.0');
  assert.equal(errata.publisherSource.appliesFromPrinting, 4);
  assert.equal(errata.publisherSource.pdfPage, 1);
  assert.equal(errata.targetPublicationSourceId, '109');
  const byId = new Map(report.records.map(row => [row.observationId, row]));
  assert.deepEqual(errata.records.map(row => [row.observationId, row.xgePrintedPage, row.correctionScope]), [
    ['dndsu:spells:468', 157, 'healing-use-limit'],
    ['dndsu:spells:490', 157, 'dismissal-origin'],
    ['dndsu:spells:475', 160, 'unreducible-self-damage'],
    ['dndsu:spells:469', 162, 'upcast-die-size'],
  ]);
  for (const row of errata.records) {
    const original = byId.get(row.observationId);
    assert.deepEqual(original.originalSourceIds, ['109']);
    assert.equal(original.eepcIndexPage, null);
    assert.equal(row.digitalLocator, original.cardUrl);
    assert.equal(row.name, original.digitalName);
  }
  assert.equal(errata.printedFullTextCompared, false);
  assert.equal(errata.runtimeChanged, false);
  assert.equal(errata.textReusePermission, 'not-established');
  assert.equal(errata.approvedDenominator, null);
});
