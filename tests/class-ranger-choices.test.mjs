import test from 'node:test';
import assert from 'node:assert/strict';
import {rangerTerrainOptions,planRangerTerrainChoice,validateRangerTerrainPlan} from '../server/class-ranger-choices.mjs';
const plan=(level,terrainId,previousTerrainIds=[],classId='ranger')=>planRangerTerrainChoice({classId,level,terrainId,previousTerrainIds});
test('SRD terrain options have seven stable IDs, are isolated and use page36',()=>{
 const options=rangerTerrainOptions();assert.deepEqual(options.map(o=>o.id),['arctic','coast','desert','forest','grassland','mountain','swamp']);assert.ok(options.every(o=>o.sourcePage===36));options[0].name='bad';assert.notEqual(rangerTerrainOptions()[0].name,'bad');assert.throws(()=>plan(1,'underdark'));
});
test('levels1/6/10 require explicit prior terrain confirmations and never infer them',()=>{
 assert.equal(plan(1,'forest').applied,false);const previous=['forest'];const six=plan(6,'swamp',previous);assert.deepEqual(previous,['forest']);assert.deepEqual(six.confirmedPrevious,['forest']);assert.equal(six.choiceId,'ranger:6:favored-terrain');assert.deepEqual(validateRangerTerrainPlan(six),six);
 assert.deepEqual(plan(10,'mountain',['swamp','forest']).confirmedPrevious,['forest','swamp']);
 for(const args of [[6,'forest',[]],[10,'coast',['forest']],[6,'forest',['forest']],[10,'coast',['forest','forest']],[1,'forest',['coast']],[6,'coast',['underdark']],[2,'coast',[]],[20,'coast',[]],[1,'coast',[],'druid']])assert.throws(()=>plan(...args));
});
test('forged source, applied flag, renamed choice, extra origin fields and unsorted history fail validation',()=>{
 const valid=plan(10,'arctic',['forest','swamp']);
 for(const edit of [v=>v.sourcePage=1,v=>v.applied=true,v=>v.choiceId='ranger:6:favored-terrain',v=>v.acquiredLevel=1,v=>v.confirmedPrevious.reverse(),v=>delete v.ruleset]){const bad=structuredClone(valid);edit(bad);assert.throws(()=>validateRangerTerrainPlan(bad));}
 assert.throws(()=>validateRangerTerrainPlan(null));assert.deepEqual(validateRangerTerrainPlan(valid),valid);
});

import {rangerEnemyTypeOptions,planRangerEnemyTypeChoice} from '../server/class-ranger-choices.mjs';
test('favored enemy offers13 SRD types but never all humanoids or an inferred language',()=>{
 const options=rangerEnemyTypeOptions();assert.deepEqual(options.map(o=>o.id),['aberrations','beasts','celestials','constructs','dragons','elementals','fey','fiends','giants','monstrosities','oozes','plants','undead']);assert.ok(options.every(o=>o.sourcePage===35));
 for(const typeId of options.map(o=>o.id)){const result=planRangerEnemyTypeChoice({classId:'ranger',level:1,typeId,previousTypeIds:[]});assert.equal(result.language,null);assert.equal(result.requiresLanguageReview,true);assert.equal(result.applied,false);}
 const select=(level,typeId,previousTypeIds=[],classId='ranger')=>planRangerEnemyTypeChoice({classId,level,typeId,previousTypeIds});assert.deepEqual(select(14,'dragons',['beasts','undead']).confirmedPrevious,['beasts','undead']);assert.equal(select(6,'undead',['beasts']).choiceId,'ranger:6:favored-enemy-and-language');
 for(const args of [[1,'humanoids'],[1,'human'],[6,'dragons'],[6,'beasts',['beasts']],[14,'dragons',['beasts','beasts']],[10,'dragons',['beasts']],[1,'dragons',[],'fighter'],[6,'dragons',['unknown']]])assert.throws(()=>select(...args));
});
