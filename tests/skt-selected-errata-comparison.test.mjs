import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const raw=path=>readFileSync(new URL('../'+path,import.meta.url));
const read=path=>JSON.parse(raw(path));
const d=read('catalog/skt-selected-errata-comparison-2014.json');
const scope=read('catalog/scope-register-2014.json');
test('selected errata comparisons preserve original observations without accepting complete stat blocks',()=>{
 assert.equal(d.records.length,7);assert.equal(new Set(d.records.map(r=>r.observationId)).size,7);
 assert.equal(d.inputSha256['catalog/scope-register-2014.json'],createHash('sha256').update(raw('catalog/scope-register-2014.json')).digest('hex'));
 assert.equal(d.accepted,false);assert.equal(d.complete,false);
 for(const r of d.records){
  const original=scope.records.find(x=>x.id===r.observationId);
  assert.equal(r.observedName,original.names.en);assert.deepEqual(r.observedSourceIds,original.sourceIds);
  assert.equal(r.secondaryUrl,original.url);assert.equal(r.comparedBlock,'Spellcasting action only');
  assert.equal(r.wholeStatBlockCompared,false);assert.equal(r.exactObservedPrinting,'unverified');
  assert.equal(r.fullRulesVerified,false);assert.equal(r.accepted,false);assert.equal(r.canonicalId,null);
  assert.equal(r.spellAttackBonusNullMeans,'not-stated-in-compared-action');
 }
});
test('spell action conditions do not inherit another casting block or invent an unstated attack bonus',()=>{
 const r=id=>d.records.find(r=>r.observationId==='dndsu:bestiary:'+id).selectedMatches;
 assert.equal(r('5599').ability,'intelligence');assert.equal(r('5599').saveDc,17);assert.equal(r('5599').spellAttackBonus,11);
 assert.equal(r('5604').ability,'charisma');assert.equal(r('5604').saveDc,22);assert.equal(r('5604').spellAttackBonus,null);
 assert.equal(r('5607').saveDc,19);assert.deepEqual(r('5607').oneActionSpells,['legend lore']);
 assert.ok(d.records.every(r=>r.selectedMatches.noMaterialComponents));
 assert.match(d.primaryEvidence.sha256,/^[0-9a-f]{64}$/);assert.equal(d.primaryEvidence.reusePermission,'not-established');
});

test('conflicts and secondary calculations stay explicit instead of becoming matching source facts',()=>{
 const storvald=d.records.find(r=>r.observationId==='dndsu:bestiary:5619');
 assert.equal(storvald.result,'selected-matches-with-review-findings');
 assert.equal(storvald.selectedMatches.ability,undefined);
 assert.deepEqual(storvald.differences.find(x=>x.field==='ability').primary,'wisdom');
 assert.deepEqual(storvald.differences.find(x=>x.field==='ability').observed,'intelligence');
 assert.equal(storvald.differences.find(x=>x.field==='saveDc').primary,null);
 const turlang=d.records.find(r=>r.observationId==='dndsu:bestiary:5615');
 assert.equal(turlang.selectedMatches.spellAttackBonus,undefined);
 assert.equal(turlang.differences.find(x=>x.field==='limitedSpellFrequencyScope').primary,'each-spell');
 const slark=d.records.find(r=>r.observationId==='dndsu:bestiary:5600');
 assert.equal(slark.selectedMatches.componentRequirement,'none');
 assert.equal(d.records.filter(r=>r.result==='selected-conditions-match-errata-v2').length,5);
});
