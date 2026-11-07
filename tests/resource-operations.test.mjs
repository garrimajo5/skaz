import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {openStore} from '../server/store.mjs';
import {createApp} from '../server/app.mjs';
const command=(s,resource={kind:'hp'},delta=-3)=>{const current=s.read();return {mutationId:randomUUID(),expectedRevision:current.revision,context:current.context,resource,delta,before:resource.kind==='hp'?current.state.hp:resource.kind==='slot'?current.state.slots[resource.level]:current.state.inspiration,maximum:resource.kind==='hp'?current.state.maxHp:resource.kind==='slot'?[4,3,2][resource.level-1]:4};};
const undo=(s,target)=>({mutationId:randomUUID(),expectedRevision:s.read().revision,characterId:s.read().context.characterId,targetMutationId:target});

test('resource history supports addressed inverse after later increments and makes undo itself one-shot',()=>{
 const s=openStore(':memory:');try{
  const damage=command(s,undefined,-5);s.changeResource(damage);s.changeResource(command(s,{kind:'slot',level:1},-1));s.changeResource(command(s,undefined,-2));
  const row=s.history().find(r=>r.mutationId===damage.mutationId);assert.equal(row.canUndo,true);assert.deepEqual(row.changes,[{resource:{kind:'hp'},before:28,after:23}]);
  const request=undo(s,damage.mutationId);s.undoResource(request);assert.equal(s.read().state.hp,26);assert.equal(s.read().state.slots[1],2);
  assert.equal(s.undoResource(request).replayed,true);assert.equal(s.read().state.hp,26);
  assert.throws(()=>s.undoResource(undo(s,damage.mutationId)),{status:409});assert.throws(()=>s.undoResource(undo(s,request.mutationId)),{status:409});
  assert.equal(s.history().find(r=>r.mutationId===damage.mutationId).canUndo,false);
 }finally{s.close();}
});
test('resource undo preserves clamping semantics, refuses overflow and absolute barriers even if values match',()=>{
 const s=openStore(':memory:');try{
  const hit=command(s,undefined,-40);s.changeResource(hit);s.changeResource(command(s,undefined,5));s.undoResource(undo(s,hit.mutationId));assert.equal(s.read().state.hp,33);
  const heal=command(s,undefined,100);s.changeResource(heal);s.changeResource(command(s,undefined,-38));assert.throws(()=>s.undoResource(undo(s,heal.mutationId)),{status:409});
  const slot=command(s,{kind:'slot',level:1},-1);s.changeResource(slot);const current=s.read();s.update({mutationId:randomUUID(),expectedRevision:current.revision,label:'Manual correction',state:current.state});
  const before=s.read();assert.throws(()=>s.undoResource(undo(s,slot.mutationId)),{status:409});assert.deepEqual(s.read(),before);assert.match(s.history().find(r=>r.mutationId===slot.mutationId).undoReason,/правки/);
 }finally{s.close();}
});
test('legacy absolute resources expose before and after without pretending to support inverse',()=>{
 const s=openStore(':memory:');try{const current=s.read();s.update({mutationId:randomUUID(),expectedRevision:0,label:'Manual',state:{...current.state,hp:10,gold:9}});const row=s.history()[0];assert.equal(row.canUndo,false);assert.deepEqual(row.changes,[{resource:{kind:'hp'},before:28,after:10},{resource:{kind:'gold'},before:124,after:9}]);}finally{s.close();}
});

test('resource commands apply in order, clamp HP individually, replay exactly once and preserve all unrelated data',()=>{
 const s=openStore(':memory:');try{
  const original=s.read();const damage=command(s,undefined,-40);s.changeResource(damage);assert.equal(s.read().state.hp,0);
  const healing=command(s,undefined,5);s.changeResource(healing);assert.equal(s.read().state.hp,5);
  assert.equal(s.changeResource(damage).replayed,true);assert.equal(s.read().state.hp,5);assert.equal(s.read().revision,2);
  const next=s.read().state;assert.deepEqual({...next,hp:original.state.hp},original.state);
  assert.match(s.history()[1].label,/28 → 0/);assert.match(s.history()[0].label,/0 → 5/);
  assert.throws(()=>s.changeResource({...damage,delta:-39}),{status:409});
 }finally{s.close();}
});
test('ten queued requests can replay sequentially; absolute revision conflict never silently rebases',()=>{
 const s=openStore(':memory:');try{
  const start=s.read();const requests=Array.from({length:10},(_,i)=>({...command(s),mutationId:randomUUID(),expectedRevision:start.revision+i,before:start.state.hp-i,delta:-1}));
  for(const request of requests){s.changeResource(request);s.changeResource(request);}
  assert.equal(s.read().state.hp,18);assert.equal(s.read().revision,10);assert.equal(s.history().length,10);
  const queued=command(s);s.update({mutationId:randomUUID(),expectedRevision:10,label:'Absolute edit',state:{...s.read().state,gold:7}});
  assert.throws(()=>s.changeResource(queued),{status:409});assert.equal(s.read().state.hp,18);assert.equal(s.read().state.gold,7);
 }finally{s.close();}
});
test('wrong context, stale balances, malformed operations and resource boundaries fail atomically',()=>{
 const s=openStore(':memory:');try{
  const before=s.read(),req=command(s);
  for(const bad of [{...req,before:27},{...req,maximum:39},{...req,context:{...req.context,characterId:'foreign-hero'}},{...req,resource:{kind:'slot',level:1},before:3,maximum:4,delta:2}])assert.throws(()=>s.changeResource(bad),{status:409});
  for(const bad of [{...req,delta:0},{...req,delta:'-3'},{...req,resource:{kind:'hp',field:'gold'}},{...req,context:{characterId:'only-hero'}},{...req,state:before.state},{...req,resource:{kind:'slot',level:9}}])assert.throws(()=>s.changeResource(bad),{status:422});
  assert.deepEqual(s.read(),before);assert.equal(s.history().length,0);
 }finally{s.close();}
});
test('own class counters use stable ids and reject fixed bard operations',()=>{
 const s=openStore(':memory:');try{
  const current=s.read(),sheet={ruleset:'5e-2014',ancestry:'',className:'Воин',subclass:'',level:2,counters:[{id:'counter-test',name:'Запас',current:2,max:3}]};
  s.saveCharacterSheet({mutationId:randomUUID(),expectedRevision:0,characterId:current.context.characterId,sheet});
  assert.throws(()=>s.changeResource(command(s,{kind:'slot',level:1},-1)),{status:409});
  const req={...command(s),resource:{kind:'counter',counterId:'counter-test'},before:2,maximum:3,delta:-1};
  s.changeResource(req);assert.equal(s.read().characterSheet.counters[0].current,1);assert.equal(s.changeResource(req).replayed,true);assert.equal(s.read().characterSheet.counters[0].current,1);
 }finally{s.close();}
});
test('resource API retains Origin and local-client checks',async t=>{
 const s=openStore(':memory:'),app=createApp(s);await new Promise(r=>app.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>app.close(r));s.close();});
 const url='http://127.0.0.1:'+app.address().port+'/api/resources/change',body=JSON.stringify(command(s));
 assert.equal((await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body})).status,403);
 const headers={'Content-Type':'application/json','X-Skaz-Client':'local-v1'};
 assert.equal((await fetch(url,{method:'POST',headers:{...headers,Origin:'https://wrong.invalid'},body})).status,403);
 assert.equal((await fetch(url,{method:'POST',headers,body})).status,200);
 assert.equal((await fetch(url,{method:'POST',headers,body}).then(r=>r.json())).replayed,true);
});
