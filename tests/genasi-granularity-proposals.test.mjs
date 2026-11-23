import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildGenasiGranularity,reviewGenasiGranularity} from '../scripts/review-genasi-granularity-2014.mjs';
const read=f=>JSON.parse(readFileSync(new URL('../catalog/'+f,import.meta.url),'utf8'));
const input=()=>['effective-m0-review-2014.json','genasi-granularity-publication-evidence-2014.json','numeric-source-scope-policy-2014.json','race-other-version-proposals-2014.json'].map(read);

test('two family observations and four MotM variants do not become six accepted races',()=>{
 const r=buildGenasiGranularity();assert.deepEqual(r,read('genasi-granularity-proposals-2014.json'));
 assert.deepEqual(r.summary,{preservedObservations:2,familyPublicationWitnesses:2,motmVariantHeadingProposals:4,supportingOtherPublicationHeadings:4,unverifiedFamilyComponentSets:1,acceptedCanonicalUnits:0});
 assert.equal(r.approvedDenominator,null);assert.equal(r.accepted,false);assert.equal(r.complete,false);
 assert.deepEqual(r.families.map(f=>f.observationId),['dndsu:multiverse:race:291','dndsu:race:102']);
 for(const f of r.families){assert.equal(f.proposedRole,'family-navigation-not-additional-playable-unit');assert.equal(f.accepted,false);assert.equal(f.canonicalId,null);assert.equal(f.automaticMerge,false);assert.equal(f.automaticCharacterMigration,false);}
 const units=r.families.find(f=>f.sourceId==='158').childProposals;assert.equal(new Set(units.map(u=>u.proposalId)).size,4);
 assert.deepEqual(units.map(u=>u.name),['Air Genasi','Earth Genasi','Fire Genasi','Water Genasi']);
 for(const u of units){assert.equal(u.sourceId,'158');assert.equal(u.fullRules,'unverified');assert.equal(u.exactErrataVersion,'unverified');assert.equal(u.translationReusePermission,'not-established');assert.equal(u.accepted,false);}
});

test('Elemental Evil headings never fill unknown source107 children or imply equivalent rules',()=>{
 const r=buildGenasiGranularity(),old=r.families.find(f=>f.sourceId==='107');
 assert.equal(old.childProposals,null);assert.equal(old.unresolved.length,1);assert.equal(r.supportingOtherPublication.sourceId,null);assert.equal(r.supportingOtherPublication.observationSourceAssignment,false);assert.equal(r.supportingOtherPublication.proposedCatalogUnits,0);
 assert.equal(r.relationship.rulesEquivalent,'unverified');assert.equal(r.relationship.automaticCharacterMigration,false);
 const d=input();d[1].supportingOtherPublication.sourceId='107';assert.throws(()=>reviewGenasiGranularity(...d),/not be assigned/);
});

test('missing and duplicate variants cannot silently shrink or expand the proposal denominator',()=>{
 for(const change of [e=>e.motm.records.pop(),e=>e.motm.records.push({...e.motm.records[1]}),e=>e.motm.records[4]={...e.motm.records[1]},e=>e.supportingOtherPublication.records.pop(),e=>e.supportingOtherPublication.records[3]={...e.supportingOtherPublication.records[0]}]){
  const d=input();change(d[1]);assert.throws(()=>reviewGenasiGranularity(...d));
 }
});

test('exact book, chapter, fragment, parent, source policy and edition are required',()=>{
 for(const change of [
  e=>e.motm.sourceId='107',e=>e.motm.records[1].targetUrl=e.motm.records[1].targetUrl.replace('/fantastical-races#','/bestiary-a#'),
  e=>e.motm.records[1].parentHeading='Different',e=>e.motm.records[1].targetUrl+='?tracking=1',
  e=>e.motm.records[1].targetUrl=e.motm.records[1].targetUrl.replace('www.dndbeyond.com','www.dndbeyond.com.evil.invalid'),
  e=>e.pota.records[0].targetUrl='https://www.dndbeyond.com/species/23-genasi',e=>e.pota.htmlSha256='unknown',
  e=>e.supportingOtherPublication.publication='2024 Player Handbook',e=>e.supportingOtherPublication.records[0].legacy=false
 ]){const d=input();change(d[1]);assert.throws(()=>reviewGenasiGranularity(...d));}
 const d=input();d[2].records.find(r=>r.sourceId==='107').observedTitle="Elemental Evil Player's Companion";assert.throws(()=>reviewGenasiGranularity(...d),/policy/);
});

test('unlabeled or repeated observations are not assigned source107 by their names',()=>{
 for(const change of [g=>g.members[1].sourceIds=[],g=>g.members[1].sourceIds=['107','158'],g=>g.members[1].id=g.members[0].id,g=>g.members[1].sourceIds=['158'],g=>g.members[1].observedName='Air Genasi',g=>g.decision='merge']){
  const d=input();change(d[0].identityGroups.find(g=>g.section==='race'&&g.comparisonKey==='genasi'));assert.throws(()=>reviewGenasiGranularity(...d));
 }
});

test('older remaining-race proposals, policy and all observations are unchanged',()=>{
 const d=input(),before=structuredClone(d);reviewGenasiGranularity(...d);assert.deepEqual(d,before);
 const old=d[3].groups.find(g=>g.name==='genasi');assert.equal(old.proposal,'retain-unresolved-publication-attribution');assert.equal(old.units.find(u=>u.sourceId==='158').identityEvidenceKind,'missing');
 old.units[0].observationId='foreign';assert.throws(()=>reviewGenasiGranularity(...d),/Prior/);
});
