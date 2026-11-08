import test from 'node:test';import assert from 'node:assert/strict';import{randomUUID}from'node:crypto';import{readFileSync}from'node:fs';import vm from'node:vm';
import{openStore}from'../server/store.mjs';import Health from'../client/health.js';
const ctx=vm.createContext({});vm.runInContext(readFileSync(new URL('../client/health.js',import.meta.url),'utf8')+'\n'+readFileSync(new URL('../client/resource-queue.js',import.meta.url),'utf8'),ctx);const Queue=vm.runInContext('SkazResourceQueue',ctx);
const plain=x=>JSON.parse(JSON.stringify(x));const memory=()=>{const m=new Map();return{getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v)}};
const command=(s,operation,amount)=>{const c=s.read();return{mutationId:randomUUID(),expectedRevision:c.revision,context:c.context,resource:{kind:'health',operation,temporaryBefore:c.state.tempHp||0,concentrationBefore:c.state.concentration},delta:amount,before:c.state.hp,maximum:c.state.maxHp}};
const undo=(s,id)=>({mutationId:randomUUID(),expectedRevision:s.read().revision,characterId:s.read().context.characterId,targetMutationId:id});
test('temporary HP absorbs damage atomically and history undo restores both pools once',()=>{const s=openStore(':memory:');try{
 s.changeResource(command(s,'temporary',5));const hit=command(s,'damage',12),result=s.changeResource(hit);assert.equal(result.state.hp,21);assert.equal(result.state.tempHp,0);assert.equal(result.resourceReceipt.tempAfter,0);
 assert.deepEqual(s.history()[0].changes,[{resource:{kind:'hp'},before:28,after:21},{resource:{kind:'tempHp'},before:5,after:0}]);
 s.undoResource(undo(s,hit.mutationId));assert.equal(s.read().state.hp,28);assert.equal(s.read().state.tempHp,5);assert.throws(()=>s.undoResource(undo(s,hit.mutationId)),{status:409});
 assert.equal(s.changeResource(hit).replayed,true);assert.equal(s.read().state.tempHp,5);
 }finally{s.close();}});
test('temporary HP replaces either larger or smaller pools; healing never restores it or exceeds max',()=>{const s=openStore(':memory:');try{
 for(const n of [50,8,3,0]){s.changeResource(command(s,'temporary',n));assert.equal(s.read().state.tempHp,n);assert.equal(s.read().state.hp,28);}
 s.changeResource(command(s,'temporary',8));s.changeResource(command(s,'heal',100));assert.equal(s.read().state.hp,38);assert.equal(s.read().state.tempHp,8);
 s.changeResource(command(s,'damage',100));assert.equal(s.read().state.hp,0);assert.equal(s.read().state.tempHp,0);s.changeResource(command(s,'temporary',7));assert.equal(s.read().state.hp,0);
 }finally{s.close();}});
test('health commands reject stale temp balance, forged undo and legacy damage without touching state',()=>{const s=openStore(':memory:');try{
 s.changeResource(command(s,'temporary',5));const before=s.read(),hit=command(s,'damage',2);
 assert.throws(()=>s.changeResource({...hit,resource:{...hit.resource,temporaryBefore:4}}),{status:409});
 assert.throws(()=>s.changeResource({...hit,resource:{kind:'hp'},delta:-2}),{status:409});
 assert.throws(()=>s.changeResource({...hit,resource:{kind:'health',operation:'restore',temporaryBefore:5,concentrationBefore:null,hpAfter:38,tempAfter:100,concentrationAfter:null}}),{status:422});
 const state={...before.state};delete state.tempHp;assert.throws(()=>s.update({mutationId:randomUUID(),expectedRevision:before.revision,label:'Old client',state}),{status:409});assert.deepEqual(s.read(),before);
 }finally{s.close();}});
test('a later health command blocks paired undo and concurrent health never silently rebases',()=>{const s=openStore(':memory:');try{
 const grant=command(s,'temporary',5);s.changeResource(grant);const stale=command(s,'damage',2);s.changeResource(command(s,'heal',1));assert.throws(()=>s.changeResource(stale),{status:409});assert.throws(()=>s.undoResource(undo(s,grant.mutationId)),{status:409});
 }finally{s.close();}});
test('offline health order survives reload, confirms paired receipts and can queue one addressed undo',()=>{const s=openStore(':memory:'),m=memory();try{
 let q=new Queue(m,'health');q.resetBaseline(s.read());q.enqueue({kind:'health',operation:'temporary',temporaryBefore:0},5,randomUUID());const hit=q.enqueue({kind:'health',operation:'damage',temporaryBefore:5},12,randomUUID());assert.equal(q.snapshot.state.hp,21);q.enqueueUndo(hit.mutationId,randomUUID());assert.equal(q.snapshot.state.hp,28);assert.equal(q.snapshot.state.tempHp,5);q=new Queue(m,'health');
 while(q.length){const c=plain(q.head),result=s.changeResource(c);assert.equal(s.changeResource(c).replayed,true);q.acknowledge(c,result);}assert.equal(s.read().state.hp,28);assert.equal(s.read().state.tempHp,5);assert.equal(s.read().revision,3);
 }finally{s.close();}});
test('missing or incorrect temporary receipt leaves exact pending command intact',()=>{const s=openStore(':memory:');try{
 const q=new Queue(memory(),'health');q.resetBaseline(s.read());const c=plain(q.enqueue({kind:'health',operation:'temporary',temporaryBefore:0},5,randomUUID())),result=s.changeResource(c);
 assert.throws(()=>q.acknowledge(c,{...result,resourceReceipt:undefined}));assert.throws(()=>q.acknowledge(c,{...result,resourceReceipt:{...result.resourceReceipt,tempAfter:9}}));assert.deepEqual(plain(q.head),c);q.acknowledge(c,result);assert.equal(q.length,0);
 }finally{s.close();}});
test('active v11 round trip preserves temp HP and older versions refuse lossy exports',()=>{const s=openStore(':memory:'),copy=openStore(':memory:');try{
 s.changeResource(command(s,'temporary',12));const file=s.exportActive(11);assert.equal(file.state.tempHp,12);assert.throws(()=>s.exportActive(10),{status:409});
 copy.importActive({destination:'new-campaign',mutationId:randomUUID(),expectedRevision:0,file});assert.equal(copy.read().state.tempHp,12);assert.equal(copy.read().state.hp,28);
 assert.throws(()=>copy.importActive({destination:'new-campaign',mutationId:randomUUID(),expectedRevision:copy.read().revision,file:{...file,schemaVersion:10}}),{status:422});
 }finally{s.close();copy.close();}});
test('shared projection validates boundaries and reproduces 2014 buffer examples',()=>{
 assert.deepEqual(Health.project(28,38,5,{operation:'damage',temporaryBefore:5},12),{hp:21,tempHp:0});
 assert.deepEqual(Health.project(0,38,0,{operation:'temporary',temporaryBefore:0},50),{hp:0,tempHp:50});
 for(const n of [-1,1.5,NaN,10001])assert.throws(()=>Health.project(28,38,0,{operation:'damage',temporaryBefore:0},n));
});

test('zero HP ends concentration in the same command and addressed undo restores the spell and both pools',()=>{const s=openStore(':memory:');try{
 const old=s.read();s.update({mutationId:randomUUID(),expectedRevision:0,label:'Concentrating',state:{...old.state,concentration:'Bless',tempHp:5}});
 const hit=command(s,'damage',40);s.changeResource(hit);assert.equal(s.read().state.concentration,null);assert.equal(s.read().state.hp,0);assert.equal(s.read().state.tempHp,0);
 assert.deepEqual(s.history()[0].changes.at(-1),{resource:{kind:'concentration'},before:'Bless',after:null});s.undoResource(undo(s,hit.mutationId));assert.equal(s.read().state.concentration,'Bless');assert.equal(s.read().state.tempHp,5);assert.equal(s.read().state.hp,28);
 }finally{s.close();}});
