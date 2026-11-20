import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildMultibookMonsters,reviewMultibookMonsters} from '../scripts/review-multibook-monster-units-2014.mjs';
const read=n=>JSON.parse(readFileSync(new URL('../catalog/'+n,import.meta.url),'utf8'));
const input=()=>['effective-m0-review-2014.json','numeric-source-scope-policy-2014.json','multibook-monster-publication-evidence-2014.json','monster-version-unit-proposals-2014.json','mtf-monster-version-unit-proposals-2014.json'].map(read);

test('all40 multi-book observations survive without repeating226 simple pairs or approving catalog units',()=>{
 const r=buildMultibookMonsters();assert.deepEqual(r,read('multibook-monster-unit-proposals-2014.json'));
 assert.deepEqual(r.summary,{consideredGroups:13,preservedObservations:40,publicationEvidencedObservations:28,groupsWithAllPublicationWitnesses:5,proposedPublicationUnitsInWitnessedGroups:16,unresolvedGroups:8,homonymGroups:1,unapprovedSpellingWitnesses:4,publisherLabelFragmentAnomalies:2,acceptedCanonicalUnits:0});
 assert.equal(r.accepted,false);assert.equal(r.complete,false);assert.equal(r.approvedDenominator,null);
 const d=input(),prior=new Set([...d[3].groups,...d[4].groups].flatMap(g=>g.units.map(u=>u.observationId)));
 assert.equal(prior.size,452);for(const g of r.groups){assert.equal(g.accepted,false);assert.equal(g.automaticMerge,false);assert.equal(g.automaticCharacterMigration,false);for(const u of g.units){assert.equal(prior.has(u.observationId),false);assert.equal(u.fullRules,'unverified');assert.equal(u.translationReusePermission,'not-established');assert.equal(u.canonicalId,null);}}
});

test('Hunt Monstrosity is an explicit distinct-name proposal rather than another accepted demon-prince version',()=>{
 const g=buildMultibookMonsters().groups.find(g=>g.name==='demogorgon');
 assert.equal(g.proposal,'review-distinct-homonym-and-publication-versions');
 const u=g.units.find(u=>u.sourceIds[0]==='123');assert.equal(u.observationId,'dndsu:bestiary:8033');assert.equal(u.observedName,'Demogorgon');
 assert.equal(u.publicationEvidence.digitalName,'Demogorgon (Monstrosity)');assert.equal(u.publicationEvidence.type,'Monstrosity');assert.equal(u.publicationEvidence.challenge,'4');assert.equal(u.publicationEvidence.identityAccepted,false);
 assert.equal(g.disambiguation.associationOfSource113WithDemonPrince,'requires-primary-type-review');assert.equal(g.disambiguation.automaticNameAlias,false);
 for(const field of ['digitalName','type','size','challenge','displayedSource']){const d=input(),row=d[2].demogorgonDisambiguation.records.find(r=>r.sourceId==='123');row[field]=field==='digitalName'?'"The Demogorgon"':'Wrong';assert.throws(()=>reviewMultibookMonsters(...d));}
});

test('publisher Female/Male label-fragment swap is preserved as unresolved, never repaired',()=>{
 const r=buildMultibookMonsters();
 for(const name of ['female steeder','male steeder']){
  const g=r.groups.find(g=>g.name===name),u=g.units.find(u=>u.sourceIds[0]==='158');
  assert.equal(u.publicationEvidence,null);assert.equal(u.proposedVersionKey,null);assert.equal(u.publisherLinkAnomaly.automaticCorrection,false);assert.notEqual(u.publisherLinkAnomaly.expectedFragment,u.publisherLinkAnomaly.observedFragment);
  assert.equal(g.units.find(u=>u.sourceIds[0]==='113').publicationEvidence.kind,'publisher-exact-contents-heading');
 }
 const d=input(),s=d[2].sources.find(s=>s.sourceId==='158');s.linkAnomalies[0].targetUrl=s.linkAnomalies[0].targetUrl.replace(s.linkAnomalies[0].observedFragment,s.linkAnomalies[0].expectedFragment);assert.throws(()=>reviewMultibookMonsters(...d),/anomaly/);
});

test('curly apostrophe witnesses do not silently fill four exact-name gaps',()=>{
 for(const g of buildMultibookMonsters().groups.filter(g=>["fraz-urb'luu","graz'zt"].includes(g.name))){
  for(const u of g.units.filter(u=>['113','158'].includes(u.sourceIds[0]))){assert.equal(u.publicationEvidence,null);assert.equal(u.literalSpellingProposal.acceptedAlias,false);assert.equal(u.literalSpellingProposal.automaticAlias,false);}
  assert.notEqual(g.units.find(u=>u.sourceIds[0]==='129').publicationEvidence,null);
 }
 const d=input(),s=d[2].sources.find(s=>s.sourceId==='113'),a=s.alternateSpellings[0];s.records.push({name:a.observedKey,heading:a.heading,targetUrl:a.targetUrl});s.missing=s.missing.filter(m=>m.name!==a.observedKey);assert.throws(()=>reviewMultibookMonsters(...d),/exact heading/);
});

test('exact publication chapter fragment and unique accounting are mandatory',()=>{
 for(const change of [
  e=>e.sources[0].records[0].targetUrl=e.sources[0].records[0].targetUrl.replace('#Baphomet','#Derro'),
  e=>e.sources[0].records[0].targetUrl=e.sources[0].records[0].targetUrl.replace('/bestiary','/fantastical-races'),
  e=>e.sources[0].records[0].targetUrl+='?x=1',e=>e.sources[0].records[0].targetUrl=e.sources[0].records[0].targetUrl.replace('www.dndbeyond.com','www.dndbeyond.com.evil.invalid'),
  e=>e.sources[0].records.push({...e.sources[0].records[0]}),e=>e.sources[0].missing.pop(),e=>e.sources[0].htmlSha256='none',
  e=>e.sources[0].sourceId='129',e=>e.sources.push({...e.sources[0]}),e=>e.demogorgonDisambiguation.records[1]={...e.demogorgonDisambiguation.records[0]}
 ]){const d=input();change(d[2]);assert.throws(()=>reviewMultibookMonsters(...d));}
});

test('partial OotA and TYP headings are not borrowed from other books',()=>{
 const r=buildMultibookMonsters();for(const name of ['derro savant','duergar kavalrachni','female steeder','male steeder'])assert.equal(r.groups.find(g=>g.name===name).units.find(u=>u.sourceIds[0]==='129').publicationEvidence,null);
 for(const name of ['choker','deathlock wight'])assert.equal(r.groups.find(g=>g.name===name).units.find(u=>u.sourceIds[0]==='133').publicationEvidence,null);
 const d=input();d[1].records.find(r=>r.sourceId==='133').observedTitle="Mordenkainen's Tome of Foes";assert.throws(()=>reviewMultibookMonsters(...d),/policy/);
});

test('source observations and previous reports are immutable; duplicate prior groups and unknown sources fail',()=>{
 const d=input(),before=structuredClone(d);reviewMultibookMonsters(...d);assert.deepEqual(d,before);
 for(const mutate of [
  x=>x[3].groups[0].reviewId=x[0].identityGroups.find(g=>g.section==='bestiary'&&g.comparisonKey==='meenlock').reviewId,
  x=>x[0].identityGroups.find(g=>g.section==='bestiary'&&g.comparisonKey==='meenlock').members[0].sourceIds=['111','122'],
  x=>x[0].identityGroups.find(g=>g.section==='bestiary'&&g.comparisonKey==='meenlock').members[0].id='dndsu:bestiary:8033'
 ]){const x=input();mutate(x);assert.throws(()=>reviewMultibookMonsters(...x));}
});
