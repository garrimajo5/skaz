import { AppError, seed, validateState } from './state.mjs';

const fail = message => { throw new AppError(422, message); };
export function exactProposal(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value,key))) fail('Неверные поля предложения');
}
const id = value => typeof value === 'string' && /^[a-zA-Z0-9-]{8,80}$/.test(value);
export function validateContent(value) {
  exactProposal(value, ['title','text']);
  if (typeof value.title !== 'string' || !value.title.trim() || value.title.length > 2000 || typeof value.text !== 'string' || !value.text.trim() || value.text.length > 4000) fail('Нужны заголовок до 2000 и текст до 4000 символов');
  return { title: value.title.trim(), text: value.text.trim() };
}
export function validateProposalData(source, suggestion) {
  exactProposal(source, ['kind','speaker','text','offsetMs']);
  if (source.kind !== 'manual-text' || typeof source.speaker !== 'string' || source.speaker.length > 120 || typeof source.text !== 'string' || !source.text.trim() || source.text.length > 12000 || !Number.isSafeInteger(source.offsetMs) || source.offsetMs < 0 || source.offsetMs > 86400000) fail('Нужен ручной фрагмент разговора, говорящий до 120 символов и время 0–24 часа');
  exactProposal(suggestion, ['kind','title','text']);
  if (!['journal','personal-note'].includes(suggestion.kind)) fail('Допустимы сюжетное или личное событие');
  return { source: { kind: source.kind, speaker: source.speaker.trim(), text: source.text.trim(), offsetMs: source.offsetMs }, suggestion: { kind: suggestion.kind, ...validateContent({ title: suggestion.title, text: suggestion.text }) } };
}
export function validateProposalCreate(input) {
  exactProposal(input, ['mutationId','expectedRevision','campaignId','sessionId','characterId','proposalId','source','suggestion']);
  if (![input.campaignId,input.sessionId,input.characterId,input.proposalId].every(id)) fail('Неверная цель предложения');
  return { campaignId: input.campaignId, sessionId: input.sessionId, characterId: input.characterId, proposalId: input.proposalId, ...validateProposalData(input.source,input.suggestion) };
}
export function validateProposalDecision(input) {
  exactProposal(input, ['mutationId','expectedRevision','proposalId','decision','content']);
  if (!id(input.proposalId) || !['accept','dismiss'].includes(input.decision)) fail('Неверное решение');
  if (input.decision === 'dismiss' && input.content !== null) fail('Пропуск не содержит исправленный текст');
  return { proposalId: input.proposalId, decision: input.decision, content: input.decision === 'accept' ? validateContent(input.content) : null };
}
export function setupProposals(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS event_proposals (
    id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES campaigns(id),
    session_id TEXT NOT NULL REFERENCES sessions(id), character_id TEXT NOT NULL REFERENCES characters(id),
    source_json TEXT NOT NULL, suggestion_json TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('pending','accepted','dismissed')), applied_entry_json TEXT);
    CREATE TABLE IF NOT EXISTS proposal_changes (
    mutation_id TEXT PRIMARY KEY REFERENCES changes(mutation_id) DEFERRABLE INITIALLY DEFERRED,
    proposal_id TEXT NOT NULL REFERENCES event_proposals(id), before_json TEXT, after_json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS proposal_origins (
    proposal_id TEXT PRIMARY KEY REFERENCES event_proposals(id), origin_json TEXT NOT NULL)`);
}
function record(row) {
  return { id: row.id, campaignId: row.campaign_id, sessionId: row.session_id, characterId: row.character_id,
    source: JSON.parse(row.source_json), suggestion: JSON.parse(row.suggestion_json), status: row.status,
    appliedEntry: row.applied_entry_json ? JSON.parse(row.applied_entry_json) : null,
    ...(row.origin_json ? { importedFrom: JSON.parse(row.origin_json) } : {}) };
}
export function readProposals(db, context) {
  return db.prepare(`SELECT p.*, o.origin_json FROM event_proposals p LEFT JOIN proposal_origins o ON o.proposal_id=p.id
    WHERE p.campaign_id=? AND p.session_id=? AND p.character_id=? ORDER BY p.rowid`).all(context.campaignId,context.sessionId,context.characterId).map(record);
}
export function createProposal(db, data, mutationId, context) {
  if (['campaignId','sessionId','characterId'].some(key => data[key] !== context[key])) throw new AppError(409, 'Активная игра или цель события изменилась');
  if (db.prepare('SELECT id FROM event_proposals WHERE id=?').get(data.proposalId)) throw new AppError(409, 'ID предложения уже используется');
  if (readProposals(db,context).length >= 1000) fail('Не более 1000 предложений для персонажа в сессии');
  db.prepare('INSERT INTO event_proposals VALUES (?, ?, ?, ?, ?, ?, ?, NULL)').run(data.proposalId,context.campaignId,context.sessionId,context.characterId,JSON.stringify(data.source),JSON.stringify(data.suggestion),'pending');
  db.prepare('INSERT INTO proposal_changes VALUES (?, ?, NULL, ?)').run(mutationId,data.proposalId,JSON.stringify({ source: data.source, suggestion: data.suggestion, status: 'pending', appliedEntry: null }));
}
export function decideProposal(db, data, mutationId, context, currentState) {
  const row = db.prepare('SELECT * FROM event_proposals WHERE id=?').get(data.proposalId);
  if (!row) throw new AppError(404, 'Предложение не найдено');
  if (row.campaign_id !== context.campaignId || row.session_id !== context.sessionId || row.character_id !== context.characterId) throw new AppError(409, 'Событие относится к другой сессии или персонажу');
  if (row.status !== 'pending') throw new AppError(409, 'Решение по этому событию уже сохранено');
  const before = record(row), state = structuredClone(currentState);
  let entry = null;
  if (data.decision === 'accept') {
    const totalMinutes = Math.floor(before.source.offsetMs / 60000);
    entry = { title: data.content.title, text: data.content.text, kind: before.suggestion.kind === 'journal' ? 'Событие сессии' : 'Личное событие', at: Date.now(), time: String(Math.floor(totalMinutes/60)).padStart(2,'0') + ':' + String(totalMinutes%60).padStart(2,'0') };
    const field = before.suggestion.kind === 'journal' ? 'journal' : 'notes';
    state[field].unshift(entry); validateState(state);
  }
  const status = data.decision === 'accept' ? 'accepted' : 'dismissed';
  db.prepare('UPDATE event_proposals SET status=?, applied_entry_json=? WHERE id=?').run(status,entry ? JSON.stringify(entry) : null,data.proposalId);
  db.prepare('INSERT INTO proposal_changes VALUES (?, ?, ?, ?)').run(mutationId,data.proposalId,JSON.stringify(before),JSON.stringify({ ...before,status,appliedEntry:entry }));
  return state;
}
export function validateTransferredProposal(item) {
  exactProposal(item, ['origin','source','suggestion','status','appliedEntry']);
  exactProposal(item.origin, ['campaignId','sessionId','characterId','proposalId']);
  if (!Object.values(item.origin).every(id)) fail('Неверное происхождение события');
  if (!['pending','accepted','dismissed'].includes(item.status)) fail('Неверный статус предложения');
  const data = validateProposalData(item.source,item.suggestion);
  let appliedEntry = null;
  if (item.status === 'accepted') {
    exactProposal(item.appliedEntry, ['title','text','kind','at','time']);
    validateContent({title:item.appliedEntry.title,text:item.appliedEntry.text});
    const expectedKind = data.suggestion.kind === 'journal' ? 'Событие сессии' : 'Личное событие';
    if (item.appliedEntry.kind !== expectedKind) fail('Неверный тип применённой записи');
    appliedEntry = validateState({ ...seed, journal: [item.appliedEntry] }).journal[0];
  } else if (item.appliedEntry !== null) fail('Непринятое предложение не содержит применённую запись');
  const origin = { campaignId: item.origin.campaignId, sessionId: item.origin.sessionId, characterId: item.origin.characterId, proposalId: item.origin.proposalId };
  return { origin, ...data, status: item.status, appliedEntry };
}
