import { DatabaseSync, backup } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { AppError, seed, validateState } from './state.mjs';

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
  if (db.prepare('SELECT schema_version FROM workspace').get().schema_version !== 1) {
    db.close(); throw new Error('Версия базы не поддерживается. Нужна миграция; база не изменена.');
  }
  function read() {
    const row = db.prepare('SELECT * FROM workspace WHERE id=1').get();
    return { schemaVersion: row.schema_version, revision: row.revision, updatedAt: row.updated_at, state: JSON.parse(row.state_json) };
  }
  function update(request) {
    const { mutationId, expectedRevision, label } = request;
    if (typeof mutationId !== 'string' || !/^[a-zA-Z0-9-]{8,80}$/.test(mutationId)) throw new AppError(400, 'Нужен идентификатор изменения');
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new AppError(400, 'Нужна версия состояния');
    if (typeof label !== 'string' || !label.trim() || label.length > 200) throw new AppError(400, 'Нужно описание изменения');
    const next = validateState(request.state);
    const hash = createHash('sha256').update(JSON.stringify({ expectedRevision, label, state: next })).digest('hex');
    db.exec('BEGIN IMMEDIATE');
    try {
      const previous = db.prepare('SELECT request_hash FROM changes WHERE mutation_id=?').get(mutationId);
      if (previous) {
        if (previous.request_hash !== hash) throw new AppError(409, 'Идентификатор уже использован для другого изменения');
        db.exec('COMMIT');
        return { ...read(), replayed: true };
      }
      const current = read();
      if (current.revision !== expectedRevision) throw new AppError(409, 'Данные изменились в другой вкладке. Загрузи актуальную версию.');
      const now = new Date().toISOString();
      const revision = current.revision + 1;
      db.prepare('INSERT INTO changes VALUES (?, ?, ?, ?, ?, ?, ?)').run(mutationId, revision, hash, label, JSON.stringify(current.state), JSON.stringify(next), now);
      db.prepare('UPDATE workspace SET revision=?, state_json=?, updated_at=? WHERE id=1').run(revision, JSON.stringify(next), now);
      db.exec('COMMIT');
      return read();
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  return {
    read, update,
    history: () => db.prepare('SELECT revision, label, created_at AS createdAt FROM changes ORDER BY revision DESC LIMIT 50').all(),
    backup: destination => backup(db, destination),
    close: () => db.close(),
  };
}
