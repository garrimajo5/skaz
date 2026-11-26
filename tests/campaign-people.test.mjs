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

function memoryFixture(store) {
  const old = store.startSession(mutation(store,{session:{name:'Переправа QA',playedOn:'2026-11-22'}})).context;
  const note = (kind,title) => ({title,text:'QA '+title,kind,at:1,time:'00:00'});
  store.update(mutation(store,{label:'Наполнить архив QA',state:{...store.read().state,journal:[
    note('Событие сессии','Сюжет о переправе'), note('Зацепка','Карта торговца'),
    note('Ресурс','Расход ячейки'), note('Из разговора','Числовая награда'),
  ],notes:[note('Личное событие','Личный черновик')]}}));
  const placeId = randomUUID(), questId = randomUUID();
  store.savePlace(mutation(store,{campaignId:old.campaignId,placeId,operation:'create',
    place:{title:'Переправа QA',description:'',x:20,y:30,visited:false}}));
  store.saveQuest(mutation(store,{campaignId:old.campaignId,questId,operation:'create',
    quest:{title:'Задание QA',description:'',status:'active',steps:[]}}));
  const personId = randomUUID(), friendId = randomUUID(), clueId = randomUUID(), latest = randomUUID();
  const save = (operation,data) => store.saveCampaignPerson(command(store,personId,operation,data));
  save('create',{details:profile,knowledge:{id:clueId,kind:'known',text:'Встречали раньше',sessionId:old.sessionId}});
  store.saveCampaignPerson(command(store,friendId,'create',{details:{...profile,name:'Союзник QA'},knowledge:null}));
  store.startSession(mutation(store,{session:{name:'Игра без упоминаний QA',playedOn:'2026-11-23'}}));
  const current = store.startSession(mutation(store,{session:{name:'Текущая игра QA',playedOn:'2026-11-24'}})).context;
  save('add-encounter',{id:latest,text:'У переправы',sessionId:old.sessionId,placeId,makeLatest:true});
  save('add-encounter',{id:randomUUID(),text:'Ещё одна старая встреча',sessionId:old.sessionId,placeId:null,makeLatest:false});
  save('add-encounter',{id:randomUUID(),text:'Неуточнённая встреча',sessionId:null,placeId:null,makeLatest:false});
  save('set-links',{links:[{kind:'person',id:friendId},{kind:'place',id:placeId},
    {kind:'quest',id:questId},{kind:'session',id:current.sessionId}]});
  for(let i=0;i<7;i++) save('edit',{...profile,description:'Запись QA '+i});
  return {old,current,personId,friendId,placeId,questId,latest};
}

test('people list projects the current title of a known last place without changing the encounter',t => {
  const store=memoryStore({campaignPeople:true});
  t.after(()=>store.close());
  const {campaignId,sessionId}=store.read().context;
  const personId=randomUUID(), placeId=randomUUID(), encounterId=randomUUID();
  const savePlace=(operation,title)=>store.savePlace(mutation(store,{campaignId,placeId,operation,
    place:{title,description:'Вымышленное место',x:44,y:32,visited:true}}));
  store.saveCampaignPerson(command(store,personId,'create',{details:profile,knowledge:null}));
  assert.equal(store.campaignPeople().people[0].latestEncounter,null);
  assert.equal(Object.hasOwn(store.campaignPeople().people[0],'latestPlaceTitle'),false);
  savePlace('create','Северные ворота');
  store.saveCampaignPerson(command(store,personId,'add-encounter',{id:encounterId,text:'',sessionId,placeId,makeLatest:true}));
  const before=store.campaignPeople().people[0];
  assert.deepEqual(before.latestEncounter,{id:encounterId,text:'',sessionId,placeId});
  assert.equal(before.latestPlaceTitle,'Северные ворота');
  savePlace('update','Ворота крепости');
  const revision=store.read().revision;
  const after=store.campaignPeople().people[0];
  assert.deepEqual(after.latestEncounter,before.latestEncounter);
  assert.equal(after.latestPlaceTitle,'Ворота крепости');
  assert.equal(store.read().revision,revision);
});

test('campaign memory transfers only linked archives, remaps typed links and retains repeatable history',t => {
  const store = memoryStore({campaignPeople:true});
  t.after(() => store.close());
  const {old,current,personId,friendId,placeId,questId,latest} = memoryFixture(store);
  const file = store.exportActive('campaign-memory');
  assert.equal(file.memory.archives.length,1);
  const archive = file.memory.archives[0];
  assert.equal(archive.id,old.sessionId);
  assert.deepEqual(archive.journal.map(row => row.title),['Сюжет о переправе','Карта торговца']);
  assert.deepEqual(Object.keys(archive).sort(),['id','journal','name','origin','playedOn']);
  assert.deepEqual(archive.origin,{campaignId:old.campaignId,sessionId:old.sessionId,number:2});
  assert.equal(archive.name,'Переправа QA');
  assert.equal(archive.playedOn,'2026-11-22');
  const packCard = file.memory.people.find(row => row.id===personId);
  assert.deepEqual(packCard.data.encounters.at(-1).sessionId,{status:'unknown'});
  // A saved source may have the same old ID as an included archive. A snapshot
  // is still inert on import and on future export.
  const snapshot = {status:'snapshot',text:'Видимый текст прежней встречи',
    origin:{campaignId:old.campaignId,id:old.sessionId}};
  for (const data of [packCard.data,...packCard.history.flatMap(row => [row.before,row.after])].filter(Boolean)) {
    if(data.encounters.length===3) data.encounters[2].sessionId=snapshot;
    if(data.links.length===4) data.links.push({kind:'session',target:snapshot});
  }
  const sourceCount = store.campaigns().length;
  const request = mutation(store,{destination:'new-campaign',file});
  const imported = store.importActive(request);
  assert.equal(store.campaigns().length,sourceCount+1);
  const context = imported.context;
  assert.notEqual(context.campaignId,current.campaignId);
  const sessions = store.sessions(context.campaignId);
  assert.equal(sessions.length,2);
  const importedArchive = sessions.find(row => row.archived);
  assert.notEqual(importedArchive.id,old.sessionId);
  assert.equal(store.sessionReview(importedArchive.id).session.importedFrom.number,2);
  assert.equal(store.sessionReview(importedArchive.id).session.number,1);
  assert.equal(store.read().sessionNumber,2);
  assert.equal(store.sessionReview(importedArchive.id).proposals.length,0);
  assert.deepEqual(store.sessionReview(importedArchive.id).session.data.journal,archive.journal);
  assert.deepEqual(store.read().context,context);
  assert.throws(() => store.sessionReview(old.sessionId),{status:404});

  const people = store.campaignPeople().people;
  const cardId = people.find(row => row.name===profile.name).id;
  const newFriendId = people.find(row => row.name==='Союзник QA').id;
  assert.notEqual(cardId,personId);
  assert.notEqual(newFriendId,friendId);
  const card = store.campaignPerson(cardId).person;
  const newPlace = store.places().places[0].id, newQuest = store.quests().quests[0].id;
  assert.notEqual(newPlace,placeId);
  assert.notEqual(newQuest,questId);
  assert.deepEqual(card.links,[{kind:'person',id:newFriendId},{kind:'place',id:newPlace},
    {kind:'quest',id:newQuest},{kind:'session',id:context.sessionId},{kind:'session',id:null,snapshot}]);
  assert.equal(card.createdSessionId,importedArchive.id);
  assert.equal(card.encounters[0].sessionId,importedArchive.id);
  assert.equal(card.encounters[0].placeId,newPlace);
  assert.equal(card.encounters[1].sessionId,importedArchive.id);
  assert.equal(card.encounters[1].placeId,null);
  assert.equal(card.encounters[2].sessionId,null);
  assert.equal(card.encounters[2].placeId,null);
  assert.deepEqual(card.encounters[2].sessionSnapshot,snapshot);
  assert.equal(card.latestEncounterId,latest);
  store.saveCampaignPerson(command(store,cardId,'edit',{...profile, description:'После импорта'}));
  assert.equal(store.campaignPerson(cardId).person.description,'После импорта');
  const page = store.campaignPersonHistory(cardId);
  const tail = store.campaignPersonHistory(cardId,page.nextBeforePosition);
  assert.equal(page.changes.length,10);
  assert.equal(page.changes[0].origin.campaignId,context.campaignId);
  assert.equal(page.changes[1].origin.campaignId,current.campaignId);
  assert.equal(tail.changes.at(-1).operation,'create');
  assert.equal(tail.changes.at(-1).position,1);
  assert.equal(tail.changes.at(-1).after.knowledge[0].sessionId,importedArchive.id);
  assert.equal(page.changes.length+tail.changes.length,packCard.history.length+1);

  const replay = store.importActive(request);
  assert.equal(replay.replayed,true);
  assert.deepEqual(replay.affectedContext,context);
  assert.equal(store.campaigns().length,sourceCount+1);
  const second = store.exportActive('campaign-memory');
  assert.deepEqual(second.memory.archives[0].origin,archive.origin);
  assert.deepEqual(second.memory.people.find(row => row.id===cardId).data.encounters[2].sessionId,snapshot);
  const edited = card.encounters[2];
  store.saveCampaignPerson(command(store,cardId,'edit-encounter',
    {id:edited.id,text:'Поправлен только текст',sessionId:null,placeId:null}));
  assert.deepEqual(store.campaignPerson(cardId).person.encounters[2].sessionSnapshot,snapshot);
  store.saveCampaignPerson(command(store,cardId,'edit-encounter',
    {id:edited.id,text:edited.text,sessionId:null,placeId:null,clearSnapshots:['session']}));
  const repaired = store.campaignPerson(cardId).person.encounters[2];
  assert.equal(repaired.sessionSnapshot,undefined);
  assert.deepEqual(store.campaignPersonHistory(cardId).changes[0].before.encounters[2].sessionSnapshot,snapshot);
  store.saveCampaignPerson(command(store,cardId,'set-links',{links:[{kind:'person',id:newFriendId}]}));
  assert.deepEqual(store.campaignPerson(cardId).person.links,[{kind:'person',id:newFriendId},{kind:'session',id:null,snapshot}]);
  const stale = command(store,cardId,'remove-link-snapshot',{index:1});
  assert.throws(() => store.saveCampaignPerson(command(store,cardId,'remove-link-snapshot',{index:0})),{status:404});
  store.saveCampaignPerson(command(store,cardId,'set-links',{links:[]}));
  assert.throws(() => store.saveCampaignPerson(stale),{status:409});
  store.saveCampaignPerson(command(store,cardId,'remove-link-snapshot',{index:0}));
  assert.deepEqual(store.campaignPerson(cardId).person.links,[]);
  assert.equal(store.campaignPersonHistory(cardId).changes[0].before.links[0].snapshot.text,snapshot.text);
});

test('invalid links, scope, archive content and inconsistent history reject the entire memory import',t => {
  const store = memoryStore({campaignPeople:true});
  t.after(() => store.close());
  const {personId} = memoryFixture(store);
  const valid = store.exportActive('campaign-memory');
  const original = store.read(), size = store.campaigns().length;
  const edits = [
    file => { file.memory.archives = []; },
    file => { file.memory.archives.push(structuredClone(file.memory.archives[0])); },
    file => { file.memory.archives[0].journal[0].kind = 'Ресурс'; },
    (file,card) => { card.data.encounters[0].placeId.campaignId = randomUUID(); },
    (file,card) => { card.data.encounters[0].placeId.id = file.memory.questIds[0]; },
    (file,card) => { card.data.latestEncounterId = randomUUID(); },
    (file,card) => { card.history[0].after.description = 'Изменено задним числом'; },
    file => { file.memory.archives.push({...file.memory.archives[0],id:randomUUID()}); },
  ];
  for (const edit of edits) {
    const file = structuredClone(valid);
    edit(file,file.memory.people.find(row => row.id===personId));
    assert.throws(() => store.importActive(mutation(store,{destination:'new-campaign',file})),{status:422});
    assert.deepEqual(store.read(),original);
    assert.equal(store.campaigns().length,size);
  }
  assert.throws(() => store.exportActive(15),{status:409});
});

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
  const next = store.campaignPersonHistory(personId, page.nextBeforePosition);
  assert(next.changes.length > 0);
  assert.equal(next.nextBeforePosition, null);
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
  gm.saveCampaignPerson(command(gm,personId,'add-knowledge',{
    id:randomUUID(),kind:'assumption',text:'Синяя Печать и ёлка',sessionId:null,
  }));
  const found=gm.campaignPeople('ЕЛКА').people;
  assert.equal(found[0].id,personId);
  assert(!Object.hasOwn(found[0],'knowledge'));
  assert.deepEqual(gm.campaignPeople('нет совпадения').people,[]);
  assert.throws(() => gm.campaignPerson(otherId), {status:404});
  const before = gm.read();
  assert.throws(() => gm.saveCampaignPerson(command(gm, personId, 'set-links', {links:[{kind:'person',id:otherId}]})), {status:404});
  assert.throws(() => gm.saveCampaignPerson(command(gm, personId, 'add-encounter', {
    id:randomUUID(), text:'QA', sessionId:other.sessionId, placeId:null, makeLatest:true,
  })), {status:404});
  assert.deepEqual(gm.read(), before);
  gm.selectContext(mutation(gm, {context:other}));
  assert.equal(gm.campaignPeople().people[0].id, otherId);
  assert.deepEqual(gm.campaignPeople('печать').people,[]);
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
    store.close(); store=null;
    store=openStore(file,{campaignPeople:true});
    store.startSession(mutation(store,{session:{name:'Текущая синтетическая',playedOn:'2026-11-24'}}));
    const packageFile=store.exportActive('campaign-memory');
    assert.equal(packageFile.memory.archives.length,1);
    const input=mutation(store,{destination:'new-campaign',file:packageFile});
    const oldContext=store.read(), gameCount=store.campaigns().length;
    raw=new DatabaseSync(file);
    raw.exec("CREATE TRIGGER refuse_imported_history BEFORE INSERT ON campaign_person_imports BEGIN SELECT RAISE(ABORT,'QA import failure'); END");
    assert.throws(() => store.importActive(input),/QA import failure/);
    assert.deepEqual(store.read(),oldContext);
    assert.equal(store.campaigns().length,gameCount);
    assert.equal(raw.prepare('SELECT count(*) AS n FROM campaign_archive_origins').get().n,0);
    assert.equal(raw.prepare('SELECT count(*) AS n FROM campaign_person_imports').get().n,0);
    assert.equal(raw.prepare('SELECT 1 FROM changes WHERE mutation_id=?').get(input.mutationId),undefined);
    raw.exec('DROP TRIGGER refuse_imported_history');
    const copied=store.importActive(input);
    const copiedId=store.campaignPeople().people[0].id;
    const copiedHistory=store.campaignPersonHistory(copiedId);
    assert.equal(raw.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
    assert.deepEqual(raw.prepare('PRAGMA foreign_key_check').all(),[]);
    const importedBackup=join(folder,'imported.sqlite');
    await store.backup(importedBackup);
    restored=openStore(importedBackup);
    assert.deepEqual(restored.read().context,copied.context);
    assert.throws(() => restored.exportActive('campaign-memory'),{status:403});
    assert.throws(() => restored.exportActive(15),{status:409});
    restored.close(); restored=null;
    restored=openStore(importedBackup,{campaignPeople:true});
    assert.deepEqual(restored.campaignPersonHistory(copiedId),copiedHistory);
    assert.equal(restored.saveCampaignPerson(request).replayed,true);
    assert.equal(restored.importActive(input).replayed,true);
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
  assert.doesNotMatch(await (await fetch(disabled.origin+'/')).text(),/data-campaign-people="enabled"/);
  const {store,origin}=await start(true), personId=randomUUID();
  const request=command(store,personId,'create',{details:profile,knowledge:null});
  const response = (route, options) => fetch(origin+route,options);
  assert.match(await (await response('/')).text(),/data-campaign-people="enabled"/);
  const send = extra => response('/api/campaign-people',{method:'POST',headers:{
    'content-type':'application/json', 'x-skaz-client':'local-v1', origin, ...extra,
  },body:JSON.stringify(request)});
  assert.equal((await send({origin:'https://foreign.example'})).status,403);
  assert.equal((await send({'x-skaz-client':'wrong'})).status,403);
  assert.equal((await send()).status,200);
  assert.equal((await (await send()).json()).replayed,true);
  const list=await (await response('/api/campaign-people')).json();
  assert.equal(list.people[0].id,personId);
  assert.equal((await response('/api/campaign-people?q=a&q=b')).status,400);
  assert.equal((await response('/api/campaign-people?q='+('x'.repeat(201)))).status,422);
  const path='/api/campaign-people/'+personId;
  assert.equal((await (await response(path)).json()).person.relation,null);
  assert.equal((await (await response(path+'/history')).json()).changes[0].operation,'create');
  assert.equal((await response(path+'/history?beforePosition=0')).status,400);
  assert.equal((await response(path+'/history?beforePosition=2&beforePosition=3')).status,400);
  assert.equal((await response('/api/export')).status,409);
  assert.equal((await response('/api/export/active-v15')).status,409);
  const exportPath='/api/export/campaign-memory', importPath='/api/import/campaign-memory';
  assert.equal((await fetch(disabled.origin+exportPath)).status,404);
  const exported=await response(exportPath);
  assert.equal(exported.status,200);
  assert.match(exported.headers.get('content-disposition'),/skaz-campaign-memory\.json/);
  const file=await exported.json();
  const memoryImport=mutation(store,{destination:'new-campaign',file});
  const restore=(route, extra)=>response(route,{method:'POST',headers:{origin,'x-skaz-client':'local-v1',
    'content-type':'application/json',...extra},body:JSON.stringify(memoryImport)});
  assert.equal((await restore(importPath,{origin:'https://foreign.example'})).status,403);
  assert.equal((await restore(importPath,{'x-skaz-client':'wrong'})).status,403);
  assert.equal((await restore('/api/import/active')).status,422);
  assert.equal((await restore(importPath)).status,200);
  assert.equal((await (await restore(importPath)).json()).replayed,true);
  const copiedList=await (await response('/api/campaign-people')).json();
  assert.equal(copiedList.people.length,1);
  assert.notEqual(copiedList.people[0].id,personId);
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
  assert.equal((await get('/api/export/campaign-memory')).status,404);
  identity=owner;
  const file=await (await get('/api/export/campaign-memory')).json();
  const importPath='/api/import/campaign-memory';
  const memoryImport=mutation(view,{destination:'new-campaign',file});
  const restore=()=>fetch(origin+importPath,{method:'POST',headers,body:JSON.stringify(memoryImport)});
  const imported=await restore();
  assert.equal(imported.status,200);
  assert.equal((await imported.json()).permissions.role,'owner');
  assert.equal((await (await restore()).json()).replayed,true);
  assert.equal((await get(path+'/'+personId)).status,404);
});
