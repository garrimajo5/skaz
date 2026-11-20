import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {reviewVariantBoundaries} from '../scripts/catalog-variant-boundary-review.mjs';
const paths=['catalog/skt-variant-boundaries-2014.json','catalog/skt-public-index-2014.json','catalog/scope-register-2014.json'];
const raw=paths.map(p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/\r\n/g,'\n'));
const [manifest,index,scope]=raw.map(JSON.parse);

test('different observed variants remain separate and matching CR never establishes identity',()=>{
 const r=reviewVariantBoundaries(manifest,index,scope);
 assert.deepEqual(r.summary,{groups:3,observations:5,groupsWithObservedDifferences:2,primaryIndexCrDifferences:1});
 const dwarf=r.rows.find(r=>r.groupId==='shield-dwarf');
 assert.deepEqual(dwarf.differingObservedFields,['challengeRating','armorClass','hitPoints','alignment']);
 assert.equal(dwarf.members[0].challengeRatingComparison,'same-number-not-proof-of-identity');
 assert.equal(dwarf.members[1].challengeRatingComparison,'different-number-needs-version-review');
 const princess=r.rows.find(r=>r.groupId==='storm-giant-princess');
 assert.deepEqual(princess.differingObservedFields,['armorClass']);
 assert.deepEqual(princess.members.map(r=>r.selectedObservedFields.armorClass),[11,12]);
 assert.ok(r.rows.every(r=>r.canonicalId===null&&r.automaticMerge===false&&r.primaryFullTextRead===false));
 assert.equal(r.rows.find(r=>r.groupId==='axe-of-mirabar').members[0].alignmentComparison,'different-label-needs-version-review');
});
test('an absent primary CR is not a zero or numeric match',()=>{
 const i=structuredClone(index);i.pages.flatMap(p=>p.rows).find(r=>r.digitalName==='Shield Dwarf').challengeRating='';
 const d=reviewVariantBoundaries(manifest,i,scope).rows.find(r=>r.groupId==='shield-dwarf');
 assert.ok(d.members.every(m=>m.challengeRatingComparison==='primary-index-not-shown'));
});
test('evidence cannot be promoted or observations reassigned silently',()=>{
 for(const mutate of [m=>m.accepted=true,m=>m.records[0].fullRulesVerified=true,m=>m.records[0].sourceIds=['103'],m=>m.records[0].observedName='Commoner',m=>m.groups[0].canonicalId='canonical:1',m=>m.groups[0].automaticMerge=true,m=>m.groups[0].observationIds.push(m.groups[0].observationIds[0]),m=>m.groups[0].observationIds=[],m=>m.primaryAccess.fullTextRead=true,m=>m.records[0].selectedObservedFields.challengeRating=null,m=>m.records[0].selectedObservedFields.hitPoints=-1]){
  const m=structuredClone(manifest);mutate(m);assert.throws(()=>reviewVariantBoundaries(m,index,scope));
 }
});
test('review clones observed values and keeps input immutable',()=>{
 const before=JSON.stringify(manifest),r=reviewVariantBoundaries(manifest,index,scope);
 r.rows[0].members[0].selectedObservedFields.hitPoints=1;r.rows[0].members[0].originalSourceIds.push('fake');
 assert.equal(JSON.stringify(manifest),before);
});
test('report and pinned normalized input hashes reproduce',()=>{
 const r=reviewVariantBoundaries(manifest,index,scope);
 r.inputSha256=Object.fromEntries(paths.map((p,i)=>[p,createHash('sha256').update(raw[i]).digest('hex')]));
 for(const [p,sha]of Object.entries(manifest.inputSha256))assert.equal(sha,r.inputSha256[p]);
 const saved=JSON.parse(readFileSync(new URL('../catalog/skt-variant-review-2014.json',import.meta.url),'utf8'));assert.deepEqual(saved,r);
});
