import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';import {randomUUID} from 'node:crypto';import {openStore} from '../server/store.mjs';
const source=readFileSync(new URL('../client/resource-queue.js',import.meta.url),'utf8');const ctx=vm.createContext({});vm.runInContext(readFileSync(new URL('../client/item-charges.js',import.meta.url),'utf8')+'\n'+readFileSync(new URL('../client/health.js',import.meta.url),'utf8')+'\n'+readFileSync(new URL('../client/personal-note.js',import.meta.url),'utf8')+'\n'+source,ctx);const Queue=vm.runInContext('SkazResourceQueue',ctx);
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

test('spend and durable undo from an agreed overage restore only the original charge agreement',()=>{
 const s=openStore(':memory:'),m=memory();try{
  const entry=JSON.parse(readFileSync(new URL('../catalog/srd51-wands.json',import.meta.url),'utf8')).entries[0];
  s.catalog.importEntries({schemaVersion:1,entries:[{...entry,links:[]}]},{apply:true});
  const cmd=fields=>({mutationId:randomUUID(),expectedRevision:s.read().revision,characterId:s.read().context.characterId,catalogId:entry.id,...fields});
  s.addInventory(cmd({quantity:2}));
  s.changeCharges(cmd({unit:0,operation:'set',amount:9,agreement:'Решение мастера'}));
  let q=new Queue(m,'charge-advisory');q.resetBaseline({...s.read(),inventory:s.inventory().entries});
  const resource={kind:'charges',catalogId:entry.id,unit:0};
  const spend=q.enqueue(resource,-1,randomUUID());
  assert.deepEqual(plain(q.snapshot.inventory[0].chargeCounts),[8,null]);
  assert.equal(q.snapshot.inventory[0].chargeAgreements,undefined);
  const undo=q.enqueueUndo(spend.mutationId,randomUUID());
  assert.equal(undo.resource.agreement.note,'Решение мастера');
  q=new Queue(m,'charge-advisory');
  while(q.length){
   const head=plain(q.head);
   s.changeResource(head);
   const saved=s.changeResource(head);
   assert.equal(saved.replayed,true);
   if(head.targetMutationId){
    const forged=structuredClone(saved);forged.resourceReceipt.chargeAgreementAfter=null;
    assert.throws(()=>q.acknowledge(head,forged),/Сервер не подтвердил согласование/);
    assert.equal(q.length,1);
   }
   q.acknowledge(head,saved);
  }
  assert.deepEqual(plain(q.snapshot.inventory),s.inventory().entries);
  assert.deepEqual(s.inventory().entries[0].chargeCounts,[9,null]);
  assert.equal(s.inventory().entries[0].chargeAgreements[0].note,'Решение мастера');
  const before=s.read();
  assert.throws(()=>s.changeResource({...plain(undo),mutationId:randomUUID(),targetMutationId:undefined,expectedRevision:before.revision}),{status:422});
  assert.equal(s.read().revision,before.revision);
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


test('manual excess survives queued retry and stale acknowledgement clears in both projection and server',()=>{
 const s=openStore(':memory:'),storage=memory(),q=new Queue(storage,'manual-excess');
 try{
  const current=s.read(),sheet={ruleset:'5e-2014',ancestry:'',className:'Synthetic',subclass:'',level:2,counters:[{id:'counter-synthetic',name:'Synthetic',current:8,max:7}]};
  s.saveCharacterSheet({mutationId:randomUUID(),expectedRevision:current.revision,characterId:current.context.characterId,sheet});
  const warning=s.read().profileRuleWarnings[0];sheet.ruleAcknowledgements=[{key:warning.key,facts:warning.facts,note:'Synthetic'}];
  s.saveCharacterSheet({mutationId:randomUUID(),expectedRevision:s.read().revision,characterId:current.context.characterId,sheet});
  q.resetBaseline(s.read());const command=plain(q.enqueue({kind:'counter',counterId:'counter-synthetic'},-1,randomUUID()));
  assert.equal(q.snapshot.characterSheet.counters[0].current,7);assert.deepEqual(plain(q.snapshot.characterSheet.ruleAcknowledgements),[]);
  const restored=new Queue(storage,'manual-excess');assert.equal(restored.head.mutationId,command.mutationId);
  const saved=s.changeResource(command);assert.equal(s.changeResource(command).replayed,true);
  restored.acknowledge(command,saved);assert.equal(restored.length,0);
  assert.deepEqual(plain(restored.snapshot.characterSheet),saved.characterSheet);
 }finally{s.close();}
});

test('queued addressed undo restores a manual excess after reload and exact retries',()=>{
 const s=openStore(':memory:'),storage=memory();
 try{
  const current=s.read();
  s.saveCharacterSheet({mutationId:randomUUID(),expectedRevision:current.revision,characterId:current.context.characterId,sheet:{ruleset:'5e-2014',ancestry:'',className:'Synthetic',subclass:'',level:2,counters:[{id:'counter-synthetic',name:'Synthetic',current:8,max:7}]}});
  let q=new Queue(storage,'manual-undo');q.resetBaseline(s.read());
  const spend=q.enqueue({kind:'counter',counterId:'counter-synthetic'},-1,randomUUID());
  const inverse=q.enqueueUndo(spend.mutationId,randomUUID());
  assert.equal(inverse.delta,1);assert.equal(q.snapshot.characterSheet.counters[0].current,8);
  q=new Queue(storage,'manual-undo');
  while(q.length){const head=plain(q.head);s.changeResource(head);q.acknowledge(head,s.changeResource(head));}
  assert.equal(s.read().characterSheet.counters[0].current,8);assert.equal(q.length,0);
  assert.equal(s.history().find(r=>r.mutationId===spend.mutationId).canUndo,false);
 }finally{s.close();}
});


test('mixed offline sequence restores a personal note and confirms it exactly once after a lost response', () => {
  const store=openStore(':memory:'), storage=memory();
  try {
    const initial=store.read();
    const starting=store.update({
      mutationId:randomUUID(), expectedRevision:initial.revision, label:'Synthetic field values',
      state:{...initial.state, hp:40, maxHp:40, slots:{1:4,2:3,3:2}},
    });
    let queue=new Queue(storage,'field-note');
    queue.resetBaseline(starting);
    for (const delta of [-12,5,-3,2,-4,1,-2]) queue.enqueue({kind:'hp'},delta,randomUUID());
    for (const level of [1,2]) queue.enqueue({kind:'slot',level},-1,randomUUID());
    const noteId=randomUUID();
    const resource={kind:'note',text:'Личная проверочная запись',at:10,time:'12:05'};
    queue.enqueue(resource,1,noteId);
    assert.equal(queue.length,10);

    queue=new Queue(storage,'field-note');
    assert.equal(queue.snapshot.state.hp,27);
    assert.deepEqual(plain(queue.snapshot.state.slots),{1:3,2:2,3:2});
    assert.equal(queue.snapshot.state.notes[0].text,resource.text);
    assert.equal(store.read().state.notes.length,0);
    while (queue.head.mutationId!==noteId) {
      const head=plain(queue.head);
      queue.acknowledge(head,store.changeResource(head));
    }
    const head=plain(queue.head);
    const result=store.changeResource(head);
    const saved=storage.getItem('field-note');
    assert.throws(()=>queue.acknowledge(head,{...result,resourceReceipt:undefined}),/операцию очереди/);
    const incorrect=structuredClone(result);
    incorrect.state.notes[0].text='Другая запись';
    assert.throws(()=>queue.acknowledge(head,incorrect),/личную заметку/);
    assert.equal(storage.getItem('field-note'),saved);
    assert.throws(()=>queue.undoInfo(noteId),/не отменяется/);

    const replay=store.changeResource(head);
    assert.equal(replay.replayed,true);
    queue.acknowledge(head,replay);
    assert.equal(queue.length,0);
    assert.equal(store.read().revision,starting.revision+10);
    assert.equal(store.history('session').filter(row=>row.mutationId===noteId).length,1);
    assert.equal(store.read().state.notes.length,1);
    assert.deepEqual(store.read().state.journal,initial.state.journal);
    assert.equal(store.exportActive(15).state.notes[0].text,resource.text);
  } finally { store.close(); }
});
