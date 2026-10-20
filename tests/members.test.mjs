import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {openStore} from '../server/store.mjs';
import {createApp} from '../server/app.mjs';
const alice='member-alice',bob='member-boris',gm='member-master';
const cmd=(view,fields)=>({mutationId:randomUUID(),expectedRevision:view.read().revision,...fields});
function setup(t,file=':memory:'){
 const store=openStore(file);t.after(()=>store.close());const first=store.read().context;
 const other=store.forView('other-hero');other.createCharacter(cmd(other,{campaignId:first.campaignId,characterId:randomUUID(),template:'bard5-demo',profile:{name:'Other hero',tagline:''}}));
 other.update(cmd(other,{label:'Private',state:{...other.read().state,notes:[{title:'Private',text:'PRIVATE_BORIS',kind:'Личная заметка',at:1,time:'00:01'}]}}));const second=other.read().context;
 store.access.apply({action:'bootstrap-owner',userId:alice,displayName:'Alice',campaignId:first.campaignId,characterId:first.characterId});
 for(const [userId,role]of [[bob,'player'],[gm,'gm']]){store.access.apply({action:'create-user',userId,displayName:userId});store.access.apply({action:'set-member',userId,campaignId:first.campaignId,role});store.access.apply({action:'grant-character',userId,campaignId:first.campaignId,characterId:second.characterId});}
 const owner=store.forUser(alice,'owner-window',{write:true});
 const change=fields=>({mutationId:randomUUID(),expectedVersion:owner.members.list().version,campaignId:first.campaignId,...fields});
 return {store,first,second,owner,change};
}
test('owner roster contains only campaign names, roles and explicit grants; personal data stays private',t=>{
 const {store,first,owner}=setup(t);const before=store.read(),roster=owner.members.list();
 assert.equal(roster.actorId,alice);assert.equal(roster.campaignId,first.campaignId);assert.equal(roster.members.length,3);assert.equal(roster.characters.length,2);assert.match(roster.version,/^[a-f0-9]{64}$/);
 assert.ok(!JSON.stringify(roster).includes('PRIVATE_BORIS'));assert.deepEqual(Object.keys(roster.characters[0]).sort(),['id','name']);assert.deepEqual(store.read(),before);
 for(const id of [bob,gm])assert.throws(()=>store.forUser(id,'reader-window',{write:true}).members.list(),{status:403});
 assert.equal(owner.permissions().members,true);assert.equal(store.forUser(bob,'player-window',{write:true}).permissions().members,false);
 assert.equal(store.forUser(alice,'readonly-window').permissions().members,false);
});
test('grant, revoke, role and membership changes never mutate game progress or implicitly grant sheets',t=>{
 const {store,first,second,owner,change}=setup(t),before=store.read();
 const granted=owner.members.change(change({action:'grant-character',userId:bob,characterId:first.characterId}));assert.equal(granted.replayed,false);store.access.character(bob,first.campaignId,first.characterId);
 owner.members.change(change({action:'revoke-character',userId:bob,characterId:first.characterId}));assert.throws(()=>store.access.character(bob,first.campaignId,first.characterId),{status:404});
 owner.members.change(change({action:'set-member',userId:bob,role:'gm'}));assert.equal(store.access.membership(bob,first.campaignId),'gm');
 owner.members.change(change({action:'remove-member',userId:bob}));assert.throws(()=>store.access.membership(bob,first.campaignId),{status:404});
 owner.members.change(change({action:'set-member',userId:bob,role:'player'}));assert.throws(()=>store.access.character(bob,first.campaignId,second.characterId),{status:404});
 assert.deepEqual(store.read(),before);
});
test('stale roster detects administrative grants, role and enabled changes; failed writes leave no grant',t=>{
 const {store,first,owner,change}=setup(t);
 for(const external of [{action:'grant-character',userId:bob,campaignId:first.campaignId,characterId:first.characterId},{action:'set-member',userId:gm,campaignId:first.campaignId,role:'player'},{action:'set-enabled',userId:gm,enabled:false}]){
 const request=change({action:'set-member',userId:bob,role:'owner'});store.access.apply(external);assert.throws(()=>owner.members.change(request),{status:409});assert.equal(store.access.membership(bob,first.campaignId),'player');}
});
test('durable retries check current authority and never reapply revoked grants, including reordered JSON keys',t=>{
 const file=join(mkdtempSync(join(tmpdir(),'skaz-members-')),'game.sqlite'),{store,first,owner,change}=setup(t,file);
 const request=change({action:'grant-character',userId:bob,characterId:first.characterId});owner.members.change(request);
 const separate=openStore(file);t.after(()=>separate.close());separate.access.apply({action:'revoke-character',userId:bob,campaignId:first.campaignId,characterId:first.characterId});
 const restarted=separate.forUser(alice,'restarted-window',{write:true});assert.equal(restarted.members.change(Object.fromEntries(Object.entries(request).reverse())).replayed,true);
 assert.throws(()=>store.access.character(bob,first.campaignId,first.characterId),{status:404});
 assert.throws(()=>restarted.members.change({...request,action:'revoke-character'}),{status:409});
 assert.throws(()=>separate.access.apply({action:'set-member',userId:alice,campaignId:first.campaignId,role:'gm'}),{status:409});
});
test('revoked owner cannot replay receipts and session guard is checked at write time',t=>{
 const {store,first,owner,change}=setup(t),request=change({action:'set-member',userId:bob,role:'owner'});owner.members.change(request);
 store.access.apply({action:'set-member',userId:alice,campaignId:first.campaignId,role:'gm'});assert.throws(()=>owner.members.change(request),{status:403});
 let revoked=false;const guarded=store.forUser(bob,'guarded-window',{write:true,guard:()=>{if(revoked){const e=new Error('Expired');e.status=401;throw e;}}});const pending={...request,mutationId:randomUUID(),expectedVersion:guarded.members.list().version,userId:gm,role:'player'};
 revoked=true;assert.throws(()=>guarded.members.change(pending),{status:401});assert.equal(store.access.membership(gm,first.campaignId),'gm');
});
test('strict commands forbid self lockout, account creation, unrelated games and disabled grants',t=>{
 const {store,first,owner,change}=setup(t),base=change({action:'set-member',userId:bob,role:'gm'});
 for(const input of [null,[],{}, {...base,extra:1},{...base,action:'constructor'},{...base,action:'__proto__'},{...base,role:'admin'},{...base,userId:'x'},{...base,expectedVersion:'bad'}])assert.throws(()=>owner.members.change(input),{status:422});
 for(const fields of [{action:'remove-member',userId:alice},{action:'set-member',userId:alice,role:'player'},{action:'revoke-character',userId:alice,characterId:first.characterId}])assert.throws(()=>owner.members.change(change(fields)),{status:409});
 assert.throws(()=>owner.members.change(change({action:'set-member',userId:'unknown-person',role:'player'})),{status:404});assert.throws(()=>store.access.user('unknown-person'),{status:404});
 assert.throws(()=>owner.members.change({...base,campaignId:randomUUID()}),{status:409});
 assert.throws(()=>owner.members.change(change({action:'grant-character',userId:bob,characterId:randomUUID()})),{status:404});
 store.access.apply({action:'set-enabled',userId:bob,enabled:false});assert.throws(()=>owner.members.change(change({action:'grant-character',userId:bob,characterId:first.characterId})),{status:404});
 assert.throws(()=>store.forUser(alice,'readonly-window').members.change(base),{status:403});
});
test('HTTP membership routes require owner, explicit writer, local client and correct origin; shared mode stays absent',async t=>{
 const {store,first,change}=setup(t);const apps=[];t.after(async()=>{for(const app of apps)await new Promise(r=>app.close(r));});
 async function start(options){const app=createApp(store,options);apps.push(app);await new Promise(r=>app.listen(0,'127.0.0.1',r));return 'http://127.0.0.1:'+app.address().port;}
 const origin=await start({authenticate:r=>r.headers.authorization||alice,individualWrites:true});
 const request=async(base,method='GET',body,headers={})=>fetch(base+'/api/members',{method,headers:{'Content-Type':'application/json','X-Skaz-Client':'local-v1',...headers},body:body===undefined?undefined:JSON.stringify(body)});
 assert.equal((await request(origin)).status,200);for(const id of[bob,gm])assert.equal((await request(origin,'GET',undefined,{Authorization:id})).status,403);
 const command=change({action:'grant-character',userId:bob,characterId:first.characterId});
 assert.equal((await request(origin,'POST',command,{'X-Skaz-Client':''})).status,403);assert.equal((await request(origin,'POST',command,{Origin:'https://evil.invalid'})).status,403);
 assert.equal((await request(origin,'POST',{...command,actorId:alice})).status,422);assert.equal((await request(origin,'POST',command)).status,200);
 assert.equal((await request(origin,'PUT',{})).status,405);assert.equal((await request(origin,'POST',{padding:'x'.repeat(17000)})).status,413);
 assert.equal((await request(await start({authenticate:()=>alice}), 'POST',command)).status,403);
 assert.equal((await request(await start({}))).status,404);
 const asset=await fetch(origin+'/members.js');assert.equal(asset.status,200);assert.match(await asset.text(),/SkazMembers/);
});

test('receipt storage failure rolls back grants and audit together',t=>{
 const file=join(mkdtempSync(join(tmpdir(),'skaz-member-atomic-')),'db.sqlite'),{store,first,owner,change}=setup(t,file);
 owner.members.change(change({action:'set-member',userId:bob,role:'player'}));
 const db=new DatabaseSync(file);t.after(()=>db.close());const audit=db.prepare('SELECT count(*) AS n FROM access_audit').get().n,receipts=db.prepare('SELECT count(*) AS n FROM membership_changes').get().n;
 db.exec("CREATE TRIGGER fail_member_receipt BEFORE INSERT ON membership_changes BEGIN SELECT RAISE(ABORT,'test receipt failure'); END");
 assert.throws(()=>owner.members.change(change({action:'grant-character',userId:bob,characterId:first.characterId})),/test receipt failure/);
 assert.throws(()=>store.access.character(bob,first.campaignId,first.characterId),{status:404});assert.equal(db.prepare('SELECT count(*) AS n FROM access_audit').get().n,audit);assert.equal(db.prepare('SELECT count(*) AS n FROM membership_changes').get().n,receipts);
});
