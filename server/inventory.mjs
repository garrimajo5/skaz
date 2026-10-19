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

export function validateInventoryQuantity(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request) || Object.keys(request).some(key => !['mutationId', 'expectedRevision', 'characterId', 'catalogId', 'quantity'].includes(key))) throw new AppError(400, 'Неверные поля команды инвентаря');
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

// Removal records loss, transfer or consumption; it does not apply item effects.
export function removeInventory(db, payload, mutationId, activeCharacterId) {
  if (payload.characterId !== activeCharacterId) throw new AppError(409, 'Активный персонаж изменился');
  const before = readInventory(db, payload.characterId);
  const existing = before.find(item => item.catalogId === payload.catalogId);
  if (!existing) throw new AppError(404, 'Предмета нет в инвентаре');
  if (payload.quantity > existing.quantity) throw new AppError(422, 'В инвентаре недостаточно предметов');
  if (payload.quantity === existing.quantity) {
    db.prepare('DELETE FROM inventory WHERE character_id=? AND catalog_id=?').run(payload.characterId, payload.catalogId);
  } else {
    db.prepare('UPDATE inventory SET quantity=quantity-? WHERE character_id=? AND catalog_id=?').run(payload.quantity, payload.characterId, payload.catalogId);
  }
  db.prepare('INSERT INTO inventory_changes VALUES (?, ?, ?, ?)').run(mutationId, payload.characterId, JSON.stringify(before), JSON.stringify(readInventory(db, payload.characterId)));
}

export function validateInventoryUndo(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request) || Object.keys(request).some(key => !['mutationId', 'expectedRevision', 'characterId', 'targetMutationId'].includes(key))) throw new AppError(400, 'Неверные поля отмены');
  const { characterId, targetMutationId } = request;
  if (typeof characterId !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(characterId)) throw new AppError(422, 'Нужен ID персонажа');
  if (typeof targetMutationId !== 'string' || !/^[a-zA-Z0-9-]{8,80}$/.test(targetMutationId)) throw new AppError(422, 'Нужен ID отменяемой операции');
  return { characterId, targetMutationId };
}

// Only the latest global mutation may be undone; never replace later progress.
export function undoInventory(db, payload, mutationId, current) {
  if (payload.characterId !== current.context.characterId) throw new AppError(409, 'Активный персонаж изменился');
  const receipt = db.prepare(`SELECT i.*, c.revision, x.operation FROM inventory_changes i
    JOIN changes c ON c.mutation_id=i.mutation_id
    JOIN context_changes x ON x.mutation_id=i.mutation_id WHERE i.mutation_id=?`).get(payload.targetMutationId);
  if (!receipt) throw new AppError(404, 'Операция инвентаря не найдена');
  if (receipt.character_id !== payload.characterId || receipt.revision !== current.revision || !['inventory-add', 'inventory-remove'].includes(receipt.operation)) throw new AppError(409, 'Можно отменить только последнее добавление или списание без последующих изменений игры');
  const before = readInventory(db, payload.characterId);
  if (JSON.stringify(before) !== receipt.after_json) throw new AppError(409, 'Инвентарь изменился после операции');
  const restored = JSON.parse(receipt.before_json);
  db.prepare('DELETE FROM inventory WHERE character_id=?').run(payload.characterId);
  const insert = db.prepare('INSERT INTO inventory VALUES (?, ?, ?, ?)');
  for (const item of restored) insert.run(payload.characterId, item.catalogId, item.quantity, JSON.stringify(item.entry));
  db.prepare('INSERT INTO inventory_changes VALUES (?, ?, ?, ?)').run(mutationId, payload.characterId, JSON.stringify(before), JSON.stringify(restored));
}
