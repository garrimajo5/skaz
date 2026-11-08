import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';import {randomUUID} from 'node:crypto';import {openStore} from '../server/store.mjs';
const source=readFileSync(new URL('../client/resource-queue.js',import.meta.url),'utf8');const ctx=vm.createContext({});vm.runInContext(readFileSync(new URL('../client/health.js',import.meta.url),'utf8')+'\n'+source,ctx);const Queue=vm.runInContext('SkazResourceQueue',ctx);
const memory=()=>{const data=new Map();return {data,getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};};
const plain=x=>JSON.parse(JSON.stringify(x));
test('independent concurrent resources advance the queue using durable receipts without changing command IDs',()=>{
 const s=openStore(':memory:'),q=new Queue(memory(),'concurrent');try{
  q.resetBaseline(s.read());const first=q.enqueue({kind:'hp'},-2,randomUUID()),second=q.enqueue({kind:'hp'},-1,randomUUID());
  const original=s.read();s.changeResource({mutationId:randomUUID(),expectedRevision:original.revision,context:original.context,resource:{kind:'slot',level:1},delta:-1,before:3,maximum:4});
  const saved=s.changeResource(plain(first));assert.equal(saved.revision,2);assert.equal(saved.resourceReceipt.revision,2);assert.equal(s.changeResource(plain(first)).replayed,true);
  q.acknowledge(plain(first),saved);assert.equal(q.head.mutationId,second.mutationId);assert.equal(q.head.expectedRevision,2);assert.equal(q.snapshot.state.slots[1],2);assert.equal(q.snapshot.state.hp,25);
  const tail=plain(q.head);q.acknowledge(tail,s.changeResource(tail));assert.equal(q.length,0);assert.equal(s.read().state.hp,25);
 }finally{s.close();}
});
test('same-resource concurrency and a changed queued tail remain explicit conflicts without dropping commands',()=>{
 const s=openStore(':memory:'),m=memory(),q=new Queue(m,'concurrent');try{
  q.resetBaseline(s.read());const head=q.enqueue({kind:'hp'},-2,randomUUID());q.enqueue({kind:'slot',level:1},-1,randomUUID());const saved=m.getItem('concurrent');
  const base=s.read();s.changeResource({mutationId:randomUUID(),expectedRevision:0,context:base.context,resource:{kind:'slot',level:1},delta:-1,before:3,maximum:4});
  const result=s.changeResource(plain(head));assert.throws(()=>q.acknowledge(plain(head),result));assert.equal(m.getItem('concurrent'),saved);assert.equal(q.length,2);
  assert.throws(()=>s.changeResource({...plain(head),mutationId:randomUUID()}),{status:409});assert.equal(s.read().state.hp,26);
 }finally{s.close();}
});
test('explicit conflict archive preserves exact commands and refuses overwrite or failed archive storage',()=>{
 const s=openStore(':memory:'),m=memory(),q=new Queue(m,'one');try{
  q.resetBaseline(s.read());q.enqueue({kind:'hp'},-3,randomUUID());const saved=m.getItem('one');
  assert.throws(()=>q.archiveAndReset(s.read(),'foreign:archive:1'));assert.equal(q.length,1);
  const write=m.setItem;m.setItem=()=>{throw new Error('quota');};assert.throws(()=>q.archiveAndReset(s.read(),'one:archive:1'));assert.equal(q.length,1);assert.equal(m.getItem('one'),saved);m.setItem=write;
  q.archiveAndReset(s.read(),'one:archive:1');assert.equal(q.length,0);assert.equal(m.getItem('one:archive:1'),saved);assert.equal(q.snapshot.state.hp,28);
  q.enqueue({kind:'hp'},-1,randomUUID());assert.throws(()=>q.archiveAndReset(s.read(),'one:archive:1'));assert.equal(q.length,1);
 }finally{s.close();}
});
test('offline charges preserve individual copies, unknown values, bounds and replay',()=>{
 const s=openStore(':memory:'),m=memory();try{
  const entry=JSON.parse(readFileSync(new URL('../catalog/srd51-wands.json',import.meta.url),'utf8')).entries[0];
  s.catalog.importEntries({schemaVersion:1,entries:[{...entry,links:[]}]},{apply:true});
  const cmd=fields=>({mutationId:randomUUID(),expectedRevision:s.read().revision,characterId:s.read().context.characterId,catalogId:entry.id,...fields});
  s.addInventory(cmd({quantity:2}));s.changeCharges(cmd({unit:0,operation:'set',amount:5}));
  let q=new Queue(m,'charges');q.resetBaseline({...s.read(),inventory:s.inventory().entries});
  assert.throws(()=>q.enqueue({kind:'charges',catalogId:entry.id,unit:1},-1,randomUUID()));
  q.enqueue({kind:'charges',catalogId:entry.id,unit:0},-3,randomUUID());
  q.enqueue({kind:'charges',catalogId:entry.id,unit:0},2,randomUUID());
  assert.throws(()=>q.enqueue({kind:'charges',catalogId:entry.id,unit:0},4,randomUUID()));
  q=new Queue(m,'charges');assert.deepEqual(plain(q.snapshot.inventory[0].chargeCounts),[4,null]);
  while(q.length){const head=plain(q.head);s.changeResource(head);q.acknowledge(head,s.changeResource(head));}
  assert.deepEqual(s.inventory().entries[0].chargeCounts,[4,null]);assert.equal(q.length,0);
 }finally{s.close();}
});
test('offline queue keeps ten ordered HP and slot operations across reload, then delivers each exactly once',()=>{
 const store=openStore(':memory:'),storage=memory();try{
  let queue=new Queue(storage,'user-a:tab-a');queue.resetBaseline(store.read());
  for(let i=0;i<10;i++)queue.enqueue(i%2?{kind:'slot',level:1}:{kind:'hp'},i%2?(i%4===1?-1:1):-1,randomUUID());
  assert.equal(queue.length,10);assert.equal(queue.snapshot.state.hp,23);assert.equal(queue.snapshot.state.slots[1],2);assert.equal(store.read().state.hp,28);
  queue=new Queue(storage,'user-a:tab-a');assert.equal(queue.snapshot.state.hp,23);
  while(queue.length){const command=plain(queue.head);store.changeResource(command);const retried=store.changeResource(command);assert.equal(retried.replayed,true);queue.acknowledge(command,retried);}
  assert.equal(store.read().state.hp,23);assert.equal(store.read().state.slots[1],2);assert.equal(store.history().length,10);assert.equal(new Queue(storage,'user-a:tab-a').length,0);
 }finally{store.close();}
});
test('clamped operations are never coalesced: damage to zero then healing remains five',()=>{
 const s=openStore(':memory:'),q=new Queue(memory(),'one');try{q.resetBaseline(s.read());q.enqueue({kind:'hp'},-40,randomUUID());q.enqueue({kind:'hp'},5,randomUUID());assert.equal(q.snapshot.state.hp,5);assert.equal(q.length,2);}finally{s.close();}
});
test('absolute conflicts, late revisions and wrong-context acknowledgements retain the exact queue',()=>{
 const s=openStore(':memory:'),m=memory(),q=new Queue(m,'one');try{
  q.resetBaseline(s.read());q.enqueue({kind:'hp'},-3,randomUUID());const saved=m.getItem('one'),head=plain(q.head),current=s.read();
  s.update({mutationId:randomUUID(),expectedRevision:0,label:'Absolute edit',state:{...current.state,hp:15}});
  assert.throws(()=>s.changeResource(head),{status:409});assert.equal(m.getItem('one'),saved);
  assert.throws(()=>q.acknowledge(head,{...current,revision:2}));assert.throws(()=>q.acknowledge(head,{...current,revision:1,context:{...current.context,characterId:'other'}}));
  assert.equal(m.getItem('one'),saved);assert.equal(q.snapshot.state.hp,25);assert.throws(()=>q.resetBaseline(s.read()));
 }finally{s.close();}
});
test('storage failure does not optimistically accept an operation; damaged data and other identities remain untouched',()=>{
 const s=openStore(':memory:'),m=memory();try{
  const q=new Queue(m,'a');q.resetBaseline(s.read());const saved=m.getItem('a');m.setItem=()=>{throw new Error('Quota exceeded');};assert.throws(()=>q.enqueue({kind:'hp'},-1,randomUUID()));assert.equal(q.length,0);assert.equal(q.snapshot.state.hp,28);assert.equal(m.getItem('a'),saved);
  m.data.set('b','{"broken":true}');assert.throws(()=>new Queue(m,'b'));assert.equal(m.getItem('b'),'{"broken":true}');assert.equal(new Queue(m,'c').length,0);
 }finally{s.close();}
});
test('duplicate operation ids and tampered persisted order fail closed without clearing data',()=>{
 const s=openStore(':memory:'),m=memory(),q=new Queue(m,'a');try{q.resetBaseline(s.read());const id=randomUUID();q.enqueue({kind:'hp'},-1,id);assert.throws(()=>q.enqueue({kind:'hp'},-1,id));assert.equal(q.length,1);const data=JSON.parse(m.getItem('a'));data.commands[0].expectedRevision=99;m.data.set('a',JSON.stringify(data));assert.throws(()=>new Queue(m,'a'));assert.equal(JSON.parse(m.getItem('a')).commands[0].expectedRevision,99);}finally{s.close();}
});

test('local operation times persist across reload without changing wire commands or legacy queues',()=>{
 const s=openStore(':memory:'),m=memory();try{
  let q=new Queue(m,'times');q.resetBaseline(s.read());const a=q.enqueue({kind:'hp'},-1,randomUUID()),b=q.enqueue({kind:'hp'},-1,randomUUID());
  const times=plain(q.data.createdAt);assert.ok(Number.isFinite(Date.parse(times[a.mutationId])));assert.equal(a.createdAt,undefined);
  q=new Queue(m,'times');assert.deepEqual(plain(q.data.createdAt),times);q.acknowledge(plain(a),s.changeResource(plain(a)));
  assert.equal(q.data.createdAt[a.mutationId],undefined);assert.equal(q.data.createdAt[b.mutationId],times[b.mutationId]);
  const legacy=JSON.parse(m.getItem('times'));delete legacy.createdAt;m.setItem('times',JSON.stringify(legacy));q=new Queue(m,'times');assert.equal(q.length,1);assert.equal(q.snapshot.state.hp,26);
  const corrupt=JSON.parse(m.getItem('times'));corrupt.createdAt={[b.mutationId]:'invalid'};m.setItem('times',JSON.stringify(corrupt));assert.throws(()=>new Queue(m,'times'),/повреждена/);
 }finally{s.close();}
});

test('queued addressed undo preserves ordered clamping, reload, lost responses and one-shot server history',()=>{
 const s=openStore(':memory:'),m=memory();try{
  let q=new Queue(m,'undo');q.resetBaseline(s.read());const hit=q.enqueue({kind:'hp'},-100,randomUUID());q.enqueue({kind:'hp'},5,randomUUID());const inverse=q.enqueueUndo(hit.mutationId,randomUUID());
  assert.equal(inverse.delta,28);assert.equal(q.snapshot.state.hp,33);assert.throws(()=>q.enqueueUndo(hit.mutationId,randomUUID()));assert.throws(()=>q.enqueueUndo(inverse.mutationId,randomUUID()));
  q=new Queue(m,'undo');while(q.length){const head=plain(q.head);s.changeResource(head);const replay=s.changeResource(head);if(head.targetMutationId){const {resourceReceipt,...missing}=replay;assert.throws(()=>q.acknowledge(head,missing));assert.throws(()=>q.acknowledge(head,{...replay,resourceReceipt:{...resourceReceipt,targetMutationId:'wrong-target'}}));}q.acknowledge(head,replay);}
  assert.equal(s.read().state.hp,33);assert.equal(s.history().find(r=>r.mutationId===hit.mutationId).canUndo,false);assert.equal(s.history().find(r=>r.mutationId===inverse.mutationId).canUndo,false);
  assert.throws(()=>s.undoResource({mutationId:randomUUID(),expectedRevision:s.read().revision,characterId:s.read().context.characterId,targetMutationId:hit.mutationId}),{status:409});
 }finally{s.close();}
});
test('queued undo refuses overflow and forged inverse without losing the queue',()=>{
 const s=openStore(':memory:'),q=new Queue(memory(),'undo');try{
  q.resetBaseline(s.read());const hit=q.enqueue({kind:'hp'},-10,randomUUID());q.enqueue({kind:'hp'},20,randomUUID());const saved=JSON.stringify(q.data);assert.throws(()=>q.enqueueUndo(hit.mutationId,randomUUID()));assert.equal(JSON.stringify(q.data),saved);
  s.changeResource(plain(hit));const forged={...plain(hit),mutationId:randomUUID(),expectedRevision:s.read().revision,before:18,delta:9,targetMutationId:hit.mutationId};assert.throws(()=>s.changeResource(forged),{status:409});assert.equal(s.read().state.hp,18);
 }finally{s.close();}
});
