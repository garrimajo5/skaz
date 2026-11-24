import { AppError } from './state.mjs';
import Charges from '../client/item-charges.js';

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
  );
  CREATE TABLE IF NOT EXISTS inventory_charge_agreements (
    character_id TEXT NOT NULL, catalog_id TEXT NOT NULL, agreements_json TEXT NOT NULL,
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
  return db.prepare(`SELECT i.catalog_id, i.quantity, i.entry_json, c.counts_json, a.agreements_json
    FROM inventory i
    LEFT JOIN inventory_charges c USING(character_id,catalog_id)
    LEFT JOIN inventory_charge_agreements a USING(character_id,catalog_id)
    WHERE i.character_id=? ORDER BY i.catalog_id`).all(characterId).map(row=>({
      catalogId:row.catalog_id,quantity:row.quantity,entry:JSON.parse(row.entry_json),
      ...(row.counts_json===null?{}:{chargeCounts:JSON.parse(row.counts_json)}),
      ...(row.agreements_json===null?{}:{chargeAgreements:JSON.parse(row.agreements_json)})
    }));
}

export function validateChargeCounts(counts, quantity, entry, {allowOverage=true}={}) {
  const maximum=Charges.maximum(entry);
  if(!Charges.validMaximum(maximum)||!Array.isArray(counts)||counts.length!==quantity||
     counts.some(n=>n!==null&&(!Charges.validCount(n)||!allowOverage&&n>maximum)))
    throw new AppError(422,'Неверные остатки зарядов для этих экземпляров');
  return counts;
}
export function validateChargeAgreements(rows, item) {
  if(!Array.isArray(rows)||rows.length>item.quantity)throw new AppError(422,'Неверные согласования зарядов');
  const seen=new Set();
  for(const row of rows){
    if(!Charges.validAgreement(row)||seen.has(row.unit)||row.unit>=item.quantity||
       row.actual!==item.chargeCounts?.[row.unit]||row.maximum!==Charges.maximum(item.entry))
      throw new AppError(422,'Согласование не соответствует остатку экземпляра');
    seen.add(row.unit);
  }
  return rows.map(({unit,actual,maximum,note})=>({unit,actual,maximum,note})).sort((a,b)=>a.unit-b.unit);
}
export function requiresChargeV15(item){
  return Boolean(item.chargeAgreements?.length||item.chargeCounts?.some(n=>n>Charges.maximum(item.entry)));
}
export function hasChargeV15Data(db){
  const exists=db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?");
  if(exists.get('inventory_charge_agreements')&&db.prepare('SELECT 1 FROM inventory_charge_agreements LIMIT 1').get())return true;
  if(!exists.get('inventory_charges'))return false;
  for(const row of db.prepare(`SELECT i.entry_json,c.counts_json FROM inventory_charges c
    JOIN inventory i USING(character_id,catalog_id)`).iterate()){
    if(requiresChargeV15({entry:JSON.parse(row.entry_json),chargeCounts:JSON.parse(row.counts_json)}))return true;
  }
  return false;
}
export function writeChargeState(db,characterId,catalogId,counts,agreements=[]){
  if(counts?.some(n=>n!==null)){
    db.prepare(`INSERT INTO inventory_charges VALUES (?,?,?)
      ON CONFLICT(character_id,catalog_id) DO UPDATE SET counts_json=excluded.counts_json`).run(characterId,catalogId,JSON.stringify(counts));
  }else db.prepare('DELETE FROM inventory_charges WHERE character_id=? AND catalog_id=?').run(characterId,catalogId);
  if(agreements.length){
    db.prepare(`INSERT INTO inventory_charge_agreements VALUES (?,?,?)
      ON CONFLICT(character_id,catalog_id) DO UPDATE SET agreements_json=excluded.agreements_json`).run(characterId,catalogId,JSON.stringify(agreements));
  }else db.prepare('DELETE FROM inventory_charge_agreements WHERE character_id=? AND catalog_id=?').run(characterId,catalogId);
}
export function validateChargeCommand(request){
  const hasAgreement=Object.hasOwn(request||{},'agreement');
  const keys=['mutationId','expectedRevision','characterId','catalogId','unit','operation','amount',...(hasAgreement?['agreement']:[])];
  if(!request||typeof request!=='object'||Array.isArray(request)||Object.keys(request).length!==keys.length||keys.some(k=>!Object.hasOwn(request,k)))throw new AppError(400,'Неверные поля команды зарядов');
  const {characterId,catalogId}=validateInventoryQuantity({characterId:request.characterId,catalogId:request.catalogId,quantity:1});
  if(!Number.isSafeInteger(request.unit)||request.unit<0||request.unit>998||!['set','spend','recover','unknown'].includes(request.operation))throw new AppError(422,'Неверный экземпляр или действие');
  if(!Charges.validAmount(request.operation,request.amount))throw new AppError(422,'Неверное число зарядов');
  if(hasAgreement&&(request.operation!=='set'||request.agreement!==null&&!Charges.validNote(request.agreement)))throw new AppError(422,'Неверное согласование зарядов');
  return {characterId,catalogId,unit:request.unit,operation:request.operation,amount:request.amount,...(hasAgreement?{agreement:request.agreement}:{})};
}
export function changeCharges(db,payload,mutationId,activeCharacterId,{restore=false,expectedAgreement}={}){
  if(payload.characterId!==activeCharacterId)throw new AppError(409,'Активный персонаж изменился');
  const before=readInventory(db,payload.characterId),item=before.find(x=>x.catalogId===payload.catalogId);
  if(!item)throw new AppError(404,'Предмета нет в инвентаре');
  const current=Charges.balance(item,payload.unit);
  if(!current)throw new AppError(422,'Экземпляр без учёта зарядов или отсутствует');
  const projected=Charges.project(current,payload.operation,payload.amount,{restore});
  if(projected.error){
    const reason={unknown:'Сначала укажи текущий остаток',manual:'Для превышения справочного максимума укажи остаток вручную'};
    throw new AppError(422,reason[projected.error]||'Неверный остаток зарядов');
  }
  const note=restore?expectedAgreement?.note:payload.agreement;
  if(typeof note==='string'&&!projected.warning)throw new AppError(422,'Согласование доступно при превышении справочного максимума');
  const state=Charges.adjust(item,payload.unit,projected,note);
  if(current.value===projected.next&&JSON.stringify(item.chargeAgreements||[])===JSON.stringify(state.agreements))
    throw new AppError(422,'Остаток и согласование не изменились');
  writeChargeState(db,payload.characterId,payload.catalogId,state.counts,state.agreements);
  db.prepare('INSERT INTO inventory_changes VALUES (?,?,?,?)').run(mutationId,payload.characterId,JSON.stringify(before),JSON.stringify(readInventory(db,payload.characterId)));
  return {after:projected.next,chargeAgreementAfter:state.agreements.find(row=>row.unit===payload.unit)??null};
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
  if(existing?.chargeCounts)writeChargeState(db,payload.characterId,payload.catalogId,[...existing.chargeCounts,...Array(payload.quantity).fill(null)],existing.chargeAgreements);
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
    if(existing.chargeCounts)writeChargeState(db,payload.characterId,payload.catalogId,existing.chargeCounts.slice(0,-payload.quantity),existing.chargeAgreements?.filter(row=>row.unit<existing.quantity-payload.quantity));
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

// Later resource-only actions are safe only while the full inventory snapshot
// still matches. Any absolute/unknown mutation remains a barrier.
export function inventoryInverse(db, payload, current) {
  if (payload.characterId !== current.context.characterId) throw new AppError(409, 'Активный персонаж изменился');
  const receipt = db.prepare(`SELECT i.*, c.revision, x.operation FROM inventory_changes i
    JOIN changes c ON c.mutation_id=i.mutation_id
    JOIN context_changes x ON x.mutation_id=i.mutation_id WHERE i.mutation_id=?`).get(payload.targetMutationId);
  if (!receipt) throw new AppError(404, 'Операция инвентаря не найдена');
  if (receipt.character_id !== payload.characterId || !['inventory-add', 'inventory-remove','inventory-charges'].includes(receipt.operation)) throw new AppError(409, 'Эта операция инвентаря не может быть отменена');
  if(db.prepare('SELECT 1 FROM changes c LEFT JOIN resource_changes r ON r.mutation_id=c.mutation_id WHERE c.revision>? AND r.mutation_id IS NULL LIMIT 1').get(receipt.revision))throw new AppError(409,'После операции были другие правки. Нужна ручная сверка');
  const before = readInventory(db, payload.characterId);
  if (JSON.stringify(before) !== receipt.after_json) throw new AppError(409, 'Инвентарь изменился после операции');
  return {before,restored:JSON.parse(receipt.before_json)};
}
export function undoInventory(db, payload, mutationId, current) {
  const {before,restored}=inventoryInverse(db,payload,current);
  db.prepare('DELETE FROM inventory WHERE character_id=?').run(payload.characterId);
  const insert = db.prepare('INSERT INTO inventory VALUES (?, ?, ?, ?)');
  for (const item of restored) {insert.run(payload.characterId, item.catalogId, item.quantity, JSON.stringify(item.entry));writeChargeState(db,payload.characterId,item.catalogId,item.chargeCounts,item.chargeAgreements);}
  db.prepare('INSERT INTO inventory_changes VALUES (?, ?, ?, ?)').run(mutationId, payload.characterId, JSON.stringify(before), JSON.stringify(restored));
}
