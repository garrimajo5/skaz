import { DatabaseSync, backup } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { AppError, seed, validateState } from './state.mjs';
import { createCatalog } from './catalog.mjs';
import { setupSessions, validateSession, startSession, listSessions, readSession } from './sessions.mjs';
import { migrateEntities, readEntities, writeEntities, joinState, contextIds, createGame, selectGame, listGames } from './entities.mjs';

export function openStore(filename) {
  if (filename !== ':memory:') mkdirSync(path.dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS workspace (
      id INTEGER PRIMARY KEY CHECK(id=1), schema_version INTEGER NOT NULL,
      revision INTEGER NOT NULL, state_json TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS changes (
      mutation_id TEXT PRIMARY KEY, revision INTEGER NOT NULL UNIQUE,
      request_hash TEXT NOT NULL, label TEXT NOT NULL,
      before_json TEXT NOT NULL, after_json TEXT NOT NULL, created_at TEXT NOT NULL
    );
  `);
  db.prepare('INSERT OR IGNORE INTO workspace VALUES (1, 1, 0, ?, ?)').run(JSON.stringify(seed), new Date().toISOString());
  if (![1, 2].includes(db.prepare('SELECT schema_version FROM workspace').get().schema_version)) {
    db.close(); throw new Error('Версия базы не поддерживается. Нужна миграция; база не изменена.');
  }
  try { migrateEntities(db); } catch (error) { db.close(); throw error; }
  setupSessions(db);
  db.exec(`CREATE TABLE IF NOT EXISTS context_changes (
    mutation_id TEXT PRIMARY KEY REFERENCES changes(mutation_id),
    operation TEXT NOT NULL, before_json TEXT NOT NULL, after_json TEXT NOT NULL
  )`);
  function read() {
    const context = readEntities(db);
    return { schemaVersion: 1, revision: context.revision, updatedAt: context.updatedAt, context: contextIds(context),
      state: joinState({ campaign: context.campaign.data, character: context.character.data, session: context.session.data }) };
  }
  function update(request) {
    const next = validateState(request.state);
    const { expectedRevision, label } = request;
    const hash = createHash('sha256').update(JSON.stringify({ expectedRevision, label, state: next })).digest('hex');
    return mutate(request, hash, label, () => { writeEntities(db, next); return next; });
  }
  function mutate(request, hash, label, apply, operation) {
    const { mutationId, expectedRevision } = request;
    if (typeof mutationId !== 'string' || !/^[a-zA-Z0-9-]{8,80}$/.test(mutationId)) throw new AppError(400, 'Нужен идентификатор изменения');
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new AppError(400, 'Нужна версия состояния');
    if (typeof label !== 'string' || !label.trim() || label.length > 200) throw new AppError(400, 'Нужно описание изменения');
    db.exec('BEGIN IMMEDIATE');
    try {
      const previous = db.prepare('SELECT request_hash FROM changes WHERE mutation_id=?').get(mutationId);
      if (previous) {
        if (previous.request_hash !== hash) throw new AppError(409, 'Идентификатор уже использован для другого изменения');
        const receipt = db.prepare('SELECT after_json FROM context_changes WHERE mutation_id=?').get(mutationId);
        const response = { ...read(), replayed: true, ...(receipt ? { affectedContext: JSON.parse(receipt.after_json) } : {}) };
        db.exec('COMMIT');
        return response;
      }
      const current = read();
      if (current.revision !== expectedRevision) throw new AppError(409, 'Данные изменились в другой вкладке. Загрузи актуальную версию.');
      const now = new Date().toISOString();
      const revision = current.revision + 1;
      const next = apply();
      db.prepare('INSERT INTO changes VALUES (?, ?, ?, ?, ?, ?, ?)').run(mutationId, revision, hash, label, JSON.stringify(current.state), JSON.stringify(next), now);
      db.prepare('UPDATE workspace SET revision=?, state_json=?, updated_at=? WHERE id=1').run(revision, JSON.stringify(next), now);
      const affectedContext = contextIds(readEntities(db));
      if (operation) db.prepare('INSERT INTO context_changes VALUES (?, ?, ?, ?)').run(mutationId, operation, JSON.stringify(current.context), JSON.stringify(affectedContext));
      const response = { ...read(), ...(operation ? { affectedContext } : {}) };
      db.exec('COMMIT');
      return response;
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  function gameCommand(operation, request) {
    const allowed = operation === 'session' ? ['mutationId', 'expectedRevision', 'session'] : operation === 'create' ? ['mutationId', 'expectedRevision', 'state'] : ['mutationId', 'expectedRevision', 'context'];
    if (!request || typeof request !== 'object' || Array.isArray(request) || Object.keys(request).some(key => !allowed.includes(key))) throw new AppError(400, 'Неверные поля команды');
    let payload;
    if (operation === 'session') payload = validateSession(request.session);
    else if (operation === 'create') payload = validateState(request.state);
    else {
      const ids = request.context;
      const keys = ['campaignId', 'characterId', 'sessionId'];
      if (!ids || typeof ids !== 'object' || Array.isArray(ids) || Object.keys(ids).length !== 3 || keys.some(key => typeof ids[key] !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(ids[key]))) throw new AppError(400, 'Нужны ID кампании, персонажа и сессии');
      payload = Object.fromEntries(keys.map(key => [key, ids[key]]));
    }
    const hash = createHash('sha256').update(JSON.stringify({ operation, expectedRevision: request.expectedRevision, payload })).digest('hex');
    return mutate(request, hash, operation === 'session' ? 'Начало сессии' : operation === 'create' ? 'Создание кампании' : 'Переключение игры', () => {
      if (operation === 'session') startSession(db, payload);
      else if (operation === 'create') createGame(db, payload); else selectGame(db, payload);
      return read().state;
    }, operation);
  }
  return {
    catalog: createCatalog(db),
    context: () => readEntities(db),
    campaigns: () => listGames(db),
    createCampaign: request => gameCommand('create', request),
    selectContext: request => gameCommand('select', request),
    startSession: request => gameCommand('session', request),
    sessions: campaignId => listSessions(db, campaignId),
    session: id => readSession(db, id),
    read, update,
    history: () => db.prepare('SELECT revision, label, created_at AS createdAt FROM changes ORDER BY revision DESC LIMIT 50').all(),
    backup: destination => backup(db, destination),
    close: () => db.close(),
  };
}
