import test from 'node:test';
import assert from 'node:assert/strict';
import {pactCantripOptions,validatePactChoice,validatePactOrigin,FIND_FAMILIAR_ID} from '../server/class-pacts.mjs';
const plan={classId:'warlock',fromLevel:2,toLevel:3};
const cantrips=['srd51:2014:spell:guidance','srd51:2014:spell:light','srd51:2014:spell:mage-hand'];

test('Tome admits cross-class cantrips but rejects spells, duplicates and leaked fields',()=>{
 const selected={id:'tome',cantrips:[...cantrips]},origin=validatePactChoice(plan,selected);
 assert.deepEqual(origin.spells,cantrips);selected.cantrips[0]='corrupt';assert.equal(origin.spells[0],cantrips[0]);
 for(const bad of [{id:'tome',cantrips:[]},{id:'tome',cantrips:[...cantrips,cantrips[0]]},{id:'tome',cantrips:[cantrips[0],cantrips[0],cantrips[1]]},{id:'tome',cantrips:['srd51:2014:spell:fireball',...cantrips.slice(1)]},{id:'tome',cantrips,extra:true},{id:'chain',cantrips},{id:'unknown',cantrips:[]}])assert.throws(()=>validatePactChoice(plan,bad));
 assert.throws(()=>validatePactChoice({...plan,classId:'wizard'},{id:'blade',cantrips:[]}));
 assert.throws(()=>validatePactChoice({...plan,fromLevel:3,toLevel:4},{id:'blade',cantrips:[]}));
});

test('all pacts retain canonical origin and cannot be smuggled into earlier levels',()=>{
 for(const id of ['blade','chain','tome']){
  const origin=validatePactChoice(plan,{id,cantrips:id==='tome'?cantrips:[]});
  assert.deepEqual(validatePactOrigin(origin,20),origin);assert.throws(()=>validatePactOrigin(origin,2));
  if(id==='chain')assert.deepEqual(origin.spells,[FIND_FAMILIAR_ID]);
  if(id==='blade')assert.deepEqual(origin.spells,[]);
  for(const edit of [o=>o.ruleset='5e-2024',o=>o.sourcePage=1,o=>o.acquiredLevel=2,o=>o.choiceId='fake',o=>o.classId='wizard',o=>o.extra=true,o=>o.spells.push('srd51:2014:spell:fireball')]){
   const bad=structuredClone(origin);edit(bad);assert.throws(()=>validatePactOrigin(bad,3));
  }
 }
 assert.equal(validatePactOrigin(null,2),null);assert.throws(()=>validatePactOrigin(null,3));
 const options=pactCantripOptions();options[0].spellId='changed';assert.notEqual(pactCantripOptions()[0].spellId,'changed');
});
