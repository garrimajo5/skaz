import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL('../' + path, import.meta.url));
const report = JSON.parse(read('catalog/eepc-spell-inventory-2014.json'));

test('all 43 original PotA and XGE observations retain exact IDs and attribution', () => {
  for (const [path, hash] of Object.entries(report.inputSha256)) {
    assert.equal(createHash('sha256').update(read(path)).digest('hex'), hash);
  }
  const { records } = JSON.parse(read('catalog/scope-register-2014.json'));
  const observations = records.filter(row => row.section === 'spells' && row.sourceIds.includes('107'));
  const byId = new Map(report.records.map(row => [row.observationId, row]));
  assert.equal(byId.size, 43);
  assert.equal(report.records.length, byId.size);
  assert.equal(observations.length, byId.size);
  for (const row of observations) {
    assert.equal(byId.get(row.id)?.observedName, row.names.en);
    assert.deepEqual(byId.get(row.id).originalSourceIds, row.sourceIds);
  }
});

test('ritual metadata and differing PDF pages survive without implying body identity', () => {
  const byName = new Map(report.records.map(row => [row.observedName.toLowerCase(), row]));
  const skywrite = byName.get('skywrite');
  assert.equal(skywrite.ritual, true);
  assert.equal(skywrite.level, 2);
  assert.equal(byName.get('create bonfire').level, 0);
  const moved = report.records.filter(row => row.pdfPages.ee2015 !== row.pdfPages.ee2016);
  assert.deepEqual(moved.map(row => [row.observedName, row.pdfPages]), [
    ['Create bonfire', {ee2015: 16, ee2016: 17}],
  ]);
  assert.equal(report.directPotaAppendixRead, false);
  assert.equal(report.bodyEquivalence, 'unverified');
  assert.equal(report.wholeCatalogCoverageAccepted, false);
  assert.equal(report.textReusePermission, 'not-established');
  assert.equal(report.approvedDenominator, null);
});

test('secondary metadata on each stable ID agrees on circle, school and ritual', () => {
  const secondary = JSON.parse(read('catalog/dndsu-spell-index-metadata.json'));
  const byId = new Map(secondary.records.map(row => [row.pageId, row.fields]));
  assert.equal(report.secondaryMetadataMatches, 43);
  for (const spell of report.records) {
    const fields = byId.get(spell.observationId);
    assert.deepEqual([spell.level, spell.school, spell.ritual], [fields.level, fields.school, fields.ritual]);
  }
});
