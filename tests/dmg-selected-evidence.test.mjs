import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const raw=p=>readFileSync(new URL('../catalog/'+p+'.json',import.meta.url),'utf8');
const read=p=>JSON.parse(raw(p));const scope=read('scope-register-2014');
test('selected DMG evidence preserves11 item identities and9 verified/2 unverified comparisons',()=>{
 const d=read('dmg-selected-item-errata-2014');assert.equal(d.records.length,11);assert.equal(d.records.filter(r=>r.secondaryFieldsMatched).length,9);
 for(const r of d.records){const o=scope.records.find(x=>x.id===r.observationId);assert.equal(o.section,'items');assert.equal(r.observedName,o.names.en);assert.deepEqual(r.observedSourceIds,o.sourceIds);assert.equal(r.secondaryUrl,o.url);assert.equal(r.accepted,false);assert.equal(r.fullRulesVerified,false);assert.equal(r.canonicalId,null);}
 assert.deepEqual(d.records.filter(r=>!r.secondaryFieldsMatched).map(r=>r.observationId),['dndsu:items:108','dndsu:items:42']);
});
test('DMG table corrections preserve MM sources and do not become primary CR evidence',()=>{
 const d=read('dmg-appendix-xp-comparison-2014');assert.equal(d.sourceId,'101');assert.equal(d.records.length,10);
 for(const r of d.records){const o=scope.records.find(x=>x.id===r.observationId);assert.equal(o.section,'bestiary');assert.equal(r.observedName,o.names.en);assert.deepEqual(r.observedSourceIds,['103']);assert.deepEqual(r.observedSourceIds,o.sourceIds);assert.equal(r.observedCurrentXp,r.primaryCorrectedTableXp);assert.ok(r.primaryPreviousTableXp<r.primaryCorrectedTableXp);assert.equal(r.primaryChallengeRating,undefined);assert.equal(r.canonicalId,null);assert.equal(r.automaticPatch,false);}
});
test('Appendix D findings distinguish unsupported preparation labels from local spell damage',()=>{
 const d=read('skt-appendix-d-comparison-2014'),primary=read('skt-spellcasting-action-evidence-2014');assert.equal(d.records.length,2);
 for(const r of d.records){const action=primary.actions.find(a=>a.unitId===r.primaryActionId);assert.equal(action.observationCandidate.id,r.observationId);assert.equal(r.fullStatBlockCompared,false);assert.equal(r.canonicalId,null);assert.ok(r.extraSecondaryClaims.every(c=>c.primary===null));assert.deepEqual(action.groups[0].spells.find(s=>s.name==='fire bolt').override,{damage:{dice:'1d10',type:'fire'}});}
 assert.equal(d.records[0].extraSecondaryClaims.find(c=>c.field==='casterLevel').observed,6);assert.ok(!d.records[1].extraSecondaryClaims.some(c=>c.field==='casterLevel'));
});
test('all three evidence packages pin normalized source inputs',()=>{
 for(const name of ['dmg-selected-item-errata-2014','dmg-appendix-xp-comparison-2014','skt-appendix-d-comparison-2014'])for(const [path,sha] of Object.entries(read(name).inputSha256)){const bytes=readFileSync(new URL('../'+path,import.meta.url),'utf8').replace(/\r\n/g,'\n');assert.equal(sha,createHash('sha256').update(bytes).digest('hex'));}
});
