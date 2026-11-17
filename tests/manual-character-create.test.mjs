import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {openStore} from '../server/store.mjs';
import {createApp} from '../server/app.mjs';

const command=(s,fields)=>({mutationId:randomUUID(),expectedRevision:s.read().revision,...fields});
const manual=()=>({stats:{abilities:{str:16,dex:12,con:14,int:10,wis:13,cha:8},armorClass:17,initiative:1,speed:25},sheet:{ruleset:'5e-2014',ancestry:'Дварф',className:'Воин',subclass:'',level:2,counters:[{id:'second-wind-test',name:'Второе дыхание',current:0,max:1}],saveProficiencies:['str','con']},hp:0,maxHp:21,tempHp:3,gold:0});
const request=s=>command(s,{campaignId:s.read().context.campaignId,characterId:randomUUID(),template:'manual-2014',profile:{name:'Тестовый воин',tagline:''},manual:manual()});

test('manual creation uses explicit zero values and never inherits demo or private possessions',()=>{
 const s=openStore(':memory:');try{
  const first=s.read();s.update(command(s,{label:'Private synthetic note',state:{...first.state,notes:[{title:'Private',text:'Private',at:1,time:'00:01'}]}}));const previous=s.read();
  const r=request(s),created=s.createCharacter(r);
  assert.deepEqual(created.characterStats,r.manual.stats);assert.deepEqual(created.characterSheet,r.manual.sheet);
  assert.equal(created.state.hp,0);assert.equal(created.state.maxHp,21);assert.equal(created.state.tempHp,3);assert.equal(created.state.gold,0);
  assert.deepEqual(created.state.slots,{1:0,2:0,3:0});assert.equal(created.state.inspiration,0);assert.deepEqual(created.state.notes,[]);
  assert.deepEqual(s.inventory().entries,[]);assert.deepEqual(s.spellbook().entries,[]);
  assert.equal(s.history().filter(x=>x.mutationId===r.mutationId).length,1);
  s.selectContext(command(s,{context:first.context}));assert.deepEqual(s.read().state,previous.state);assert.equal(s.read().characterSheet,null);
  assert.equal(s.createCharacter(r).replayed,true);assert.equal(s.read().context.characterId,first.context.characterId);assert.equal(s.campaigns()[0].characters.length,2);
 }finally{s.close();}
});

test('manual payload rejects unknown, missing, invalid and non-2014 fields without side effects',()=>{
 const s=openStore(':memory:');try{const before=s.read();
  for(const alter of [r=>delete r.manual,r=>r.manual=null,r=>r.manual.extra=1,r=>delete r.manual.gold,r=>r.manual.hp=22,r=>r.manual.hp=-1,r=>r.manual.maxHp=0,r=>r.manual.tempHp=10000,r=>r.manual.gold=0.5,r=>r.manual.stats=null,r=>r.manual.stats.abilities.str=31,r=>r.manual.sheet=null,r=>r.manual.sheet.ruleset='5e-2024',r=>r.manual.sheet.level=0,r=>r.manual.sheet.counters[0].current=2,r=>r.template='bard5-demo']){
   const r=request(s);alter(r);assert.throws(()=>s.createCharacter(r),{status:422});assert.deepEqual(s.read(),before);
  }
  assert.equal(s.campaigns()[0].characters.length,1);
 }finally{s.close();}
});

test('stale revision, changed retry, wrong campaign and duplicate ID cannot partially create manual records',()=>{
 const s=openStore(':memory:');try{const r=request(s);assert.throws(()=>s.createCharacter({...r,campaignId:randomUUID()}),{status:409});s.createCharacter(r);const before=s.read();
  assert.throws(()=>s.createCharacter({...request(s),expectedRevision:0}),{status:409});
  assert.throws(()=>s.createCharacter({...r,manual:{...r.manual,gold:9}}),{status:409});
  assert.throws(()=>s.createCharacter({...request(s),characterId:r.characterId}),{status:409});
  assert.deepEqual(s.read(),before);assert.equal(s.campaigns()[0].characters.length,2);
 }finally{s.close();}
});

test('manual character, stats, sheet, selection and receipt roll back together at each write stage',()=>{
 const file=join(mkdtempSync(join(tmpdir(),'skaz-manual-create-')),'qa.sqlite'),s=openStore(file),db=new DatabaseSync(file);
 try{for(const table of ['character_stats','character_sheets','changes']){
  const before=s.read(),r=request(s);db.exec(`CREATE TRIGGER reject_create BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT,'injected creation failure'); END`);
  assert.throws(()=>s.createCharacter(r),/injected creation failure/);assert.deepEqual(s.read(),before);
  for(const target of ['character_stats','character_sheets'])assert.equal(db.prepare(`SELECT count(*) AS n FROM ${target}`).get().n,0);
  assert.equal(s.campaigns()[0].characters.length,1);db.exec('DROP TRIGGER reject_create');
 }}finally{db.close();s.close();}
});

test('manual creation receipt and explicit fields survive restart and v12 transfer',()=>{
 const file=join(mkdtempSync(join(tmpdir(),'skaz-manual-restart-')),'qa.sqlite');let s=openStore(file);const target=openStore(':memory:');
 try{const r=request(s);s.createCharacter(r);s.close();s=openStore(file);assert.equal(s.createCharacter(r).replayed,true);
  assert.throws(()=>s.exportActive(8),{status:409});const exported=s.exportActive(12);
  target.importActive(command(target,{destination:'new-campaign',file:exported}));
  assert.deepEqual(target.read().characterStats,r.manual.stats);assert.deepEqual(target.read().characterSheet,r.manual.sheet);assert.equal(target.read().state.tempHp,3);assert.equal(target.read().state.hp,0);assert.equal(target.read().state.gold,0);
 }finally{s.close();target.close();}
});

function users(s){const c=s.read().context;s.access.apply({action:'bootstrap-owner',userId:'qa-owner',displayName:'QA owner',campaignId:c.campaignId,characterId:c.characterId});s.access.apply({action:'create-user',userId:'qa-player',displayName:'QA player'});s.access.apply({action:'set-member',userId:'qa-player',campaignId:c.campaignId,role:'player'});s.access.apply({action:'grant-character',userId:'qa-player',campaignId:c.campaignId,characterId:c.characterId});return c;}
test('only campaign owner/gm may create and access grants are actor-specific; revoked replay denied',()=>{
 const s=openStore(':memory:');try{users(s);const owner=s.forUser('qa-owner','manual-owner',{write:true}),player=s.forUser('qa-player','manual-player',{write:true});
  assert.throws(()=>player.createCharacter(request(player)),{status:403});assert.throws(()=>s.forUser('qa-owner','manual-readonly').createCharacter(request(owner)),{status:403});
  const r=request(owner);owner.createCharacter(r);assert.equal(owner.createCharacter(r).replayed,true);
  assert.throws(()=>player.selectContext(command(player,{context:owner.read().context})),{status:404});
  s.access.apply({action:'revoke-character',userId:'qa-owner',campaignId:r.campaignId,characterId:r.characterId});assert.throws(()=>owner.createCharacter(r),{status:404});
 }finally{s.close();}
});

test('failed access grant audit rolls back manual payload and newly selected hero',()=>{
 const file=join(mkdtempSync(join(tmpdir(),'skaz-manual-access-')),'qa.sqlite'),s=openStore(file),db=new DatabaseSync(file);
 try{users(s);const owner=s.forUser('qa-owner','manual-rollback',{write:true}),before=owner.read();const r=request(owner);
  db.exec("CREATE TRIGGER reject_claim BEFORE INSERT ON access_audit WHEN NEW.action='claim-created' BEGIN SELECT RAISE(ABORT,'claim failed');END");
  assert.throws(()=>owner.createCharacter(r),/claim failed/);assert.deepEqual(owner.read(),before);assert.equal(s.campaigns()[0].characters.length,1);
  assert.equal(db.prepare('SELECT count(*) AS n FROM character_sheets').get().n,0);assert.equal(db.prepare('SELECT count(*) AS n FROM character_stats').get().n,0);
 }finally{db.close();s.close();}
});

test('manual API keeps origin/client guards and returns complete explicitly entered profile',async t=>{
 const s=openStore(':memory:'),app=createApp(s);await new Promise(r=>app.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>app.close(r));s.close();});
 const url=`http://127.0.0.1:${app.address().port}/api/characters`,r=request(s),body=JSON.stringify(r),headers={'Content-Type':'application/json','X-Skaz-Client':'local-v1'};
 assert.equal((await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body})).status,403);
 assert.equal((await fetch(url,{method:'POST',headers:{...headers,Origin:'https://foreign.invalid'},body})).status,403);
 const response=await fetch(url,{method:'POST',headers,body});assert.equal(response.status,200);const saved=await response.json();assert.deepEqual(saved.characterSheet,r.manual.sheet);assert.deepEqual(saved.characterStats,r.manual.stats);assert.equal(saved.state.gold,0);
 assert.equal((await fetch(url,{method:'POST',headers,body}).then(x=>x.json())).replayed,true);
});
