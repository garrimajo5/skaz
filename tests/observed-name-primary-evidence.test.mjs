import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>JSON.parse(readFileSync(new URL('../catalog/'+name,import.meta.url),'utf8'));
const evidence=read('observed-name-primary-evidence-2014.json');
const scope=read('scope-register-2014.json');

test('primary name evidence remains linked to unchanged observations and source editions',()=>{
 const ids=new Set();
 assert.equal(evidence.complete,false);assert.equal(evidence.approvedDenominator,null);
 for(const record of evidence.records){
  assert.ok(!ids.has(record.observationId));ids.add(record.observationId);
  const source=scope.records.find(r=>r.id===record.observationId);
  assert.ok(source,'Missing observed ID: '+record.observationId);
  assert.equal(record.observedName,source.names.en);
  assert.ok(source.sourceIds.includes(record.sourceId));
  assert.equal(record.accepted,false);assert.equal(record.canonicalId,null);assert.equal(record.fullRulesVerified,false);
  assert.ok(record.candidateName.trim());assert.ok(record.evidence.length);
  for(const item of record.evidence){assert.equal(new URL(item.url).hostname,'www.dndbeyond.com');assert.ok(item.locator.trim());}
 }
});

test('same Nilbog name retains two explicit publication identities instead of a merge',()=>{
 const records=evidence.records.filter(r=>r.candidateName==='Nilbog');
 assert.equal(records.length,2);
 assert.deepEqual(records.map(r=>r.sourceId).sort(),['111','158']);
 for(const r of records){assert.deepEqual(r.mustRemainDistinctFrom,records.filter(o=>o!==r).map(o=>o.observationId));}
});

test('figurine family preserves four differently rare variants without inventing full rules or IDs',()=>{
 const family=evidence.records.find(r=>r.observationId==='dndsu:items:6459');
 assert.equal(family.unitKind,'family-with-variants');
 assert.deepEqual(family.variants.map(v=>[v.name,v.rarity]),[
 ['Carnelian Triceratops','very rare'],['Jasper Tyrannosaurus Rex','legendary'],['Kyanite Pteranodon','rare'],['Pyrite Plesiosaurus','uncommon']]);
 assert.ok(family.variants.every(v=>!('id' in v)&&!('duration' in v)&&!('recharge' in v)));
 assert.ok(family.unverified.some(v=>v.includes('duration')));
 const needle=evidence.records.find(r=>r.observationId==='dndsu:bestiary:17367');
 assert.equal(needle.access.fullStatBlockRead,false);assert.equal(needle.access.result,'redirect-to-product-page');
 assert.ok(needle.unverified.some(v=>v.includes('Needlefolk')));
 assert.ok(!evidence.records.some(r=>r.observationId==='dndsu:bestiary:20456'),'Mixed-letter AL name has no primary evidence yet');
});
