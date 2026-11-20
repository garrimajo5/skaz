import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { applyNumericSourcePolicy } from '../scripts/catalog-numeric-source-policy.mjs';

const paths = ['catalog/dndsu-source-register.json', 'catalog/scope-register-2014.json', 'catalog/numeric-source-publisher-evidence.json'];
const raw = paths.map(path => readFileSync(new URL('../' + path, import.meta.url), 'utf8').replace(/\r\n/g, '\n'));
const inputs = raw.map(text => JSON.parse(text));
const fixture = () => structuredClone(inputs);

test('numeric source policy reproduces pinned evidence without changing observations or accepting unknown sources', () => {
  const original = JSON.stringify(inputs);
  const result = applyNumericSourcePolicy(...inputs);
  const saved = JSON.parse(readFileSync(new URL('../catalog/numeric-source-scope-policy-2014.json', import.meta.url), 'utf8'));
  const { inputSha256, ...report } = saved;
  assert.deepEqual(result, report);
  assert.deepEqual(inputSha256, Object.fromEntries(paths.map((path, index) => [path, createHash('sha256').update(raw[index]).digest('hex')])));
  assert.equal(JSON.stringify(inputs), original);
  assert.deepEqual(result.summary, { observedSources: 70, reviewedSources: 69, observedPages: 4973, affectedPages: 15, excludedPages: 15, mixedSourcePages: 0 });
  assert.equal(result.approvedDenominator, null);
  assert.equal(result.complete, false);
  assert.equal(result.records.filter(row => row.disposition === 'not-reviewed-by-this-audit').length, 1);
  assert.equal(result.affectedPages.filter(row => row.originalInclusion === 'excluded-homebrew').length, 9);
  assert.equal(result.affectedPages.filter(row => row.excludedSourceIds.includes('180') && row.originalInclusion === 'candidate-2014').length, 6);
  assert.ok(result.affectedPages.every(row => !row.included && row.fullRules === 'unverified'));
});

test('mixed official candidate and excluded author requires review instead of excluding the whole identity', () => {
  const [sources, scope, evidence] = fixture();
  scope.records = [{ id: 'synthetic:mixed', sourceIds: ['102', '179'], inclusion: 'candidate-2014' }];
  const result = applyNumericSourcePolicy(sources, scope, evidence);
  assert.equal(result.summary.excludedPages, 0);
  assert.equal(result.summary.mixedSourcePages, 1);
  assert.equal(result.affectedPages[0].disposition, 'needs-mixed-source-review');
  assert.deepEqual(result.affectedPages[0].sourceIds, ['102', '179']);
  assert.deepEqual(result.affectedPages[0].excludedSourceIds, ['179']);
});

test('unknown, duplicated or renamed bibliography evidence fails rather than silently applying a decision', () => {
  for (const mutate of [
    ([sources]) => sources.sources.push(sources.sources[0]),
    ([,, evidence]) => evidence.records.push(evidence.records[0]),
    ([,, evidence]) => evidence.records[0].sourceId = 'unknown',
    ([,, evidence]) => evidence.records[0].observedTitle = 'Different book',
    ([,, evidence]) => evidence.records[0].publicationKind = 'official',
    ([,, evidence]) => evidence.records[0].evidenceUrl = '',
    ([, scope]) => scope.records.push(scope.records[0]),
    ([, scope]) => scope.records[0].sourceIds = ['179', '179'],
  ]) {
    const args = fixture(); mutate(args);
    assert.throws(() => applyNumericSourcePolicy(...args));
  }
});

test('two excluded sources remain excluded, while empty or unreviewed sources never become official', () => {
  const [sources, scope, evidence] = fixture();
  scope.records = [
    { id: 'synthetic:excluded', sourceIds: ['179', '190'], inclusion: 'candidate-2014' },
    { id: 'synthetic:unknown', sourceIds: ['not-reviewed'], inclusion: 'needs-source-review' },
    { id: 'synthetic:empty', sourceIds: [], inclusion: 'needs-source-review' },
  ];
  const result = applyNumericSourcePolicy(sources, scope, evidence);
  assert.equal(result.summary.observedPages, 3);
  assert.equal(result.summary.affectedPages, 1);
  assert.equal(result.affectedPages[0].disposition, 'excluded-by-owner-source-policy');
  assert.deepEqual(result.affectedPages[0].excludedSourceIds, ['179', '190']);
});

test('eligible core publications do not certify page text and require edition plus publisher evidence', () => {
  const report = applyNumericSourcePolicy(...inputs);
  assert.deepEqual(report.records.filter(row => row.disposition === 'eligible-publication-records-need-review').map(row => row.sourceId), ["101","102","103","105","106","107","108","109","110","111","112","113","114","115","116","117","119","120","121","122","123","124","125","126","127","128","129","130","131","132","133","134","135","151","152","153","155","157","158","159","160","161","167","171","174","183","187","188","189","191","194","197","198","199","202","205","206","207","208","213","214","218","219"]);
  assert.ok(report.records.filter(row => row.editionEvidenceUrl).every(row => row.exactTextVersion === 'unverified' && row.reusePermission === 'not-established'));
  for (const [key, value] of [['publisher', 'Other publisher'], ['ruleset', '5e-2024'], ['editionEvidenceUrl', '']]) {
    const args = fixture();
    args[2].records.find(row => row.sourceId === '101')[key] = value;
    assert.throws(() => applyNumericSourcePolicy(...args), /official 2014 publication evidence/);
  }
});


test('organized-play group does not certify a publisher for every associated adventure',()=>{
 const result=applyNumericSourcePolicy(...inputs);
 assert.equal(result.records.find(row=>row.sourceId==='169').disposition,'needs-publication-identification');
 const args=fixture();args[1].records=[{id:'synthetic:league',sourceIds:['169'],inclusion:'candidate-2014'}];
 const group=applyNumericSourcePolicy(...args);assert.equal(group.affectedPages.length,0);
 assert.equal(group.approvedDenominator,null);assert.equal(group.complete,false);
});


test('official crossover publication does not confer redistribution rights or exact-version approval',()=>{
 const evidence=inputs[2].records.find(row=>row.sourceId==='199');
 assert.ok(evidence.redistributionRestriction.includes('prohibits redistribution'));
 assert.notEqual(evidence.evidenceUrl,evidence.editionEvidenceUrl);
 const row=applyNumericSourcePolicy(...inputs).records.find(row=>row.sourceId==='199');
 assert.equal(row.disposition,'eligible-publication-records-need-review');
 assert.equal(row.redistributionRestriction,evidence.redistributionRestriction);
 assert.equal(row.reusePermission,'not-established');
 assert.equal(row.exactTextVersion,'unverified');
});


test('licensed-store evidence preserves restrictions and excludes third-party Ryoko when referenced',()=>{
 const report=applyNumericSourcePolicy(...inputs);
 for(const id of ['127','130','131','167']){
  const source=inputs[2].records.find(r=>r.sourceId===id);
  const decision=report.records.find(r=>r.sourceId===id);
  assert.equal(decision.disposition,'eligible-publication-records-need-review');
  assert.ok(source.redistributionRestriction);
  assert.equal(decision.redistributionRestriction,source.redistributionRestriction);
  assert.equal(decision.reusePermission,'not-established');
  assert.equal(decision.exactTextVersion,'unverified');
 }
 const args=fixture();
 args[1].records=[{id:'synthetic:ryoko-only',sourceIds:['210'],inclusion:'candidate-2014'},{id:'synthetic:ryoko-reprint',sourceIds:['210','102'],inclusion:'candidate-2014'}];
 const result=applyNumericSourcePolicy(...args);
 assert.equal(result.affectedPages.find(r=>r.id==='synthetic:ryoko-only').disposition,'excluded-by-owner-source-policy');
 assert.equal(result.affectedPages.find(r=>r.id==='synthetic:ryoko-reprint').disposition,'needs-mixed-source-review');
 assert.equal(result.complete,false);
});
