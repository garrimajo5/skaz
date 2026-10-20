import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openStore } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';
import { seed } from '../server/state.mjs';

const command=(view,fields)=>({mutationId:randomUUID(),expectedRevision:view.read().revision,...fields});
const userA='user-alice',userB='user-boris',userGM='user-master';
const note=text=>({title:text,text,kind:'Личная заметка',at:1,time:'00:01'});
function setup(t,file=':memory:') {
  const store=openStore(file); t.after(()=>store.close());
  const a=store.forView('fixture-alice'), b=store.forView('fixture-boris');
  const first=a.read().context;
  a.update(command(a,{label:'Secret Alice label',state:{...a.read().state,notes:[note('ALICE_PRIVATE')]}}));
  b.createCharacter(command(b,{campaignId:first.campaignId,characterId:randomUUID(),template:'bard5-demo',profile:{name:'Boris hero',tagline:''}}));
  b.update(command(b,{label:'Secret Boris label',state:{...b.read().state,notes:[note('BORIS_PRIVATE')],hp:7}}));
  const second=b.read().context;
  store.createCampaign(command(store,{state:{...structuredClone(seed),profile:{name:'Hidden hero',tagline:'',campaign:'HIDDEN_CAMPAIGN'},notes:[note('HIDDEN_PRIVATE')]}}));
  const hidden=store.read().context;
  store.access.apply({action:'bootstrap-owner',userId:userA,displayName:'Alice',campaignId:first.campaignId,characterId:first.characterId});
  for (const [userId,displayName,role] of [[userB,'Boris','player'],[userGM,'Master','gm']]) {
    store.access.apply({action:'create-user',userId,displayName});
    store.access.apply({action:'set-member',userId,campaignId:first.campaignId,role});
  }
  store.access.apply({action:'grant-character',userId:userB,campaignId:first.campaignId,characterId:second.characterId});
  return {store,a,b,first,second,hidden};
}

test('player corrects all personal balances atomically without altering shared state or another hero',t=>{
 const {store}=setup(t),player=store.forUser(userB,'resource-window',{write:true}),owner=store.forUser(userA,'resource-window');
 const before=player.read(),other=owner.read(),state={...before.state,hp:0,maxHp:40,gold:0,inspiration:0,slots:{1:0,2:0,3:0}};
 const request=command(player,{label:'Ручная корректировка ресурсов',state}),saved=player.update(request);
 assert.equal(saved.state.gold,0);assert.equal(saved.state.hp,0);assert.deepEqual(saved.state.slots,{1:0,2:0,3:0});assert.deepEqual(saved.state.notes,before.state.notes);assert.deepEqual(saved.state.journal,before.state.journal);assert.deepEqual(owner.read().state,other.state);
 assert.deepEqual(player.update(request),{...saved,replayed:true});
 const version=player.read().revision;assert.throws(()=>player.update(command(player,{label:'Invalid slots',state:{...state,slots:{1:5,2:0,3:0}}})),{status:422});assert.equal(player.read().revision,version);assert.deepEqual(player.read().state,saved.state);
});

test('manual statistics obey explicit hero grants, read-only mode, revocation and actor audit rollback',t=>{
 const file=join(mkdtempSync(join(tmpdir(),'skaz-user-stats-')),'db.sqlite'),{store,first,second}=setup(t,file),player=store.forUser(userB,'stats-window',{write:true}),owner=store.forUser(userA,'stats-window');
 const value={abilities:{str:10,dex:12,con:14,int:16,wis:18,cha:20},armorClass:15,initiative:1,speed:25},request=command(player,{characterId:second.characterId,stats:value});
 player.saveCharacterStats(request);assert.deepEqual(player.read().characterStats,value);assert.equal(owner.read().characterStats,null);
 assert.throws(()=>player.saveCharacterStats(command(player,{characterId:first.characterId,stats:value})),{status:409});assert.throws(()=>store.forUser(userB,'read-stats').saveCharacterStats(request),{status:403});
 store.access.apply({action:'revoke-character',userId:userB,campaignId:first.campaignId,characterId:second.characterId});assert.throws(()=>player.saveCharacterStats(request),{status:404});
 const db=new DatabaseSync(file);t.after(()=>db.close());const writer=store.forUser(userA,'stats-audit',{write:true}),before=writer.read();db.exec("CREATE TRIGGER fail_user_stats BEFORE INSERT ON user_changes BEGIN SELECT RAISE(ABORT,'audit failed');END");assert.throws(()=>writer.saveCharacterStats(command(writer,{characterId:first.characterId,stats:value})));assert.deepEqual(writer.read(),before);
 assert.equal(db.prepare('SELECT count(*) AS n FROM character_stats WHERE character_id=?').get(first.characterId).n,0);
});

test('v8 personal import claims manual stats atomically and failed ownership audit leaves no orphan sheet',t=>{
 const file=join(mkdtempSync(join(tmpdir(),'skaz-stats-import-')),'db.sqlite'),{store}=setup(t,file),owner=store.forUser(userA,'stats-import',{write:true});
 const value={abilities:{str:10,dex:12,con:14,int:16,wis:18,cha:20},armorClass:15,initiative:1,speed:25};owner.saveCharacterStats(command(owner,{characterId:owner.read().context.characterId,stats:value}));
 const before=owner.read(),exported=owner.exportActive(8),request=command(owner,{destination:'new-campaign',file:exported}),db=new DatabaseSync(file);t.after(()=>db.close());const count=table=>db.prepare('SELECT count(*) AS n FROM '+table).get().n,counts=['campaigns','characters','character_stats'].map(count);
 db.exec("CREATE TRIGGER fail_stats_claim BEFORE INSERT ON access_audit WHEN NEW.action='claim-created' BEGIN SELECT RAISE(ABORT,'claim audit failed');END");assert.throws(()=>owner.importActive(request));assert.deepEqual(owner.read(),before);assert.deepEqual(['campaigns','characters','character_stats'].map(count),counts);
 db.exec('DROP TRIGGER fail_stats_claim');const saved=owner.importActive(request);assert.notEqual(saved.context.characterId,before.context.characterId);assert.deepEqual(saved.characterStats,value);assert.equal(owner.importActive(request).replayed,true);assert.equal(store.access.membership(userA,saved.context.campaignId),'owner');assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
});

test('manual class and counters stay private to granted heroes and revocation blocks captured writes and replay',t=>{
 const {store,first,second}=setup(t),player=store.forUser(userB,'own-sheet',{write:true}),owner=store.forUser(userA,'own-sheet'),sheet={ruleset:'5e-2014',ancestry:'Человек',className:'Воин',subclass:'',level:1,counters:[{id:'counter-second-wind',name:'Второе дыхание',current:1,max:1}]};
 const request=command(player,{characterId:second.characterId,sheet});player.saveCharacterSheet(request);assert.deepEqual(player.read().characterSheet,sheet);assert.equal(owner.read().characterSheet,null);assert.deepEqual(player.exportActive(9).characterSheet,sheet);
  const spend=command(player,{characterId:second.characterId,counterId:'counter-second-wind',delta:-1});player.changeCharacterCounter(spend);assert.equal(player.read().characterSheet.counters[0].current,0);assert.equal(owner.read().characterSheet,null);
  assert.throws(()=>player.changeCharacterCounter(command(player,{characterId:first.characterId,counterId:'counter-second-wind',delta:1})),{status:409});assert.throws(()=>store.forUser(userB,'readonly-counter').changeCharacterCounter(spend),{status:403});
  assert.throws(()=>player.saveCharacterSheet(command(player,{characterId:first.characterId,sheet})),{status:409});assert.throws(()=>store.forUser(userB,'readonly-sheet').saveCharacterSheet(request),{status:403});store.access.apply({action:'revoke-character',userId:userB,campaignId:first.campaignId,characterId:second.characterId});assert.throws(()=>player.saveCharacterSheet(request),{status:404});assert.throws(()=>player.changeCharacterCounter(spend),{status:404});
});

test('v9 ownership failure rolls back the imported manual class and statistics together',t=>{
 const file=join(mkdtempSync(join(tmpdir(),'skaz-v9-import-')),'db.sqlite'),{store}=setup(t,file),owner=store.forUser(userA,'sheet-import',{write:true});
 const sheet={ruleset:'5e-2014',ancestry:'',className:'Волшебник',subclass:'',level:17,counters:[{id:'counter-ninth-level',name:'Ячейки 9 круга',current:1,max:1}]};owner.saveCharacterSheet(command(owner,{characterId:owner.read().context.characterId,sheet}));
 const before=owner.read(),request=command(owner,{destination:'new-campaign',file:owner.exportActive(9)}),db=new DatabaseSync(file);t.after(()=>db.close());const counts=()=>['campaigns','characters','character_sheets','character_stats'].map(table=>db.prepare('SELECT count(*) AS n FROM '+table).get().n),initial=counts();
 db.exec("CREATE TRIGGER fail_sheet_claim BEFORE INSERT ON access_audit WHEN NEW.action='claim-created' BEGIN SELECT RAISE(ABORT,'claim failed');END");assert.throws(()=>owner.importActive(request));assert.deepEqual(owner.read(),before);assert.deepEqual(counts(),initial);db.exec('DROP TRIGGER fail_sheet_claim');
 const saved=owner.importActive(request);assert.deepEqual(saved.characterSheet,sheet);assert.equal(saved.characterStats,null);assert.equal(store.access.membership(userA,saved.context.campaignId),'owner');assert.equal(owner.importActive(request).replayed,true);assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
});

test('grants choose only authorized heroes and identical client view IDs never share a user context',t=>{
  const {store,first,second}=setup(t);
  const a=store.forUser(userA,'same-window'), b=store.forUser(userB,'same-window');
  assert.deepEqual(a.read().context,first);assert.deepEqual(b.read().context,second);
  assert.equal(a.read().state.notes[0].text,'ALICE_PRIVATE');assert.equal(b.read().state.notes[0].text,'BORIS_PRIVATE');
  assert.equal(b.read().state.hp,7);
  const campaigns=a.campaigns();assert.equal(campaigns.length,1);assert.equal(campaigns[0].characters.length,1);
  assert.equal(campaigns[0].characters[0].id,first.characterId);
  assert.ok(!JSON.stringify(campaigns).includes('Hidden'));
  // An owner or GM receives no implicit permission to personal sheets.
  assert.throws(()=>store.forUser(userGM,'same-window'),{status:404});
  assert.throws(()=>store.access.character(userA,first.campaignId,second.characterId),{status:404});
});

test('user creation and grants validate structure and cannot cross campaign relations',t=>{
  const {store,first,hidden}=setup(t);
  for (const request of [null,{}, {action:'create-user',userId:'bad',displayName:'x'},
    {action:'create-user',userId:'new-user-1',displayName:' ',password:'secret'},
    {action:'set-member',userId:userB,campaignId:first.campaignId,role:'admin'},
    {action:'set-enabled',userId:userB,enabled:1}]) assert.throws(()=>store.access.apply(request),{status:422});
  assert.throws(()=>store.access.apply({action:'grant-character',userId:userB,campaignId:first.campaignId,characterId:hidden.characterId}),{status:404});
  assert.throws(()=>store.access.apply({action:'grant-character',userId:userB,campaignId:hidden.campaignId,characterId:hidden.characterId}),{status:404});
  assert.throws(()=>store.access.apply({action:'bootstrap-owner',userId:'new-owner',displayName:'New',campaignId:first.campaignId,characterId:hidden.characterId}),{status:404});
  assert.throws(()=>store.access.user('new-owner'),{status:404});
  assert.throws(()=>store.forUser('unknown-user','window-one'),{status:404});
  assert.throws(()=>store.forUser(userA,'../invalid'),{status:422});
});

test('last active owner cannot be removed, demoted or disabled; another owner permits transition',t=>{
  const {store,first}=setup(t);
  for (const request of [
    {action:'remove-member',userId:userA,campaignId:first.campaignId},
    {action:'set-member',userId:userA,campaignId:first.campaignId,role:'player'},
    {action:'set-enabled',userId:userA,enabled:false},
  ]) assert.throws(()=>store.access.apply(request),{status:409});
  store.access.apply({action:'set-member',userId:userB,campaignId:first.campaignId,role:'owner'});
  store.access.apply({action:'set-enabled',userId:userA,enabled:false});
  assert.throws(()=>store.forUser(userA,'window-one'),{status:404});
  assert.equal(store.access.membership(userB,first.campaignId),'owner');
  assert.throws(()=>store.access.apply({action:'set-enabled',userId:userB,enabled:false}),{status:409});
});

test('revocation applies to captured readers and never silently retargets their saved window',t=>{
  const {store,first,second}=setup(t), reader=store.forUser(userB,'window-one');
  store.access.apply({action:'revoke-character',userId:userB,campaignId:first.campaignId,characterId:second.characterId});
  for (const call of [()=>reader.read(),()=>reader.context(),()=>reader.campaigns(),()=>reader.inventory(),()=>reader.proposals(),()=>reader.exportActive(),()=>reader.catalog.coverage(),()=>reader.sessionReview(first.sessionId)]) assert.throws(call,{status:404});
  store.access.apply({action:'grant-character',userId:userB,campaignId:first.campaignId,characterId:first.characterId});
  assert.throws(()=>store.forUser(userB,'window-one'),{status:404});
  assert.equal(store.forUser(userB,'new-window').read().context.characterId,first.characterId);
  store.access.apply({action:'remove-member',userId:userB,campaignId:first.campaignId});
  assert.throws(()=>store.forUser(userB,'new-window'),{status:404});
  // Rejoining must not revive character grants deleted with membership.
  store.access.apply({action:'set-member',userId:userB,campaignId:first.campaignId,role:'player'});
  assert.throws(()=>store.forUser(userB,'third-window'),{status:404});
});

test('read-only capabilities reject all writes, global history, backup and access to a raw store',t=>{
  const {store}=setup(t), reader=store.forUser(userA,'window-one'), before=store.read();
  const methods=['update','createCampaign','selectContext','startSession','createCharacter','importActive','createProposal','decideProposal','savePlace','saveQuest','setSpell','changeCharges','addInventory','removeInventory','undoInventory','history','backup','close','forView','forUser'];
  for (const method of methods) assert.throws(()=>reader[method]({}),{status:403},method);
  for (const method of ['importEntries','reviewedImport','previewBundled','installBundled']) assert.throws(()=>reader.catalog[method]({}),{status:403},method);
  assert.equal(reader.access,undefined);assert.equal(reader.inventory().undo,null);
  assert.deepEqual(store.read(),before);
});

test('archives and every supported export include only granted personal data and shared story',t=>{
  const {store,a,first,hidden}=setup(t);
  a.update(command(a,{label:'Shared story',state:{...a.read().state,journal:[note('SHARED_STORY')]}}));
  const reader=store.forUser(userA,'window-one');
  for (let version=2;version<=7;version++) {
    const output=reader.exportActive(version), text=JSON.stringify(output);
    assert.ok(text.includes('ALICE_PRIVATE'));assert.ok(text.includes('SHARED_STORY'));
    assert.ok(!text.includes('BORIS_PRIVATE'));assert.ok(!text.includes('HIDDEN_PRIVATE'));
  }
  assert.throws(()=>reader.sessions(hidden.campaignId),{status:404});
  assert.throws(()=>reader.session(hidden.sessionId),{status:404});
  assert.throws(()=>reader.sessionReview(hidden.sessionId),{status:404});
  a.startSession(command(a,{session:{name:'Next',playedOn:'2026-10-20'}}));
  assert.notEqual(reader.read().context.sessionId,first.sessionId);
  assert.ok(JSON.stringify(reader.session(first.sessionId)).includes('SHARED_STORY'));
  assert.ok(!JSON.stringify(reader.sessionReview(first.sessionId)).includes('BORIS_PRIVATE'));
});

test('catalog sharing is exact bundled content, not a license flag; private imports and links stay hidden',t=>{
  const {store,a}=setup(t);
  const p=store.catalog.previewBundled();store.catalog.installBundled({version:p.version});
  const base=JSON.parse(readFileSync(new URL('../catalog/srd51-items.json',import.meta.url),'utf8')).entries[0];
  const privateCard={...base,id:'personal:hidden-item',name:{ru:'СЕКРЕТНЫЙ ПРЕДМЕТ',en:'SECRET_ITEM'},text:'PRIVATE_ITEM_DESCRIPTION',links:[]};
  // Deliberately retains CC BY license metadata: license is not visibility.
  store.catalog.importEntries({schemaVersion:1,entries:[privateCard]},{apply:true});
  const reader=store.forUser(userA,'window-one');
  assert.equal(store.catalog.coverage().total,535);assert.equal(reader.catalog.coverage().total,534);
  assert.equal(reader.catalog.search(new URLSearchParams({q:'SECRET_ITEM'})).total,0);
  assert.throws(()=>reader.catalog.lookup(new URLSearchParams({id:privateCard.id})),{status:404});
  assert.equal(reader.catalog.search(new URLSearchParams({kind:'monster'})).total,112);
  assert.deepEqual(Object.values(reader.catalog.coverage().scopes.srd51CreatureTypes).map(s=>[s.expected,s.prepared,s.installed]),[[6,6,6],[6,6,6],[9,9,9]]);
  a.addInventory(command(a,{characterId:a.read().context.characterId,catalogId:privateCard.id,quantity:1}));
  assert.equal(reader.inventory().entries[0].entry.text,'PRIVATE_ITEM_DESCRIPTION');
  assert.throws(()=>reader.exportActive(),{status:403});
});

test('challenge ranges never count or return a private monster retained under an open license',t=>{
 const {store}=setup(t),p=store.catalog.previewBundled();store.catalog.installBundled({version:p.version});const base=JSON.parse(readFileSync(new URL('../catalog/srd51-forest.json',import.meta.url),'utf8')).entries.find(e=>e.name.en==='Sprite'),privateCard={...structuredClone(base),id:'personal:hidden-range-monster',name:{ru:'Личный монстр диапазона',en:'HIDDEN_RANGE_MONSTER'},links:[]};store.catalog.importEntries({schemaVersion:1,entries:[privateCard]},{apply:true});const reader=store.forUser(userB,'private-range-window'),params=new URLSearchParams({kind:'monster',challengeMin:'0',challengeMax:'30',limit:'100'}),raw=store.catalog.search(params),scoped=reader.catalog.search(params);
 assert.deepEqual(Object.values(reader.catalog.coverage().scopes.srd51CreatureTypes).map(s=>s.installed),[6,6,9]);assert.equal(raw.total,113);assert.equal(scoped.total,112);assert.equal(scoped.entries.some(e=>e.id===privateCard.id),false);assert.equal(reader.catalog.search(new URLSearchParams({kind:'monster',challengeMin:'1/8',challengeMax:'1/2',q:'HIDDEN_RANGE_MONSTER'})).total,0);assert.equal(store.catalog.search(new URLSearchParams({kind:'monster',challengeMin:'1/8',challengeMax:'1/2',q:'HIDDEN_RANGE_MONSTER'})).total,1);
});

test('membership migration persists, remains in full backup and leaves existing game state intact',async t=>{
  const folder=mkdtempSync(join(tmpdir(),'skaz-access-')),file=join(folder,'test.sqlite'),copy=join(folder,'copy.sqlite');
  const {store,first}=setup(t,file),before=store.read();
  store.forUser(userA,'window-one'); await store.backup(copy);
  const restored=openStore(copy);t.after(()=>restored.close());
  assert.deepEqual(restored.read(),before);
  assert.deepEqual(restored.forUser(userA,'window-one').read().context,first);
  const db=new DatabaseSync(copy);t.after(()=>db.close());
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  assert.equal(db.prepare('SELECT count(*) AS n FROM access_users').get().n,3);
});

test('HTTP individual reader never falls back to unrestricted API or trusts user ID headers',async t=>{
  const {store,hidden}=setup(t);
  // Test-only authentication adapter; production index does not enable this mode.
  const app=createApp(store,{authenticate:request=>request.headers.authorization==='Bearer test-alice'?userA:null});
  await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>app.close(resolve)));
  const base='http://127.0.0.1:'+app.address().port;
  for (const route of ['/api/workspace','/api/history','/api/catalog','/api/export/active-v7','/api/context','/api/health']) {
    const response=await fetch(base+route,{headers:{'X-Skaz-User':userA,'X-Skaz-View':'window-one'}});
    assert.equal(response.status,401);await response.body.cancel();
  }
  const headers={Authorization:'Bearer test-alice','X-Skaz-View':'window-one'};
  const current=await (await fetch(base+'/api/workspace',{headers})).json();
  assert.equal(current.state.notes[0].text,'ALICE_PRIVATE');
  for (const route of ['/api/sessions/'+hidden.sessionId,'/api/campaigns/'+hidden.campaignId+'/sessions']) {
    const r=await fetch(base+route,{headers});assert.equal(r.status,404);await r.body.cancel();
  }
  for (const route of ['/api/context/select','/api/import/active','/api/catalog/bundled']) {
    const r=await fetch(base+route,{method:'POST',headers:{...headers,'X-Skaz-Client':'local-v1','Content-Type':'application/json'},body:'{}'});
    assert.equal(r.status,403);await r.body.cancel();
  }
  const foreign=await fetch(base+'/api/workspace',{headers:{...headers,Origin:'https://other.invalid'}});assert.equal(foreign.status,403);await foreign.body.cancel();
  store.access.apply({action:'set-enabled',userId:userA,enabled:true});
  store.access.apply({action:'revoke-character',userId:userA,campaignId:current.context.campaignId,characterId:current.context.characterId});
  const denied=await fetch(base+'/api/workspace',{headers});assert.equal(denied.status,404);await denied.body.cancel();
});

test('opt-in writer changes own resources but player cannot overwrite common state or another hero',t=>{
  const {store,first,second}=setup(t),writer=store.forUser(userB,'write-window',{write:true});
  const before=writer.read();
  const change=command(writer,{label:'My HP',state:{...before.state,hp:4}});
  assert.equal(writer.update(change).state.hp,4);assert.equal(writer.update(change).replayed,true);
  for (const state of [
    {...writer.read().state,journal:[note('FORBIDDEN_SHARED')]},
    {...writer.read().state,profile:{...writer.read().state.profile,campaign:'FORBIDDEN_RENAME'}},
  ]) assert.throws(()=>writer.update(command(writer,{label:'Forbidden',state})),{status:403});
  assert.throws(()=>writer.selectContext(command(writer,{context:first})),{status:404});
  assert.throws(()=>writer.startSession(command(writer,{session:{name:'Forbidden',playedOn:'2026-10-20'}})),{status:403});
  assert.equal(writer.read().context.characterId,second.characterId);
  assert.deepEqual(writer.history().map(r=>r.label),['My HP']);
  assert.ok(!JSON.stringify(writer.history()).includes('Alice'));
});

test('creation and ownership commit together; replay after revoked original access is denied',t=>{
  const {store,first}=setup(t),writer=store.forUser(userA,'write-window',{write:true});
  const request=command(writer,{state:{...structuredClone(seed),profile:{name:'My new hero',tagline:'',campaign:'My new game'}}});
  const created=writer.createCampaign(request);
  assert.equal(store.access.membership(userA,created.context.campaignId),'owner');
  assert.equal(writer.createCampaign(request).replayed,true);
  assert.equal(writer.campaigns().length,2);
  writer.selectContext(command(writer,{context:first}));
  assert.equal(writer.createCampaign(request).replayed,true);
  assert.deepEqual(writer.read().context,first);
  store.access.apply({action:'revoke-character',userId:userA,campaignId:created.context.campaignId,characterId:created.context.characterId});
  assert.throws(()=>writer.createCampaign(request),{status:404});
  assert.equal(store.campaigns().length,3);
});

test('writer creates personal proposals, masters change shared state, demotion rechecks a replay',t=>{
  const {store,first}=setup(t),player=store.forUser(userB,'player-window',{write:true}),owner=store.forUser(userA,'owner-window',{write:true});
  const proposal=command(player,{...player.read().context,proposalId:randomUUID(),source:{kind:'manual-text',speaker:'',text:'Private source',offsetMs:0},suggestion:{kind:'personal-note',title:'Private',text:'My detail'}});
  player.createProposal(proposal);
  player.decideProposal(command(player,{proposalId:proposal.proposalId,decision:'accept',content:{title:'Private',text:'My detail'}}));
  assert.equal(player.read().state.notes[0].text,'My detail');
  assert.ok(!JSON.stringify(owner.proposals()).includes('Private source'));
  assert.throws(()=>player.createProposal(command(player,{...proposal,mutationId:randomUUID(),expectedRevision:player.read().revision,proposalId:randomUUID(),suggestion:{kind:'journal',title:'Shared',text:'Shared'}})),{status:403});
  const shared=command(owner,{label:'Shared checked',state:{...owner.read().state,journal:[note('SHARED_ALLOWED')]}});
  owner.update(shared);assert.equal(player.read().state.journal[0].text,'SHARED_ALLOWED');
  store.access.apply({action:'set-member',userId:userB,campaignId:first.campaignId,role:'owner'});
  store.access.apply({action:'set-member',userId:userA,campaignId:first.campaignId,role:'player'});
  assert.throws(()=>owner.update(shared),{status:403});
});

test('writer changes inventory and spellbook only through permitted catalog entries',t=>{
  const {store,second,first}=setup(t),writer=store.forUser(userB,'write-window',{write:true});
  const p=store.catalog.previewBundled();store.catalog.installBundled({version:p.version});
  const item=store.catalog.search(new URLSearchParams({kind:'item'})).entries[0];
  const request=command(writer,{characterId:second.characterId,catalogId:item.id,quantity:1});
  writer.addInventory(request);assert.equal(writer.addInventory(request).replayed,true);
  assert.equal(writer.inventory().entries.length,1);
  assert.throws(()=>writer.addInventory(command(writer,{...request,mutationId:randomUUID(),expectedRevision:writer.read().revision,characterId:first.characterId})),{status:409});
  const spell=store.catalog.search(new URLSearchParams({kind:'spell'})).entries[0];
  writer.setSpell(command(writer,{characterId:second.characterId,catalogId:spell.id,status:'known'}));
  assert.equal(writer.spellbook().entries[0].catalogId,spell.id);
  const file=writer.exportActive(7), imported=writer.importActive(command(writer,{destination:'new-campaign',file}));
  assert.equal(store.access.membership(userB,imported.context.campaignId),'owner');
  assert.equal(writer.spellbook().entries.length,1);
  assert.equal(writer.inventory().entries.length,1);
});

test('failed actor audit rolls back new game, grants, selection and global revision',t=>{
  const file=join(mkdtempSync(join(tmpdir(),'skaz-access-')),'rollback.sqlite');
  const {store}=setup(t,file),writer=store.forUser(userA,'write-window',{write:true}),before=writer.read();
  const db=new DatabaseSync(file);t.after(()=>db.close());
  const counts=()=>['campaigns','characters','sessions','campaign_memberships','character_access','access_audit','user_changes'].map(table=>db.prepare('SELECT count(*) AS n FROM '+table).get().n);
  const initial=counts();
  db.exec("CREATE TRIGGER fail_actor BEFORE INSERT ON user_changes BEGIN SELECT RAISE(ABORT,'injected actor audit failure'); END");
  assert.throws(()=>writer.createCampaign(command(writer,{state:structuredClone(seed)})),/injected actor audit/);
  assert.deepEqual(writer.read(),before);assert.deepEqual(counts(),initial);
});

test('write mode requires an explicit boolean and disabled identities lose existing capabilities',t=>{
  const {store}=setup(t);
  for (const write of ['false',1,{},null]) assert.throws(()=>store.forUser(userB,'write-window',{write}),{status:422});
  const writer=store.forUser(userB,'write-window',{write:true}),request=command(writer,{label:'Health',state:{...writer.read().state,hp:6}});
  store.access.apply({action:'set-enabled',userId:userB,enabled:false});
  for (const action of [()=>writer.read(),()=>writer.history(),()=>writer.update(request)]) assert.throws(action,{status:404});
});

test('access migration rejects future schema without rewriting game or assigning owners',t=>{
  const file=join(mkdtempSync(join(tmpdir(),'skaz-access-schema-')),'game.sqlite');
  const store=openStore(file),before=store.read();store.close();
  const db=new DatabaseSync(file);
  assert.equal(db.prepare('SELECT count(*) AS n FROM access_users').get().n,0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM campaign_memberships').get().n,0);
  db.exec('UPDATE access_schema SET version=99');db.close();
  assert.throws(()=>openStore(file),/Неподдерживаемая версия/);
  const repaired=new DatabaseSync(file);
  assert.equal(repaired.prepare('SELECT version FROM access_schema').get().version,99);
  repaired.exec('UPDATE access_schema SET version=1');repaired.close();
  const reopened=openStore(file);t.after(()=>reopened.close());assert.deepEqual(reopened.read(),before);
});

test('inventory undo exposes only the current users own receipt even for a shared hero',t=>{
  const {store,first}=setup(t);
  store.access.apply({action:'grant-character',userId:userGM,campaignId:first.campaignId,characterId:first.characterId});
  const alice=store.forUser(userA,'alice-undo',{write:true}),master=store.forUser(userGM,'master-undo',{write:true});
  const p=store.catalog.previewBundled();store.catalog.installBundled({version:p.version});
  const catalogId=store.catalog.search(new URLSearchParams({kind:'item'})).entries[0].id;
  const add=command(alice,{characterId:first.characterId,catalogId,quantity:1});alice.addInventory(add);
  assert.equal(alice.inventory().undo.mutationId,add.mutationId);assert.equal(master.inventory().undo,null);
  assert.throws(()=>master.undoInventory(command(master,{characterId:first.characterId,targetMutationId:add.mutationId})),{status:404});
  const undo=command(alice,{characterId:first.characterId,targetMutationId:add.mutationId});alice.undoInventory(undo);
  assert.equal(alice.inventory().entries.length,0);assert.equal(alice.undoInventory(undo).replayed,true);
});

test('revocation on a separate connection invalidates prepared writes and replay receipts',t=>{
  const file=join(mkdtempSync(join(tmpdir(),'skaz-access-concurrent-')),'game.sqlite');
  const {store,first}=setup(t,file),writer=store.forUser(userA,'concurrent-window',{write:true});
  const saved=command(writer,{label:'Own update',state:{...writer.read().state,hp:10}});writer.update(saved);
  const pending=command(writer,{label:'Pending update',state:{...writer.read().state,hp:8}});
  const admin=openStore(file);t.after(()=>admin.close());
  admin.access.apply({action:'revoke-character',userId:userA,campaignId:first.campaignId,characterId:first.characterId});
  for(const action of [()=>writer.update(pending),()=>writer.update(saved),()=>writer.inventory(),()=>writer.exportActive(),()=>writer.catalog.coverage()]) assert.throws(action,{status:404});
  assert.equal(admin.forView('fixture-alice').read().state.hp,10);
  admin.access.apply({action:'grant-character',userId:userA,campaignId:first.campaignId,characterId:first.characterId});
  assert.equal(writer.read().state.hp,10);assert.equal(writer.update(saved).replayed,true);
});

test('failed administrative audit rolls back permission changes',t=>{
  const file=join(mkdtempSync(join(tmpdir(),'skaz-access-audit-')),'game.sqlite');
  const {store,first}=setup(t,file),db=new DatabaseSync(file);t.after(()=>db.close());
  db.exec("CREATE TRIGGER fail_access_audit BEFORE INSERT ON access_audit BEGIN SELECT RAISE(ABORT,'injected access audit failure'); END");
  assert.throws(()=>store.access.apply({action:'grant-character',userId:userGM,campaignId:first.campaignId,characterId:first.characterId}),/injected access audit/);
  assert.throws(()=>store.access.character(userGM,first.campaignId,first.characterId),{status:404});
  assert.equal(store.access.membership(userGM,first.campaignId),'gm');
});

test('HTTP individual writes require explicit trusted opt-in and retain per-user and origin checks',async t=>{
  const {store,first,second}=setup(t);
  for(const options of [{individualWrites:true},{authenticate:()=>userA,individualWrites:'false'}]) assert.throws(()=>createApp(store,options));
  const app=createApp(store,{individualWrites:true,authenticate:r=>r.headers.authorization==='Bearer test-boris'?userB:null});
  await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>app.close(resolve)));
  const base='http://127.0.0.1:'+app.address().port,headers={Authorization:'Bearer test-boris','X-Skaz-View':'http-write','X-Skaz-Client':'local-v1','Content-Type':'application/json'};
  const api=async(route,method='GET',body,extra={})=>{
    const r=await fetch(base+route,{method,headers:{...headers,...extra},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json()};
  };
  const before=(await api('/api/workspace')).body;
  assert.equal(before.context.characterId,second.characterId);
  assert.equal((await api('/api/health')).body.mode,'individual');
  const change={mutationId:randomUUID(),expectedRevision:before.revision,label:'HTTP own health',state:{...before.state,hp:5}};
  assert.equal((await api('/api/workspace','PUT',change,{Origin:'https://foreign.invalid'})).status,403);
  assert.equal((await api('/api/workspace','PUT',change)).body.state.hp,5);
  assert.equal((await api('/api/workspace','PUT',change)).body.replayed,true);
  assert.equal((await api('/api/context/select','POST',{mutationId:randomUUID(),expectedRevision:before.revision+1,context:first})).status,404);
  assert.deepEqual((await api('/api/history')).body.changes.map(x=>x.label),['HTTP own health']);
  assert.equal((await api('/api/catalog/bundled','POST',{})).status,403);
  store.access.apply({action:'revoke-character',userId:userB,campaignId:second.campaignId,characterId:second.characterId});
  assert.equal((await api('/api/workspace','PUT',change)).status,404);
});

test('campaign roles govern quests, places, sessions and new heroes without exposing personal sheets',t=>{
 const {store,first}=setup(t),owner=store.forUser(userA,'owner-role',{write:true}),player=store.forUser(userB,'player-role',{write:true});
 const quest={campaignId:first.campaignId,questId:randomUUID(),operation:'create',quest:{title:'Shared quest',description:'Find it',status:'active',steps:[]}};
 const place={campaignId:first.campaignId,placeId:randomUUID(),operation:'create',place:{title:'Shared place',description:'Known',x:25,y:60,visited:false}};
 const hero={campaignId:first.campaignId,characterId:randomUUID(),template:'bard5-demo',profile:{name:'Extra',tagline:''}};
 for(const [method,fields]of [['saveQuest',quest],['savePlace',place],['createCharacter',hero]])assert.throws(()=>player[method](command(player,fields)),{status:403});
 owner.saveQuest(command(owner,quest));owner.savePlace(command(owner,place));
 assert.equal(player.quests().quests[0].title,'Shared quest');assert.equal(player.places().places[0].title,'Shared place');
 const created=owner.createCharacter(command(owner,hero));assert.equal(created.context.characterId,hero.characterId);
 store.access.character(userA,first.campaignId,hero.characterId);
 assert.throws(()=>store.access.character(userB,first.campaignId,hero.characterId),{status:404});
 assert.equal(player.campaigns()[0].characters.length,1);
 const session=owner.startSession(command(owner,{session:{name:'Shared next',playedOn:'2026-10-20'}}));
 assert.equal(player.read().context.sessionId,session.context.sessionId);assert.equal(player.read().state.notes[0].text,'BORIS_PRIVATE');
 assert.equal(owner.read().state.notes.length,0);
});

test('identity bootstrap returns only the verified enabled user even before any hero grant',async t=>{
 const store=openStore(':memory:');t.after(()=>store.close());
 store.access.apply({action:'create-user',userId:'new-player',displayName:'New player'});
 let identity='new-player';
 const app=createApp(store,{authenticate:()=>identity});
 await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>app.close(resolve)));
 const base='http://127.0.0.1:'+app.address().port;
 const response=await fetch(base+'/api/me?userId=other-user',{headers:{'X-Skaz-User':'other-user'}});
 assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);
 assert.deepEqual(await response.json(),{user:{id:'new-player',displayName:'New player',enabled:true},individualWrites:false});
 const workspace=await fetch(base+'/api/workspace');assert.equal(workspace.status,404);await workspace.body.cancel();
 store.access.apply({action:'set-enabled',userId:'new-player',enabled:false});
 const disabled=await fetch(base+'/api/me');assert.equal(disabled.status,404);await disabled.body.cancel();
 identity=null;const anonymous=await fetch(base+'/api/me');assert.equal(anonymous.status,401);await anonymous.body.cancel();
 const shared=createApp(store);await new Promise(resolve=>shared.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>shared.close(resolve)));
 const noIdentity=await fetch('http://127.0.0.1:'+shared.address().port+'/api/me');assert.equal(noIdentity.status,404);await noIdentity.body.cancel();
});

test('permission hints reflect role and opt-in write mode; demotion cannot authorize a shared write',t=>{
 const {store,first}=setup(t),player=store.forUser(userB,'permissions-window',{write:true});
 assert.equal(player.permissions().character,true);assert.equal(player.permissions().shared,false);assert.equal(player.permissions().catalog,false);
 const owner=store.forUser(userA,'owner-permissions',{write:true});assert.equal(owner.permissions().shared,true);
 const readOnly=store.forUser(userA,'readonly-permissions');assert.equal(readOnly.permissions().character,false);assert.equal(readOnly.permissions().shared,false);
 store.access.apply({action:'grant-character',userId:userGM,campaignId:first.campaignId,characterId:first.characterId});
 const gm=store.forUser(userGM,'gm-permissions',{write:true});assert.equal(gm.permissions().manageCampaign,true);
 store.access.apply({action:'set-member',userId:userGM,campaignId:first.campaignId,role:'player'});assert.equal(gm.permissions().manageCampaign,false);
 const before=gm.read();assert.throws(()=>gm.update({mutationId:randomUUID(),expectedRevision:before.revision,label:'Shared write',state:{...before.state,journal:[note('Denied')]}}),{status:403});assert.deepEqual(gm.read(),before);
});
