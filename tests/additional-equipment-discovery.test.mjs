import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = file => JSON.parse(readFileSync(new URL('../catalog/' + file, import.meta.url), 'utf8').replace(/^\uFEFF/, ''));
const discovery = read('srd51-additional-equipment-discovery.json');
const byName = name => discovery.records.find(row => row.nameEn === name);

test('additional discovery keeps heterogeneous units outside the approved item denominator', () => {
  assert.equal(discovery.records.length, 82);
  assert.equal(new Set(discovery.records.map(row => row.observationId)).size, 82);
  const existing = new Set(read('dndsu-equipment-discovery.json').articles.flatMap(article => article.records.map(row => row.observationId)));
  assert.ok(discovery.records.every(row => !existing.has(row.observationId)));
  assert.equal(discovery.approvedDenominator, null);
  assert.equal(discovery.complete, false);
  assert.ok(discovery.records.every(row => row.canonicalCatalogId === null && row.fullRules === 'unverified'));
  assert.equal(discovery.records.filter(row => row.recordType === 'equipment-pack').length, 7);
  assert.equal(discovery.records.filter(row => row.recordType === 'mount-purchase-option').length, 8);
  assert.equal(discovery.records.filter(row => row.section === 'Tack, Harness, and Drawn Vehicles').length, 14);
  assert.equal(discovery.records.filter(row => row.recordType === 'water-vehicle').length, 6);
});

test('barding multiplier and daily fees cannot be mistaken for fixed purchase prices', () => {
  assert.deepEqual(byName('Barding').pricing, { mode: 'multiplier', factor: 4, base: 'equivalent-armor-for-humanoids' });
  assert.equal(byName('Barding').recordType, 'barding-price-rule');
  assert.equal(byName('Stabling (per day)').recordType, 'service');
  assert.equal(byName('Stabling (per day)').pricingPeriod, 'day');
  assert.deepEqual(byName('Stabling (per day)').pricing, { mode: 'fixed', amount: 5, currency: 'sp' });
  assert.equal(byName('Feed (per day)').pricingPeriod, 'day');
  assert.deepEqual(byName('Feed (per day)').pricing, { mode: 'fixed', amount: 5, currency: 'cp' });
  assert.equal(byName('Donkey or mule').bestiaryIdentity, 'not-resolved');
  assert.equal(discovery.records.filter(row => row.nameEn.includes('Donkey') || row.nameEn.includes('mule')).length, 1);
  assert.equal(byName('Camel').sourcePage, 71);
  assert.equal(byName('Horse, draft').sourcePage, 72);
  assert.equal(byName('Galley').pricing.amount, 30000);
  assert.ok(discovery.records.filter(row => row.recordType === 'equipment-pack').every(row => row.contents === 'not-enumerated-by-this-manifest'));
});

test('trade alternatives, minimum lifestyle prices and service units retain their meaning', () => {
  const trade = discovery.records.filter(row => row.recordType === 'barter-price-row');
  assert.equal(trade.length, 13);
  assert.equal(trade.flatMap(row => row.alternatives).length, 23);
  assert.ok(trade.every(row => row.alternativesAre === 'one-of-not-a-bundle'));
  assert.deepEqual(byName('Iron or Canvas').alternatives.map(row => row.unit), ['lb', 'square-yard']);
  assert.deepEqual(byName('Flour or Chicken').alternatives.map(row => row.unit), ['lb', 'animal']);
  assert.deepEqual(byName('Wretched').pricing, { mode: 'not-priced', sourceValue: '—' });
  assert.deepEqual(byName('Aristocratic').pricing, { mode: 'minimum', amount: 10, currency: 'gp' });
  assert.equal(byName('Aristocratic').pricingPeriod, 'day');
  assert.equal(discovery.records.filter(row => row.section === 'Food, Drink, and Lodging').length, 20);
  assert.equal(discovery.records.filter(row => row.section === 'Services').length, 7);
  assert.equal(byName('Coach cab, between towns').pricedUnit, 'mile');
  assert.equal(byName('Coach cab, within a city').pricedUnit, 'not-specified-in-table');
  assert.equal(byName('Hireling, skilled').pricedUnit, 'day');
  assert.equal(byName('Inn stay, Modest').includedInLifestyleExpenses, true);
  assert.equal(byName('Meals, Modest').includedInLifestyleExpenses, true);
});
