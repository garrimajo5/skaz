import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {openStore} from '../server/store.mjs';
import {createApp} from '../server/app.mjs';
import {seed} from '../server/state.mjs';
const cmd=(s,fields)=>({mutationId:randomUUID(),expectedRevision:s.read().revision,...fields});
const create=s=>cmd(s,{campaignId:s.read().context.campaignId,characterId:randomUUID(),template:'bard5-demo',profile:{name:'Лира',tagline:'Ищет северную тропу'}});
const entry=kind=>({title:kind,text:kind,at:1,time:'00:01'});
test('characters share campaign and session but keep resources, notes and proposals separate',()=>{
 const s=openStore(':memory:');try{
  s.update(cmd(s,{state:{...structuredClone(seed),hp:1,gold:9,journal:[entry('Shared')],notes:[entry('Private')]},label:'First hero'}));
  const first=s.read();const proposalId=randomUUID();
  s.createProposal(cmd(s,{...first.context,proposalId,source:{kind:'manual-text',text:'Private source',speaker:'Player',offsetMs:0},suggestion:{kind:'personal-note',title:'Private',text:'Private text'}}));
  const request=create(s),second=s.createCharacter(request);
  assert.equal(second.context.campaignId,first.context.campaignId);assert.equal(second.context.sessionId,first.context.sessionId);assert.equal(second.context.characterId,request.characterId);
  assert.equal(second.state.profile.name,'Лира');assert.equal(second.state.hp,seed.hp);assert.equal(second.state.gold,seed.gold);assert.deepEqual(second.state.notes,[]);assert.deepEqual(second.state.journal,first.state.journal);
  assert.deepEqual(s.proposals().proposals,[]);assert.deepEqual(s.sessionReview(first.context.sessionId).proposals,[]);
  assert.throws(()=>s.decideProposal(cmd(s,{proposalId,decision:'dismiss',content:null})),{status:409});
  s.update(cmd(s,{state:{...second.state,hp:12,notes:[entry('Second private')],journal:[entry('Shared later')]},label:'Second hero'}));
  s.selectContext(cmd(s,{context:first.context}));assert.equal(s.read().state.hp,1);assert.equal(s.read().state.gold,9);assert.deepEqual(s.read().state.notes,first.state.notes);assert.equal(s.read().state.journal[0].title,'Shared later');
  assert.equal(s.sessionReview(first.context.sessionId).proposals.length,1);
  const replay=s.createCharacter(request);assert.equal(replay.replayed,true);assert.equal(replay.context.characterId,first.context.characterId);assert.equal(replay.affectedContext.characterId,request.characterId);assert.equal(s.campaigns()[0].characters.length,2);
  const exported=s.exportActive(6);assert.equal(exported.state.profile.name,first.state.profile.name);assert.equal(exported.proposals.length,1);
 }finally{s.close();}
});
test('invalid template, profile, stale context and duplicate ID cannot create characters',()=>{
 const s=openStore(':memory:');try{
  const request=create(s);
  for(const change of [r=>r.template='wizard',r=>r.profile.name=' ',r=>r.profile.tagline='x'.repeat(161),r=>r.profile.hp=999,r=>r.characterId='../bad',r=>r.extra=true]){
   const invalid=structuredClone(request);change(invalid);assert.throws(()=>s.createCharacter(invalid),{status:422});
  }
  assert.throws(()=>s.createCharacter({...request,campaignId:randomUUID()}),{status:409});assert.equal(s.read().revision,0);
  s.createCharacter(request);assert.throws(()=>s.createCharacter({...create(s),characterId:request.characterId}),{status:409});
  assert.throws(()=>s.createCharacter({...create(s),expectedRevision:0}),{status:409});assert.equal(s.campaigns()[0].characters.length,2);
  assert.throws(()=>s.createCharacter({...request,profile:{name:'Changed',tagline:''}}),{status:409});
 }finally{s.close();}
});
test('character creation and active selection roll back with audit; receipt survives restart',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'skaz-characters-')),file=join(dir,'game.sqlite');let s=openStore(file);const raw=new DatabaseSync(file);
 try{
  const request=create(s),before=s.read();raw.exec("CREATE TRIGGER fail_character BEFORE INSERT ON changes BEGIN SELECT RAISE(ABORT, 'character failure'); END");
  assert.throws(()=>s.createCharacter(request),/character failure/);assert.deepEqual(s.read(),before);assert.equal(s.campaigns()[0].characters.length,1);
  raw.exec('DROP TRIGGER fail_character');s.createCharacter(request);s.close();s=openStore(file);assert.equal(s.createCharacter(request).replayed,true);assert.equal(s.campaigns()[0].characters.length,2);
  s.startSession(cmd(s,{session:{name:'Next',playedOn:'2026-10-19'}}));assert.equal(s.read().context.characterId,request.characterId);
 }finally{raw.close();s.close();}
});
test('character creation HTTP needs local headers and returns the selected character',async t=>{
 const s=openStore(':memory:'),app=createApp(s);await new Promise(r=>app.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>app.close(r));s.close();});
 const base=`http://127.0.0.1:${app.address().port}`,request=create(s),body=JSON.stringify(request),headers={'Content-Type':'application/json','X-Skaz-Client':'local-v1'};
 assert.equal((await fetch(base+'/api/characters',{method:'POST',headers:{'Content-Type':'application/json'},body})).status,403);
 assert.equal((await fetch(base+'/api/characters',{method:'POST',headers:{...headers,Origin:'https://other.example'},body})).status,403);
 const result=await fetch(base+'/api/characters',{method:'POST',headers,body}).then(r=>r.json());assert.equal(result.context.characterId,request.characterId);assert.equal(result.state.profile.name,'Лира');
 assert.equal((await fetch(base+'/api/campaigns').then(r=>r.json())).campaigns[0].characters.length,2);
});


test('inventory, spellbook and v6 export follow the selected character within one campaign',async()=>{
 const s=openStore(':memory:');try{
  const items=JSON.parse(await readFile(new URL('../catalog/srd51-items.json',import.meta.url),'utf8')),spells=JSON.parse(await readFile(new URL('../catalog/srd51-spells.json',import.meta.url),'utf8'));
  s.catalog.importEntries(items,{apply:true});s.catalog.importEntries(spells,{apply:true});const first=s.read().context;
  s.addInventory(cmd(s,{characterId:first.characterId,catalogId:items.entries[0].id,quantity:2}));
  s.setSpell(cmd(s,{characterId:first.characterId,catalogId:spells.entries[0].id,status:'prepared'}));
  const request=create(s);s.createCharacter(request);const second=s.read().context;
  assert.deepEqual(s.inventory().entries,[]);assert.deepEqual(s.spellbook().entries,[]);assert.deepEqual(s.exportActive(6).inventory,[]);
  s.addInventory(cmd(s,{characterId:second.characterId,catalogId:items.entries[0].id,quantity:5}));
  s.selectContext(cmd(s,{context:first}));assert.equal(s.inventory().entries[0].quantity,2);assert.equal(s.spellbook().entries[0].status,'prepared');
  const exported=s.exportActive(6);assert.equal(exported.inventory[0].quantity,2);assert.equal(exported.spellbook.length,1);
  s.selectContext(cmd(s,{context:second}));assert.equal(s.inventory().entries[0].quantity,5);assert.equal(s.spellbook().entries.length,0);
 }finally{s.close();}
});


test('character limit rejects the next creation without changing the selected hero',()=>{
 const s=openStore(':memory:');try{for(let i=1;i<100;i++)s.createCharacter(create(s));const before=s.read();assert.throws(()=>s.createCharacter(create(s)),{status:422});assert.deepEqual(s.read(),before);assert.equal(s.campaigns()[0].characters.length,100);}finally{s.close();}
});
