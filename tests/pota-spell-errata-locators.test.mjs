import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => JSON.parse(readFileSync(new URL('../' + path, import.meta.url)));
const report = read('catalog/pota-spell-errata-locators-2014.json');

test('PotA errata keeps 22 description headings and four separate class-list additions', () => {
  const rows = [...report.descriptionErrata, ...report.spellListAdditions];
  const inventory = read('catalog/eepc-spell-inventory-2014.json');
  const source = new Map(inventory.records.map(row => [row.observationId, row]));
  assert.equal(report.descriptionErrata.length, 22);
  assert.equal(report.spellListAdditions.length, 4);
  assert.equal(new Set(rows.map(row => row.observationId)).size, 24);
  assert.equal(report.uniqueAffectedObservations, 24);
  for (const row of rows) {
    assert.equal(source.get(row.observationId).observedName, row.observedName);
    assert.deepEqual(source.get(row.observationId).originalSourceIds, ['107', '109']);
  }
  assert.deepEqual(report.spellListAdditions.map(row => [row.observedName, row.class, row.printing]), [
    ['Absorb elements', 'sorcerer', '5th'],
    ['Tidal wave', 'sorcerer', '5th'],
    ['Whirlwind', 'sorcerer', '5th'],
    ['Warding wind', 'wizard', '5th'],
  ]);
});

test('mixed printing labels are preserved without applying them to EEPC or XGE', () => {
  const descriptions = new Map(report.descriptionErrata.map(row => [row.observedName, row.printings]));
  assert.deepEqual(descriptions.get('Catapult'), ['future', '5th']);
  assert.deepEqual(descriptions.get('Create bonfire'), ['5th', 'future']);
  assert.deepEqual(descriptions.get('Bones of the earth'), ['future']);
  assert.equal(report.targetPublicationSourceId, '107');
  assert.equal(report.automaticRulesPatch, false);
  assert.equal(report.exactRulesVersionAccepted, false);
  assert.equal(report.textReusePermission, 'not-established');
  assert.equal(report.approvedDenominator, null);
});
