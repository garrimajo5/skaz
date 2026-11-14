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

