import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reviewMonsterVersions,buildMonsterVersions} from '../scripts/review-monster-version-units-2014.mjs';
const read=name=>JSON.parse(readFileSync(new URL('../catalog/'+name,import.meta.url)));
const inputs=()=>[read('effective-m0-review-2014.json'),read('numeric-source-scope-policy-2014.json'),read('monster-version-publication-evidence-2014.json')];
test('114 two-source groups reproduce without accepting canonical units or changing observations',()=>{
 const data=inputs(),before=JSON.stringify(data),report=reviewMonsterVersions(...data);
 assert.deepEqual(report.summary,{consideredGroups:114,preservedObservations:228,publicationEvidencedObservations:210,proposedSeparateVersionGroups:103,proposedVersionUnits:206,unresolvedGroups:11,acceptedCanonicalUnits:0});
 assert.equal(report.approvedDenominator,null);assert.equal(report.accepted,false);assert.equal(report.complete,false);
 assert.ok(report.groups.every(g=>!g.accepted&&!g.automaticMerge&&!g.automaticCharacterMigration&&g.canonicalId===null));
 assert.equal(JSON.stringify(data),before);assert.deepEqual(buildMonsterVersions(),read('monster-version-unit-proposals-2014.json'));
});
test('drake colours, accent and compound names stay unresolved despite nearby publisher headings',()=>{
 const r=reviewMonsterVersions(...inputs());
 for(const name of ['black guard drake','deep rothe','nilbog,goblin гоблин']){
  const g=r.groups.find(g=>g.name===name);assert.equal(g.proposal,'retain-unresolved-publication-attribution');assert.ok(g.units.every(u=>u.publicationEvidence===null));
 }
 const warrior=r.groups.find(g=>g.name==='firenewt warrior');assert.equal(warrior.proposal,'retain-unresolved-publication-attribution');assert.equal(warrior.units.filter(u=>u.publicationEvidence).length,1);
});
test('missing primary heading with explicit accounting withholds the complete pair',()=>{
 const data=inputs(),source=data[2].sources.find(s=>s.sourceId==='111');source.records=source.records.filter(r=>r.name!=='kraken priest');source.missing.push({name:'kraken priest',reason:'missing-index-heading'});
 const r=reviewMonsterVersions(...data);assert.equal(r.summary.proposedSeparateVersionGroups,102);assert.equal(r.summary.unresolvedGroups,12);
});
test('foreign URLs, substituted book metadata and duplicate witnesses fail closed',()=>{
 for(const mutate of [e=>e.sources[0].records[0].targetUrl='https://untrusted.invalid/sources/vgtm/bestiary#A',e=>e.sources[0].records[0].targetUrl='https://www.dndbeyond.com/sources/dmg/bestiary#A',e=>e.sources[0].records[0].targetUrl=e.sources[0].records[0].targetUrl.replace('#','?untrusted=1#'),e=>e.sources[0].title='Monster Manual 2024',e=>e.sources[0].records.push({...e.sources[0].records[0]}),e=>e.sources[0].records[0].heading='Another monster']){
  const data=inputs();mutate(data[2]);assert.throws(()=>reviewMonsterVersions(...data));
 }
});
test('removed accounting, altered policy and scope changes cannot silently inherit old evidence',()=>{
 const missing=inputs();missing[2].sources[0].missing.pop();assert.throws(()=>reviewMonsterVersions(...missing),/accounting/);
 const changed=inputs();changed[1].records.find(r=>r.sourceId==='111').observedTitle='Different book';assert.throws(()=>reviewMonsterVersions(...changed),/policy/);
 const scope=inputs();scope[0].identityGroups.find(g=>g.comparisonKey==='kraken priest'&&g.section==='bestiary').comparisonKey='new name';assert.throws(()=>reviewMonsterVersions(...scope),/Selected names/);
});
test('duplicate observations across selected groups are rejected rather than counted twice',()=>{
 const data=inputs(),groups=data[0].identityGroups.filter(g=>g.section==='bestiary'&&g.members.length===2&&JSON.stringify(g.members.map(m=>m.sourceIds).sort())==='[["111"],["158"]]');
 groups[1].members[0].id=groups[0].members[0].id;assert.throws(()=>reviewMonsterVersions(...data),/duplicate observation/);
});
