import { AppError } from './state.mjs';
export function setupSpellbook(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS character_spells (
    character_id TEXT NOT NULL REFERENCES characters(id), catalog_id TEXT NOT NULL REFERENCES catalog_entries(id),
    status TEXT NOT NULL CHECK(status IN ('known','prepared')), entry_json TEXT NOT NULL,
    PRIMARY KEY(character_id,catalog_id));
    CREATE TABLE IF NOT EXISTS spell_changes (
    mutation_id TEXT PRIMARY KEY REFERENCES changes(mutation_id) DEFERRABLE INITIALLY DEFERRED,
    character_id TEXT NOT NULL REFERENCES characters(id), before_json TEXT NOT NULL, after_json TEXT NOT NULL)`);
}
export function readSpellbook(db, characterId) {
  return db.prepare('SELECT catalog_id,status,entry_json FROM character_spells WHERE character_id=? ORDER BY catalog_id').all(characterId)
    .map(row => ({ catalogId: row.catalog_id, status: row.status, entry: JSON.parse(row.entry_json) }));
}
export function validateSpellCommand(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['mutationId','expectedRevision','characterId','catalogId','status'].includes(key))) throw new AppError(400, 'Неверные поля списка заклинаний');
  const { characterId, catalogId, status } = input;
  if (typeof characterId !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(characterId) || typeof catalogId !== 'string' || !/^[a-z0-9][a-z0-9:._-]{2,119}$/.test(catalogId)) throw new AppError(422, 'Нужны ID персонажа и заклинания');
  if (!['known','prepared','remove'].includes(status)) throw new AppError(422, 'Статус: known, prepared или remove');
  return { characterId, catalogId, status };
}
export function setSpell(db, payload, mutationId, activeId) {
  if (payload.characterId !== activeId) throw new AppError(409, 'Активный персонаж изменился');
  const before = readSpellbook(db, activeId);
  if (payload.status === 'remove') {
    if (!before.some(item => item.catalogId === payload.catalogId)) throw new AppError(404, 'Заклинания нет у персонажа');
    db.prepare('DELETE FROM character_spells WHERE character_id=? AND catalog_id=?').run(activeId, payload.catalogId);
  } else {
    const row = db.prepare('SELECT entry_json FROM catalog_entries WHERE id=?').get(payload.catalogId);
    if (!row) throw new AppError(404, 'Заклинание не найдено');
    const entry = JSON.parse(row.entry_json);
    if (entry.ruleset !== '5e-2014' || entry.kind !== 'spell') throw new AppError(422, 'Нужно заклинание редакции 2014');
    if (before.length >= 1000 && !before.some(item => item.catalogId === payload.catalogId)) throw new AppError(422, 'Не более 1000 заклинаний');
    db.prepare(`INSERT INTO character_spells VALUES (?, ?, ?, ?)
      ON CONFLICT(character_id,catalog_id) DO UPDATE SET status=excluded.status`).run(activeId, payload.catalogId, payload.status, row.entry_json);
  }
  db.prepare('INSERT INTO spell_changes VALUES (?, ?, ?, ?)').run(mutationId, activeId, JSON.stringify(before), JSON.stringify(readSpellbook(db, activeId)));
}
