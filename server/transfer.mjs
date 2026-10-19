import { AppError, validateState } from './state.mjs';
import { validateCatalog } from './catalog.mjs';
import { validateSession } from './sessions.mjs';
import { createGame } from './entities.mjs';

const fail = message => { throw new AppError(422, message); };
function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) fail('Неверные поля файла переноса');
}
export function validateTransfer(file) {
  exact(file, ['app','schemaVersion','ruleset','scope','exportedAt','source','state','session','inventory','catalog']);
  if (file.app !== 'skaz-active' || file.schemaVersion !== 2 || file.ruleset !== '5e-2014' || file.scope !== 'active-game') fail('Нужен экспорт активной игры СКАЗ v2, D&D 2014');
  if (typeof file.exportedAt !== 'string' || file.exportedAt.length > 40 || !Number.isFinite(Date.parse(file.exportedAt))) fail('Неверная дата экспорта');
  exact(file.source, ['revision','context']); exact(file.source.context, ['campaignId','characterId','sessionId']);
  if (!Number.isSafeInteger(file.source.revision) || file.source.revision < 0 || Object.values(file.source.context).some(id => typeof id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(id))) fail('Неверные сведения об исходной игре');
  const state = validateState(file.state);
  exact(file.session, ['name','playedOn']);
  const session = validateSession({ name: file.session.name === null ? 'Импорт' : file.session.name, playedOn: file.session.playedOn === null ? '2000-01-01' : file.session.playedOn });
  if (file.session.name === null) session.name = null;
  if (file.session.playedOn === null) session.playedOn = null;
  exact(file.catalog, ['schemaVersion','entries']);
  if (file.catalog.schemaVersion !== 1 || !Array.isArray(file.catalog.entries)) fail('Неверный каталог');
  const entries = file.catalog.entries.length ? validateCatalog(file.catalog) : [];
  const byId = new Map(entries.map(entry => [entry.id, entry]));
  for (const entry of entries) for (const link of entry.links) if (!byId.has(link)) fail('В файле отсутствует связь: ' + link);
  if (!Array.isArray(file.inventory) || file.inventory.length > 1000) fail('Не более 1000 видов предметов');
  const seen = new Set();
  const inventory = file.inventory.map(item => {
    exact(item, ['catalogId','quantity']);
    const entry = byId.get(item.catalogId);
    if (!entry || !['item','artifact'].includes(entry.kind) || seen.has(item.catalogId)) fail('Неверный или повторный предмет');
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 999) fail('Количество: целое 1–999');
    seen.add(item.catalogId); return { catalogId: item.catalogId, quantity: item.quantity };
  }).sort((a,b) => a.catalogId.localeCompare(b.catalogId, 'en'));
  return { state, session, inventory, entries: entries.sort((a,b) => a.id.localeCompare(b.id, 'en')) };
}
// Caller owns one transaction for catalog, new game, inventory and mutation receipt.
export function importTransfer(db, data, mutationId) {
  for (const entry of data.entries) {
    const existing = db.prepare('SELECT entry_json FROM catalog_entries WHERE id=?').get(entry.id);
    if (existing && existing.entry_json !== JSON.stringify(entry)) throw new AppError(409, 'Конфликт источника каталога: ' + entry.id);
  }
  for (const entry of data.entries) db.prepare('INSERT OR IGNORE INTO catalog_entries VALUES (?, ?)').run(entry.id, JSON.stringify(entry));
  const ids = createGame(db, data.state);
  db.prepare('INSERT INTO session_details VALUES (?, ?, ?, 0)').run(ids.sessionId, data.session.name, data.session.playedOn);
  const entries = new Map(data.entries.map(entry => [entry.id, entry]));
  const snapshot = data.inventory.map(item => ({ ...item, entry: entries.get(item.catalogId) }));
  for (const item of snapshot) db.prepare('INSERT INTO inventory VALUES (?, ?, ?, ?)').run(ids.characterId, item.catalogId, item.quantity, JSON.stringify(item.entry));
  db.prepare('INSERT INTO inventory_changes VALUES (?, ?, ?, ?)').run(mutationId, ids.characterId, '[]', JSON.stringify(snapshot));
}
