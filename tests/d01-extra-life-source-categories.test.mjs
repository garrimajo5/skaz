import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL('../' + path, import.meta.url));
const report = JSON.parse(read('catalog/d01-extra-life-source-categories-2014.json'));
const readPinned = path => {
  const raw = read(path);
  assert.equal(createHash('sha256').update(raw).digest('hex'), report.inputSha256[path]);
  return JSON.parse(raw);
};

test('publisher categories preserve four exact observations and do not collapse the two Tortles', () => {
  const { records } = readPinned('catalog/scope-register-2014.json');
  const observations = new Map(records.map(row => [row.id, row]));
  assert.equal(new Set(report.records.map(row => row.cardUrl)).size, 4);
  assert.deepEqual(
    report.records.map(row => [row.name, row.sourceCode, row.uiCategory]),
    [
      ['Grung', 'oga', 'legacynoncore'],
      ['Locathah', 'lr', 'legacynoncore'],
      ['Tortle', 'ttp', 'legacynoncore'],
      ['Tortle', 'motm', '5e-expanded-rules'],
    ]
  );
  for (const row of report.records) {
    const original = observations.get(row.observationId);
    assert.equal(original.names.en, row.name);
    assert.equal(original.bibliographyEvidenceId ?? null, row.bibliographyEvidenceId);
  }
  assert.deepEqual(observations.get(report.records[3].observationId).sourceIds, ['158']);
});

test('shared UI category cannot resolve the open Grung rule status or advance scope', () => {
  const { sourceDecisions } = readPinned('catalog/effective-m0-review-2014.json');
  const stillOpen = new Set(sourceDecisions.map(row => row.observationId));
  assert.deepEqual(report.records.map(row => stillOpen.has(row.observationId)), [true, false, false, false]);
  assert.equal(report.witnesses.changelog.legacyExample, 'One Grung Above');
  assert.equal(report.officialRulesDisposition, 'unresolved');
  assert.equal(report.grungCardAccess.fullCharacterRulesVerified, false);
  assert.equal(report.appTextReusePermission, 'not-established');
  assert.equal(report.approvedDenominator, null);
});
