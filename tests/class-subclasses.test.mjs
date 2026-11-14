import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSubclassChoice,validateSubclassOrigin,advancementSubclassOptions} from '../server/class-subclasses.mjs';
test('subclass choice rejects cross-class IDs, skipped levels, missing input and unsupported additional choices',()=>{
 const plan={classId:'fighter',fromLevel:2,toLevel:3};
 for(const selected of [null,{},'fighter-champion',{id:'wizard-evocation'},{id:'fighter-champion',extra:true}])assert.throws(()=>validateSubclassChoice(plan,selected));
 assert.throws(()=>validateSubclassChoice({...plan,toLevel:4},{id:'fighter-champion'}));
 assert.throws(()=>validateSubclassChoice({classId:'bard',fromLevel:2,toLevel:3},{id:'bard-lore'}));
 assert.equal(advancementSubclassOptions('druid',2)[0].id,'druid-land');assert.throws(()=>validateSubclassChoice({classId:'druid',fromLevel:1,toLevel:2},{id:'druid-land'}));assert.deepEqual(advancementSubclassOptions('fighter',4),[]);
});
test('subclass origins bind source, class and acquisition level and never infer a past selection',()=>{
 const origin=validateSubclassChoice({classId:'fighter',fromLevel:2,toLevel:3},{id:'fighter-champion'}),context={classId:'fighter',baselineLevel:2,level:9};
 assert.deepEqual(validateSubclassOrigin(origin,context),origin);
 for(const edit of [o=>o.sourcePage=1,o=>o.acquiredLevel=4,o=>o.ruleset='5e-2024',o=>o.choiceId='fake',o=>o.classId='wizard',o=>o.extra=true]){const bad=structuredClone(origin);edit(bad);assert.throws(()=>validateSubclassOrigin(bad,context));}
 assert.throws(()=>validateSubclassOrigin(origin,{...context,baselineLevel:3}));assert.throws(()=>validateSubclassOrigin(origin,{...context,level:10}),/два разных/);
 const row=advancementSubclassOptions('wizard',2)[0];row.features[0].text='corrupt';assert.notEqual(advancementSubclassOptions('wizard',2)[0].features[0].text,'corrupt');
});

test('Hunter origin preserves all mandatory groups at later levels and rejects future or missing records',async()=>{
 const {validateHunterSelection}=await import('../server/class-hunter.mjs');
 const origin=validateSubclassChoice({classId:'ranger',fromLevel:2,toLevel:3},{id:'ranger-hunter',optionId:'colossus-slayer'});
 assert.equal(validateSubclassOrigin(origin,{classId:'ranger',baselineLevel:1,level:6}).options.length,1);assert.throws(()=>validateSubclassOrigin(origin,{classId:'ranger',baselineLevel:1,level:7}));
 origin.options.push(validateHunterSelection(7,'steel-will'));assert.equal(validateSubclassOrigin(origin,{classId:'ranger',baselineLevel:1,level:10}).options.length,2);assert.throws(()=>validateSubclassOrigin(origin,{classId:'ranger',baselineLevel:1,level:6}));
 origin.options.push(validateHunterSelection(11,'volley'),validateHunterSelection(15,'evasion'));assert.deepEqual(validateSubclassOrigin(origin,{classId:'ranger',baselineLevel:1,level:20}),origin);
});

import {validateChampionStyles,validateChampionStyleOrigin} from '../server/class-subclasses.mjs';
test('Champion records a confirmed baseline style separately from a newly acquired style',()=>{
 const pair=validateChampionStyles({previousId:'archery',newId:'defense'});assert.deepEqual(pair,{previous:{id:'archery',confirmedLevel:10,sourcePage:24},added:{id:'defense',acquiredLevel:10,sourcePage:25}});assert.deepEqual(validateChampionStyleOrigin(pair),pair);
 for(const selected of [{previousId:'archery',newId:'archery'},{previousId:'',newId:'defense'},{previousId:'fake',newId:'defense'},{previousId:'archery',newId:'defense',extra:true}])assert.throws(()=>validateChampionStyles(selected));
 for(const edit of [v=>v.previous.confirmedLevel=1,v=>v.added.acquiredLevel=1,v=>v.added.sourcePage=24,v=>v.previous.extra=true,v=>v.added.id='archery']){const bad=structuredClone(pair);edit(bad);assert.throws(()=>validateChampionStyleOrigin(bad));}
 const origin=validateSubclassChoice({classId:'fighter',fromLevel:2,toLevel:3},{id:'fighter-champion'});origin.additionalStyle=pair;assert.throws(()=>validateSubclassOrigin(origin,{classId:'fighter',baselineLevel:2,level:9}));assert.deepEqual(validateSubclassOrigin(origin,{classId:'fighter',baselineLevel:2,level:20}),origin);
});
