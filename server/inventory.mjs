import { AppError } from './state.mjs';

export function setupInventory(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS inventory (
    character_id TEXT NOT NULL REFERENCES characters(id),
    catalog_id TEXT NOT NULL REFERENCES catalog_entries(id),
    quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 999),
    entry_json TEXT NOT NULL,
    PRIMARY KEY(character_id, catalog_id)
  );
  CREATE TABLE IF NOT EXISTS inventory_changes (
    mutation_id TEXT PRIMARY KEY REFERENCES changes(mutation_id) DEFERRABLE INITIALLY DEFERRED,
    character_id TEXT NOT NULL REFERENCES characters(id),
    before_json TEXT NOT NULL, after_json TEXT NOT NULL
  )`);
}

export function validateInventoryAdd(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request) || Object.keys(request).some(key => !['mutationId', 'expectedRevision', 'characterId', 'catalogId', 'quantity'].includes(key))) throw new AppError(400, 'Неверные поля добавления предмета');
  const { characterId, catalogId, quantity } = request;
  if (typeof characterId !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(characterId)) throw new AppError(422, 'Нужен ID персонажа');
  if (typeof catalogId !== 'string' || !/^[a-z0-9][a-z0-9:._-]{2,119}$/.test(catalogId)) throw new AppError(422, 'Нужен ID каталога');
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 999) throw new AppError(422, 'Количество: целое от 1 до 999');
  return { characterId, catalogId, quantity };
}

export function readInventory(db, characterId) {
  return db.prepare('SELECT catalog_id, quantity, entry_json FROM inventory WHERE character_id=? ORDER BY catalog_id').all(characterId)
    .map(row => ({ catalogId: row.catalog_id, quantity: row.quantity, entry: JSON.parse(row.entry_json) }));
}

// Caller owns the transaction, revision and mutation receipt.
export function addInventory(db, payload, mutationId, activeCharacterId) {
  if (payload.characterId !== activeCharacterId) throw new AppError(409, 'Активный персонаж изменился');
  const row = db.prepare('SELECT entry_json FROM catalog_entries WHERE id=?').get(payload.catalogId);
  if (!row) throw new AppError(404, 'Предмет не найден в каталоге');
  const entry = JSON.parse(row.entry_json);
  if (entry.ruleset !== '5e-2014' || !['item', 'artifact'].includes(entry.kind)) throw new AppError(422, 'В инвентарь можно добавить предмет или артефакт 2014');
  const before = readInventory(db, payload.characterId);
  const existing = before.find(item => item.catalogId === payload.catalogId);
  if ((existing?.quantity || 0) + payload.quantity > 999) throw new AppError(422, 'Суммарное количество превышает 999');
  if (!existing && before.length >= 1000) throw new AppError(422, 'Не более 1000 видов предметов');
  db.prepare(`INSERT INTO inventory VALUES (?, ?, ?, ?)
    ON CONFLICT(character_id, catalog_id) DO UPDATE SET quantity=quantity+excluded.quantity`)
    .run(payload.characterId, payload.catalogId, payload.quantity, row.entry_json);
  db.prepare('INSERT INTO inventory_changes VALUES (?, ?, ?, ?)').run(mutationId, payload.characterId, JSON.stringify(before), JSON.stringify(readInventory(db, payload.characterId)));
}
