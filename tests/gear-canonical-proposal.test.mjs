import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bundledCatalog } from '../server/bundled-catalog.mjs';

const read = name => JSON.parse(readFileSync(new URL('../catalog/' + name, import.meta.url), 'utf8').replace(/^\uFEFF/, ''));
const proposal = read('gear-canonical-proposal-2014.json');
const discovery = read('dndsu-equipment-discovery.json');
const rows = discovery.articles.find(article => article.url.endsWith('/98-equipment/')).records;
const byName = name => proposal.records.find(record => record.observedName === name);

test('gear preserves 99 observations, their prices and primary-source quantities', () => {
  assert.equal(proposal.records.length, 99);
  assert.deepEqual(new Set(proposal.records.map(record => record.observationId)), new Set(rows.map(row => row.observationId)));
  for (const record of proposal.records) {
    const row = rows.find(row => row.observationId === record.observationId);
    assert.equal(record.observedName, row.name);
    assert.equal(record.observedPrice, row.priceText);
    const price = row.priceText.match(/^([\d ]+)\s+(мм|см|зм)$/);
    assert.ok(price, row.priceText);
    assert.equal(record.costCp, Number(price[1].replaceAll(' ', '')) * ({ мм: 1, см: 10, зм: 100 }[price[2]]));
    assert.equal(record.sourcePage, 69);
    assert.equal(record.fullRules, 'unverified');
    assert.equal(record.status, 'proposed-identity-not-runtime-record');
  }
  assert.equal(byName('Подзорная труба').costCp, 100000);
  assert.equal(byName('Снаряды для пращи (20)').costCp, 4);
  assert.equal(byName('Стрелы (20)').nameEn, 'Arrows (20)');
  assert.equal(byName('Иглы для трубки (50)').nameEn, 'Blowgun needles (50)');
  assert.equal(byName('Верёвка пеньковая (50 футов)').nameEn, 'Rope, hempen (50 feet)');
  assert.equal(byName('Чернила (бутылочка 30 грамм)').nameEn, 'Ink (1 ounce bottle)');
  assert.match(byName('Чернила (бутылочка 30 грамм)').identityNote, /do not assert exact unit equivalence/);
});

test('all 186 equipment observations are accounted for without inventing missing SRD game sets', () => {
  const groups = ['armor', 'weapon', 'tools', 'gear'].map(group => read(group + '-canonical-proposal-2014.json'));
  const matched = groups.flatMap(group => group.records);
  const unmatched = groups.flatMap(group => group.unmatched ?? []);
  const all = [...matched, ...unmatched];
  assert.equal(matched.length, 184);
  assert.equal(unmatched.length, 2);
  assert.equal(new Set(matched.map(record => record.proposedCanonicalId)).size, 184);
  assert.equal(new Set(all.map(record => record.observationId)).size, 186);
  assert.deepEqual(new Set(all.map(record => record.observationId)), new Set(discovery.articles.flatMap(article => article.records.map(row => row.observationId))));
});

test('only the existing ordinary healing potion is reused, and focus variants stay distinct', () => {
  const runtime = new Map(bundledCatalog().bundle.entries.map(record => [record.id, record]));
  const overlap = proposal.records.filter(record => runtime.has(record.proposedCanonicalId));
  assert.equal(overlap.length, 1);
  assert.equal(overlap[0].proposedCanonicalId, 'srd51:2014:item:potion-of-healing');
  assert.equal(overlap[0].identityDisposition, 'reuse-existing-runtime-id');
  assert.equal(runtime.get(overlap[0].proposedCanonicalId).name.en, 'Potion of Healing');
  assert.equal(proposal.records.filter(record => record.category === 'arcane-focus').length, 5);
  assert.equal(proposal.records.filter(record => record.category === 'druidic-focus').length, 4);
  assert.equal(proposal.records.filter(record => record.category === 'holy-symbol').length, 3);
  assert.notEqual(byName('Посох').proposedCanonicalId, byName('Деревянный посох').proposedCanonicalId);
  assert.notEqual(byName('Посох').proposedCanonicalId, 'srd51:2014:item:quarterstaff');
});
