import { AppError } from './state.mjs';

const kinds = ['mechanic', 'spell', 'monster', 'item', 'artifact'];
const fail = message => { throw new AppError(422, message); };
function object(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) fail('Неверная структура каталога');
}
function text(value, max = 200) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail('Неверное текстовое поле каталога');
  return value.trim();
}
function id(value) {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9:._-]{2,119}$/.test(value)) fail('Неверный ID каталога');
  return value;
}
function url(value) {
  text(value, 2000);
  let parsed;
  try { parsed = new URL(value); } catch { fail('Неверная ссылка источника'); }
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) fail('Неверная ссылка источника');
  if (parsed.hostname === 'next.dnd.su') fail('Источник относится к редакции 2024');
  return parsed.href;
}
export function validateCatalog(bundle) {
  object(bundle, ['schemaVersion', 'entries']);
  if (bundle.schemaVersion !== 1 || !Array.isArray(bundle.entries) || bundle.entries.length > 1000 || !bundle.entries.length) fail('Ожидается пакет версии 1: от 1 до 1000 записей');
  const ids = new Set();
  return bundle.entries.map(entry => {
    object(entry, ['id', 'ruleset', 'kind', 'name', 'source', 'text', 'links']);
    const entryId = id(entry.id);
    if (ids.has(entryId)) fail(`Повтор ID: ${entryId}`);
    ids.add(entryId);
    if (entry.ruleset !== '5e-2014' || !kinds.includes(entry.kind)) fail('Нужны категория и редакция 5e-2014');
    object(entry.name, ['ru', 'en']);
    object(entry.source, ['url', 'title', 'version', 'usage', 'terms']);
    if (!['reference-only', 'personal'].includes(entry.source.usage)) fail('Неизвестный режим использования');
    if (entry.source.usage === 'reference-only' && entry.text !== undefined) fail('Справочная ссылка не должна содержать копию текста');
    if (!Array.isArray(entry.links) || entry.links.length > 100) fail('Неверный список связей');
    const links = entry.links.map(id).sort();
    if (new Set(links).size !== links.length || links.includes(entryId)) fail('Повторная связь или ссылка на себя');
    return {
      id: entryId, ruleset: '5e-2014', kind: entry.kind,
      name: { ru: text(entry.name.ru), en: text(entry.name.en) },
      source: { url: url(entry.source.url), title: text(entry.source.title), version: text(entry.source.version), usage: entry.source.usage, terms: text(entry.source.terms, 2000) },
      ...(entry.text === undefined ? {} : { text: text(entry.text, 20000) }), links,
    };
  });
}

export function createCatalog(db) {
  db.exec('CREATE TABLE IF NOT EXISTS catalog_entries (id TEXT PRIMARY KEY, entry_json TEXT NOT NULL)');
  const all = () => db.prepare('SELECT entry_json FROM catalog_entries ORDER BY id').all().map(row => JSON.parse(row.entry_json));
  function importEntries(bundle, { apply = false } = {}) {
    const entries = validateCatalog(bundle);
    db.exec('BEGIN IMMEDIATE');
    try {
      const existing = new Map(all().map(entry => [entry.id, entry]));
      const available = new Set([...existing.keys(), ...entries.map(entry => entry.id)]);
      let added = 0, unchanged = 0;
      for (const entry of entries) {
        for (const link of entry.links) if (!available.has(link)) fail(`Не найдена связь ${entry.id} → ${link}`);
        if (existing.has(entry.id)) {
          if (JSON.stringify(existing.get(entry.id)) !== JSON.stringify(entry)) throw new AppError(409, `ID ${entry.id} уже занят другим содержимым; замена не выполнена`);
          unchanged++;
        } else added++;
      }
      if (apply) for (const entry of entries) db.prepare('INSERT OR IGNORE INTO catalog_entries VALUES (?, ?)').run(entry.id, JSON.stringify(entry));
      db.exec('COMMIT');
      return { applied: apply, added, unchanged, total: existing.size + (apply ? added : 0) };
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  function search(params = new URLSearchParams()) {
    for (const key of params.keys()) if (!['q', 'kind', 'limit', 'offset'].includes(key) || params.getAll(key).length !== 1) throw new AppError(400, 'Неизвестный или повторный фильтр');
    const q = (params.get('q') || '').trim().toLocaleLowerCase('ru');
    const kind = params.get('kind');
    if (q.length > 200 || (kind !== null && !kinds.includes(kind))) throw new AppError(400, 'Неверный поиск');
    const number = (key, fallback, max) => {
      const value = params.get(key);
      if (value === null) return fallback;
      if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > max) throw new AppError(400, 'Неверная пагинация');
      return Number(value);
    };
    const limit = number('limit', 50, 100), offset = number('offset', 0, Number.MAX_SAFE_INTEGER);
    if (!limit) throw new AppError(400, 'Лимит должен быть больше нуля');
    const matches = all().filter(entry => (!kind || entry.kind === kind) && `${entry.name.ru} ${entry.name.en}`.toLocaleLowerCase('ru').includes(q));
    return { entries: matches.slice(offset, offset + limit), total: matches.length, limit, offset };
  }
  function coverage() {
    const entries = all();
    return { ruleset: '5e-2014', complete: false, expectedTotal: null, total: entries.length,
      categories: Object.fromEntries(kinds.map(kind => [kind, entries.filter(entry => entry.kind === kind).length])),
      referenceOnly: entries.filter(entry => entry.source.usage === 'reference-only').length,
      personal: entries.filter(entry => entry.source.usage === 'personal').length,
      gaps: ['Полная база не загружена; общее количество материалов не установлено.', 'Структурированные характеристики и связь с листом пока не реализованы.'] };
  }
  return { importEntries, search, coverage };
}
