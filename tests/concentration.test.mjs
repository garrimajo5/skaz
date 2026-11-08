import test from 'node:test';import assert from 'node:assert/strict';import{randomUUID}from'node:crypto';import{readFileSync}from'node:fs';import vm from'node:vm';
import{openStore}from'../server/store.mjs';
const ctx=vm.createContext({});for(const file of ['health.js','resource-queue.js'])vm.runInContext(readFileSync(new URL('../client/'+file,import.meta.url),'utf8'),ctx);const Queue=vm.runInContext('SkazResourceQueue',ctx);const plain=x=>JSON.parse(JSON.stringify(x));
function setup(){const s=openStore(':memory:');s.update({mutationId:randomUUID(),expectedRevision:0,label:'Concentration',state:{...s.read().state,concentration:'Bless'}});return s;}
function command(s,operation,delta,checkId){const c=s.read();return{mutationId:randomUUID(),expectedRevision:c.revision,context:c.context,resource:{kind:'health',operation,temporaryBefore:c.state.tempHp||0,concentrationBefore:c.state.concentration,checksBefore:c.state.concentrationChecks||[],...(checkId?{checkId}:{})},delta,before:c.state.hp,maximum:c.state.maxHp};}
const undo=(s,id)=>s.undoResource({mutationId:randomUUID(),expectedRevision:s.read().revision,characterId:s.read().context.characterId,targetMutationId:id});
test('each damage creates a durable question; pass preserves the spell, fail and one undo restore pending questions',()=>{const s=setup();try{
 const first=command(s,'damage',2);s.changeResource(first);s.changeResource(command(s,'damage',3));let c=s.read();assert.deepEqual(c.state.concentrationChecks.map(x=>x.damage),[2,3]);assert.equal(c.state.concentrationChecks[0].id,first.mutationId);
 s.changeResource(command(s,'pass',1,first.mutationId));assert.equal(s.read().state.concentration,'Bless');assert.equal(s.read().state.concentrationChecks.length,1);
 const fail=command(s,'fail',1,s.read().state.concentrationChecks[0].id);s.changeResource(fail);assert.equal(s.read().state.concentration,null);assert.deepEqual(s.read().state.concentrationChecks,[]);assert.equal(s.changeResource(fail).replayed,true);
 undo(s,fail.mutationId);assert.equal(s.read().state.concentration,'Bless');assert.equal(s.read().state.concentrationChecks.length,1);assert.throws(()=>undo(s,fail.mutationId),{status:409});
 }finally{s.close();}});
test('temporary absorption still asks; zero HP ends concentration and damage undo restores its pending questions',()=>{const s=setup();try{
 s.changeResource(command(s,'temporary',50));s.changeResource(command(s,'damage',23));assert.equal(s.read().state.hp,28);assert.equal(s.read().state.concentrationChecks[0].dc,11);
 const lethal=command(s,'damage',100);s.changeResource(lethal);assert.equal(s.read().state.hp,0);assert.deepEqual(s.read().state.concentrationChecks,[]);undo(s,lethal.mutationId);assert.equal(s.read().state.hp,28);assert.equal(s.read().state.tempHp,27);assert.equal(s.read().state.concentrationChecks.length,1);
 }finally{s.close();}});
test('stale, fabricated, out-of-order and old-client answers cannot change current concentration',()=>{const s=setup();try{
 s.changeResource(command(s,'damage',1));const stale=command(s,'pass',1,s.read().state.concentrationChecks[0].id);s.changeResource(command(s,'damage',1));const baseline=s.read();assert.throws(()=>s.changeResource(stale),{status:409});assert.throws(()=>s.changeResource(command(s,'fail',1,randomUUID())),{status:409});assert.throws(()=>s.changeResource(command(s,'pass',1,baseline.state.concentrationChecks[1].id)),{status:409});const old=command(s,'heal',1);delete old.resource.checksBefore;assert.throws(()=>s.changeResource(old),{status:409});assert.deepEqual(s.read(),baseline);
 }finally{s.close();}});
test('offline damage, pass, damage, fail and addressed undo survive reload and exact replay',()=>{const s=setup(),map=new Map(),storage={getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)};try{
 let q=new Queue(storage,'c');q.resetBaseline(s.read());const add=(operation,delta,checkId)=>q.enqueue({kind:'health',operation,temporaryBefore:q.snapshot.state.tempHp||0,...(checkId?{checkId}:{})},delta,randomUUID());
 add('damage',2);add('pass',1,q.snapshot.state.concentrationChecks[0].id);add('damage',3);const failed=add('fail',1,q.snapshot.state.concentrationChecks[0].id);q.enqueueUndo(failed.mutationId,randomUUID());q=new Queue(storage,'c');assert.equal(q.snapshot.state.concentration,'Bless');assert.equal(q.snapshot.state.concentrationChecks.length,1);
 while(q.length){const c=plain(q.head),r=s.changeResource(c);assert.equal(s.changeResource(c).replayed,true);q.acknowledge(c,r);}assert.equal(s.read().state.hp,23);assert.equal(s.read().state.concentrationChecks.length,1);
 }finally{s.close();}});
test('v12 carries pending checks and older exports refuse silent loss',()=>{const s=setup(),destination=openStore(':memory:');try{
 s.changeResource(command(s,'damage',4));const file=s.exportActive(12);assert.throws(()=>s.exportActive(11),{status:409});const c=destination.read();destination.importActive({mutationId:randomUUID(),expectedRevision:c.revision,destination:'new-campaign',file});assert.deepEqual(destination.read().state.concentrationChecks,s.read().state.concentrationChecks);
 }finally{s.close();destination.close();}});
