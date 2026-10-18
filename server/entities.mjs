import { randomUUID } from 'node:crypto';
import { AppError, validateState } from './state.mjs';

export function contextIds(context) {
  return { campaignId: context.campaign.id, characterId: context.character.id, sessionId: context.session.id };
}

// The caller owns the transaction. Creation deliberately requires an explicit
// validated state, rather than silently cloning the currently active adventure.
export function createGame(db, state) {
  const parts = splitState(state);
  const ids = { campaignId: randomUUID(), characterId: randomUUID(), sessionId: randomUUID() };
  db.prepare('INSERT INTO campaigns VALUES (?, ?, ?)').run(ids.campaignId, '5e-2014', JSON.stringify(parts.campaign));
  db.prepare('INSERT INTO characters VALUES (?, ?, ?)').run(ids.characterId, ids.campaignId, JSON.stringify(parts.character));
  db.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(ids.sessionId, ids.campaignId, JSON.stringify(parts.session));
  selectGame(db, ids);
  return ids;
}

export function selectGame(db, ids) {
  if (db.prepare('SELECT archived FROM session_details WHERE session_id=?').get(ids.sessionId)?.archived) throw new AppError(409, 'Архивная сессия доступна только для чтения');
  const found = db.prepare(`SELECT c.id FROM campaigns c
    JOIN characters h ON h.campaign_id=c.id AND h.id=?
    JOIN sessions s ON s.campaign_id=c.id AND s.id=? WHERE c.id=?`).get(ids.characterId, ids.sessionId, ids.campaignId);
  if (!found) throw new AppError(404, 'Кампания, персонаж или сессия не найдены в одной игре');
  db.prepare('UPDATE active_context SET campaign_id=?, character_id=?, session_id=? WHERE id=1').run(ids.campaignId, ids.characterId, ids.sessionId);
}

export function listGames(db) {
  return db.prepare(`SELECT c.id, c.ruleset, c.data_json,
    (SELECT json_group_array(json_object('id', h.id, 'name', json_extract(h.data_json, '$.name'))) FROM characters h WHERE h.campaign_id=c.id) AS characters,
    (SELECT json_group_array(json_object('id', s.id)) FROM sessions s WHERE s.campaign_id=c.id AND NOT EXISTS(SELECT 1 FROM session_details d WHERE d.session_id=s.id AND d.archived=1)) AS sessions
    FROM campaigns c ORDER BY c.rowid`).all().map(row => ({
      id: row.id, name: JSON.parse(row.data_json).name, ruleset: row.ruleset,
      characters: JSON.parse(row.characters), sessions: JSON.parse(row.sessions),
    }));
}

// Format of the existing HTTP workspace remains v1; database layout is now v2.
export function splitState(input) {
  const state = validateState(input);
  const { profile, mapNotes, checks, journal, accepted, dismissed, eventEdits, ...character } = state;
  return {
    campaign: { name: profile.campaign, mapNotes, checks },
    character: { ...character, name: profile.name, tagline: profile.tagline },
    session: { journal, accepted, dismissed, eventEdits },
  };
}

export function joinState({ campaign, character, session }) {
  const { name, tagline, ...resources } = character;
  return validateState({ ...resources, ...session, mapNotes: campaign.mapNotes, checks: campaign.checks,
    profile: { name, tagline, campaign: campaign.name } });
}

export function migrateEntities(db) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const row = db.prepare('SELECT * FROM workspace WHERE id=1').get();
    if (row.schema_version === 2) { db.exec('COMMIT'); return; }
    if (row.schema_version !== 1) throw new Error('Неподдерживаемая версия базы');
    const parts = splitState(JSON.parse(row.state_json));
    db.exec(`
      CREATE TABLE campaigns (id TEXT PRIMARY KEY, ruleset TEXT NOT NULL CHECK(ruleset='5e-2014'), data_json TEXT NOT NULL);
      CREATE TABLE characters (
        id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES campaigns(id), data_json TEXT NOT NULL,
        UNIQUE(id, campaign_id)
      );
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES campaigns(id), data_json TEXT NOT NULL,
        UNIQUE(id, campaign_id)
      );
      CREATE TABLE active_context (
        id INTEGER PRIMARY KEY CHECK(id=1), campaign_id TEXT NOT NULL REFERENCES campaigns(id),
        character_id TEXT NOT NULL, session_id TEXT NOT NULL,
        FOREIGN KEY(character_id, campaign_id) REFERENCES characters(id, campaign_id),
        FOREIGN KEY(session_id, campaign_id) REFERENCES sessions(id, campaign_id)
      );
    `);
    const campaignId = randomUUID(), characterId = randomUUID(), sessionId = randomUUID();
    db.prepare('INSERT INTO campaigns VALUES (?, ?, ?)').run(campaignId, '5e-2014', JSON.stringify(parts.campaign));
    db.prepare('INSERT INTO characters VALUES (?, ?, ?)').run(characterId, campaignId, JSON.stringify(parts.character));
    db.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(sessionId, campaignId, JSON.stringify(parts.session));
    db.prepare('INSERT INTO active_context VALUES (1, ?, ?, ?)').run(campaignId, characterId, sessionId);
    db.prepare('UPDATE workspace SET schema_version=2 WHERE id=1').run();
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

export function readEntities(db) {
  // One SQL snapshot avoids mixing entities from different committed revisions.
  const row = db.prepare(`SELECT a.campaign_id, a.character_id, a.session_id,
    c.ruleset, c.data_json AS campaign, h.data_json AS character, s.data_json AS session,
    w.revision, w.updated_at
    FROM active_context a
    JOIN campaigns c ON c.id=a.campaign_id
    JOIN characters h ON h.id=a.character_id AND h.campaign_id=a.campaign_id
    JOIN sessions s ON s.id=a.session_id AND s.campaign_id=a.campaign_id
    JOIN workspace w ON w.id=a.id WHERE a.id=1`).get();
  if (!row) throw new Error('Не найдены связанные данные активной игры');
  return {
    revision: row.revision, updatedAt: row.updated_at, ruleset: row.ruleset,
    campaign: { id: row.campaign_id, data: JSON.parse(row.campaign) },
    character: { id: row.character_id, campaignId: row.campaign_id, data: JSON.parse(row.character) },
    session: { id: row.session_id, campaignId: row.campaign_id, data: JSON.parse(row.session) },
  };
}

// Called inside the same transaction as the workspace revision and audit entry.
export function writeEntities(db, state) {
  const parts = splitState(state);
  const active = db.prepare('SELECT * FROM active_context WHERE id=1').get();
  if (!active) throw new Error('Активная игра не найдена');
  for (const [table, key, data] of [['campaigns', 'campaign_id', parts.campaign], ['characters', 'character_id', parts.character], ['sessions', 'session_id', parts.session]]) {
    const result = db.prepare(`UPDATE ${table} SET data_json=? WHERE id=?`).run(JSON.stringify(data), active[key]);
    if (result.changes !== 1) throw new Error('Сущность активной игры не найдена');
  }
}
