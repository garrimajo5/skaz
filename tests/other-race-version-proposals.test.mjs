import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildOtherRaceVersions,reviewOtherRaceVersions} from '../scripts/review-other-race-versions-2014.mjs';
const read=file=>JSON.parse(readFileSync(new URL('../catalog/'+file,import.meta.url),'utf8'));
const input=()=>['effective-m0-review-2014.json','race-other-publication-evidence-2014.json','numeric-source-scope-policy-2014.json','race-other-toc-evidence-2014.json','race-version-unit-proposals-2014.json'].map(read);

test('remaining publication proposals preserve all23 observations without accepting a denominator',()=>{
 const report=buildOtherRaceVersions();assert.deepEqual(report,read('race-other-version-proposals-2014.json'));
 assert.deepEqual(report.summary,{consideredGroups:10,proposedSeparateVersionGroups:5,unresolvedGroups:5,preservedObservations:23,publicationEvidencedObservations:17,proposedVersionUnits:10,acceptedCanonicalUnits:0});
 assert.deepEqual(report.groups.filter(g=>g.proposal==='keep-separate-publication-versions').map(g=>g.name).sort(),['changeling','fairy','harengon','satyr','shifter']);
 assert.equal(report.approvedDenominator,null);assert.equal(report.complete,false);
 for(const g of report.groups){assert.equal(g.accepted,false);assert.equal(g.canonicalId,null);assert.equal(g.automaticMerge,false);assert.equal(g.automaticCharacterMigration,false);for(const u of g.units){assert.equal(u.fullRules,'unverified');assert.equal(u.translationReusePermission,'not-established');}}
});
test('source107 cannot be silently replaced by Elemental Evil; Genasi gets only the evidenced book heading',()=>{
 const report=buildOtherRaceVersions();
 const a=report.groups.find(g=>g.name==='aarakocra'),g=report.groups.find(g=>g.name==='genasi');
 assert.equal(a.units.find(u=>u.sourceId==='107').identityEvidenceKind,'missing');
 assert.equal(g.units.find(u=>u.sourceId==='107').identityEvidenceKind,'publisher-contents-heading');
 assert.equal(g.units.find(u=>u.sourceId==='158').identityEvidenceKind,'missing');
 assert.equal(g.proposal,'retain-unresolved-publication-attribution');
});
test('unlabeled Ravnica and Tortle observations stay unresolved despite exact same-name publisher entries',()=>{
 const report=buildOtherRaceVersions();
 for(const name of ['centaur','minotaur','tortle']){
  const group=report.groups.find(g=>g.name===name);assert.equal(group.proposal,'retain-unresolved-publication-attribution');
  for(const unit of group.units.filter(u=>u.sourceId===null)){assert.equal(unit.primaryIdentityUrl,null);assert.equal(unit.proposedVersionKey,null);assert.equal(unit.missingReason,'missing-source-attribution');}
 }
 for(const name of ['centaur','minotaur'])assert.equal(report.groups.find(g=>g.name===name).units.find(u=>u.sourceId==='112').identityEvidenceKind,'publisher-contents-heading');
});
test('later Forge identity cannot replace missing Rising identity; missing Witchlight heading stays unresolved',()=>{
 for(const name of ['Changeling','Shifter']){
  const d=input();d[1].records=d[1].records.filter(r=>!(r.name===name&&r.publication==='Eberron: Rising from the Last War'));
  assert.equal(reviewOtherRaceVersions(...d).groups.find(g=>g.name===name.toLowerCase()).proposal,'retain-unresolved-publication-attribution');
 }
 const d=input();d[3].sources=d[3].sources.filter(s=>s.sourceId!=='151');
 for(const g of reviewOtherRaceVersions(...d).groups.filter(g=>['fairy','harengon'].includes(g.name)))assert.equal(g.proposal,'retain-unresolved-publication-attribution');
});
test('ambiguous evidence, wrong publisher, substituted books and changed observations fail closed',()=>{
 for(const change of [
  d=>d[1].records.push({...d[1].records[0]}),
  d=>d[1].records[0].url='https://www.dndbeyond.com.evil.invalid/species/4-aarakocra',
  d=>d[3].sources[0].records[0].targetUrl='https://www.dndbeyond.com/sources/ggtr/character-creation#Fairy',
  d=>d[3].sources[0].records.push({...d[3].sources[0].records[0]}),
  d=>d[3].sources[0].htmlSha256='not-a-hash',
  d=>d[2].records.find(r=>r.sourceId==='107').observedTitle='Elemental Evil Players Companion',
  d=>d[0].identityGroups.find(g=>g.comparisonKey==='changeling'&&g.section==='race').members[0].observedName='Shifter'
 ]){const d=input();change(d);assert.throws(()=>reviewOtherRaceVersions(...d));}
});
test('no source observations or earlier proposals are mutated; unexpected residual names require new evidence',()=>{
 const d=input(),before=structuredClone(d);reviewOtherRaceVersions(...d);assert.deepEqual(d,before);
 d[1].selectedNames=d[1].selectedNames.filter(n=>n!=='satyr');assert.throws(()=>reviewOtherRaceVersions(...d),/cover remaining/);
});
