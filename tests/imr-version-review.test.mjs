import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {reviewImrVersions} from '../scripts/catalog-imr-version-review.mjs';
const paths=['catalog/imr-version-boundaries-2014.json','catalog/infernal-machine-public-index-2014.json','catalog/scope-register-2014.json'];
const raw=paths.map(p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/\r\n/g,'\n'));
const [data,index,scope]=raw.map(JSON.parse);
test('selected source versions are candidates, including six numerically different groups',()=>{
 const r=reviewImrVersions(data,index,scope);
 assert.deepEqual(r.summary,{selectedPrimaryRows:11,distinctNames:9,secondaryObservations:18,selectedSecondaryFields:94,groupsWithSelectedDifferences:6,sourceCompatibleCandidateLinks:11,primaryFullStatBlocksRead:0});
 assert.ok(r.groups.every(g=>g.identityDecision==='unresolved'&&g.canonicalId===null&&!g.fullRulesVerified));
 assert.deepEqual(r.groups.find(g=>g.name==='Trapper').differingFields,['hitPoints','walkingSpeedFeet']);
 assert.deepEqual(r.groups.find(g=>g.name==='Warlock of the Fiend').members.map(o=>[o.selectedFields.armorClass,o.selectedFields.armorClassWithMageArmor]),[[12,15],[13,16]]);
});
test('matching headers do not establish identical abilities or canonical merges',()=>{
 const r=reviewImrVersions(data,index,scope);for(const name of ['Adult Oblex','Eidolon','Warlord']){
  const g=r.groups.find(g=>g.name===name);assert.deepEqual(g.differingFields,[]);assert.equal(g.automaticMerge,false);assert.equal(g.identityDecision,'unresolved');
 }
});
test('URL number never substitutes for the observed source label',()=>{
 const r=reviewImrVersions(data,index,scope);
 for(const [id,expected] of [['17224','6482'],['2556122','521'],['17300','6927'],['2556141','561']]){
  const row=r.rows.find(r=>r.cardUrl.includes('/'+id+'-'));
  assert.equal(row.candidates.find(c=>c.relation==='source-label-compatible-candidate').observationId,'dndsu:bestiary:'+expected);
  assert.equal(row.primaryFullRulesRead,false);
 }
});
test('wrong source, duplicate IDs, omitted versions and primary rows fail',()=>{
 for(const mutate of [d=>d.observations[0].sourceIds=['158'],d=>d.observations[0].observationId=d.observations[1].observationId,d=>d.observations.pop(),d=>d.primaryRows.pop(),d=>d.primaryRows.push(d.primaryRows[0]),d=>d.primaryRows[0].displayedSource="Volo's Guide to Monsters",d=>d.observations[0].originalUrl='https://dnd.su/wrong/']){
  const d=structuredClone(data);mutate(d);assert.throws(()=>reviewImrVersions(d,index,scope));
 }
});
test('secondary or redirect evidence cannot be promoted',()=>{
 for(const mutate of [d=>d.accepted=true,d=>d.complete=true,d=>d.approvedDenominator=18,d=>d.observations[0].primaryFullRulesRead=true,d=>d.observations[0].fullStatBlockCompared=true,d=>d.primaryRows[0].access.fullTextRead=true,d=>d.primaryRows[0].canonicalId='canonical',d=>d.primaryRows[0].automaticMerge=true,d=>d.primaryRows[0].access.destination='https://example.com/']){
  const d=structuredClone(data);mutate(d);assert.throws(()=>reviewImrVersions(d,index,scope));
 }
});
test('zero walking speed is valid but absent, negative and implicit conditional fields fail',()=>{
 assert.equal(reviewImrVersions(data,index,scope).groups.find(g=>g.name==='Eidolon').members[0].selectedFields.walkingSpeedFeet,0);
 for(const mutate of [d=>delete d.observations[0].selectedFields.walkingSpeedFeet,d=>d.observations[0].selectedFields.hitPoints=-1,d=>d.observations[0].selectedFields.armorClass=true,d=>d.observations[0].selectedFields.challengeRating='1/0',d=>d.observations[0].selectedFields.armorClassWithMageArmor=17,d=>delete d.observations.find(o=>o.observedName==='Warlock of the Fiend').selectedFields.armorClassWithMageArmor]){
  const d=structuredClone(data);mutate(d);assert.throws(()=>reviewImrVersions(d,index,scope));
 }
});
test('results do not mutate caller inputs',()=>{
 const before=JSON.stringify(data),r=reviewImrVersions(data,index,scope);r.groups[0].members[0].sourceIds.push('fake');r.rows[0].access.destination='changed';assert.equal(JSON.stringify(data),before);
});
test('report and normalized pinned hashes reproduce',()=>{
 const r=reviewImrVersions(data,index,scope);r.inputSha256=Object.fromEntries(paths.map((p,i)=>[p,createHash('sha256').update(raw[i]).digest('hex')]));
 for(const [p,sha] of Object.entries(data.inputSha256))assert.equal(r.inputSha256[p],sha);
 assert.deepEqual(r,JSON.parse(readFileSync(new URL('../catalog/imr-version-review-2014.json',import.meta.url),'utf8')));
});
