import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildRaceVersionProposals,proposeRaceVersions} from '../scripts/propose-race-version-units-2014.mjs';
const read=name=>JSON.parse(readFileSync(new URL('../catalog/'+name,import.meta.url),'utf8'));
const inputs=()=>[read('effective-m0-review-2014.json'),read('race-publication-identity-evidence-2014.json'),read('numeric-source-scope-policy-2014.json'),read('goliath-publication-reference-2014.json'),read('vgm-mtf-selected-errata-2014.json')];

test('version proposals reproduce all selected observations, using a separate primary errata reference for Goliath',()=>{
  const actual=buildRaceVersionProposals();assert.deepEqual(actual,read('race-version-unit-proposals-2014.json'));
  assert.deepEqual(actual.summary,{consideredGroups:12,proposedSeparateVersionGroups:12,unresolvedGroups:0,preservedObservations:24,proposedVersionUnits:24,acceptedCanonicalUnits:0});
  assert.equal(actual.groups.find(group=>group.name==='goliath').units.find(unit=>unit.sourceId==='111').identityEvidenceKind,'publisher-errata-publication-reference');
  for(const group of actual.groups){
    assert.equal(group.automaticMerge,false);assert.equal(group.automaticCharacterMigration,false);
    assert.equal(group.accepted,false);assert.equal(group.canonicalId,null);
    assert.equal(new Set(group.units.map(unit=>unit.proposedVersionKey)).size,2);
    for(const unit of group.units){assert.equal(unit.fullRules,'unverified');assert.equal(unit.translationReusePermission,'not-established');}
  }
  assert.equal(actual.approvedDenominator,null);
});

test('an official entry from a different book or edition cannot stand in for the missing source',()=>{
  const data=inputs();data[1].records=data[1].records.filter(record=>!(record.name==='Firbolg'&&record.publication==="Volo's Guide to Monsters"));
  data[1].records.push({name:'Firbolg',publication:'Player’s Handbook',url:'https://www.dndbeyond.com/species/9999-firbolg'});
  const group=proposeRaceVersions(...data).groups.find(group=>group.name==='firbolg');
  assert.equal(group.proposal,'retain-unresolved-publication-attribution');
  assert.equal(group.units.find(unit=>unit.sourceId==='111').primaryIdentityUrl,null);
});

test('same name in another section, third-source attribution and missing source do not enter this scoped proposal',()=>{
  for(const change of [g=>g.section='bestiary',g=>g.members[0].sourceIds=['158','113'],g=>g.members[0].sourceIds=[]]){
    const data=inputs(),g=data[0].identityGroups.find(group=>group.comparisonKey==='firbolg');change(g);
    assert.equal(proposeRaceVersions(...data).groups.some(group=>group.name==='firbolg'),false);
  }
});

test('ambiguous official identities, wrong host and changed observation names fail explicitly',()=>{
  for(const change of [
    d=>d[1].records.push(structuredClone(d[1].records[0])),
    d=>d[1].records[0].url=d[1].records[1].url,
    d=>d[1].records[0].url='https://www.dndbeyond.com.example.org/species/1-example',
    d=>d[0].identityGroups.find(g=>g.comparisonKey==='firbolg').members[0].observedName='Other race',
    d=>d[0].identityGroups.push(structuredClone(d[0].identityGroups.find(g=>g.comparisonKey==='firbolg'))),
    d=>d[2].records.find(r=>r.sourceId==='111').observedTitle='Other publication'
  ]){const data=inputs();change(data);assert.throws(()=>proposeRaceVersions(...data));}
});

test('legacy labels are not used to exclude 2014 variants or migrate user choices',()=>{
  const data=inputs(),before=structuredClone(data);
  const result=proposeRaceVersions(...data);
  for(const name of ['aasimar','orc']) assert.equal(result.groups.find(g=>g.name===name).proposal,'keep-separate-publication-versions');
  assert.deepEqual(data,before);
  assert.equal(result.complete,false);
});


test('without the specific errata evidence Goliath stays unresolved; a wrong page or SHA cannot substitute for it',()=>{
  const data=inputs();data[3]=null;
  const group=proposeRaceVersions(...data).groups.find(g=>g.name==='goliath');
  assert.equal(group.proposal,'retain-unresolved-publication-attribution');
  assert.equal(group.units.find(unit=>unit.sourceId==='111').primaryIdentityUrl,null);
  for(const [field,value] of [['bookPage',110],['sha256','0'.repeat(64)],['sourceId','107'],['anchor','Mountain Born'],['errataVersion','4.0']]){
    const changed=inputs();changed[3][field]=value;assert.throws(()=>proposeRaceVersions(...changed),/Unverified publication reference/);
  }
});
