import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>JSON.parse(readFileSync(new URL('../catalog/'+name,import.meta.url),'utf8'));
const armor=read('srd51-armor-parameters-2014.json'),weapons=read('srd51-weapon-parameters-2014.json');
const rule=key=>weapons.conditions.find(r=>r.key===key).parameters;

test('every weapon property resolves once to a sourced rule; special rules resolve to existing weapons',()=>{
 const keys=weapons.conditions.map(r=>r.key);
 assert.equal(new Set(keys).size,keys.length);
 for(const r of weapons.conditions){assert.ok([64,65].includes(r.sourcePage));assert.ok(r.textRu.length>50);}
 for(const item of weapons.records){
  assert.equal(new Set(item.properties.map(p=>p.key)).size,item.properties.length);
  for(const p of item.properties){
   assert.equal(keys.filter(k=>k===p.key).length,1);
   if(p.rangeFeet){assert.ok(p.rangeFeet.normal>0);assert.ok(p.rangeFeet.long>=p.rangeFeet.normal);assert.ok(['thrown','ammunition'].includes(p.key));}
  }
 }
 const special=weapons.records.filter(r=>r.properties.some(p=>p.key==='special')).map(r=>r.candidateItemId);
 assert.deepEqual([...special].sort(),[...rule('special').weapons].sort());
 for(const id of special)assert.equal(weapons.conditions.filter(c=>c.parameters.candidateItemId===id).length,1);
});

test('weapon costs are not duplicated and no parameter grants or spends a player resource',()=>{
 for(const manifest of [armor,weapons]){
  assert.equal(manifest.applicationBoundary.ruleDeviation,'warn-and-allow-manual-override');
  for(const key of ['automaticEquip','automaticStatChange','automaticResourceSpend'])assert.equal(manifest.applicationBoundary[key],false);
  assert.equal(manifest.accepted,false);assert.equal(manifest.complete,false);
  assert.equal(new Set(manifest.records.map(r=>r.candidateItemId)).size,manifest.records.length);
  assert.ok(manifest.records.every(r=>r.accepted===false&&r.runtimeImported===false&&!('costCp'in r)&&!('costGp'in r)));
 }
});

test('2014 conditions preserve per-action limits, attack scope and fixed net escape',()=>{
 for(const key of ['loading','net']){
  assert.deepEqual(rule(key).actionKinds,['action','bonus-action','reaction']);assert.equal(rule(key).grantsAction,false);
 }
 assert.equal(rule('loading').perTurnLimit,null);
 assert.deepEqual(rule('reach').appliesTo,['attacks-with-this-weapon','opportunity-attacks-with-this-weapon']);
 assert.equal(rule('heavy').explicitSourceSize,'Small');assert.equal(rule('heavy').strengthMinimum,null);
 assert.deepEqual(rule('versatile').alternateDamageRequires,['two-hands','melee-attack']);
 assert.equal(rule('net').escape.roll,'ability-check');assert.equal(rule('net').escape.dc,10);
 assert.equal(rule('net').destroy.type,'slashing');assert.equal(rule('net').destroy.harmsTrappedCreature,false);
 assert.equal(rule('net').maximumAffectedSize,'Large');assert.equal(rule('net').excludesFormless,true);
});

test('armor timing has all categories and does not silently halve donning time',()=>{
 assert.deepEqual([...new Set(armor.records.map(r=>r.category))].sort(),armor.donDoff.map(r=>r.category).sort());
 assert.equal(armor.conditions.donDoff.assistedDoffMultiplier,0.5);
 assert.equal(armor.conditions.donDoff.assistedDonMultiplier,null);
 assert.equal(armor.conditions.heavyArmorSpeed.isEquipRequirement,false);
 assert.equal(armor.conditions.shield.maximumBeneficialShields,1);
 assert.equal(armor.conditions.proficiency.shieldConsequenceScope,'not-resolved-by-this-proposal');
 assert.equal(armor.conditions.proficiency.shieldAutomation,false);
 const shield=armor.records.find(r=>r.nameEn==='Shield');
 assert.equal(shield.armorClass.kind,'bonus');assert.equal(shield.armorClass.value,armor.conditions.shield.acBonus);
});
