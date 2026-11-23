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
});

test('one parent Guard Drake heading cannot replace five color variants', () => {
  const variants = report.groups.filter(group => group.name.endsWith('guard drake'));
  assert.equal(variants.length, 5);
  assert.equal(new Set(variants.map(group => group.members[0].additionalLocator.url)).size, 1);
  assert.ok(variants.every(group => group.members[0].additionalLocator.relation === 'broader-heading'));
  assert.ok(variants.every(group => group.members[1].additionalLocator === null));
  assert.equal(new Set(variants.flatMap(group => group.members.map(row => row.observationId))).size, 10);
});
