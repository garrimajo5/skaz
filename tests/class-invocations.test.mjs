import {validatePactChoice} from '../server/class-pacts.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {invocationEligibility} from '../server/class-invocations.mjs';
const get=(level,extra={})=>invocationEligibility({warlockLevel:level,...extra});
const find=(level,id,extra={})=>get(level,extra).find(o=>o.id===id);
test('all 32 SRD invocations retain names and source pages; level 1 grants none',()=>{
 const rows=get(1);assert.equal(rows.length,32);assert.equal(new Set(rows.map(o=>o.id)).size,32);
 assert.ok(rows.every(o=>!o.eligible&&[48,49,50].includes(o.sourcePage)&&o.text&&o.name));
 assert.deepEqual(get(2).filter(o=>o.eligible).map(o=>o.id),['armor-of-shadows','beast-speech','beguiling-influence','devils-sight','eldritch-sight','eyes-of-the-rune-keeper','fiendish-vigor','gaze-of-two-minds','mask-of-many-faces','misty-visions','thief-of-five-fates']);
 assert.equal(get(2,{hasEldritchBlast:true}).filter(o=>o.eligible).length,14);
});
test('threshold is warlock level; pact and cantrip requirements are conjunctive',()=>{
 for(const [id,level,pact] of [['ascendant-step',9,null],['bewitching-whispers',7,null],['mire-the-mind',5,null],['witch-sight',15,null],['lifedrinker',12,'blade'],['chains-of-carceri',15,'chain'],['thirsting-blade',5,'blade']]){
  assert.equal(find(level-1,id,{pact}).eligible,false,id);
  assert.equal(find(level,id,{pact}).eligible,true,id);
  if(pact)assert.equal(find(level,id).eligible,false,id);
 }
 assert.equal(find(3,'book-of-ancient-secrets',{pact:'tome'}).eligible,true);
 assert.equal(find(3,'voice-of-the-chain-master',{pact:'chain'}).eligible,true);
 for(const id of ['agonizing-blast','eldritch-spear','repelling-blast']){
  assert.equal(find(20,id).eligible,false);assert.equal(find(2,id,{hasEldritchBlast:true}).eligible,true);
 }
});
test('invalid facts cannot silently grant options and returned data cannot mutate rules',()=>{
 for(const facts of [{warlockLevel:0},{warlockLevel:21},{warlockLevel:2,pact:'tome'},{warlockLevel:3,pact:'unknown'},{warlockLevel:2,hasEldritchBlast:'yes'},{warlockLevel:2,knownInvocations:['unknown']},{warlockLevel:2,knownInvocations:['armor-of-shadows','armor-of-shadows']}])assert.throws(()=>invocationEligibility(facts));
 assert.deepEqual(find(2,'armor-of-shadows',{knownInvocations:['armor-of-shadows']}).reasons,['already-known']);
 const rows=get(2);rows[0].reasons.length=0;rows[0].text='corrupt';assert.ok(get(2)[0].reasons.length);assert.notEqual(get(2)[0].text,'corrupt');
});

import {buildInvocationEvent,validateInvocationHistory} from '../server/class-invocations.mjs';
test('invocation history retains replaced origins and validates each level rather than only final IDs',()=>{
 const first=buildInvocationEvent({fromLevel:1,toLevel:2,selected:['armor-of-shadows','devils-sight']});
 const second=buildInvocationEvent({fromLevel:2,toLevel:3,knownInvocations:['armor-of-shadows','devils-sight'],replacement:{remove:'armor-of-shadows',add:'eldritch-sight'}});
 const records=[first,second];assert.deepEqual(validateInvocationHistory(records,{baselineLevel:1,level:3,pact:validatePactChoice({classId:'warlock',fromLevel:2,toLevel:3},{id:'blade',cantrips:[]})}),['devils-sight','eldritch-sight']);assert.equal(records[0].added[0].id,'armor-of-shadows');
 for(const edit of [r=>r[1].replacement.remove='unknown',r=>r[1].replacement.add.id='devils-sight',r=>r[1].replacement.add.sourcePage=1,r=>r[1].level=4,r=>r[0].extra=true,r=>r[0].added=[]]){const bad=structuredClone(records);edit(bad);assert.throws(()=>validateInvocationHistory(bad,{baselineLevel:1,level:3,pact:validatePactChoice({classId:'warlock',fromLevel:2,toLevel:3},{id:'blade',cantrips:[]})}));}
 assert.throws(()=>buildInvocationEvent({fromLevel:4,toLevel:5,selected:['mire-the-mind']}),/историей/);
 assert.throws(()=>buildInvocationEvent({fromLevel:1,toLevel:2,selected:['armor-of-shadows','armor-of-shadows']}));
 assert.throws(()=>buildInvocationEvent({fromLevel:2,toLevel:3,knownInvocations:['agonizing-blast','devils-sight']}),/требования/);
 const removed=buildInvocationEvent({fromLevel:2,toLevel:3,knownInvocations:['agonizing-blast','devils-sight'],replacement:{remove:'agonizing-blast',add:'armor-of-shadows'}});assert.equal(removed.replacement.remove,'agonizing-blast');
});

import {initialRitualOptions} from '../server/class-rituals.mjs';
test('Book of Ancient Secrets requires two distinct level-one rituals and preserves them after replacement',()=>{
 const first=buildInvocationEvent({fromLevel:1,toLevel:2,selected:['armor-of-shadows','devils-sight']}),rituals=initialRitualOptions().slice(0,2).map(o=>o.id),pact=validatePactChoice({classId:'warlock',fromLevel:2,toLevel:3},{id:'tome',cantrips:['srd51:2014:spell:eldritch-blast','srd51:2014:spell:light','srd51:2014:spell:mage-hand']});
 const replace=selection=>buildInvocationEvent({fromLevel:2,toLevel:3,knownInvocations:['armor-of-shadows','devils-sight'],pact:'tome',replacement:{remove:'armor-of-shadows',add:selection}});
 for(const selection of ['book-of-ancient-secrets',{id:'book-of-ancient-secrets',rituals:[]},{id:'book-of-ancient-secrets',rituals:[rituals[0],rituals[0]]},{id:'book-of-ancient-secrets',rituals:['srd51:2014:spell:fireball',rituals[0]]},{id:'eldritch-sight',rituals}])assert.throws(()=>replace(selection));
 const record=replace({id:'book-of-ancient-secrets',rituals}),history=[first,record];assert.deepEqual(validateInvocationHistory(history,{baselineLevel:1,level:3,pact}),['devils-sight','book-of-ancient-secrets']);
 for(const edit of [h=>delete h[1].replacement.add.rituals,h=>h[1].replacement.add.rituals.push(rituals[0]),h=>h[1].replacement.add.extra=true]){const bad=structuredClone(history);edit(bad);assert.throws(()=>validateInvocationHistory(bad,{baselineLevel:1,level:3,pact}));}
 const removed=buildInvocationEvent({fromLevel:3,toLevel:4,knownInvocations:['devils-sight','book-of-ancient-secrets'],pact:'tome',replacement:{remove:'book-of-ancient-secrets',add:'eldritch-sight'}});history.push(removed);assert.deepEqual(validateInvocationHistory(history,{baselineLevel:1,level:4,pact}),['devils-sight','eldritch-sight']);assert.deepEqual(history[1].replacement.add.rituals,rituals);
});
