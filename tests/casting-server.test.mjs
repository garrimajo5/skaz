import test from 'node:test';import assert from 'node:assert/strict';import{randomUUID}from'node:crypto';import{mkdtempSync}from'node:fs';import{join}from'node:path';import{tmpdir}from'node:os';import{DatabaseSync}from'node:sqlite';
import{openStore}from'../server/store.mjs';import{bundledCatalog}from'../server/bundled-catalog.mjs';import Casting from'../client/casting.js';
import vm from 'node:vm';import{readFileSync}from'node:fs';
const bundle=bundledCatalog().bundle;
const focus=bundle.entries.find(e=>e.kind==='spell'&&e.spell.level===2&&e.spell.concentration);
const cantrip=bundle.entries.find(e=>e.kind==='spell'&&e.spell.level===0&&!e.spell.concentration);
const cmd=(s,fields)=>({mutationId:randomUUID(),expectedRevision:s.read().revision,...fields});
function setup(file=':memory:'){const s=openStore(file);s.catalog.importEntries(bundle,{apply:true});for(const e of[focus,cantrip])s.setSpell(cmd(s,{characterId:s.read().context.characterId,catalogId:e.id,status:'prepared'}));s.update(cmd(s,{label:'Fixture',state:{...s.read().state,concentration:'Previous',concentrationChecks:[{id:'damage-before',spell:'Previous',damage:2,dc:10}]}}));return s;}
function cast(s,id=focus.id,cost={kind:'slot',level:2}){const snapshot={...s.read(),spellbook:s.spellbook().entries},command=Casting.prepare(snapshot,id,cost);return cmd(s,{context:snapshot.context,resource:{kind:'cast',operation:'cast',command},delta:1,before:command.before,maximum:command.maximum});}
const undo=(s,target)=>s.undoResource(cmd(s,{characterId:s.read().context.characterId,targetMutationId:target}));
test('one durable cast receipt and history restore both slot and previous questions; lost response replay spends once',()=>{const s=setup();try{
 const before=s.read(),request=cast(s),result=s.changeResource(request);assert.equal(result.state.slots[2],before.state.slots[2]-1);assert.equal(result.state.concentration,focus.name.ru);assert.deepEqual(result.state.concentrationChecks,[]);assert.equal(result.resourceReceipt.casting.focusBefore.concentration,'Previous');
 assert.equal(s.changeResource(request).replayed,true);assert.equal(s.read().revision,before.revision+1);const row=s.history().find(r=>r.mutationId===request.mutationId);assert.equal(row.canUndo,true);assert.equal(row.changes.length,3);
 undo(s,request.mutationId);assert.deepEqual(s.read().state,before.state);assert.throws(()=>undo(s,request.mutationId),{status:409});
}finally{s.close();}});
test('cantrip records intent without consuming slots or disturbing concentration; forged restore requires real target',()=>{const s=setup();try{
 const before=s.read(),r=cast(s,cantrip.id,null);s.changeResource(r);assert.deepEqual(s.read().state,before.state);assert.equal(s.history().find(x=>x.mutationId===r.mutationId).canUndo,false);
 const receipt={context:before.context,cost:null,before:0,after:0,maximum:0,focusBefore:{concentration:'Forged',checks:[]},focusAfter:{concentration:'Previous',checks:before.state.concentrationChecks},changesFocus:true};
 assert.throws(()=>s.changeResource(cmd(s,{context:before.context,resource:{kind:'cast',operation:'restore',receipt},delta:1,before:0,maximum:0})),{status:422});
 assert.throws(()=>s.changeResource(cmd(s,{context:before.context,resource:{kind:'cast',operation:'restore',receipt},targetMutationId:r.mutationId,delta:1,before:0,maximum:0})),{status:409});
}finally{s.close();}});
test('changed payload, stale focus/context and removed spell do not partially spend',()=>{const s=setup();try{
 const r=cast(s),before=s.read();const bad=structuredClone(r);bad.resource.command.spell.name='Fake';assert.throws(()=>s.changeResource(bad),{status:409});assert.deepEqual(s.read(),before);
 const foreign=structuredClone(r);foreign.resource.command.context.characterId='foreign';assert.throws(()=>s.changeResource(foreign),{status:409});assert.deepEqual(s.read(),before);
 s.changeResource(r);const changed=structuredClone(r);changed.resource.command.cost.level=3;assert.throws(()=>s.changeResource(changed),{status:409});
 const next=cast(s);s.setSpell(cmd(s,{characterId:s.read().context.characterId,catalogId:focus.id,status:'remove'}));next.expectedRevision=s.read().revision;const removed=s.read();assert.throws(()=>s.changeResource(next),{status:409});assert.deepEqual(s.read(),removed);
}finally{s.close();}});
test('intervening damage or spend/recover blocks cast undo even when final balance matches; unrelated inspiration does not',()=>{const s=setup();try{
 const r=cast(s);s.changeResource(r);s.changeResource(cmd(s,{context:s.read().context,resource:{kind:'inspiration'},delta:-1,before:3,maximum:4}));assert.equal(s.history().find(x=>x.mutationId===r.mutationId).canUndo,true);undo(s,r.mutationId);
 const next=cast(s);s.changeResource(next);for(const delta of[-1,1])s.changeResource(cmd(s,{context:s.read().context,resource:{kind:'slot',level:2},delta,before:s.read().state.slots[2],maximum:3}));assert.throws(()=>undo(s,next.mutationId),{status:409});
}finally{s.close();}});
test('audit failure rolls back manual counter, concentration, history and revision together',()=>{const path=join(mkdtempSync(join(tmpdir(),'skaz-cast-')),'test.sqlite'),s=setup(path),db=new DatabaseSync(path);try{
 s.saveCharacterSheet(cmd(s,{characterId:s.read().context.characterId,sheet:{ruleset:'5e-2014',ancestry:'',className:'Manual',subclass:'',level:5,counters:[{id:'counter-slot',name:'Manual',current:2,max:3}]}}));
 const r=cast(s,focus.id,{kind:'counter',counterId:'counter-slot',level:2}),before=s.read(),history=s.history();db.exec("CREATE TRIGGER fail_cast_receipt BEFORE INSERT ON resource_changes BEGIN SELECT RAISE(ABORT,'receipt failure');END");assert.throws(()=>s.changeResource(r));assert.deepEqual(s.read(),before);assert.deepEqual(s.history(),history);db.exec('DROP TRIGGER fail_cast_receipt');
 s.changeResource(r);assert.equal(s.read().characterSheet.counters[0].current,1);assert.equal(s.read().state.concentration,focus.name.ru);undo(s,r.mutationId);assert.deepEqual(s.read().characterSheet,before.characterSheet);assert.deepEqual(s.read().state,before.state);
}finally{db.close();s.close();}});
test('cast state survives export v12 and restart, receipt remains addressable',()=>{const path=join(mkdtempSync(join(tmpdir(),'skaz-cast-persist-')),'test.sqlite');let s=setup(path);const other=openStore(':memory:');try{
 const r=cast(s);s.changeResource(r);const file=s.exportActive(12);other.importActive(cmd(other,{destination:'new-campaign',file}));assert.deepEqual(other.read().state,s.read().state);s.close();s=openStore(path);assert.equal(s.changeResource(r).replayed,true);undo(s,r.mutationId);assert.equal(s.read().state.concentration,'Previous');
}finally{s.close();other.close();}});

test('offline mixed cast/damage/heal/undo survives reload and lost responses; wrong receipt retains head',()=>{const s=setup(),ctx=vm.createContext({});for(const name of['health','casting','resource-queue'])vm.runInContext(readFileSync(new URL('../client/'+name+'.js',import.meta.url),'utf8'),ctx);const Queue=vm.runInContext('SkazResourceQueue',ctx),map=new Map(),storage={getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)},plain=x=>JSON.parse(JSON.stringify(x));try{
 let q=new Queue(storage,'test');q.resetBaseline(s.read());const first=q.enqueue({kind:'cast',catalogId:focus.id,cost:{kind:'slot',level:2}},1,randomUUID());
 q.enqueue({kind:'health',operation:'damage',temporaryBefore:0},3,randomUUID());assert.throws(()=>q.enqueueUndo(first.mutationId,randomUUID()));
 q.enqueue({kind:'health',operation:'heal',temporaryBefore:0},1,randomUUID());const second=q.enqueue({kind:'cast',catalogId:focus.id,cost:{kind:'slot',level:3}},1,randomUUID());q.enqueueUndo(second.mutationId,randomUUID());q=new Queue(storage,'test');
 const expected=plain(q.snapshot),head=plain(q.head),response=s.changeResource(head),fake=structuredClone(response);fake.resourceReceipt.casting.focusAfter.concentration='fake';assert.throws(()=>q.acknowledge(head,fake));assert.equal(q.head.mutationId,head.mutationId);
 while(q.length){const command=plain(q.head),result=s.changeResource(command);assert.equal(s.changeResource(command).replayed,true);q.acknowledge(command,result);}assert.deepEqual(s.read().state,expected.state);assert.equal(s.read().state.slots[3],1);assert.equal(s.read().state.concentrationChecks.length,1);
}finally{s.close();}});

test('individual casting and inverse enforce actor, character grants, read-only mode and revoked replay',()=>{const s=setup();try{
 const own=s.read().context;s.access.apply({action:'bootstrap-owner',userId:'caster-owner',displayName:'Owner',campaignId:own.campaignId,characterId:own.characterId});
 s.access.apply({action:'create-user',userId:'caster-player',displayName:'Player'});s.access.apply({action:'set-member',userId:'caster-player',campaignId:own.campaignId,role:'player'});s.access.apply({action:'grant-character',userId:'caster-player',campaignId:own.campaignId,characterId:own.characterId});
 const player=s.forUser('caster-player','cast-player',{write:true}),owner=s.forUser('caster-owner','cast-owner',{write:true}),r=cast(player);
 assert.throws(()=>s.forUser('caster-player','cast-reader').changeResource(r),{status:403});player.changeResource(r);assert.throws(()=>owner.changeResource(r),{status:404});assert.throws(()=>undo(owner,r.mutationId),{status:404});
 s.access.apply({action:'revoke-character',userId:'caster-player',campaignId:own.campaignId,characterId:own.characterId});assert.throws(()=>player.changeResource(r),{status:404});assert.throws(()=>undo(player,r.mutationId),{status:404});
}finally{s.close();}});
