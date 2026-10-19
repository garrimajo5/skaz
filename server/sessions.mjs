import { activeSelection } from './views.mjs';
import { randomUUID } from 'node:crypto';
import { AppError } from './state.mjs';

export function setupSessions(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS session_details (
    session_id TEXT PRIMARY KEY REFERENCES sessions(id), name TEXT, played_on TEXT,
    archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1))
  );
  CREATE TRIGGER IF NOT EXISTS protect_archived_session BEFORE UPDATE ON sessions
    WHEN EXISTS(SELECT 1 FROM session_details WHERE session_id=OLD.id AND archived=1)
    BEGIN SELECT RAISE(ABORT, 'Archived session is read-only'); END;`);
}

export function validateSession(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['name', 'playedOn'].includes(key))) throw new AppError(422, 'Неверные поля сессии');
  if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 120) throw new AppError(422, 'Название сессии: от 1 до 120 символов');
  const date = input.playedOn;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date < '0001-01-01' || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new AppError(422, 'Нужна существующая дата в формате YYYY-MM-DD');
  return { name: input.name.trim(), playedOn: date };
}

// Caller owns the workspace transaction and revision check.
export function startSession(db, details, viewId) {
  const current = activeSelection(db, viewId);
  if (!current) throw new AppError(409, 'Нет активной игры');
  db.prepare('INSERT OR IGNORE INTO session_details(session_id) VALUES (?)').run(current.session_id);
  db.prepare('UPDATE session_details SET archived=1 WHERE session_id=?').run(current.session_id);
  const id = randomUUID();
  // Fixed prototype suggestions must not appear again as fresh real events.
  const data = { journal: [], accepted: [], dismissed: ['quest', 'gold', 'damage'], eventEdits: {} };
  db.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(id, current.campaign_id, JSON.stringify(data));
  db.prepare('INSERT INTO session_details VALUES (?, ?, ?, 0)').run(id, details.name, details.playedOn);
  // Starting a session is a campaign event: all its views leave the archived session.
  db.prepare('UPDATE active_context SET session_id=? WHERE campaign_id=? AND session_id=?').run(id, current.campaign_id, current.session_id);
  db.prepare('UPDATE browser_contexts SET session_id=? WHERE campaign_id=? AND session_id=?').run(id, current.campaign_id, current.session_id);
}

export function listSessions(db, campaignId) {
  if (!db.prepare('SELECT id FROM campaigns WHERE id=?').get(campaignId)) throw new AppError(404, 'Кампания не найдена');
  return db.prepare(`SELECT s.id, s.campaign_id AS campaignId, d.name, d.played_on AS playedOn,
    coalesce(d.archived,0) AS archived FROM sessions s LEFT JOIN session_details d ON d.session_id=s.id
    WHERE s.campaign_id=? ORDER BY s.rowid`).all(campaignId).map(row => ({ ...row, archived: Boolean(row.archived) }));
}

export function readSession(db, id) {
  const row = db.prepare(`SELECT s.id, s.campaign_id AS campaignId, s.data_json, d.name,
    d.played_on AS playedOn, coalesce(d.archived,0) AS archived FROM sessions s
    LEFT JOIN session_details d ON d.session_id=s.id WHERE s.id=?`).get(id);
  if (!row) throw new AppError(404, 'Сессия не найдена');
  const { data_json, ...metadata } = row;
  return { ...metadata, archived: Boolean(row.archived), data: JSON.parse(data_json) };
}
