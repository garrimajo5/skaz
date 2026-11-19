import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {buildM0ExitReview} from '../scripts/catalog-m0-exit-review.mjs';
const paths=['catalog/scope-register-2014.json','catalog/numeric-source-scope-policy-2014.json','catalog/observed-name-review-2014.json','catalog/background-adaptation-page-review-2014.json'];
const raw=paths.map(p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/\r\n/g,'\n'));
const inputs=raw.map(JSON.parse);
test('page routing conserves the snapshot without accepting a canonical denominator',()=>{
 const r=buildM0ExitReview(...inputs);assert.equal(r.summary.observedPages,4973);assert.equal(r.summary.excludedObservationPages,87);assert.equal(r.summary.publicationDecisionPages,48);assert.equal(r.summary.eligiblePublicationObservationPages,4838);
 for(const row of Object.values(r.sections)){assert.equal(row.observedPages,row.excludedPages+row.publicationDecisionPages+row.eligiblePublicationObservationPages);assert.equal(row.approvedCanonicalUnits,null);}
 assert.equal(r.approvedDenominator,null);assert.equal(r.accepted,false);assert.equal(r.complete,false);
});
test('source versions, same-source units and overlapping attribution are different decisions',()=>{
 const r=buildM0ExitReview(...inputs);assert.deepEqual(r.summary.identityGroupsByDecision,{'define-separate-source-version-units':282,'one-nonexcluded-observation':5,'resolve-duplicate-or-variant-unit':3,'resolve-publication-first':2,'resolve-overlapping-source-attribution':2});
 assert.equal(r.identityGroups.find(g=>g.comparisonKey==='juiblex').decision,'resolve-overlapping-source-attribution');
 assert.equal(r.identityGroups.find(g=>g.comparisonKey==='drake companion').decision,'resolve-duplicate-or-variant-unit');
 assert.equal(r.identityGroups.find(g=>g.comparisonKey==='troodon').decision,'resolve-publication-first');
});
test('excluded homebrew does not make an otherwise single observation a duplicate',()=>{
 const r=buildM0ExitReview(...inputs),elf=r.identityGroups.find(g=>g.section==='race'&&g.comparisonKey==='elf');
 assert.equal(elf.decision,'one-nonexcluded-observation');assert.equal(elf.members.length,2);assert.equal(elf.canonicalId,null);
});
test('missing names retain existing proposals without inventing English labels',()=>{
 const r=buildM0ExitReview(...inputs);assert.equal(r.missingNames.length,5);assert.ok(r.missingNames.every(row=>row.existingPageKindProposal?.accepted===false));
 assert.equal(inputs[0].records.find(r=>r.id==='dndsu:backgrounds:845').names.en,'');
});
test('stale, omitted or reassigned name groups fail instead of understating remaining work',()=>{
 for(const mutate of [i=>i[2].duplicateNameGroups.pop(),i=>i[2].duplicateNameGroups[0].members[0].sourceIds=['fake'],i=>i[2].missingEnglishNameIds.pop(),i=>i[2].scriptDiagnostics.pop(),i=>i[2].complete=true]){
  const i=structuredClone(inputs);mutate(i);assert.throws(()=>buildM0ExitReview(...i));
 }
});
test('wrong or accepted proposal cannot be imported as remaining classification',()=>{
 for(const mutate of [i=>i[3].records[0].sourceId='wrong',i=>i[3].records[0].accepted=true,i=>i[3].records.push(i[3].records[0])]){
  const i=structuredClone(inputs);mutate(i);assert.throws(()=>buildM0ExitReview(...i));
 }
});
test('mixed source ordering is preserved in inputs and output cannot mutate them',()=>{
 const before=JSON.stringify(inputs),r=buildM0ExitReview(...inputs);r.identityGroups[0].members[0].sourceIds.push('fake');r.scriptDiagnostics[0].characters[0].character='x';assert.equal(JSON.stringify(inputs),before);
});
test('pinned report reproduces without summing overlapping dimensions',()=>{
 const r=buildM0ExitReview(...inputs);r.inputSha256=Object.fromEntries(paths.map((p,i)=>[p,createHash('sha256').update(raw[i]).digest('hex')]));assert.deepEqual(r,JSON.parse(readFileSync(new URL('../catalog/m0-exit-review-2014.json',import.meta.url),'utf8')));
 assert.ok(r.limitations.some(s=>s.includes('overlap')));assert.equal(r.summary.identityGroups,294);
});
