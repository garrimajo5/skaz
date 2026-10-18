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
function spell(value) {
  object(value, ['level', 'school', 'castingTime', 'range', 'components', 'duration', 'concentration', 'ritual']);
  if (!Number.isInteger(value.level) || value.level < 0 || value.level > 9) fail('Уровень заклинания: целое 0–9');
  if (!['abjuration', 'conjuration', 'divination', 'enchantment', 'evocation', 'illusion', 'necromancy', 'transmutation'].includes(value.school)) fail('Неизвестная школа');
  object(value.range, ['type', 'feet']);
  if (!['self', 'touch', 'feet', 'sight', 'unlimited', 'special'].includes(value.range.type)) fail('Неизвестная дистанция');
  if (value.range.type === 'feet' ? (!Number.isSafeInteger(value.range.feet) || value.range.feet <= 0 || value.range.feet > 10000000) : value.range.feet !== undefined) fail('Неверная дистанция в футах');
  if (!Array.isArray(value.components) || !value.components.length || value.components.some(c => !['V', 'S', 'M'].includes(c)) || new Set(value.components).size !== value.components.length) fail('Неверные компоненты');
  if (typeof value.concentration !== 'boolean' || typeof value.ritual !== 'boolean') fail('Нужны логические признаки концентрации и ритуала');
  return { level: value.level, school: value.school, castingTime: text(value.castingTime), range: { type: value.range.type, ...(value.range.type === 'feet' ? { feet: value.range.feet } : {}) }, components: [...value.components].sort(), duration: text(value.duration), concentration: value.concentration, ritual: value.ritual };
}
function item(value) {
  object(value, ['type', 'rarity', 'attunement', 'attunementRequirement', 'healing']);
  if (!['armor', 'potion', 'ring', 'rod', 'scroll', 'staff', 'wand', 'weapon', 'wondrous'].includes(value.type)) fail('Неизвестный тип магического предмета');
  if (!['common', 'uncommon', 'rare', 'very-rare', 'legendary', 'varies'].includes(value.rarity)) fail('Неизвестная редкость предмета');
  if (typeof value.attunement !== 'boolean') fail('Настройка предмета должна быть boolean');
  if (value.attunementRequirement !== undefined && !value.attunement) fail('Условие настройки требует attunement=true');
  let healing;
  if (value.healing !== undefined) {
    if (value.type !== 'potion') fail('Структурированное лечение пока поддерживается только для зелий');
    object(value.healing, ['diceCount', 'diceSides', 'bonus']);
    const { diceCount, diceSides, bonus } = value.healing;
    if (!Number.isSafeInteger(diceCount) || diceCount < 1 || diceCount > 100 || ![4, 6, 8, 10, 12, 20].includes(diceSides) || !Number.isSafeInteger(bonus) || bonus < 0 || bonus > 10000) fail('Неверная формула лечения');
    healing = { diceCount, diceSides, bonus };
  }
  return { type: value.type, rarity: value.rarity, attunement: value.attunement,
    ...(value.attunementRequirement === undefined ? {} : { attunementRequirement: text(value.attunementRequirement) }),
    ...(healing === undefined ? {} : { healing }) };
}
export function validateCatalog(bundle) {
  object(bundle, ['schemaVersion', 'entries']);
  if (bundle.schemaVersion !== 1 || !Array.isArray(bundle.entries) || bundle.entries.length > 1000 || !bundle.entries.length) fail('Ожидается пакет версии 1: от 1 до 1000 записей');
  const ids = new Set();
  return bundle.entries.map(entry => {
    object(entry, ['id', 'ruleset', 'kind', 'name', 'source', 'text', 'links', 'spell', 'item']);
    const entryId = id(entry.id);
    if (ids.has(entryId)) fail(`Повтор ID: ${entryId}`);
    ids.add(entryId);
    if (entry.ruleset !== '5e-2014' || !kinds.includes(entry.kind)) fail('Нужны категория и редакция 5e-2014');
    object(entry.name, ['ru', 'en']);
    object(entry.source, ['url', 'title', 'version', 'usage', 'terms', 'attribution', 'changes']);
    if (!['reference-only', 'personal', 'cc-by-4.0'].includes(entry.source.usage)) fail('Неизвестный режим использования');
    if (entry.source.usage === 'reference-only' && (entry.text !== undefined || entry.spell !== undefined || entry.item !== undefined)) fail('Справочная ссылка не должна содержать копию текста или характеристики');
    if (entry.spell !== undefined && entry.kind !== 'spell') fail('Характеристики заклинания допустимы только для spell');
    if (entry.item !== undefined && entry.kind !== 'item') fail('Характеристики предмета допустимы только для item');
    const license = entry.source.usage === 'cc-by-4.0' ? { attribution: text(entry.source.attribution, 2000), changes: text(entry.source.changes, 2000) } : {};
    if (entry.source.usage !== 'cc-by-4.0' && (entry.source.attribution !== undefined || entry.source.changes !== undefined)) fail('Атрибуция CC допускается только для cc-by-4.0');
    if (!Array.isArray(entry.links) || entry.links.length > 100) fail('Неверный список связей');
    const links = entry.links.map(id).sort();
    if (new Set(links).size !== links.length || links.includes(entryId)) fail('Повторная связь или ссылка на себя');
    return {
      id: entryId, ruleset: '5e-2014', kind: entry.kind,
      name: { ru: text(entry.name.ru), en: text(entry.name.en) },
      source: { url: url(entry.source.url), title: text(entry.source.title), version: text(entry.source.version), usage: entry.source.usage, terms: text(entry.source.terms, 2000), ...license },
      ...(entry.text === undefined ? {} : { text: text(entry.text, 20000) }), links,
      ...(entry.spell === undefined ? {} : { spell: spell(entry.spell) }),
      ...(entry.item === undefined ? {} : { item: item(entry.item) }),
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
      openlyLicensed: entries.filter(entry => entry.source.usage === 'cc-by-4.0').length,
      structuredSpells: entries.filter(entry => entry.spell !== undefined).length,
      structuredItems: entries.filter(entry => entry.item !== undefined).length,
      gaps: ['Полная база не загружена; общее количество материалов не установлено.', 'Структуры заклинаний и предметов частичные; полные эффекты остаются в тексте. Схемы монстров и артефактов, связь с листом и инвентарём пока не реализованы.'] };
  }
  return { importEntries, search, coverage };
}
