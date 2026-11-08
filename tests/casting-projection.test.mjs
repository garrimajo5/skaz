import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import Casting from '../client/casting.js';

const entry=(id,level,concentration)=>({catalogId:id,status:'prepared',entry:{id,kind:'spell',ruleset:'5e-2014',name:{ru:id,en:id},spell:{level,concentration}}});
function fixture(){return {context:{campaignId:'campaign',characterId:'character',sessionId:'session'},state:{hp:15,maxHp:20,tempHp:4,slots:{1:2,2:1,3:2},concentration:'Old spell',concentrationChecks:[{id:'damage-id',spell:'Old spell',damage:4,dc:10}]},characterSheet:null,spellbook:[entry('spell:cantrip',0,false),entry('spell:focus',2,true),entry('spell:instant',1,false),entry('spell:focus-cantrip',0,true)]};}
const clone=x=>JSON.parse(JSON.stringify(x));

test('one projection spends an upcast slot and replaces concentration/questions; one inverse restores both',()=>{
 const s=fixture(),original=clone(s),command=Casting.prepare(s,'spell:focus',{kind:'slot',level:3}),result=Casting.project(s,command);
 assert.deepEqual(s,original);assert.equal(result.snapshot.state.slots[3],1);assert.equal(result.snapshot.state.concentration,'spell:focus');assert.deepEqual(result.snapshot.state.concentrationChecks,[]);
 assert.deepEqual(Casting.restore(result.snapshot,result.receipt),s);
 assert.equal(result.snapshot.state.hp,15);assert.equal(result.snapshot.state.tempHp,4);
});
test('cantrip spends no slot, non-concentration preserves pending checks, same-name recasting starts new concentration',()=>{
 const s=fixture(),c=Casting.project(s,Casting.prepare(s,'spell:cantrip'));
 assert.deepEqual(c.snapshot,s);assert.deepEqual(Casting.restore(c.snapshot,c.receipt),s);
 assert.throws(()=>Casting.prepare(s,'spell:cantrip',{kind:'slot',level:1}));
 const first=Casting.project(s,Casting.prepare(s,'spell:focus',{kind:'slot',level:2})).snapshot;
 first.state.concentrationChecks=[{id:'later-damage',spell:'spell:focus',damage:2,dc:10}];
 const second=Casting.project(first,Casting.prepare(first,'spell:focus',{kind:'slot',level:3}));assert.deepEqual(second.snapshot.state.concentrationChecks,[]);assert.deepEqual(Casting.restore(second.snapshot,second.receipt),first);
 const focusCantrip=Casting.project(s,Casting.prepare(s,'spell:focus-cantrip'));assert.deepEqual(focusCantrip.snapshot.state.slots,s.state.slots);assert.equal(focusCantrip.snapshot.state.concentration,'spell:focus-cantrip');
});
test('unknown, wrong edition, low/exhausted slots and zero/dead HP reject without changing the snapshot',()=>{
 for(const modify of [s=>{s.spellbook=[];},s=>{s.spellbook[1].entry.ruleset='5e-2024';},s=>{s.state.slots[2]=0;},s=>{s.state.hp=0;},s=>{s.state.deathSaves={status:'dead'};}]){
  const s=fixture();modify(s);const before=clone(s);assert.throws(()=>Casting.prepare(s,'spell:focus',{kind:'slot',level:2}));assert.deepEqual(s,before);
 }
 assert.throws(()=>Casting.prepare(fixture(),'spell:focus',{kind:'slot',level:1}));
 assert.throws(()=>Casting.prepare(fixture(),'spell:focus'));
});
test('manual counters require explicit selection and declared circle, never name inference',()=>{
 const s=fixture();s.characterSheet={counters:[{id:'generic',name:'Жетоны',current:2,max:3},{id:'misleading',name:'Ячейки 9 круга',current:0,max:2}]};
 assert.throws(()=>Casting.prepare(s,'spell:focus',{kind:'slot',level:2}));
 assert.throws(()=>Casting.prepare(s,'spell:focus',{kind:'counter',counterId:'generic'}));
 assert.throws(()=>Casting.prepare(s,'spell:focus',{kind:'counter',counterId:'generic',level:1}));
 assert.throws(()=>Casting.prepare(s,'spell:focus',{kind:'counter',counterId:'misleading',level:9}));
 const result=Casting.project(s,Casting.prepare(s,'spell:focus',{kind:'counter',counterId:'generic',level:2}));
 assert.equal(result.snapshot.characterSheet.counters[0].current,1);assert.deepEqual(result.snapshot.state.slots,s.state.slots);assert.deepEqual(Casting.restore(result.snapshot,result.receipt),s);
});
test('stale context, spell metadata, focus, balance or maximum fail the whole projection',()=>{
 for(const modify of [s=>{s.context.characterId='other';},s=>{s.context.sessionId='other';},s=>{s.spellbook[1].entry.name.ru='Renamed';},s=>{s.spellbook[1].entry.spell.concentration=false;},s=>{s.state.concentration='Other';s.state.concentrationChecks=[];},s=>{s.state.concentrationChecks=[];},s=>{s.state.slots[2]=0;}]){
  const s=fixture(),c=Casting.prepare(s,'spell:focus',{kind:'slot',level:2});modify(s);const before=clone(s);assert.throws(()=>Casting.project(s,c));assert.deepEqual(s,before);
 }
 const s=fixture(),c=Casting.prepare(s,'spell:focus',{kind:'slot',level:2});c.maximum=99;assert.throws(()=>Casting.project(s,c));
});
test('inverse rejects affected changes and another context but preserves independent health for a non-focus spell',()=>{
 const s=fixture(),result=Casting.project(s,Casting.prepare(s,'spell:focus',{kind:'slot',level:2}));
 for(const modify of [x=>{x.context.campaignId='other';},x=>{x.state.slots[2]=1;},x=>{x.state.concentration=null;},x=>{x.state.concentrationChecks=[{id:'damage-later',spell:'spell:focus',damage:2,dc:10}];}]){const next=clone(result.snapshot);modify(next);assert.throws(()=>Casting.restore(next,result.receipt));}
 const instant=Casting.project(s,Casting.prepare(s,'spell:instant',{kind:'slot',level:1}));instant.snapshot.state.hp=12;instant.snapshot.state.concentration=null;instant.snapshot.state.concentrationChecks=[];
 const restored=Casting.restore(instant.snapshot,instant.receipt);assert.equal(restored.state.hp,12);assert.equal(restored.state.concentration,null);assert.equal(restored.state.slots[1],2);
});
test('history overlap identifies both costs and concentration, including manual counters',()=>{
 const c=Casting.prepare(fixture(),'spell:focus',{kind:'slot',level:2});
 assert.equal(Casting.touches(c,{kind:'health'}),true);assert.equal(Casting.touches(c,{kind:'slot',level:2}),true);assert.equal(Casting.touches(c,{kind:'slot',level:1}),false);assert.equal(Casting.touches(c,{kind:'inspiration'}),false);
 const s=fixture();s.characterSheet={counters:[{id:'a',current:1,max:1}]};const manual=Casting.prepare(s,'spell:instant',{kind:'counter',counterId:'a',level:1});
 assert.equal(Casting.touches(manual,{kind:'counter',counterId:'a'}),true);assert.equal(Casting.touches(manual,{kind:'health'}),false);assert.equal(Casting.touches(manual,{kind:'cast'}),true);
});
test('browser and server project the same ordered serializable casts after a saved queue reload',()=>{
 const ctx=vm.createContext({});vm.runInContext(readFileSync(new URL('../client/casting.js',import.meta.url),'utf8'),ctx);const browser=vm.runInContext('SkazCasting',ctx);
 let serverState=fixture(),browserState=clone(serverState);const saved=[];
 for(const [id,cost] of [['spell:focus',{kind:'slot',level:2}],['spell:instant',{kind:'slot',level:1}],['spell:focus-cantrip',null]]){
  const command=clone(browser.prepare(browserState,id,cost));saved.push(command);browserState=browser.project(browserState,command).snapshot;serverState=Casting.project(serverState,command).snapshot;assert.deepEqual(clone(browserState),serverState);
 }
 let reloaded=fixture();for(const command of JSON.parse(JSON.stringify(saved)))reloaded=Casting.project(reloaded,command).snapshot;assert.deepEqual(reloaded,serverState);
 // This verifies projection only, not durable server receipts or transport.
 assert.throws(()=>Casting.project(fixture(),saved[1]));
});
