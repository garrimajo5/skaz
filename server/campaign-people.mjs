import { AppError } from './state.mjs';

const kinds = ['known', 'assumption'];
const targets = new Map([
  ['person', 'campaign_people'],
  ['place', 'campaign_places'],
  ['quest', 'quests'],
  ['session', 'sessions'],
]);
const personLimit = 1000;
const entryLimit = 128;
const linkLimit = 64;
const historyPageSize = 10;
const fields = ['mutationId', 'expectedRevision', 'campaignId', 'personId', 'operation', 'data'];
export const campaignPersonOperations = Object.freeze([
  'create', 'edit', 'add-knowledge', 'edit-knowledge', 'confirm-knowledge',
  'add-encounter', 'edit-encounter', 'choose-latest', 'set-links', 'remove-link-snapshot',
]);
const validId = value => typeof value === 'string' && /^[a-zA-Z0-9-]{8,80}$/.test(value);
const invalid = message => { throw new AppError(422, message); };
const missing = () => { throw new AppError(404, 'Запись не найдена в активной кампании'); };

export function setupCampaignPeople(db) {
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS campaign_people (
      id TEXT NOT NULL, campaign_id TEXT NOT NULL REFERENCES campaigns(id),
      created_session_id TEXT NOT NULL, data_json TEXT NOT NULL,
      PRIMARY KEY(campaign_id,id),
      FOREIGN KEY(created_session_id, campaign_id) REFERENCES sessions(id, campaign_id));
      CREATE TABLE IF NOT EXISTS campaign_person_changes (
        mutation_id TEXT PRIMARY KEY REFERENCES changes(mutation_id) DEFERRABLE INITIALLY DEFERRED,
        campaign_id TEXT NOT NULL, person_id TEXT NOT NULL, operation TEXT NOT NULL,
        before_json TEXT, after_json TEXT NOT NULL,
        FOREIGN KEY(campaign_id,person_id) REFERENCES campaign_people(campaign_id,id));
      CREATE INDEX IF NOT EXISTS campaign_person_changes_person ON campaign_person_changes(campaign_id,person_id);
      CREATE TABLE IF NOT EXISTS campaign_person_imports (
        campaign_id TEXT NOT NULL, person_id TEXT NOT NULL, history_json TEXT NOT NULL,
        PRIMARY KEY(campaign_id,person_id),
        FOREIGN KEY(campaign_id,person_id) REFERENCES campaign_people(campaign_id,id));
      CREATE TABLE IF NOT EXISTS campaign_archive_origins (
        session_id TEXT PRIMARY KEY REFERENCES sessions(id), origin_json TEXT NOT NULL);`);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) {
    invalid('Неверные поля команды картотеки');
  }
}

function text(value, max, required = false) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) {
    invalid('Неверный текст картотеки');
  }
  return required ? value.trim() : value;
}

function id(value, optional = false) {
  if (!(optional && value === null) && !validId(value)) invalid('Неверный ID картотеки');
  return value;
}

function details(value) {
  exact(value, ['name', 'description', 'relation']);
  return {
    name: text(value.name, 120, true),
    description: text(value.description, 1200),
    relation: value.relation === null ? null : text(value.relation, 1200, true),
  };
}

function snapshotEdit(value, creating, kinds) {
  if (creating || !Object.hasOwn(value ?? {}, 'clearSnapshots')) return {};
  const {clearSnapshots} = value;
  if (!Array.isArray(clearSnapshots) || !clearSnapshots.length || clearSnapshots.length > kinds.length ||
      new Set(clearSnapshots).size !== clearSnapshots.length ||
      clearSnapshots.some(kind => !kinds.includes(kind) || value[kind+'Id'] !== null)) {
    invalid('Для удаления снимка нужно оставить поле неизвестным');
  }
  return {clearSnapshots:[...clearSnapshots].sort()};
}

function knowledge(value, creating) {
  const snapshots = snapshotEdit(value,creating,['session']);
  exact(value, ['id', 'text', 'sessionId', ...(creating ? ['kind'] : []), ...Object.keys(snapshots)]);
  if (creating && !kinds.includes(value.kind)) invalid('Нужен вид сведения');
  return {
    id: id(value.id),
    ...(creating ? { kind: value.kind } : {}),
    text: text(value.text, 1200, true),
    sessionId: id(value.sessionId, true),
    ...snapshots,
  };
}

function encounter(value, creating) {
  const snapshots = snapshotEdit(value,creating,['session','place']);
  exact(value, ['id', 'text', 'sessionId', 'placeId', ...(creating ? ['makeLatest'] : []), ...Object.keys(snapshots)]);
  if (creating && typeof value.makeLatest !== 'boolean') invalid('Нужен явный выбор последней встречи');
  return {
    id: id(value.id),
    text: text(value.text, 1200),
    sessionId: id(value.sessionId, true),
    placeId: id(value.placeId, true),
    ...(creating ? { makeLatest: value.makeLatest } : {}),
    ...snapshots,
  };
}

function links(value) {
  exact(value, ['links']);
  if (!Array.isArray(value.links) || value.links.length > linkLimit) invalid('Слишком много связей');
  const seen = new Set();
  return { links: value.links.map(link => {
    exact(link, ['kind', 'id']);
    if (!targets.has(link.kind)) invalid('Неизвестный вид связи');
    const target = id(link.id);
    const key = link.kind + ':' + target;
    if (seen.has(key)) invalid('Повторная связь');
    seen.add(key);
    return { kind: link.kind, id: target };
  }) };
}

function commandData(operation, data) {
  switch (operation) {
    case 'create':
      exact(data, ['details', 'knowledge']);
      return {
        details: details(data.details),
        knowledge: data.knowledge === null ? null : knowledge(data.knowledge, true),
      };
    case 'edit':
      return details(data);
    case 'add-knowledge':
    case 'edit-knowledge':
      return knowledge(data, operation === 'add-knowledge');
    case 'add-encounter':
    case 'edit-encounter':
      return encounter(data, operation === 'add-encounter');
    case 'confirm-knowledge':
      exact(data, ['id']);
      return { id: id(data.id) };
    case 'choose-latest':
      exact(data, ['id']);
      return { id: id(data.id, true) };
    case 'set-links':
      return links(data);
    case 'remove-link-snapshot':
      exact(data,['index']);
      if (!Number.isSafeInteger(data.index) || data.index < 0 || data.index >= linkLimit) invalid('Неверная позиция снимка');
      return {index:data.index};
    default:
      invalid('Неизвестная операция картотеки');
  }
}

export function validateCampaignPersonCommand(request) {
  exact(request, fields);
  return {
    campaignId: id(request.campaignId),
    personId: id(request.personId),
    operation: request.operation,
    data: commandData(request.operation, request.data),
  };
}

function getPerson(db, campaignId, personId) {
  return db.prepare('SELECT id, created_session_id, data_json FROM campaign_people WHERE campaign_id=? AND id=?')
    .get(campaignId, personId);
}

function unpack(row) {
  return { id: row.id, createdSessionId: row.created_session_id, ...JSON.parse(row.data_json) };
}

function uniqueRows(value, max, normalize, key = item => item.id) {
  if (!Array.isArray(value) || value.length > max) invalid('Неверный список записей картотеки');
  const seen = new Set();
  return value.map(item => {
    const row = normalize(item);
    const value = key(row);
    if (seen.has(value)) invalid('Повтор ID записи картотеки');
    seen.add(value);
    return row;
  });
}

// Transfer uses explicit typed references. Reuse the command field validation
// for the rest of the card, then keep the resolved ID or inert snapshot.
export function validatePortablePersonData(value, reference) {
  exact(value, ['name', 'description', 'relation', 'knowledge', 'encounters', 'links', 'latestEncounterId']);
  const entries = uniqueRows(value.knowledge, entryLimit, item => {
    exact(item, ['id', 'kind', 'text', 'sessionId']);
    return { ...knowledge({...item, sessionId:null}, true), sessionId:reference('session',item.sessionId) };
  });
  const encounters = uniqueRows(value.encounters, entryLimit, item => {
    exact(item, ['id', 'text', 'sessionId', 'placeId']);
    return { ...encounter({...item, sessionId:null, placeId:null}, false),
      sessionId:reference('session',item.sessionId), placeId:reference('place',item.placeId) };
  });
  const linkRows = uniqueRows(value.links, linkLimit, item => {
    exact(item, ['kind','target']);
    if (!targets.has(item.kind)) invalid('Неизвестный тип связи');
    return {kind:item.kind, target:reference(item.kind,item.target, false)};
  }, item => JSON.stringify([item.kind,item.target]));
  const latestEncounterId = id(value.latestEncounterId, true);
  if (latestEncounterId !== null && !encounters.some(item => item.id === latestEncounterId)) {
    invalid('Последняя встреча должна принадлежать карточке');
  }
  const {name, description, relation} = value;
  return {...details({name,description,relation}), knowledge:entries, encounters, links:linkRows, latestEncounterId};
}

function addRow(rows, item) {
  if (rows.some(row => row.id === item.id)) throw new AppError(409, 'ID записи уже используется');
  if (rows.length >= entryLimit) invalid('Достигнут лимит записей карточки');
  rows.push(item);
}

function updateRow(rows, item) {
  const index = rows.findIndex(row => row.id === item.id);
  if (index < 0) missing();
  const {clearSnapshots=[], ...fields} = item;
  const updated = { ...rows[index], ...fields };
  for (const kind of ['session','place']) {
    if (fields[kind+'Id'] || clearSnapshots.includes(kind)) delete updated[kind+'Snapshot'];
  }
  rows[index] = updated;
}

function checkLink(db, campaignId, kind, targetId) {
  if (targetId === null) return;
  const table = targets.get(kind);
  if (!db.prepare('SELECT 1 FROM ' + table + ' WHERE id=? AND campaign_id=?').get(targetId, campaignId)) {
    missing();
  }
}

function changePerson(db, campaignId, person, { operation, data }) {
  switch (operation) {
    case 'edit':
      Object.assign(person, data);
      break;
    case 'add-knowledge':
    case 'edit-knowledge':
      checkLink(db, campaignId, 'session', data.sessionId);
      if (operation === 'add-knowledge') addRow(person.knowledge, data);
      else updateRow(person.knowledge, data);
      break;
    case 'confirm-knowledge': {
      const selected = person.knowledge.find(row => row.id === data.id);
      if (!selected) missing();
      if (selected.kind !== 'assumption') throw new AppError(409, 'Сведение уже подтверждено');
      selected.kind = 'known';
      break;
    }
    case 'add-encounter': {
      const { makeLatest, ...entry } = data;
      checkLink(db, campaignId, 'session', entry.sessionId);
      checkLink(db, campaignId, 'place', entry.placeId);
      addRow(person.encounters, entry);
      if (makeLatest) person.latestEncounterId = entry.id;
      break;
    }
    case 'edit-encounter':
      checkLink(db, campaignId, 'session', data.sessionId);
      checkLink(db, campaignId, 'place', data.placeId);
      updateRow(person.encounters, data);
      break;
    case 'choose-latest':
      if (data.id !== null && !person.encounters.some(row => row.id === data.id)) missing();
      person.latestEncounterId = data.id;
      break;
    case 'set-links': {
      const snapshots = person.links.filter(link => link.snapshot);
      if (data.links.length + snapshots.length > linkLimit) invalid('Слишком много связей');
      for (const link of data.links) checkLink(db, campaignId, link.kind, link.id);
      person.links = [...data.links,...snapshots];
      break;
    }
    case 'remove-link-snapshot':
      if (!person.links[data.index]?.snapshot) missing();
      person.links.splice(data.index,1);
      break;
  }
}

export function saveCampaignPerson(db, payload, mutationId, context) {
  const { campaignId, personId, operation, data } = payload;
  if (campaignId !== context.campaignId) throw new AppError(409, 'Активная кампания изменилась');
  const previous = getPerson(db, campaignId, personId);
  let person;
  if (operation === 'create') {
    if (previous) {
      throw new AppError(409, 'ID лица уже используется');
    }
    if (db.prepare('SELECT count(*) AS n FROM campaign_people WHERE campaign_id=?').get(campaignId).n >= personLimit) {
      invalid('Достигнут лимит карточек кампании');
    }
    if (data.knowledge) checkLink(db, campaignId, 'session', data.knowledge.sessionId);
    person = {
      ...data.details,
      knowledge: data.knowledge ? [data.knowledge] : [],
      encounters: [],
      links: [],
      latestEncounterId: null,
    };
    db.prepare('INSERT INTO campaign_people VALUES (?, ?, ?, ?)')
      .run(personId, campaignId, context.sessionId, JSON.stringify(person));
  } else {
    if (!previous) missing();
    person = JSON.parse(previous.data_json);
    changePerson(db, campaignId, person, payload);
    db.prepare('UPDATE campaign_people SET data_json=? WHERE id=? AND campaign_id=?')
      .run(JSON.stringify(person), personId, campaignId);
  }
  db.prepare('INSERT INTO campaign_person_changes VALUES (?, ?, ?, ?, ?, ?)')
    .run(mutationId, campaignId, personId, operation, previous?.data_json ?? null, JSON.stringify(person));
}

export function listCampaignPeople(db, campaignId) {
  return db.prepare('SELECT id, created_session_id, data_json FROM campaign_people WHERE campaign_id=? ORDER BY rowid')
    .all(campaignId).map(row => {
      const { id, createdSessionId, name, description, relation, encounters, latestEncounterId } = unpack(row);
      return { id, createdSessionId, name, description, relation,
        latestEncounter: encounters.find(item => item.id === latestEncounterId) ?? null };

    });
}

export function readCampaignPerson(db, campaignId, personId) {
  const row = getPerson(db, campaignId, id(personId));
  if (!row) missing();
  return unpack(row);
}

function importedHistory(db, campaignId, personId) {
  const row = db.prepare('SELECT history_json FROM campaign_person_imports WHERE campaign_id=? AND person_id=?')
    .get(campaignId,personId);
  return row ? JSON.parse(row.history_json) : [];
}

const nativeHistorySelect = `SELECT p.operation, p.before_json, p.after_json, c.revision, c.created_at
  FROM campaign_person_changes p JOIN changes c ON c.mutation_id=p.mutation_id WHERE p.campaign_id=? AND p.person_id=?`;

function historyEntry(row, campaignId, personId) {
  return {
    operation:row.operation, origin:{campaignId, personId, revision:row.revision}, createdAt:row.created_at,
    before:row.before_json === null ? null : JSON.parse(row.before_json), after:JSON.parse(row.after_json),
  };
}

export function* eachCampaignPersonForTransfer(db, campaignId) {
  const people = db.prepare('SELECT id, created_session_id, data_json FROM campaign_people WHERE campaign_id=? ORDER BY rowid')
    .iterate(campaignId);
  const native = db.prepare(nativeHistorySelect + ' ORDER BY c.revision');
  for (const row of people) {
    const history = function* () {
      yield* importedHistory(db,campaignId,row.id);
      for (const change of native.iterate(campaignId,row.id)) yield historyEntry(change,campaignId,row.id);
    };
    yield {person:unpack(row), history:history()};
  }
}

export function readCampaignPersonHistory(db, campaignId, personId, beforePosition = Number.MAX_SAFE_INTEGER) {
  id(personId);
  if (!Number.isSafeInteger(beforePosition) || beforePosition < 1) invalid('Неверная граница истории');
  if (!getPerson(db,campaignId,personId)) missing();
  const imported = importedHistory(db,campaignId,personId);
  const count = db.prepare('SELECT count(*) AS n FROM campaign_person_changes WHERE campaign_id=? AND person_id=?')
    .get(campaignId,personId).n;
  const end = Math.min(imported.length + count, beforePosition - 1);
  const start = Math.max(0,end - historyPageSize);
  const nativeEnd = Math.max(0,end - imported.length), nativeStart = Math.max(0,start - imported.length);
  const rows = nativeEnd > nativeStart ? db.prepare(nativeHistorySelect + ' ORDER BY c.revision DESC LIMIT ? OFFSET ?')
    .all(campaignId,personId,nativeEnd - nativeStart,count - nativeEnd) : [];
  const changes = rows.map(row => historyEntry(row,campaignId,personId))
    .concat(imported.slice(start,Math.min(imported.length,end)).reverse());
  return {
    changes:changes.map((change,index) => ({...change, position:end-index, revision:change.origin.revision})),
    nextBeforePosition:start > 0 ? start+1 : null,
  };
}

export function assertCampaignPeopleExportable(db, campaignId) {
  const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='campaign_people'").get();
  if (exists && db.prepare('SELECT 1 FROM campaign_people WHERE campaign_id=? LIMIT 1').get(campaignId)) {
    throw new AppError(409, 'Для кампании с картотекой нужен пакет картотеки или полная SQLite-копия');
  }
}
