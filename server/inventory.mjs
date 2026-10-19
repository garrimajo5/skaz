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
  );
  CREATE TABLE IF NOT EXISTS inventory_charges (
    character_id TEXT NOT NULL, catalog_id TEXT NOT NULL, counts_json TEXT NOT NULL,
    PRIMARY KEY(character_id,catalog_id),
    FOREIGN KEY(character_id,catalog_id) REFERENCES inventory(character_id,catalog_id) ON DELETE CASCADE
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
    .map(row => {
      const charges=db.prepare('SELECT counts_json FROM inventory_charges WHERE character_id=? AND catalog_id=?').get(characterId,row.catalog_id);
      return {catalogId:row.catalog_id,quantity:row.quantity,entry:JSON.parse(row.entry_json),...(charges?{chargeCounts:JSON.parse(charges.counts_json)}:{})};
    });
}

export function validateChargeCounts(counts, quantity, entry) {
  const maximum=(entry.item||entry.artifact)?.charges?.max;
  if(!Number.isSafeInteger(maximum)||!Array.isArray(counts)||counts.length!==quantity||counts.some(n=>n!==null&&(!Number.isSafeInteger(n)||n<0||n>maximum)))throw new AppError(422,'Заряды должны соответствовать числу предметов и справочному максимуму');
  return counts;
}
export function writeChargeCounts(db,characterId,catalogId,counts) {
  if(!counts?.some(n=>n!==null)){db.prepare('DELETE FROM inventory_charges WHERE character_id=? AND catalog_id=?').run(characterId,catalogId);return;}
  db.prepare('INSERT INTO inventory_charges VALUES (?,?,?) ON CONFLICT(character_id,catalog_id) DO UPDATE SET counts_json=excluded.counts_json').run(characterId,catalogId,JSON.stringify(counts));
}
export function validateChargeCommand(request){
  const keys=['mutationId','expectedRevision','characterId','catalogId','unit','operation','amount'];
  if(!request||typeof request!=='object'||Array.isArray(request)||Object.keys(request).length!==keys.length||keys.some(k=>!Object.hasOwn(request,k)))throw new AppError(400,'Неверные поля команды зарядов');
  const {characterId,catalogId}=validateInventoryQuantity({characterId:request.characterId,catalogId:request.catalogId,quantity:1});
  if(!Number.isSafeInteger(request.unit)||request.unit<0||request.unit>998||!['set','spend','recover','unknown'].includes(request.operation))throw new AppError(422,'Неверный экземпляр или действие');
  if(request.operation==='unknown'?request.amount!==null:(!Number.isSafeInteger(request.amount)||request.amount<0||request.amount>10000||(['spend','recover'].includes(request.operation)&&request.amount===0)))throw new AppError(422,'Неверное число зарядов');
  return {characterId,catalogId,unit:request.unit,operation:request.operation,amount:request.amount};
}
export function changeCharges(db,payload,mutationId,activeCharacterId){
  if(payload.characterId!==activeCharacterId)throw new AppError(409,'Активный персонаж изменился');
  const before=readInventory(db,payload.characterId),item=before.find(x=>x.catalogId===payload.catalogId);
  if(!item)throw new AppError(404,'Предмета нет в инвентаре');
  if(payload.unit>=item.quantity)throw new AppError(422,'Экземпляр отсутствует');
  const counts=item.chargeCounts?.slice()||Array(item.quantity).fill(null),previous=counts[payload.unit];
  if(['spend','recover'].includes(payload.operation)&&previous===null)throw new AppError(422,'Сначала укажи текущий остаток');
  counts[payload.unit]=payload.operation==='unknown'?null:payload.operation==='set'?payload.amount:previous+(payload.operation==='spend'?-payload.amount:payload.amount);
  validateChargeCounts(counts,item.quantity,item.entry);
  if(previous===counts[payload.unit])throw new AppError(422,'Остаток не изменился');
  writeChargeCounts(db,payload.characterId,payload.catalogId,counts);
  db.prepare('INSERT INTO inventory_changes VALUES (?,?,?,?)').run(mutationId,payload.characterId,JSON.stringify(before),JSON.stringify(readInventory(db,payload.characterId)));
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
  if(existing?.chargeCounts)writeChargeCounts(db,payload.characterId,payload.catalogId,[...existing.chargeCounts,...Array(payload.quantity).fill(null)]);
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
    if(existing.chargeCounts)writeChargeCounts(db,payload.characterId,payload.catalogId,existing.chargeCounts.slice(0,-payload.quantity));
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
  if (receipt.character_id !== payload.characterId || receipt.revision !== current.revision || !['inventory-add', 'inventory-remove','inventory-charges'].includes(receipt.operation)) throw new AppError(409, 'Можно отменить только последнюю операцию инвентаря без последующих изменений игры');
  const before = readInventory(db, payload.characterId);
  if (JSON.stringify(before) !== receipt.after_json) throw new AppError(409, 'Инвентарь изменился после операции');
  const restored = JSON.parse(receipt.before_json);
  db.prepare('DELETE FROM inventory WHERE character_id=?').run(payload.characterId);
  const insert = db.prepare('INSERT INTO inventory VALUES (?, ?, ?, ?)');
  for (const item of restored) {insert.run(payload.characterId, item.catalogId, item.quantity, JSON.stringify(item.entry));writeChargeCounts(db,payload.characterId,item.catalogId,item.chargeCounts);}
  db.prepare('INSERT INTO inventory_changes VALUES (?, ?, ?, ?)').run(mutationId, payload.characterId, JSON.stringify(before), JSON.stringify(restored));
}
