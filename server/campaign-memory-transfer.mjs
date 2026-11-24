import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { AppError, seed, validateState } from './state.mjs';
import { readSession, validateSession } from './sessions.mjs';
import { validateTransfer } from './transfer.mjs';
import {
  campaignPersonOperations, eachCampaignPersonForTransfer, validatePortablePersonData,
} from './campaign-people.mjs';

export const campaignMemoryApp = 'skaz-campaign-memory';
export const campaignMemoryMaxBytes = 8 * 1024 * 1024;
const historyLimit = 4096;
const storyKinds = new Set(['Событие сессии', 'Зацепка']);
const validId = value => typeof value === 'string' && /^[a-zA-Z0-9-]{8,80}$/.test(value);
const fail = message => { throw new AppError(422,message); };
const blocked = message => { throw new AppError(409,message); };

function exact(value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== fields.length || fields.some(key => !Object.hasOwn(value,key))) {
    fail('Неверные поля пакета картотеки');
  }
}

function id(value) {
  if (!validId(value)) fail('Неверный ID пакета картотеки');
  return value;
}

function distinctIds(rows, label) {
  const found = new Set();
  for (const value of rows) {
    if (found.has(id(value))) fail('Повтор ID: ' + label);
    found.add(value);
  }
  return found;
}

function archiveOrigin(value) {
  exact(value,['campaignId','sessionId','number']);
  if (!Number.isSafeInteger(value.number) || value.number < 1) fail('Неверный номер архивной сессии');
  return {campaignId:id(value.campaignId), sessionId:id(value.sessionId), number:value.number};
}

function validateArchive(value) {
  exact(value,['id','name','playedOn','journal','origin']);
  const {name,playedOn} = validateSession({
    name:value.name === null ? 'Архив' : value.name,
    playedOn:value.playedOn === null ? '2000-01-01' : value.playedOn,
  });
  const {journal} = validateState({...seed,journal:value.journal});
  if (journal.some(entry => !storyKinds.has(entry.kind))) fail('Архив принимает только сюжетные записи сессии');
  return {id:id(value.id), name:value.name === null ? null : name,
    playedOn:value.playedOn === null ? null : playedOn, journal, origin:archiveOrigin(value.origin)};
}

function referenceReader(source, targets, usedArchives) {
  return (kind, value, optional = true) => {
    switch(value?.status) {
      case 'linked': {
        exact(value,['status','campaignId','id']);
        const targetId = id(value.id);
        if (value.campaignId !== source.campaignId || !targets[kind].has(targetId)) {
          fail('Рабочая ссылка картотеки не имеет цели в пакете');
        }
        if (kind === 'session' && targetId !== source.sessionId) usedArchives.add(targetId);
        return {status:'linked',campaignId:value.campaignId,id:targetId};
      }
      case 'snapshot':
        exact(value,['status','text','origin']);
        if (typeof value.text !== 'string' || !value.text.trim() || value.text.length > 1200) {
          fail('Для недоступного источника нужен сохранённый текст');
        }
        if (value.origin !== null) {
          exact(value.origin,['campaignId','id']);
          id(value.origin.campaignId);
          id(value.origin.id);
        }
        return {status:'snapshot',text:value.text,origin:value.origin && {
          campaignId:value.origin.campaignId,id:value.origin.id,
        }};
      case 'unknown':
        exact(value,['status']);
        if (optional) return {status:'unknown'};
        break;
    }
    fail('Неверное состояние ссылки картотеки');
  };
}

function validateHistory(history, data, reference, budget) {
  if (!Array.isArray(history) || !history.length || history.length > budget.remaining) {
    fail('Превышен предел истории картотеки или нет исходной записи');
  }
  budget.remaining -= history.length;
  let previous = null;
  const origins = new Set();
  const rows = history.map((value,index) => {
    exact(value,['operation','origin','createdAt','before','after']);
    const {operation,origin,createdAt} = value;
    exact(origin,['campaignId','personId','revision']);
    const {revision} = origin;
    if (!campaignPersonOperations.includes(operation) || (index === 0) !== (operation === 'create') ||
        typeof createdAt !== 'string' || createdAt.length > 35 || !Number.isFinite(Date.parse(createdAt)) ||
        !Number.isSafeInteger(revision) || revision < 1) fail('Неверное изменение в истории картотеки');
    const source = {campaignId:id(origin.campaignId), personId:id(origin.personId), revision};
    const key = JSON.stringify(source);
    if (origins.has(key)) fail('Повтор изменения в истории картотеки');
    origins.add(key);
    const before = value.before === null ? null : validatePortablePersonData(value.before,reference);
    const after = validatePortablePersonData(value.after,reference);
    if (!isDeepStrictEqual(before,previous)) fail('Нарушена последовательность истории картотеки');
    previous = after;
    return {operation,origin:source,createdAt,before,after};
  });
  if (!isDeepStrictEqual(previous,data)) fail('Карточка отличается от последней версии в общей истории');
  return rows;
}

export function validateCampaignMemoryPackage(file) {
  exact(file,['app','schemaVersion','ruleset','game','memory']);
  if (file.app !== campaignMemoryApp || file.schemaVersion !== 1 || file.ruleset !== '5e-2014' ||
      file.game?.schemaVersion !== 15) fail('Нужен пакет картотеки v1 с игрой v15');
  if (Buffer.byteLength(JSON.stringify(file)) > campaignMemoryMaxBytes) fail('Пакет картотеки превышает 8 МиБ');
  const game = validateTransfer(file.game);
  const source = file.game.source.context;
  exact(file.memory,['people','archives','placeIds','questIds']);
  const {people,archives,placeIds,questIds} = file.memory;
  if (!Array.isArray(people) || people.length > 1000 || !Array.isArray(archives) || archives.length > historyLimit ||
      !Array.isArray(placeIds) || placeIds.length !== game.places.length ||
      !Array.isArray(questIds) || questIds.length !== game.quests.length) fail('Неверное количество целей картотеки');
  const archiveRows = archives.map(validateArchive);
  const targets = {
    person:distinctIds(people.map(row => row?.id),'карточки'),
    session:distinctIds([source.sessionId,...archiveRows.map(row => row.id)],'сессии'),
    place:distinctIds(placeIds,'места'),
    quest:distinctIds(questIds,'задания'),
  };
  const usedArchives = new Set();
  const reference = referenceReader(source,targets,usedArchives);
  const budget = {remaining:historyLimit};
  const cards = people.map(value => {
    exact(value,['id','createdSession','data','history']);
    const createdSession = reference('session',value.createdSession,false);
    if (createdSession.status !== 'linked') fail('Нет сессии создания карточки');
    const data = validatePortablePersonData(value.data,reference);
    return {id:value.id,createdSession,data,history:validateHistory(value.history,data,reference,budget)};
  });
  if (archiveRows.some(row => !usedArchives.has(row.id))) fail('Пакет содержит архив без ссылки из картотеки');
  return {game,memory:{source, people:cards, archives:archiveRows, placeIds:[...placeIds], questIds:[...questIds]}};
}

function writePortableData(data, reference) {
  return {...data,
    knowledge:data.knowledge.map(({sessionId,sessionSnapshot,...row}) =>
      ({...row,sessionId:reference('session',sessionId,sessionSnapshot)})),
    encounters:data.encounters.map(({sessionId,sessionSnapshot,placeId,placeSnapshot,...row}) =>
      ({...row, sessionId:reference('session',sessionId,sessionSnapshot),
        placeId:reference('place',placeId,placeSnapshot)})),
    links:data.links.map(({kind,id,snapshot}) => ({kind,target:reference(kind,id,snapshot)})),
  };
}

export function campaignMemoryPackage(db, game, {places,quests}) {
  const {campaignId,sessionId} = game.source.context;
  const archives = new Map();
  let count = 0, bytes = Buffer.byteLength(JSON.stringify(game));
  function addBytes(value) {
    bytes += Buffer.byteLength(JSON.stringify(value));
    if (bytes > campaignMemoryMaxBytes) blocked('Пакет картотеки превышает 8 МиБ. Используй SQLite-копию');
  }
  const archiveScope = db.prepare('SELECT 1 FROM sessions s JOIN session_details d ON d.session_id=s.id WHERE s.campaign_id=? AND s.id=? AND d.archived=1');
  const placeIds = places.map(row => row.id), questIds = quests.map(row => row.id);
  const targets = {place:new Set(placeIds),quest:new Set(questIds)};
  function reference(kind,target,snapshot) {
    if (snapshot) return snapshot;
    if (target === null) return {status:'unknown'};
    if (kind === 'session' && target !== sessionId && !archives.has(target)) {
      // Membership in this campaign is already checked in the export transaction.
      // Check scope before projecting any session fields.
      if (!archiveScope.get(campaignId,target)) blocked('Недоступная архивная сессия не может быть выгружена');
      const row = readSession(db,target);
      const archive = {id:target,name:row.name,playedOn:row.playedOn,
        journal:row.data.journal.filter(entry => storyKinds.has(entry.kind)),
        origin:row.importedFrom ?? {campaignId,sessionId:target,number:row.number}};
      addBytes(archive);
      archives.set(target,{archive,number:row.number});
    }
    if (targets[kind] && !targets[kind].has(target)) blocked('Связанная запись не входит в пакет картотеки');
    return {status:'linked',campaignId,id:target};
  }
  const people = [];
  for (const {person,history} of eachCampaignPersonForTransfer(db,campaignId)) {
    const {id,createdSessionId,...data} = person;
    const card = {id,createdSession:reference('session',createdSessionId),
      data:writePortableData(data,reference),history:[]};
    addBytes(card);
    for (const {before,after,...change} of history) {
      const entry = {...change,before:before === null ? null : writePortableData(before,reference),
        after:writePortableData(after,reference)};
      addBytes(entry);
      if (++count > historyLimit) {
        blocked('Картотека превышает предел переноса. Используй SQLite-копию');
      }
      card.history.push(entry);
    }
    people.push(card);
  }
  const file = {app:campaignMemoryApp,schemaVersion:1,ruleset:'5e-2014',game,
    memory:{people,archives:[...archives.values()].sort((a,b) => a.number-b.number).map(row => row.archive),placeIds,questIds}};
  if (Buffer.byteLength(JSON.stringify(file)) > campaignMemoryMaxBytes) {
    blocked('Пакет картотеки превышает 8 МиБ. Используй SQLite-копию');
  }
  validateCampaignMemoryPackage(file);
  return file;
}

function remapPersonData(data, ids) {
  function field(kind,key,snapshotKey,reference) {
    if (reference.status === 'linked') return {[key]:ids[kind].get(reference.id)};
    if (reference.status === 'unknown') return {[key]:null};
    return {[key]:null,[snapshotKey]:reference};
  }
  return {...data,
    knowledge:data.knowledge.map(({sessionId,...row}) =>
      ({...row,...field('session','sessionId','sessionSnapshot',sessionId)})),
    encounters:data.encounters.map(({sessionId,placeId,...row}) =>
      ({...row,...field('session','sessionId','sessionSnapshot',sessionId),
        ...field('place','placeId','placeSnapshot',placeId)})),
    links:data.links.map(({kind,target}) => ({kind,...field(kind,'id','snapshot',target)})),
  };
}

export function prepareCampaignArchives(memory) {
  return memory.archives.map(archive => ({
    id:randomUUID(),
    sourceId:archive.id,
    name:archive.name,
    playedOn:archive.playedOn,
    origin:archive.origin,
    data:{journal:archive.journal,accepted:[],dismissed:['quest','gold','damage'],eventEdits:{}},
  }));
}

// Owns no transaction. The normal import receipt, permission grant and all
// memory rows commit together in store.mjs.
export function importCampaignMemory(db, memory, transfer, archives) {
  const {campaignId,sessionId,placeIds,questIds} = transfer;
  const ids = {
    person:new Map(memory.people.map(person => [person.id,randomUUID()])),
    session:new Map([[memory.source.sessionId,sessionId]]),
    place:new Map(memory.placeIds.map((old,index) => [old,placeIds[index]])),
    quest:new Map(memory.questIds.map((old,index) => [old,questIds[index]])),
  };
  const details = db.prepare('INSERT INTO session_details VALUES (?,?,?,1)');
  const origin = db.prepare('INSERT INTO campaign_archive_origins VALUES (?,?)');
  for (const archive of archives) {
    details.run(archive.id,archive.name,archive.playedOn);
    origin.run(archive.id,JSON.stringify(archive.origin));
    ids.session.set(archive.sourceId,archive.id);
  }
  const insert = db.prepare('INSERT INTO campaign_people VALUES (?,?,?,?)');
  const history = db.prepare('INSERT INTO campaign_person_imports VALUES (?,?,?)');
  for (const person of memory.people) {
    const newId = ids.person.get(person.id);
    insert.run(newId,campaignId,ids.session.get(person.createdSession.id),
      JSON.stringify(remapPersonData(person.data,ids)));
    history.run(campaignId,newId,JSON.stringify(person.history.map(change => ({
      ...change,before:change.before === null ? null : remapPersonData(change.before,ids),
      after:remapPersonData(change.after,ids),
    }))));
  }
}
