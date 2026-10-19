import { AppError } from './state.mjs';
export function setupQuests(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS quests (
    id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES campaigns(id),
    created_session_id TEXT NOT NULL REFERENCES sessions(id), data_json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS quest_changes (
    mutation_id TEXT PRIMARY KEY REFERENCES changes(mutation_id) DEFERRABLE INITIALLY DEFERRED,
    quest_id TEXT NOT NULL REFERENCES quests(id), before_json TEXT, after_json TEXT NOT NULL)`);
}
const id = value => typeof value === 'string' && /^[a-zA-Z0-9-]{8,80}$/.test(value);
const fail = message => { throw new AppError(422, message); };
function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value,key))) fail('Неверные поля задания');
}
export function validateQuestCommand(input) {
  exact(input, ['mutationId','expectedRevision','campaignId','questId','operation','quest']);
  if (!id(input.campaignId) || !id(input.questId)) fail('Нужны ID кампании и задания');
  if (!['create','update'].includes(input.operation)) fail('Операция: create или update');
  exact(input.quest, ['title','description','status','steps']);
  const { title, description, status, steps } = input.quest;
  if (typeof title !== 'string' || !title.trim() || title.length > 200 || typeof description !== 'string' || description.length > 12000) fail('Название: 1–200, описание: до 12000 символов');
  if (!['active','completed','failed'].includes(status) || !Array.isArray(steps) || steps.length > 50) fail('Неверный статус или больше 50 этапов');
  const seen = new Set();
  const normalized = steps.map(step => {
    exact(step, ['id','title','done']);
    if (!id(step.id) || seen.has(step.id) || typeof step.title !== 'string' || !step.title.trim() || step.title.length > 500 || typeof step.done !== 'boolean') fail('Неверный или повторный этап');
    seen.add(step.id); return { id: step.id, title: step.title.trim(), done: step.done };
  });
  return { campaignId: input.campaignId, questId: input.questId, operation: input.operation, quest: { title: title.trim(), description, status, steps: normalized } };
}
export function readQuests(db, campaignId) {
  return db.prepare('SELECT * FROM quests WHERE campaign_id=? ORDER BY rowid').all(campaignId)
    .map(row => ({ id: row.id, campaignId: row.campaign_id, createdSessionId: row.created_session_id, ...JSON.parse(row.data_json) }));
}
export function saveQuest(db, payload, mutationId, context) {
  if (payload.campaignId !== context.campaignId) throw new AppError(409, 'Активная кампания изменилась');
  const existing = db.prepare('SELECT * FROM quests WHERE id=?').get(payload.questId);
  const after = JSON.stringify(payload.quest);
  if (payload.operation === 'create') {
    if (existing) throw new AppError(409, 'ID задания уже используется');
    if (db.prepare('SELECT count(*) AS n FROM quests WHERE campaign_id=?').get(context.campaignId).n >= 1000) fail('Не более 1000 заданий в кампании');
    db.prepare('INSERT INTO quests VALUES (?, ?, ?, ?)').run(payload.questId, context.campaignId, context.sessionId, after);
  } else {
    if (!existing || existing.campaign_id !== context.campaignId) throw new AppError(404, 'Задание не найдено в активной кампании');
    db.prepare('UPDATE quests SET data_json=? WHERE id=?').run(after, payload.questId);
  }
  db.prepare('INSERT INTO quest_changes VALUES (?, ?, ?, ?)').run(mutationId, payload.questId, existing?.data_json || null, after);
}
