import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '../server/app.mjs';
import { openStore } from '../server/store.mjs';
import { seed } from '../server/state.mjs';

const mutation = (view, fields) => ({ mutationId: randomUUID(), expectedRevision: view.read().revision, ...fields });
const profile = { name: 'QA Встречный', description: 'Вымышленное лицо', relation: null };
const command = (view, personId, operation, data) => mutation(view, {
  campaignId: view.read().context.campaignId, personId, operation, data,
});
const memoryStore = options => openStore(':memory:', options);

test('campaign card preserves independent observations, explicit latest choice and correction history', t => {
  const store = memoryStore({campaignPeople:true});
  t.after(() => store.close());
  const first = store.read();
  const personId = randomUUID(), clueId = randomUUID(), earlier = randomUUID(), latest = randomUUID();
  const change = (operation, data) => command(store, personId, operation, data);
  const create = change('create', {
    details: profile,
    knowledge: {id:clueId, kind:'assumption', text:'Может знать дорогу', sessionId:first.context.sessionId},
  });
  assert.deepEqual(store.campaignPeople().people, []);
  store.saveCampaignPerson(create);
  assert.equal(store.saveCampaignPerson(create).replayed, true);
  assert.deepEqual(store.read().state, first.state);
  assert.equal(store.campaignPerson(personId).person.latestEncounterId, null);
  assert.equal(store.campaignPerson(personId).person.knowledge[0].kind, 'assumption');

  const current = store.startSession(mutation(store, {session:{name:'Новая игра QA',playedOn:'2026-11-24'}}));
  const addLatest = change('add-encounter', {id:latest, text:'У переправы', sessionId:current.context.sessionId, placeId:null, makeLatest:true});
  store.saveCampaignPerson(addLatest);
  store.saveCampaignPerson(change('add-encounter', {id:earlier, text:'Ранее', sessionId:first.context.sessionId, placeId:null, makeLatest:false}));
  store.saveCampaignPerson(change('edit-encounter', {id:earlier, text:'Исправленная запись', sessionId:first.context.sessionId, placeId:null}));
  assert.equal(store.campaignPeople().people[0].latestEncounter.id, latest);
  assert.equal(store.saveCampaignPerson(addLatest).replayed, true);
  assert.equal(store.campaignPerson(personId).person.latestEncounterId, latest);

  const staleChoice = change('choose-latest', {id:earlier});
  store.saveCampaignPerson(change('edit-knowledge', {id:clueId, text:'Знает короткую дорогу', sessionId:null}));
  assert.equal(store.campaignPerson(personId).person.knowledge[0].kind, 'assumption');
  assert.throws(() => store.saveCampaignPerson(staleChoice), {status:409});
  assert.throws(() => store.saveCampaignPerson(change('choose-latest', {id:randomUUID()})), {status:404});
  store.saveCampaignPerson(change('confirm-knowledge', {id:clueId}));
  const confirmation = store.campaignPersonHistory(personId).changes[0];
  assert.equal(confirmation.before.knowledge[0].kind, 'assumption');
  assert.equal(confirmation.after.knowledge[0].kind, 'known');

  const choose = change('choose-latest', {id:earlier});
  store.saveCampaignPerson(choose);
  assert.equal(store.campaignPerson(personId).person.latestEncounterId, earlier);
  store.saveCampaignPerson(change('choose-latest', {id:null}));
  assert.equal(store.saveCampaignPerson(choose).replayed, true);
  assert.equal(store.campaignPerson(personId).person.latestEncounterId, null);
  for (let i=0; i<5; i++) store.saveCampaignPerson(change('edit', {...profile, description:'QA ' + i}));
  const page = store.campaignPersonHistory(personId);
  assert.equal(page.changes.length, 10);
  const next = store.campaignPersonHistory(personId, page.nextBeforeRevision);
  assert(next.changes.length > 0);
  assert.equal(next.nextBeforeRevision, null);
  assert(next.changes.every(row => row.revision < page.changes.at(-1).revision));
  assert.throws(() => store.exportActive(15), {status:409});
});

test('campaign links and authenticated receipts reject foreign scope, demotion and duplicate payload', t => {
  const store = memoryStore({campaignPeople:true});
  t.after(() => store.close());
  const first = store.read().context;
  store.createCampaign(mutation(store, {state:seed}));
  const other = store.read().context;
  const otherId = randomUUID();
  store.saveCampaignPerson(command(store, otherId, 'create', {details:profile, knowledge:null}));
  store.access.apply({action:'bootstrap-owner', userId:'owner-qa', displayName:'QA owner', campaignId:first.campaignId, characterId:first.characterId});
  store.access.apply({action:'create-user', userId:'gm-qa-campaign', displayName:'QA GM'});
  for (const {campaignId,characterId} of [first, other]) {
    store.access.apply({action:'set-member', userId:'gm-qa-campaign', campaignId, role:'gm'});
    store.access.apply({action:'grant-character', userId:'gm-qa-campaign', campaignId, characterId});
  }
  const reader = store.forUser('gm-qa-campaign','people-read');
  const gm = store.forUser('gm-qa-campaign','people-edit',{write:true});
  gm.selectContext(mutation(gm, {context:first}));
  const personId = randomUUID();
  const create = command(gm, personId, 'create', {details:profile, knowledge:null});
  assert.throws(() => reader.saveCampaignPerson(create), {status:403});
  gm.saveCampaignPerson(create);
  assert.equal(gm.campaignPeople().people.length, 1);
  assert.equal(gm.campaignPeople().people[0].name, profile.name);
  assert.throws(() => gm.campaignPerson(otherId), {status:404});
  const before = gm.read();
  assert.throws(() => gm.saveCampaignPerson(command(gm, personId, 'set-links', {links:[{kind:'person',id:otherId}]})), {status:404});
  assert.throws(() => gm.saveCampaignPerson(command(gm, personId, 'add-encounter', {
    id:randomUUID(), text:'QA', sessionId:other.sessionId, placeId:null, makeLatest:true,
  })), {status:404});
  assert.deepEqual(gm.read(), before);
  gm.selectContext(mutation(gm, {context:other}));
  assert.equal(gm.campaignPeople().people[0].id, otherId);
  assert.throws(() => gm.campaignPerson(personId), {status:404});
  const sameId = command(gm, personId, 'create', {details:{...profile,name:'QA Только в другой'}, knowledge:null});
  gm.saveCampaignPerson(sameId);
  assert.equal(gm.campaignPerson(personId).person.name, 'QA Только в другой');
  const otherHistory = gm.campaignPersonHistory(personId).changes;
  assert.equal(otherHistory.length, 1);
  assert.equal(otherHistory[0].after.name, 'QA Только в другой');
  const repeated = gm.saveCampaignPerson(create);
  assert.equal(repeated.replayed, true);
  assert.deepEqual(repeated.affectedContext, first);
  assert.deepEqual(repeated.context, other);
  assert.throws(() => gm.saveCampaignPerson({...create,data:{details:{...profile,name:'Другой'},knowledge:null}}), {status:409});
  store.access.apply({action:'set-member', userId:'gm-qa-campaign', campaignId:first.campaignId, role:'player'});
  assert.throws(() => gm.saveCampaignPerson(create), {status:403});
  store.access.apply({action:'remove-member', userId:'gm-qa-campaign', campaignId:first.campaignId});
  assert.throws(() => gm.saveCampaignPerson(create), {status:404});
  assert.deepEqual(gm.read().context, other);
});

test('existing disk state, atomic rollback, backup and opt-out keep campaign memory intact', async () => {
  const base=realpathSync(tmpdir());
  const folder=mkdtempSync(join(base, 'skaz-campaign-people-'));
  const file=join(folder,'game.sqlite'), backup=join(folder,'backup.sqlite');
  let store, raw, restored;
  try {
    store=openStore(file);
    const before=store.read();
    store.close(); store=null;
    store=openStore(file,{campaignPeople:true});
    assert.deepEqual(store.read(),before);
    raw=new DatabaseSync(file);
    raw.exec("CREATE TRIGGER refuse_people_history BEFORE INSERT ON campaign_person_changes BEGIN SELECT RAISE(ABORT,'QA history failure'); END");
    const personId=randomUUID();
    const request=command(store,personId,'create',{details:profile,knowledge:null});
    assert.throws(() => store.saveCampaignPerson(request), /QA history failure/);
    assert.deepEqual(store.read(), before);
    assert.deepEqual(store.campaignPeople().people, []);
    raw.exec('DROP TRIGGER refuse_people_history');
    store.saveCampaignPerson(request);
    const card=store.campaignPerson(personId), history=store.campaignPersonHistory(personId);
    assert.equal(raw.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
    assert.deepEqual(raw.prepare('PRAGMA foreign_key_check').all(),[]);
    await store.backup(backup);
    restored=openStore(backup,{campaignPeople:true});
    assert.deepEqual(restored.campaignPerson(personId),card);
    assert.deepEqual(restored.campaignPersonHistory(personId),history);
    assert.equal(restored.saveCampaignPerson(request).replayed,true);
    restored.close(); restored=null;
    const backupDb=new DatabaseSync(backup);
    try {
      assert.equal(backupDb.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
      assert.deepEqual(backupDb.prepare('PRAGMA foreign_key_check').all(),[]);
    } finally {backupDb.close();}
    raw.close(); raw=null;
    store.close(); store=null;
    store=openStore(file);
    assert.throws(() => store.campaignPerson(personId),{status:403});
    assert.throws(() => store.exportActive(15),{status:409});
    assert.throws(() => store.legacyExport(),{status:409});
  } finally {
    restored?.close();
    raw?.close();
    store?.close();
    const owned=realpathSync(folder);
    assert.equal(dirname(owned),base);
    rmSync(owned,{recursive:true,force:true});
  }
});

test('local HTTP exposes scoped campaign memory only when explicitly enabled', async t => {
  async function start(enabled) {
    const store=memoryStore({campaignPeople:enabled});
    const server=createApp(store);
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    t.after(async () => {
      server.closeAllConnections();
      await new Promise(resolve=>server.close(resolve));
      store.close();
    });
    return {store, origin:'http://127.0.0.1:'+server.address().port};
  }
  const disabled=await start(false);
  assert.equal((await fetch(disabled.origin+'/api/campaign-people')).status,404);
  const {store,origin}=await start(true), personId=randomUUID();
  const request=command(store,personId,'create',{details:profile,knowledge:null});
  const response = (route, options) => fetch(origin+route,options);
  const send = extra => response('/api/campaign-people',{method:'POST',headers:{
    'content-type':'application/json', 'x-skaz-client':'local-v1', origin, ...extra,
  },body:JSON.stringify(request)});
  assert.equal((await send({origin:'https://foreign.example'})).status,403);
  assert.equal((await send({'x-skaz-client':'wrong'})).status,403);
  assert.equal((await send()).status,200);
  assert.equal((await (await send()).json()).replayed,true);
  const list=await (await response('/api/campaign-people')).json();
  assert.equal(list.people[0].id,personId);
  const path='/api/campaign-people/'+personId;
  assert.equal((await (await response(path)).json()).person.relation,null);
  assert.equal((await (await response(path+'/history')).json()).changes[0].operation,'create');
  assert.equal((await response(path+'/history?beforeRevision=0')).status,400);
  assert.equal((await response(path+'/history?beforeRevision=2&beforeRevision=3')).status,400);
  assert.equal((await response('/api/export')).status,409);
  assert.equal((await response('/api/export/active-v15')).status,409);
});

test('individual HTTP checks identity, authorizes reads and restricts campaign writes', async t => {
  const store=memoryStore({campaignPeople:true});
  const {campaignId,characterId}=store.read().context;
  const owner='owner-campaign-qa', player='player-campaign-qa';
  store.access.apply({action:'bootstrap-owner',userId:owner,displayName:'QA owner',campaignId,characterId});
  store.access.apply({action:'create-user',userId:player,displayName:'QA player'});
  store.access.apply({action:'set-member',userId:player,campaignId,role:'player'});
  store.access.apply({action:'grant-character',userId:player,campaignId,characterId});
  let identity=null;
  const server=createApp(store,{authenticate:()=>identity,individualWrites:true});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve=>server.close(resolve));
    store.close();
  });
  const origin='http://127.0.0.1:'+server.address().port;
  const path='/api/campaign-people';
  const headers={origin,'content-type':'application/json','x-skaz-client':'local-v1','x-skaz-view':'people-api-qa'};
  const get=route=>fetch(origin+route,{headers});
  const post=body=>fetch(origin+path,{method:'POST',headers,body:JSON.stringify(body)});
  assert.equal((await get(path)).status,401);
  identity=owner;
  const view=store.forUser(owner,'people-api-qa',{write:true});
  const personId=randomUUID();
  const create=command(view,personId,'create',{details:profile,knowledge:null});
  assert.equal((await post({...create,unknown:true})).status,422);
  const saved=await post(create);
  assert.equal(saved.status,200);
  assert.equal((await saved.json()).revision,create.expectedRevision+1);
  identity=player;
  const card=await get(path+'/'+personId);
  assert.equal(card.status,200);
  assert.equal((await card.json()).person.name,profile.name);
  assert.equal((await get(path+'/'+personId+'/history')).status,200);
  const otherView=store.forUser(player,'people-api-qa',{write:true});
  const edit=command(otherView,personId,'edit',{...profile,description:'Недопустимое изменение'});
  assert.equal((await post(edit)).status,403);
  assert.equal((await (await get(path+'/'+personId)).json()).person.description,profile.description);
  store.access.apply({action:'remove-member',userId:player,campaignId});
  assert.equal((await get(path+'/'+personId)).status,404);
  assert.equal((await get(path+'/'+personId+'/history')).status,404);
});
