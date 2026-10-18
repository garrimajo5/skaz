export const seed = {
  hp: 28, maxHp: 38, gold: 124, slots: { 1: 3, 2: 2, 3: 1 }, inspiration: 3,
  accepted: [], dismissed: [], journal: [], notes: [], mapNotes: [], checks: {},
  eventEdits: {}, concentration: null,
  profile: { name: 'Элиан Вейл', tagline: 'Тот, кто собирает чужие истории', campaign: 'Там, где гаснут маяки' },
};

export class AppError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = message => { throw new AppError(422, message); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function keys(value, allowed, label) {
  if (!object(value) || Object.keys(value).some(key => !allowed.includes(key))) fail(`Некорректные поля: ${label}`);
}
function text(value, max, label, empty = true) {
  if (typeof value !== 'string' || value.length > max || (!empty && !value.trim())) fail(`Некорректный текст: ${label}`);
}
function integer(value, min, max, label) {
  if (!Number.isSafeInteger(value) || value < min || value > max) fail(`Некорректное число: ${label}`);
}
function list(value, max, label) {
  if (!Array.isArray(value) || value.length > max) fail(`Слишком много записей или неверный формат: ${label}`);
}

export function validateState(input) {
  keys(input, Object.keys(seed), 'состояние');
  for (const key of Object.keys(seed)) if (!(key in input)) fail(`Отсутствует поле: ${key}`);
  integer(input.maxHp, 1, 999, 'максимум хитов');
  integer(input.hp, 0, input.maxHp, 'хиты');
  integer(input.gold, 0, 1000000000, 'золото');
  integer(input.inspiration, 0, 4, 'вдохновение');
  keys(input.slots, ['1', '2', '3'], 'ячейки');
  for (const [level, max] of [[1, 4], [2, 3], [3, 2]]) integer(input.slots[level], 0, max, `ячейки ${level}`);
  for (const field of ['accepted', 'dismissed']) {
    list(input[field], 3, field);
    if (new Set(input[field]).size !== input[field].length || input[field].some(id => !['quest', 'gold', 'damage'].includes(id))) fail('Неверные идентификаторы событий');
  }
  if (input.accepted.some(id => input.dismissed.includes(id))) fail('Событие не может быть одновременно принято и пропущено');
  for (const field of ['journal', 'notes']) {
    list(input[field], 2000, field);
    for (const entry of input[field]) {
      keys(entry, ['title', 'text', 'kind', 'at', 'time'], field);
      text(entry.title, 2000, 'заголовок', false);
      text(entry.text, 4000, 'запись');
      if (entry.kind !== undefined) text(entry.kind, 80, 'тип записи');
      integer(entry.at, 0, 8640000000000000, 'время записи');
      text(entry.time, 20, 'метка времени');
    }
  }
  list(input.mapNotes, 1000, 'заметки карты');
  for (const note of input.mapNotes) {
    keys(note, ['place', 'text'], 'заметка карты');
    if (!['lighthouse', 'town', 'forest'].includes(note.place)) fail('Неизвестное место');
    text(note.text, 2000, 'заметка карты', false);
  }
  keys(input.checks, ['q0', 'q1', 'q2'], 'этапы задания');
  if (Object.values(input.checks).some(value => typeof value !== 'boolean')) fail('Неверное состояние этапа');
  keys(input.eventEdits, ['quest', 'gold', 'damage'], 'уточнения событий');
  if (input.eventEdits.quest !== undefined) text(input.eventEdits.quest, 2000, 'зацепка', false);
  for (const field of ['gold', 'damage']) if (input.eventEdits[field] !== undefined) integer(input.eventEdits[field], 0, 9999, field);
  if (input.concentration !== null) text(input.concentration, 200, 'концентрация', false);
  keys(input.profile, ['name', 'tagline', 'campaign'], 'профиль');
  text(input.profile.name, 80, 'имя персонажа', false);
  text(input.profile.tagline, 160, 'описание');
  text(input.profile.campaign, 120, 'кампания', false);
  return structuredClone(input);
}
