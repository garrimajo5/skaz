import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {reviewPrimaryIndex} from '../scripts/catalog-primary-index-review.mjs';
const raw=p=>readFileSync(new URL('../catalog/'+p+'.json',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const index=JSON.parse(raw('skt-public-index-2014')),scope=JSON.parse(raw('scope-register-2014'));
test('six-page SKT index preserves22 absentCRs separately from displayed zero',()=>{
 const d=reviewPrimaryIndex(index,scope);assert.deepEqual(d.summary,{digitalRows:105,blankChallengeRatingRows:22,distinctDigitalNames:105,displayedOwnSourceRows:85,displayedReferenceRows:20,rowsWithoutObservedName:16,originalSourceBestiaryObservations:94,originalSourceBestiaryWithNameCandidate:69});
 const absent=d.records.filter(r=>r.challengeRatingStatus==='not-shown');assert.equal(absent.length,22);assert.ok(absent.every(r=>r.challengeRating===''));
 const zero=d.records.filter(r=>r.challengeRating==='0');assert.ok(zero.length>0);assert.ok(zero.every(r=>r.challengeRatingStatus==='shown'));
});
test('blankCR requires opt-in semantics and exact counts; other invalid values still fail',()=>{
 for(const mutate of [d=>delete d.allowBlankChallengeRatings,d=>d.blankChallengeRatingMeaning='zero',d=>d.summary.blankChallengeRatingRows++,d=>d.pages[0].rows[0].challengeRating='unknown',d=>d.pages[0].rows[0].challengeRating=null]){const d=structuredClone(index);mutate(d);assert.throws(()=>reviewPrimaryIndex(d,scope));}
});
test('named candidates retain original names while unresolved variant groups stay unmerged',()=>{
 const d=reviewPrimaryIndex(index,scope),guh=d.records.find(r=>r.digitalName==='Chief Guh');assert.equal(guh.observationCandidates[0].observedName,'Guh');assert.equal(guh.canonicalId,null);
 for(const name of ['Shield Dwarf','Storm Giant Princess','Axe of Mirabar Veteran'])assert.equal(d.records.find(r=>r.digitalName===name).observationCandidates.length,0);
 for(const group of index.unresolvedNameGroups)for(const id of group.observedIds)assert.ok(scope.records.some(r=>r.id===id));
 for(const r of d.records)for(const c of r.observationCandidates){const o=scope.records.find(x=>x.id===c.observationId);assert.equal(c.observedName,o.names.en);assert.deepEqual(c.originalSourceIds,o.sourceIds);}
});
test('saved SKT report preserves input hashes and incomplete historical inventory',()=>{
 const d=reviewPrimaryIndex(index,scope);d.inputSha256=Object.fromEntries(['skt-public-index-2014','scope-register-2014'].map(p=>['catalog/'+p+'.json',createHash('sha256').update(raw(p)).digest('hex')]));assert.deepEqual(d,JSON.parse(raw('skt-index-review-2014')));
 assert.equal(d.accepted,false);assert.equal(d.complete,false);assert.equal(d.approvedDenominator,null);
});
