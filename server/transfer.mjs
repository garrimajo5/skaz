import { validatePlace } from './places.mjs';
import { randomUUID } from 'node:crypto';
import { validateQuestCommand } from './quests.mjs';
import { AppError, validateState } from './state.mjs';
import { validateCatalog } from './catalog.mjs';
import { validateSession } from './sessions.mjs';
import { createGame } from './entities.mjs';

const fail = message => { throw new AppError(422, message); };
function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) fail('Неверные поля файла переноса');
}
export function validateTransfer(file) {
  exact(file, ['app','schemaVersion','ruleset','scope','exportedAt','source','state','session','inventory','catalog', ...([3,4,5].includes(file?.schemaVersion) ? ['spellbook'] : []), ...([4,5].includes(file?.schemaVersion) ? ['quests'] : []), ...(file?.schemaVersion === 5 ? ['places'] : [])]);
  if (file.app !== 'skaz-active' || ![2,3,4,5].includes(file.schemaVersion) || file.ruleset !== '5e-2014' || file.scope !== 'active-game') fail('Нужен экспорт активной игры СКАЗ v2–v5, D&D 2014');
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
  let spellbook;
  if (file.schemaVersion >= 3) {
    if (!Array.isArray(file.spellbook) || file.spellbook.length > 1000) fail('Не более 1000 заклинаний');
    const selected = new Set();
    spellbook = file.spellbook.map(item => {
      exact(item, ['catalogId','status']);
      if (byId.get(item.catalogId)?.kind !== 'spell' || selected.has(item.catalogId) || !['known','prepared'].includes(item.status)) fail('Неверное или повторное заклинание');
      selected.add(item.catalogId); return { catalogId: item.catalogId, status: item.status };
    }).sort((a,b) => a.catalogId.localeCompare(b.catalogId, 'en'));
  }
  let quests;
  if (file.schemaVersion >= 4) {
    if (!Array.isArray(file.quests) || file.quests.length > 1000) fail('Не более 1000 заданий');
    const origins = new Set();
    quests = file.quests.map(item => {
      exact(item, ['origin','quest']); exact(item.origin, ['campaignId','questId','sessionId']);
      if (Object.values(item.origin).some(value => typeof value !== 'string' || !/^[a-zA-Z0-9-]{8,80}$/.test(value))) fail('Неверное происхождение задания');
      const origin = { campaignId: item.origin.campaignId, questId: item.origin.questId, sessionId: item.origin.sessionId };
      const key = JSON.stringify([origin.campaignId, origin.questId]);
      if (origins.has(key)) fail('Повторное задание');
      origins.add(key);
      const { quest } = validateQuestCommand({ mutationId: 'transfer', expectedRevision: 0, campaignId: origin.campaignId, questId: origin.questId, operation: 'create', quest: item.quest });
      return { origin, quest };
    });
  }
  let places;
  if (file.schemaVersion === 5) {
    if (!Array.isArray(file.places) || file.places.length > 1000) fail('Не более 1000 мест');
    const origins = new Set();
    places = file.places.map(item => {
      exact(item, ['origin','place']); exact(item.origin, ['campaignId','placeId','sessionId']);
      if (Object.values(item.origin).some(value => typeof value !== 'string' || !/^[a-zA-Z0-9-]{8,80}$/.test(value))) fail('Неверное происхождение места');
      const origin = { campaignId: item.origin.campaignId, placeId: item.origin.placeId, sessionId: item.origin.sessionId };
      const key = JSON.stringify([origin.campaignId, origin.placeId]);
      if (origins.has(key)) fail('Повторное место');
      origins.add(key);
      return { origin, place: validatePlace(item.place) };
    });
  }
  // Preserve the normalized v2 payload and its existing mutation hashes.
  return { state, session, inventory, ...(places ? { places } : {}), ...(quests ? { quests } : {}), ...(spellbook ? { spellbook } : {}), entries: entries.sort((a,b) => a.id.localeCompare(b.id, 'en')) };
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
  for (const item of data.quests || []) {
    const questId = randomUUID();
    db.prepare('INSERT INTO quests VALUES (?, ?, ?, ?)').run(questId, ids.campaignId, ids.sessionId, JSON.stringify(item.quest));
    db.prepare('INSERT INTO quest_origins VALUES (?, ?)').run(questId, JSON.stringify(item.origin));
  }
  for (const item of data.places || []) {
    const placeId = randomUUID();
    db.prepare('INSERT INTO campaign_places VALUES (?, ?, ?, ?)').run(placeId, ids.campaignId, ids.sessionId, JSON.stringify(item.place));
    db.prepare('INSERT INTO place_origins VALUES (?, ?)').run(placeId, JSON.stringify(item.origin));
  }
  const entries = new Map(data.entries.map(entry => [entry.id, entry]));
  const snapshot = data.inventory.map(item => ({ ...item, entry: entries.get(item.catalogId) }));
  for (const item of snapshot) db.prepare('INSERT INTO inventory VALUES (?, ?, ?, ?)').run(ids.characterId, item.catalogId, item.quantity, JSON.stringify(item.entry));
  db.prepare('INSERT INTO inventory_changes VALUES (?, ?, ?, ?)').run(mutationId, ids.characterId, '[]', JSON.stringify(snapshot));
  if (data.spellbook) {
    const spells = data.spellbook.map(item => ({ ...item, entry: entries.get(item.catalogId) }));
    for (const item of spells) db.prepare('INSERT INTO character_spells VALUES (?, ?, ?, ?)').run(ids.characterId, item.catalogId, item.status, JSON.stringify(item.entry));
    db.prepare('INSERT INTO spell_changes VALUES (?, ?, ?, ?)').run(mutationId, ids.characterId, '[]', JSON.stringify(spells));
  }
}
