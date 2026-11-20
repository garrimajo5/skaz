import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>JSON.parse(readFileSync(new URL('../catalog/'+name,import.meta.url),'utf8'));
const evidence=read('background-adaptation-page-review-2014.json'),scope=read('scope-register-2014.json');

test('all five empty-English observations are retained as page-type proposals, not fabricated backgrounds',()=>{
 const empty=scope.records.filter(r=>r.section==='backgrounds'&&!r.names.en).map(r=>r.id).sort();
 assert.deepEqual(evidence.records.map(r=>r.observationId).sort(),empty);
 assert.equal(new Set(evidence.records.map(r=>r.observationId)).size,5);
 for(const r of evidence.records){
  const old=scope.records.find(o=>o.id===r.observationId);
  assert.equal(r.observedName,old.names.ru);assert.equal(r.observedEnglishName,old.names.en);assert.equal(r.observedEnglishName,'');
  assert.ok(old.sourceIds.includes(r.sourceId));assert.equal(r.referenceEvidence.url,old.url);
  assert.equal(r.accepted,false);assert.equal(r.canonicalId,null);assert.equal(r.fullRulesVerified,false);assert.equal(r.automaticProfileChange,false);
  assert.equal(r.primaryEvidence.exactSectionEquivalence,'unverified');assert.equal(r.primaryEvidence.sectionAccess.fullTextRead,false);
 }
 assert.equal(evidence.complete,false);assert.equal(evidence.approvedDenominator,null);
});

test('campaign bonuses, setting adaptations and alternative features are distinct and access gaps stay explicit',()=>{
 const record=n=>evidence.records.find(r=>r.observationId==='dndsu:backgrounds:'+n);
 assert.equal(record(856).proposedPageKind,'campaign-bonus-feat-rules');
 assert.equal(record(848).proposedPageKind,'setting-adaptations-of-existing-backgrounds');
 assert.equal(record(845).proposedPageKind,'optional-background-feature-collection');
 assert.equal(record(847).primaryEvidence.sectionAccess.result,'http-404');
 assert.equal(evidence.records.filter(r=>r.primaryEvidence.sectionAccess.result==='redirect-to-product-page').length,4);
 assert.ok(evidence.records.every(r=>r.reusePermission==='not-established'));
});
