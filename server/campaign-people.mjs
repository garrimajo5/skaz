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
      CREATE INDEX IF NOT EXISTS campaign_person_changes_person ON campaign_person_changes(campaign_id,person_id)`);
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

function knowledge(value, creating) {
  exact(value, ['id', 'text', 'sessionId', ...(creating ? ['kind'] : [])]);
  if (creating && !kinds.includes(value.kind)) invalid('Нужен вид сведения');
  return {
    id: id(value.id),
    ...(creating ? { kind: value.kind } : {}),
    text: text(value.text, 1200, true),
    sessionId: id(value.sessionId, true),
  };
}

function encounter(value, creating) {
  exact(value, ['id', 'text', 'sessionId', 'placeId', ...(creating ? ['makeLatest'] : [])]);
  if (creating && typeof value.makeLatest !== 'boolean') invalid('Нужен явный выбор последней встречи');
  return {
    id: id(value.id),
    text: text(value.text, 1200),
    sessionId: id(value.sessionId, true),
    placeId: id(value.placeId, true),
    ...(creating ? { makeLatest: value.makeLatest } : {}),
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

function addRow(rows, item) {
  if (rows.some(row => row.id === item.id)) throw new AppError(409, 'ID записи уже используется');
  if (rows.length >= entryLimit) invalid('Достигнут лимит записей карточки');
  rows.push(item);
}

function updateRow(rows, item) {
  const index = rows.findIndex(row => row.id === item.id);
  if (index < 0) missing();
  rows[index] = { ...rows[index], ...item };
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
    case 'set-links':
      for (const link of data.links) checkLink(db, campaignId, link.kind, link.id);
      person.links = data.links;
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

export function readCampaignPersonHistory(db, campaignId, personId, beforeRevision = Number.MAX_SAFE_INTEGER) {
  id(personId);
  if (!Number.isSafeInteger(beforeRevision) || beforeRevision < 1) invalid('Неверная граница истории');
  if (!getPerson(db, campaignId, personId)) missing();
  const rows = db.prepare(`SELECT p.operation, p.before_json, p.after_json, c.revision, c.created_at
    FROM campaign_person_changes p JOIN changes c ON c.mutation_id=p.mutation_id
    WHERE p.campaign_id=? AND p.person_id=? AND c.revision<? ORDER BY c.revision DESC LIMIT ?`)
    .all(campaignId, personId, beforeRevision, historyPageSize + 1);
  const page = rows.slice(0, historyPageSize);
  return {
    changes: page.map(row => ({
      operation: row.operation,
      revision: row.revision,
      createdAt: row.created_at,
      before: row.before_json === null ? null : JSON.parse(row.before_json),
      after: JSON.parse(row.after_json),
    })),
    nextBeforeRevision: rows.length > historyPageSize ? page.at(-1).revision : null,
  };
}

export function assertCampaignPeopleExportable(db, campaignId) {
  const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='campaign_people'").get();
  if (exists && db.prepare('SELECT 1 FROM campaign_people WHERE campaign_id=? LIMIT 1').get(campaignId)) {
    throw new AppError(409, 'Для кампании с картотекой нужна SQLite-копия до поддержки нового пакета');
  }
}
