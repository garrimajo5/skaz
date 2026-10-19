import { AppError } from './state.mjs';

export function setupPlaces(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS campaign_places (
    id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES campaigns(id),
    created_session_id TEXT NOT NULL REFERENCES sessions(id), data_json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS place_changes (
    mutation_id TEXT PRIMARY KEY REFERENCES changes(mutation_id) DEFERRABLE INITIALLY DEFERRED,
    place_id TEXT NOT NULL REFERENCES campaign_places(id), before_json TEXT, after_json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS place_origins (
    place_id TEXT PRIMARY KEY REFERENCES campaign_places(id), origin_json TEXT NOT NULL)`);
}
const id = value => typeof value === 'string' && /^[a-zA-Z0-9-]{8,80}$/.test(value);
const fail = message => { throw new AppError(422, message); };
function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value,key))) fail('Неверные поля места');
}
export function validatePlace(value) {
  exact(value, ['title','description','x','y','visited']);
  const { title, description, x, y, visited } = value;
  if (typeof title !== 'string' || !title.trim() || title.length > 200 || typeof description !== 'string' || description.length > 12000) fail('Название: 1–200, заметка: до 12000 символов');
  if ([x,y].some(n => typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 100)) fail('Положение на схеме: числа от 0 до 100');
  if (typeof visited !== 'boolean') fail('Неверная отметка посещения');
  return { title: title.trim(), description, x, y, visited };
}
export function validatePlaceCommand(input) {
  exact(input, ['mutationId','expectedRevision','campaignId','placeId','operation','place']);
  if (!id(input.campaignId) || !id(input.placeId)) fail('Нужны ID кампании и места');
  if (!['create','update'].includes(input.operation)) fail('Операция: create или update');
  return { campaignId: input.campaignId, placeId: input.placeId, operation: input.operation, place: validatePlace(input.place) };
}
export function readPlaces(db, campaignId) {
  return db.prepare('SELECT p.*, o.origin_json FROM campaign_places p LEFT JOIN place_origins o ON o.place_id=p.id WHERE p.campaign_id=? ORDER BY p.rowid').all(campaignId)
    .map(row => ({ id: row.id, campaignId: row.campaign_id, createdSessionId: row.created_session_id, ...JSON.parse(row.data_json), ...(row.origin_json ? { importedFrom: JSON.parse(row.origin_json) } : {}) }));
}
export function savePlace(db, payload, mutationId, context) {
  if (payload.campaignId !== context.campaignId) throw new AppError(409, 'Активная кампания изменилась');
  const existing = db.prepare('SELECT * FROM campaign_places WHERE id=?').get(payload.placeId);
  const after = JSON.stringify(payload.place);
  if (payload.operation === 'create') {
    if (existing) throw new AppError(409, 'ID места уже используется');
    if (db.prepare('SELECT count(*) AS n FROM campaign_places WHERE campaign_id=?').get(context.campaignId).n >= 1000) fail('Не более 1000 мест в кампании');
    db.prepare('INSERT INTO campaign_places VALUES (?, ?, ?, ?)').run(payload.placeId, context.campaignId, context.sessionId, after);
  } else {
    if (!existing || existing.campaign_id !== context.campaignId) throw new AppError(404, 'Место не найдено в активной кампании');
    db.prepare('UPDATE campaign_places SET data_json=? WHERE id=?').run(after, payload.placeId);
  }
  db.prepare('INSERT INTO place_changes VALUES (?, ?, ?, ?)').run(mutationId, payload.placeId, existing?.data_json || null, after);
}
