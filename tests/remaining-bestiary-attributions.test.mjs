import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reviewRemainingBestiary,buildRemainingBestiary} from '../scripts/review-remaining-bestiary-attributions-2014.mjs';
const files=['effective-m0-review-2014.json','numeric-source-scope-policy-2014.json','remaining-bestiary-source-selection-2014.json','remaining-bestiary-publication-evidence-2014.json','monster-version-unit-proposals-2014.json','mtf-monster-version-unit-proposals-2014.json','multibook-monster-unit-proposals-2014.json'];
const input=()=>files.map(f=>JSON.parse(readFileSync(new URL('../catalog/'+f,import.meta.url),'utf8')));
test('remaining cohorts reproduce all observations and publication claims without acceptance',()=>{
 const r=buildRemainingBestiary(),saved=JSON.parse(readFileSync(new URL('../catalog/remaining-bestiary-attribution-proposals-2014.json',import.meta.url),'utf8'));
 assert.deepEqual(r,saved);assert.equal(r.summary.consideredGroups,18);assert.equal(r.summary.preservedObservations,36);assert.equal(r.summary.publicationClaims,50);
 assert.equal(r.summary.exactPublicationHeadingClaims,18);assert.equal(r.summary.groupsWithAllPublicationHeadings,3);
 assert.equal(r.accepted,false);assert.equal(r.complete,false);assert.equal(r.approvedDenominator,null);
});
test('composite observation retains all three source IDs and never splits into accepted versions',()=>{
 const r=buildRemainingBestiary(),g=r.groups.find(g=>g.observations.some(o=>o.observationId==='dndsu:bestiary:8027'));
 const o=g.observations.find(o=>o.observationId==='dndsu:bestiary:8027');assert.deepEqual(o.sourceIds,['127','131','167']);
 assert.equal(g.publicationClaims.filter(c=>c.observationId===o.observationId).length,3);assert.equal(g.automaticSourceVersionSplit,false);
 assert.ok(g.publicationClaims.every(c=>!c.accepted&&c.canonicalId===null&&c.fullRules==='unverified'));
});
test('changed source order or attribution cannot silently rewrite an observation',()=>{
 const a=input();a[0].identityGroups.find(g=>g.members.some(m=>m.id==='dndsu:bestiary:8027')).members.find(m=>m.id==='dndsu:bestiary:8027').sourceIds.reverse();
 assert.throws(()=>reviewRemainingBestiary(...a),/attribution changed/);
});
test('one book witness cannot establish another source claim',()=>{
 const a=input(),s=a[3].sources.find(s=>s.sourceId==='129');s.records[0].targetUrl='https://www.dndbeyond.com/sources/mtof/bestiary#Orcus';
 assert.throws(()=>reviewRemainingBestiary(...a),/publication witness/);
});
test('parent contexts and article mentions cannot be promoted to exact witnesses',()=>{
 let a=input();a[3].sources.find(s=>s.parentContexts.length).parentContexts[0].satisfiesCreatureClaim=true;
 assert.throws(()=>reviewRemainingBestiary(...a),/Parent chapter/);
 a=input();a[3].sources.find(s=>s.articleMentions.length).articleMentions[0].acceptedAsPublicationWitness=true;
 assert.throws(()=>reviewRemainingBestiary(...a),/Article mention/);
});
test('renamed Redbrand labels remain unapproved proposals',()=>{
 const a=input(),s=a[3].sources.find(s=>s.sourceId==='202');s.unapprovedAlternates[0].aliasAccepted=true;
 assert.throws(()=>reviewRemainingBestiary(...a),/Unapproved spelling/);
});
test('missing exact witness reduces metadata coverage without inventing content absence',()=>{
 const a=input(),s=a[3].sources.find(s=>s.sourceId==='129'),r=s.records.pop();s.missing.push({name:r.name,reason:'exact-heading-unresolved'});
 const out=reviewRemainingBestiary(...a);assert.equal(out.summary.exactPublicationHeadingClaims,17);assert.equal(out.complete,false);assert.equal(out.approvedDenominator,null);
});
test('previous reports and observation IDs remain disjoint',()=>{
 const a=input();a[4].groups.push({reviewId:a[2].selectedReviewIds[0],units:[]});
 assert.throws(()=>reviewRemainingBestiary(...a),/selection changed/);
});

test('digital index passes account for all 50 original claims once, including one unavailable filter',()=>{
 const read=file=>JSON.parse(readFileSync(new URL('../catalog/'+file,import.meta.url),'utf8'));
 const original=read('remaining-bestiary-attribution-proposals-2014.json');
 const compound=read('compound-bestiary-filter-evidence-2014.json');
 const sidekicks=read('essentials-sidekick-index-evidence-2014.json');
 const remaining=read('remaining-bestiary-filter-evidence-2014.json');
 const covered=[
  ...compound.groups.flatMap(group=>group.observations.map(row=>row.claimKey)),
  ...sidekicks.publications.flatMap(book=>book.captures.flatMap(capture=>capture.checkedClaimKeys)),
  ...remaining.captures.map(capture=>capture.checkedClaimKey),
  ...remaining.comparisons.flatMap(capture=>capture.unavailableReferenceFilter?[capture.unavailableReferenceFilter.unresolvedClaimKey]:[]),
 ];
 const expected=original.groups.flatMap(group=>group.publicationClaims.map(claim=>claim.claimKey));
 assert.equal(covered.length,50);
 assert.equal(new Set(covered).size,50);
 assert.deepEqual(covered.toSorted(),expected.toSorted());
 assert.equal(remaining.captures.filter(capture=>capture.listing==='empty').length,4);
 assert.equal(remaining.comparisons.length,3);
 for(const result of [compound,sidekicks,remaining]){
  assert.equal(result.accepted,false);
  assert.equal(result.automaticMerge,false);
  assert.equal(result.approvedDenominator,null);
 }
});
