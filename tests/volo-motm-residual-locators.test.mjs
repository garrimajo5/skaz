import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const read = name => JSON.parse(readFileSync(new URL('../catalog/' + name, import.meta.url)));
const baseline = read('monster-version-unit-proposals-2014.json');
const report = read('volo-motm-residual-locators-2014.json');

test('the source locators preserve all 22 observations in the eleven incomplete pairs', () => {
  const remaining = baseline.groups.filter(group => group.units.some(unit => !unit.publicationEvidence));
  assert.equal(remaining.length, 11);
  assert.deepEqual(report.groups.map(group => group.reviewId), remaining.map(group => group.reviewId));
  for (const [index, group] of report.groups.entries()) {
    assert.deepEqual(
      group.members.map(({observationId, observedName, sourceIds}) => ({observationId, observedName, sourceIds})),
      remaining[index].units.map(({observationId, observedName, sourceIds}) => ({observationId, observedName, sourceIds})),
    );
    assert.equal(group.canonicalId, null);
    assert.equal(group.aliasAccepted, false);
    assert.equal(group.standaloneRulesVerified, false);
  }
  assert.equal(report.approvedDenominator, null);
});

test('Nilbog and Deep Rothé keep the names and locators in their own publications', () => {
  const members = name => report.groups.find(group => group.name === name).members;
  const nilbog = members('nilbog,goblin гоблин');
  assert.ok(nilbog.every(row => row.additionalLocator.heading === 'Nilbog'));
  assert.notEqual(nilbog[0].additionalLocator.url, nilbog[1].additionalLocator.url);
  const rothe = members('deep rothe');
  assert.deepEqual(rothe.map(row => row.additionalLocator.relation), ['broader-heading', 'accented-name-candidate']);
  assert.equal(rothe[1].additionalLocator.heading, 'Deep Rothé');
  const comparison = report.digitalIndexComparison;
  assert.deepEqual(comparison.cards.map(card => card.sourceId), ['111', '158']);
  assert.equal(new Set(comparison.cards.map(card => card.url)).size, 2);
  assert.equal(comparison.statBlocksRead, false);
});

test('one parent Guard Drake heading cannot replace five color variants', () => {
  const variants = report.groups.filter(group => group.name.endsWith('guard drake'));
  assert.equal(variants.length, 5);
  assert.equal(new Set(variants.map(group => group.members[0].additionalLocator.url)).size, 1);
  assert.ok(variants.every(group => group.members[0].additionalLocator.relation === 'broader-heading'));
  assert.ok(variants.every(group => group.members[1].additionalLocator === null));
  assert.equal(new Set(variants.flatMap(group => group.members.map(row => row.observationId))).size, 10);
});

test('digital Guard Drake links preserve five color pairs and distinct publisher rows', () => {
  const report = JSON.parse(readFileSync(new URL('../catalog/guard-drake-publisher-locators-2014.json', import.meta.url), 'utf8'));
  const baseline = JSON.parse(readFileSync(new URL('../catalog/volo-motm-residual-locators-2014.json', import.meta.url), 'utf8'));
  assert.equal(report.groups.length, 5);
  assert.equal(report.approvedDenominator, null);
  assert.equal(report.accepted, false);
  assert.equal(report.complete, false);
  const observed = new Set();
  const cards = new Set(Object.values(report.parentCards));
  for (const variant of report.groups) {
    const original = baseline.groups.find(group => group.reviewId === variant.reviewId);
    assert.equal(variant.name.toLowerCase(), original.name);
    assert.deepEqual(variant.observations.map(({observationId, sourceIds})=>({observationId, sourceIds})),
      original.members.map(({observationId, sourceIds})=>({observationId, sourceIds})));
    assert.equal(variant.canonicalId, null);
    assert.equal(variant.aliasAccepted, false);
    assert.equal(variant.standaloneRulesVerified, false);
    for (const {observationId, publisherCard, publisherIndex} of variant.observations) {
      const slug = variant.name.toLowerCase().replaceAll(' ', '-');
      const card = new URL(publisherCard);
      assert.equal(card.origin, 'https://www.dndbeyond.com');
      assert.match(card.pathname, new RegExp('^/monsters/[0-9]+-' + slug + '$'));
      assert.ok(report.publisherIndexPages.includes(publisherIndex));
      assert.ok(!cards.has(publisherCard) && !observed.has(observationId));
      cards.add(publisherCard);
      observed.add(observationId);
    }
  }
  assert.equal(cards.size, 12);
  assert.equal(observed.size, 10);
});

test('Deep Rothé and Nilbog preserve source identities and compare digital fields', () => {
  const report = JSON.parse(readFileSync(new URL('../catalog/volo-motm-rothe-nilbog-index-2014.json', import.meta.url), 'utf8'));
  const base = JSON.parse(readFileSync(new URL('../catalog/volo-motm-residual-locators-2014.json', import.meta.url), 'utf8'));
  assert.deepEqual(report.groups.map(group => group.name), ['deep rothe','nilbog,goblin гоблин']);
  assert.equal(report.accepted,false);
  assert.equal(report.complete,false);
  assert.equal(report.approvedDenominator,null);
  for (const group of report.groups) {
    const original = base.groups.find(({reviewId}) => reviewId === group.reviewId);
    assert.equal(group.name,original.name);
    assert.deepEqual(group.observations.map(({publisherIndexUrl,digitalRow,...member})=>member),original.members);
    assert.deepEqual(group.observations.map(({digitalRow})=>digitalRow.digitalName),[group.digitalName,group.digitalName]);
    assert.equal(group.canonicalId,null);
    assert.equal(group.aliasAccepted,false);
    assert.equal(group.fullStatBlocksCompared,false);
  }
  const [rothe, nilbog] = report.groups;
  assert.deepEqual(rothe.digitalDifferences, {type: {vgtm:'Beast',motm:'Beast (Cattle)'}});
  assert.deepEqual(nilbog.digitalDifferences, {
    type: {vgtm:'Humanoid (goblinoid)',motm:'Fey (goblinoid)'},
    alignment: {vgtm:'Chaotic Evil',motm:'Typically Chaotic Neutral'},
  });
});

test('digital research covers all 22 residual observations without approving canonical units', () => {
  const read = name => JSON.parse(readFileSync(new URL('../catalog/' + name, import.meta.url), 'utf8'));
  const files = [
    'volo-motm-warrior-alpha-index-2014.json',
    'volo-motm-ox-kow-index-2014.json',
    'guard-drake-publisher-locators-2014.json',
    'volo-motm-rothe-nilbog-index-2014.json',
  ];
  const reports = files.map(read);
  const observed = reports.flatMap(report => {
    assert.equal(report.approvedDenominator,null);
    assert.equal(report.accepted,false);
    assert.equal(report.complete,false);
    return report.groups.flatMap(group => {
      assert.equal(group.canonicalId,null);
      assert.equal(group.aliasAccepted,false);
      return group.observations.map(({observationId, sourceIds, publisherCard, digitalRow}) => ({
        observationId,sourceIds,card:publisherCard ?? digitalRow.cardUrl,
      }));
    });
  });
  assert.equal(observed.length,22);
  assert.equal(new Set(observed.map(({card})=>card)).size,22);
  const order = rows => rows.map(({observationId,sourceIds})=>observationId+'/'+sourceIds.join(',')).sort();
  const base = read('volo-motm-residual-locators-2014.json');
  assert.deepEqual(order(observed),order(base.groups.flatMap(group=>group.members)));
});
