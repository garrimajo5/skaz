import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../client/map.js', import.meta.url), 'utf8');
function harness() {
  let key = 'first'; const handlers = {}, tasks = [], requests = [], edits = [];
  const region = { innerHTML: '', setAttribute() {}, focus() {}, scrollIntoView() {} };
  const context = vm.createContext({ queueMicrotask: fn => tasks.push(fn), document: { addEventListener: (name,fn) => handlers[name] = fn, getElementById: () => region, querySelector: () => region }, SkazStorage: { snapshotKey: () => key, placesData: () => new Promise((resolve,reject) => requests.push({ resolve,reject })), editPlace: p => edits.push(p) } });
  vm.runInContext(source, context);
  return { region, tasks, requests, edits, view: () => vm.runInContext('SkazMap.view()',context), setKey: value => key = value,
    click: (id, dataset = {}) => handlers.click({ target: { closest: () => ({ id, dataset }) } }),
    search: (q, visited = 'all') => handlers.submit({ target: { id: 'map-search', elements: { q: { value: q }, visited: { value: visited } } }, preventDefault() {} }) };
}
const settle = () => new Promise(resolve => setImmediate(resolve));
const place = (i = 0) => ({ id: 'place-' + i, title: 'Место ' + i, description: i === 0 ? '<img src=x onerror=alert(1)>' : 'Следопыт', x: 25, y: 70, visited: i % 2 === 0 });

test('map filters notes and visited places, paginates and escapes personal text', async () => {
  const h = harness(); h.view(); h.tasks.shift()(); h.requests[0].resolve({ places: Array.from({ length: 25 }, (_,i) => place(i)) }); await settle();
  assert.match(h.region.innerHTML, /1–20 из 25/); h.click('map-next'); assert.match(h.region.innerHTML, /21–25 из 25/);
  h.search('следопыт', 'yes'); assert.match(h.region.innerHTML, /1–12 из 12/);
  h.search('img'); h.click('', { mapSelect: 'place-0' }); assert.match(h.region.innerHTML, /&lt;img/); assert.doesNotMatch(h.region.innerHTML, /<img/);
  h.click('', { mapEdit: 'place-0' }); assert.equal(h.edits[0].id, 'place-0');
  h.search('missing'); assert.match(h.region.innerHTML, /Места не найдены/);
});

test('late map response from another campaign cannot replace new map or edit it', async () => {
  const h = harness(); h.view(); h.tasks.shift()(); h.setKey('second'); h.view(); h.tasks.shift()();
  h.requests[1].resolve({ places: [{ ...place(1), title: 'New campaign' }] }); await settle(); const current = h.region.innerHTML;
  h.requests[0].resolve({ places: [place()] }); await settle(); assert.equal(h.region.innerHTML, current);
  h.setKey('third'); h.click('', { mapEdit: 'place-1' }); assert.equal(h.edits.length, 0);
});

test('map offers retry on error and a distinct empty state', async () => {
  const h = harness(); h.view(); h.tasks.shift()(); h.requests[0].reject(new Error('offline')); await settle();
  assert.match(h.region.innerHTML, /Карта недоступна/); h.click('map-retry'); h.requests[1].resolve({ places: [] }); await settle();
  assert.match(h.region.innerHTML, /Начни свою карту/); h.click('new-place'); assert.equal(h.edits.length, 1);
});
