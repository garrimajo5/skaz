import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const raw=path=>readFileSync(new URL('../'+path,import.meta.url));
const read=path=>JSON.parse(raw(path));
const d=read('catalog/cross-source-name-evidence-2014.json');
const diagnostic=read('catalog/observed-name-review-2014.json');

test('source-specific review preserves all seven observations and their original sources',()=>{
 assert.equal(d.groups.length,3);assert.equal(d.groups.flatMap(g=>g.records).length,7);
 assert.equal(d.inputSha256['catalog/observed-name-review-2014.json'],createHash('sha256').update(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(raw('catalog/observed-name-review-2014.json')).replace(/\r\n/g,'\n')).digest('hex'));
 for(const group of d.groups){
  const before=diagnostic.duplicateNameGroups.find(g=>g.section===group.section&&g.comparisonKey===group.comparisonKey);
  assert.ok(before);assert.deepEqual(group.records.map(r=>r.observationId).sort(),before.members.map(r=>r.id).sort());
  assert.equal(group.automaticMerge,false);
  for(const row of group.records){
   const original=before.members.find(m=>m.id===row.observationId);
   assert.equal(row.observedName,original.observedName);assert.deepEqual(row.observedSourceIds,original.sourceIds);
   assert.equal(row.accepted,false);assert.equal(row.canonicalId,null);assert.equal(row.fullRulesVerified,false);
   assert.equal(row.exactObservedTextVersion,'unverified');assert.equal(row.reusePermission,'not-established');
   for(const e of row.evidence)assert.ok(['www.dndbeyond.com','marketplace.dndbeyond.com','media.wizards.com'].includes(new URL(e.url).hostname));
  }
 }
});

test('SKT errata does not rename Witchlight or claim same rules',()=>{
 const g=d.groups.find(g=>g.comparisonKey==='pixie dust');
 const skt=g.records.find(r=>r.observedSourceIds.includes('132'));
 const wbw=g.records.find(r=>r.observedSourceIds.includes('151'));
 assert.equal(skt.primaryName,'Faerie Dust');assert.equal(wbw.primaryName,'Pixie Dust');
 assert.equal(skt.identityStatus,'primary-errata-renames-source-section');
 assert.equal(skt.evidence[0].version,'2.0; copyright2021');assert.match(skt.evidence[0].sha256,/^[a-f0-9]{64}$/);
 assert.equal(wbw.access.fullRulesRead,false);
});

test('an adventure heading and a missing primary unit do not become stat-block equivalence',()=>{
 const m=d.groups.find(g=>g.comparisonKey==='meenlock');
 assert.equal(m.records.find(r=>r.observedSourceIds.includes('122')).identityStatus,'official-adventure-toc-heading');
 const h=d.groups.find(g=>g.comparisonKey==='space hamster');
 const unresolved=h.records.find(r=>r.observedSourceIds.includes('135'));
 assert.equal(unresolved.primaryName,null);assert.equal(unresolved.evidence.length,0);
 assert.equal(unresolved.identityStatus,'primary-unit-not-confirmed');
 assert.equal(h.records.find(r=>r.observedSourceIds.includes('160')).primaryName,'Space Hamster');
 assert.equal(d.complete,false);assert.equal(d.accepted,false);assert.equal(d.approvedDenominator,null);
});
