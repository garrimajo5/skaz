import {validateTransfer} from '../server/transfer.mjs';
import {gameArtPackage,validateGameArtPackage} from '../server/game-art-package.mjs';
import {personalArtTransfer} from '../server/personal-art-transfer.mjs';
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
  for(const alter of [r=>delete r.manual,r=>r.manual=null,r=>r.manual.extra=1,r=>delete r.manual.gold,r=>r.manual.hp=22,r=>r.manual.hp=-1,r=>r.manual.maxHp=0,r=>r.manual.tempHp=10000,r=>r.manual.gold=0.5,r=>r.manual.stats=null,r=>r.manual.stats.abilities.str=1.5,r=>r.manual.sheet=null,r=>r.manual.sheet.ruleset='5e-2024',r=>r.manual.sheet.level=0,r=>r.manual.sheet.counters[0].current=-1,r=>r.template='bard5-demo']){
   const r=request(s);alter(r);assert.throws(()=>s.createCharacter(r),{status:422});assert.deepEqual(s.read(),before);
  }
  assert.equal(s.campaigns()[0].characters.length,1);
 }finally{s.close();}
});

test('published manual-2014 and v15 preserve zero but still reject unknown scalar state',()=>{
 const source=openStore(':memory:'),target=openStore(':memory:');
 try{
  const before=source.read();
  for(const field of ['hp','maxHp','tempHp','gold','stats']){
   const invalid=request(source);
   invalid.manual[field]=null;
   assert.throws(()=>source.createCharacter(invalid),{status:422},field);
   assert.deepEqual(source.read(),before);
   assert.equal(source.campaigns()[0].characters.length,1);
   assert.equal(source.history().length,0);
  }
  const input=request(source);
  input.manual.maxHp=33;
  input.manual.tempHp=0;
  input.manual.stats.abilities.dex=31;
  input.manual.sheet.level=21;
  input.manual.sheet.counters[0]={id:'test-counter',name:'Боевой запас',current:8,max:7};
  source.createCharacter(input);
  assert.equal(source.createCharacter(input).replayed,true);
  assert.equal(source.history().filter(row=>row.mutationId===input.mutationId).length,1);
  const file=source.exportActive(15);
  assert.equal(file.schemaVersion,15);
  for(const field of ['hp','maxHp','tempHp','gold']){
   const invalid={...file,state:{...file.state,[field]:null}};
   assert.throws(()=>validateTransfer(invalid),{status:422},field);
  }
  target.importActive(command(target,{destination:'new-campaign',file}));
  const imported=target.read();
  assert.equal(imported.state.maxHp,33);
  for(const field of ['hp','tempHp','gold'])assert.equal(imported.state[field],0);
  assert.deepEqual(imported.characterStats,input.manual.stats);
  assert.deepEqual(imported.characterSheet,input.manual.sheet);
 }finally{source.close();target.close();}
});

test('v15 health keeps a known zero distinct from the legacy omission and rejects explicit unknown',()=>{
 const source=openStore(':memory:'),target=openStore(':memory:');
 try{
  const create=request(source);
  Object.assign(create.manual,{hp:12,tempHp:0});
  source.createCharacter(create);
  const known=source.exportActive(15);
  assert.equal(known.state.tempHp,0);
  const legacy=structuredClone(known);
  delete legacy.state.tempHp;

  const unknown=structuredClone(known);
  unknown.state.tempHp=null;
  const unchanged=target.read();
  assert.throws(()=>target.importActive(command(target,{destination:'new-campaign',file:unknown})),{status:422});
  assert.deepEqual(target.read(),unchanged);
  assert.equal(target.campaigns().length,1);

  for(const [file,expected] of [[known,0],[legacy,undefined]]){
   target.importActive(command(target,{destination:'new-campaign',file}));
   assert.equal(target.exportActive(15).state.tempHp,expected);
   const before=target.read();
   const damage=command(target,{
    context:before.context,delta:1,before:before.state.hp,maximum:before.state.maxHp,
    resource:{kind:'health',operation:'damage',temporaryBefore:0,concentrationBefore:null},
   });
   assert.throws(()=>target.changeResource({...damage,resource:{...damage.resource,temporaryBefore:null}}),{status:422});
   assert.deepEqual(target.read(),before);
   const result=target.changeResource(damage);
   assert.equal(result.state.hp,11);
   assert.equal(result.state.tempHp,0);
   assert.equal(target.changeResource(damage).replayed,true);
   assert.equal(target.history().filter(row=>row.mutationId===damage.mutationId).length,1);
  }
 }finally{source.close();target.close();}
});

test('v15 keeps a zero counter and refuses unknown level or counters atomically',()=>{
 const source=openStore(':memory:'),target=openStore(':memory:');
 try{
  source.createCharacter(request(source));
  const file=source.exportActive(15),before=target.read();
  const invalidCases=[
   sheet=>{sheet.level=null;},
   sheet=>{delete sheet.level;},
   sheet=>{sheet.counters=null;},
   sheet=>{sheet.counters[0].current=null;},
   sheet=>{sheet.counters[0].max=null;},
  ];
  for(const alter of invalidCases){
   const invalid=structuredClone(file);
   alter(invalid.characterSheet);
   assert.throws(()=>target.importActive(command(target,{destination:'new-campaign',file:invalid})),{status:422});
   assert.deepEqual(target.read(),before);
   assert.equal(target.campaigns().length,1);
  }
  target.importActive(command(target,{destination:'new-campaign',file}));
  const selected=target.read(),counter=selected.characterSheet.counters[0];
  assert.equal(counter.current,0);
  const spend=command(target,{characterId:selected.context.characterId,counterId:counter.id,delta:-1});
  assert.throws(()=>target.changeCharacterCounter(spend),{status:409});
  assert.deepEqual(target.read(),selected);
  const recovered=target.changeCharacterCounter({...spend,mutationId:randomUUID(),delta:1});
  assert.equal(recovered.characterSheet.counters[0].current,1);
  const {context, state}=target.read();
  assert.throws(()=>target.changeResource(command(target,{
   context,resource:{kind:'slot',level:1},delta:1,before:state.slots[1],maximum:4,
  })),{status:409});

  const empty=structuredClone(file);
  empty.characterSheet.counters=[];
  target.importActive(command(target,{destination:'new-campaign',file:empty}));
  assert.deepEqual(target.read().characterSheet.counters,[]);
  assert.deepEqual(target.exportActive(15).characterSheet.counters,[]);
 }finally{source.close();target.close();}
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


test('manual deviations remain advisory through creation, restart, acknowledgement, spending and undo',()=>{
 const file=join(mkdtempSync(join(tmpdir(),'skaz-advisory-')),'qa.sqlite');let s=openStore(file);
 try{
  const r=request(s);r.manual.stats.abilities.dex=31;r.manual.sheet.level=21;
  r.manual.sheet.counters[0].current=8;r.manual.sheet.counters[0].max=7;
  s.createCharacter(r);assert.equal(s.read().profileRuleWarnings.length,3);
  assert.ok(s.read().profileRuleWarnings.every(w=>w.blocking===false&&!w.acknowledged));
  assert.equal(s.createCharacter(r).replayed,true);
  const sheet=s.read().characterSheet;
  sheet.ruleAcknowledgements=s.read().profileRuleWarnings.filter(w=>!w.key.startsWith('ability:')).map(({key,facts})=>({key,facts,note:'Synthetic agreement'}));
  s.saveCharacterSheet(command(s,{characterId:r.characterId,sheet}));
  s.close();s=openStore(file);
  assert.equal(s.read().characterStats.abilities.dex,31);
  assert.equal(s.read().profileRuleWarnings.filter(w=>w.acknowledged).length,2);
  const spend=command(s,{context:s.read().context,resource:{kind:'counter',counterId:'second-wind-test'},delta:-1,before:8,maximum:7});
  s.changeResource(spend);assert.equal(s.read().characterSheet.counters[0].current,7);
  assert.equal(s.changeResource(spend).replayed,true);
  assert.equal(s.read().profileRuleWarnings.length,2);
  s.undoResource(command(s,{targetMutationId:spend.mutationId,characterId:s.read().context.characterId}));
  assert.equal(s.read().characterSheet.counters[0].current,8);
  assert.equal(s.read().profileRuleWarnings.find(w=>w.key.startsWith('counter:')).acknowledged,false);
  const before=s.read();
  assert.throws(()=>s.changeResource(command(s,{context:before.context,resource:{kind:'counter',counterId:'second-wind-test'},delta:-9,before:8,maximum:7})),{status:409});
  assert.deepEqual(s.read(),before);
 }finally{s.close();}
});


test('v15 preserves deviations and exact agreements; old formats fail instead of silently downgrading',()=>{
 const source=openStore(':memory:'),target=openStore(':memory:');
 try{
  const r=request(source);r.manual.stats.abilities.dex=31;r.manual.sheet.level=21;r.manual.sheet.counters[0].current=8;r.manual.sheet.counters[0].max=7;
  source.createCharacter(r);const stats=source.read().characterStats;
  stats.ruleAcknowledgements=source.read().profileRuleWarnings.filter(w=>w.key.startsWith('ability:')).map(({key,facts})=>({key,facts,note:'Synthetic agreement'}));
  source.saveCharacterStats(command(source,{characterId:r.characterId,stats}));
  for(const version of [8,9,12,13,14])assert.throws(()=>source.exportActive(version),{status:409});
  const file=source.exportActive(15);assert.equal(file.schemaVersion,15);
  assert.throws(()=>validateTransfer({...file,schemaVersion:14}),{status:422});
  const wrapped=gameArtPackage(file,personalArtTransfer([]));assert.equal(wrapped.schemaVersion,4);
  assert.deepEqual(validateGameArtPackage(wrapped).game.characterStats,stats);
  target.importActive(command(target,{destination:'new-campaign',file}));
  assert.deepEqual(target.read().characterStats,stats);assert.deepEqual(target.read().characterSheet,source.read().characterSheet);
  assert.deepEqual(target.read().profileRuleWarnings,source.read().profileRuleWarnings);
 }finally{source.close();target.close();}
});


test('agreement scopes and legacy edits cannot discard another field agreement',()=>{
 const s=openStore(':memory:');try{
  const r=request(s);r.manual.stats.abilities.dex=31;r.manual.sheet.level=21;s.createCharacter(r);
  const [ability,level]=s.read().profileRuleWarnings;
  const stats=s.read().characterStats;stats.ruleAcknowledgements=[{key:ability.key,facts:ability.facts,note:'Synthetic'}];
  s.saveCharacterStats(command(s,{characterId:r.characterId,stats}));
  const before=s.read(),without=structuredClone(stats);delete without.ruleAcknowledgements;
  assert.throws(()=>s.saveCharacterStats(command(s,{characterId:r.characterId,stats:{...stats,ruleAcknowledgements:null}})),{status:422});
  assert.throws(()=>s.saveCharacterStats(command(s,{characterId:r.characterId,stats:without})),{status:409});
  assert.throws(()=>s.saveCharacterStats(command(s,{characterId:r.characterId,stats:{...stats,ruleAcknowledgements:[{key:level.key,facts:level.facts,note:''}]}})),{status:422});
  assert.deepEqual(s.read(),before);
  const sheet=s.read().characterSheet;sheet.ruleAcknowledgements=[{key:level.key,facts:level.facts,note:''}];
  s.saveCharacterSheet(command(s,{characterId:r.characterId,sheet}));
  const oldSheet=structuredClone(sheet);delete oldSheet.ruleAcknowledgements;
  assert.throws(()=>s.saveCharacterSheet(command(s,{characterId:r.characterId,sheet:oldSheet})),{status:409});
  stats.ruleAcknowledgements=[];s.saveCharacterStats(command(s,{characterId:r.characterId,stats}));
  assert.equal(s.read().characterStats.abilities.dex,31);assert.equal(s.read().profileRuleWarnings.find(w=>w.key===ability.key).acknowledged,false);
 }finally{s.close();}
});

test('v15 API exports advisory fields without enabling advancement or weakening Origin guard',async t=>{
 const s=openStore(':memory:'),app=createApp(s);await new Promise(r=>app.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>app.close(r));s.close();});
 const r=request(s);r.manual.sheet.level=21;s.createCharacter(r);
 const url=`http://127.0.0.1:${app.address().port}/api/export/active-v15`;
 const response=await fetch(url);assert.equal(response.status,200);
 const file=await response.json();assert.equal(file.schemaVersion,15);assert.equal(file.characterSheet.level,21);assert.equal(file.advancement,null);
 assert.equal((await fetch(url,{headers:{Origin:'https://foreign.invalid'}})).status,403);
 assert.equal((await fetch(url.replace('v15','v14'))).status,409);
});
