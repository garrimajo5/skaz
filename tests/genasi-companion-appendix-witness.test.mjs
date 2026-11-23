import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL('../' + path, import.meta.url));
const report = JSON.parse(read('catalog/genasi-companion-appendix-witness-2014.json'));

test('publisher witness adds four component candidates and preserves both original families', () => {
  const [inputPath, expectedHash] = Object.entries(report.inputSha256)[0];
  const raw = read(inputPath);
  assert.equal(createHash('sha256').update(raw).digest('hex'), expectedHash);
  const prior = JSON.parse(raw);
  const pota = prior.families.find(row => row.sourceId === '107');
  const motm = prior.families.find(row => row.sourceId === '158');
  assert.equal(pota.observationId, report.destination.observationId);
  assert.equal(pota.primaryFamilyUrl, report.destination.appendixUrl);
  assert.equal(pota.childProposals, null);
  assert.equal(motm.observationId, report.separateMotmObservationId);
  assert.notEqual(motm.observationId, pota.observationId);
  assert.deepEqual(report.componentCandidates.map(row => row.name),
    prior.supportingOtherPublication.componentNames);
  assert.deepEqual(report.componentCandidates.map(row => row.pdfPage), [9, 9, 9, 10]);
});

test('an editorial notice does not approve wording equivalence, reuse, or the denominator', () => {
  assert.equal(report.destination.directAppendixTextRead, false);
  assert.equal(report.exactWordingEquivalence, 'unverified');
  assert.equal(report.exactErrataVersion, 'unverified');
  assert.equal(report.textReusePermission, 'not-established');
  assert.equal(report.approvedDenominator, null);
  assert.ok(report.componentCandidates.every(row => row.canonicalId === null));
});
