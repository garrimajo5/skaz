import { AppError } from './state.mjs';

// A view is a browser selection, never an identity or an access-control boundary.
export function setupViews(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS browser_contexts (
    view_id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES campaigns(id),
    character_id TEXT NOT NULL, session_id TEXT NOT NULL,
    FOREIGN KEY(character_id, campaign_id) REFERENCES characters(id, campaign_id),
    FOREIGN KEY(session_id, campaign_id) REFERENCES sessions(id, campaign_id)
  )`);
  // A previous release may have advanced a campaign while ignoring this additive table.
  // Repair only archived selections, preserving the selected character and campaign.
  db.exec(`UPDATE browser_contexts SET session_id=(
    SELECT s.id FROM sessions s LEFT JOIN session_details d ON d.session_id=s.id
    WHERE s.campaign_id=browser_contexts.campaign_id AND coalesce(d.archived,0)=0
    ORDER BY s.rowid DESC LIMIT 1
  ) WHERE EXISTS(SELECT 1 FROM session_details d WHERE d.session_id=browser_contexts.session_id AND d.archived=1)
    AND EXISTS(SELECT 1 FROM sessions s LEFT JOIN session_details d ON d.session_id=s.id
      WHERE s.campaign_id=browser_contexts.campaign_id AND coalesce(d.archived,0)=0)`);
}

export function ensureView(db, viewId) {
  if (typeof viewId !== 'string' || !/^[a-zA-Z0-9-]{8,80}$/.test(viewId)) throw new AppError(400, 'Неверный идентификатор окна');
  if (db.prepare('SELECT 1 FROM browser_contexts WHERE view_id=?').get(viewId)) return;
  if (db.prepare('SELECT count(*) AS n FROM browser_contexts').get().n >= 10000) throw new AppError(409, 'Достигнут лимит сохранённых окон. Обратитесь к владельцу сервера.');
  db.prepare(`INSERT OR IGNORE INTO browser_contexts SELECT ?, campaign_id, character_id, session_id FROM active_context WHERE id=1`).run(viewId);
}

export function activeSelection(db, viewId) {
  return viewId === undefined
    ? db.prepare('SELECT * FROM active_context WHERE id=1').get()
    : db.prepare('SELECT * FROM browser_contexts WHERE view_id=?').get(viewId);
}

export function setSelection(db, ids, viewId) {
  const values = [ids.campaignId, ids.characterId, ids.sessionId];
  const result = viewId === undefined
    ? db.prepare('UPDATE active_context SET campaign_id=?, character_id=?, session_id=? WHERE id=1').run(...values)
    : db.prepare('UPDATE browser_contexts SET campaign_id=?, character_id=?, session_id=? WHERE view_id=?').run(...values, viewId);
  if (result.changes !== 1) throw new AppError(409, 'Окно игры не найдено. Перезагрузи страницу.');
}
