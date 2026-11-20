import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {buildCorrectedNameReview} from '../scripts/catalog-corrected-name-review.mjs';
const paths=['catalog/scope-register-2014.json','catalog/baldur-background-name-corrections-2014.json','catalog/numeric-source-scope-policy-2014.json','catalog/background-adaptation-page-review-2014.json'];
const raw=paths.map(p=>readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const run=(texts=raw)=>buildCorrectedNameReview(...texts);
function altered(mutate){const texts=[...raw],p=JSON.parse(texts[1]);mutate(p);texts[1]=JSON.stringify(p);return texts;}
test('thirteen corrected names remove one false diagnostic group without removing observations',()=>{
 const r=run();assert.equal(r.corrections.length,13);assert.equal(r.beforeSummary.observedPages,4973);assert.equal(r.afterSummary.observedPages,4973);assert.equal(r.beforeSummary.duplicateNameGroups,294);assert.equal(r.afterSummary.duplicateNameGroups,293);assert.equal(r.afterSummary.observationsInNameGroups,605);
 assert.equal(r.groupDelta.removedDiagnosticGroups.length,1);assert.equal(r.groupDelta.removedDiagnosticGroups[0].comparisonKey,'baldur');assert.equal(r.groupDelta.removedDiagnosticGroups[0].members.length,13);assert.equal(r.groupDelta.unchangedGroupIds.length,293);assert.deepEqual(r.groupDelta.addedDiagnosticGroups,[]);assert.deepEqual(r.groupDelta.changedDiagnosticGroups,[]);
});
test('source eligibility and missing or mixed-script names are preserved independently of grouping',()=>{
 const r=run();for(const field of ['observedPages','excludedObservationPages','publicationDecisionPages','eligiblePublicationObservationPages','missingEnglishNames'])assert.equal(r.originalM0Summary[field],r.effectiveM0Summary[field]);
 assert.equal(r.scriptDiagnostics.length,5);assert.equal(r.missingEnglishNameIds.length,5);assert.equal(r.effectiveM0Summary.identityGroupsByDecision['resolve-duplicate-or-variant-unit'],2);assert.equal(r.approvedDenominator,null);assert.equal(r.accepted,false);assert.equal(r.invariants.canonicalIdentitiesAssigned,0);
});
test('stale base hashes cannot apply names to a different snapshot',()=>{
 const texts=[...raw];const scope=JSON.parse(texts[0]);scope.records[0].names.ru+=' changed';texts[0]=JSON.stringify(scope);
 assert.throws(()=>run(texts),/Unpinned/);assert.throws(()=>run(altered(p=>p.scopeSha256='0'.repeat(64))),/Unpinned/);
});
test('missing duplicate and unrelated corrections fail instead of hiding observations',()=>{
 for(const mutation of [p=>p.records.pop(),p=>p.records[1]=p.records[0],p=>p.records[0].observationId='dndsu:spells:999',p=>p.records[0].observedEnglishName='wrong',p=>p.records[0].sourceIds=['152'],p=>p.records[0].url+='wrong',p=>p.records[0].resolvedUrl='https://wrong.example/'])assert.throws(()=>run(altered(mutation)));
});
test('names must preserve the exact card heading before explicit trim and remain distinct',()=>{
 for(const mutation of [p=>p.records[0].proposedEnglishName='Baldur',p=>p.records[0].observedCardEnglishName='Other',p=>p.records[0].proposedEnglishName+=' ',p=>{p.records[1].proposedEnglishName=p.records[0].proposedEnglishName;p.records[1].observedCardEnglishName=p.records[0].observedCardEnglishName;}])assert.throws(()=>run(altered(mutation)),/name/);
 const c=run().corrections.find(c=>c.observationId==='dndsu:backgrounds:844');assert.equal(c.effectiveEnglishName,c.observedCardEnglishName.trim());assert.notEqual(c.effectiveEnglishName,c.observedCardEnglishName);
});
test('unreviewed evidence shape and canonical promotion fail closed',()=>{
 for(const mutation of [p=>p.accepted=true,p=>p.complete=true,p=>p.approvedDenominator=4973,p=>p.records[0].canonicalId='merged',p=>p.records[0].accepted=true,p=>p.records[0].rawSha256='missing',p=>p.records[0].evidenceKind='guessed-from-slug'])assert.throws(()=>run(altered(mutation)));
});
test('deterministic report is pinned to all inputs and preserves raw strings',()=>{
 const before=[...raw],r=run();assert.deepEqual(raw,before);assert.deepEqual(r,run());assert.deepEqual(r,JSON.parse(readFileSync(new URL('../catalog/corrected-name-review-2014.json',import.meta.url),'utf8')));
 for(let i=0;i<paths.length;i++)assert.equal(r.inputSha256[paths[i]],createHash('sha256').update(raw[i].replace(/\r\n/g,'\n')).digest('hex'));
});
test('CRLF transport changes do not invalidate the normalized input hash',()=>{
 const texts=raw.map(s=>s.replace(/\r?\n/g,'\r\n'));assert.deepEqual(run(texts),run());
});
