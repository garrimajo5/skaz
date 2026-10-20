import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../client/quests.js', import.meta.url), 'utf8');
function harness() {
  let key = 'first', editable = true; const handlers = {}, tasks = [], requests = [], edits = [], toggles = [], messages = [];
  const region = { innerHTML: '', setAttribute() {}, focus() {} };
  const context = vm.createContext({ queueMicrotask: fn => tasks.push(fn), toast: msg => messages.push(msg), document: { addEventListener: (name,fn) => handlers[name] = fn, getElementById: () => region, querySelector: () => region }, SkazStorage: { snapshotKey: () => key, contextKey: () => key.split(':')[0], editable: () => editable, questsData: () => new Promise((resolve,reject) => requests.push({ resolve,reject })), editQuest: p => edits.push(p), setQuestStep: (...args) => { toggles.push(args); editable = false; return Promise.reject(new Error('offline')); } } });
  vm.runInContext(source, context);
  return { region, tasks, requests, edits, toggles, messages, view: () => vm.runInContext('SkazQuests.view()',context), setKey: value => key = value,
    click: (id, dataset = {}) => handlers.click({ target: { closest: () => ({ id, dataset }) } }),
    search: (q, status = 'all') => handlers.submit({ target: { id: 'personal-quest-search', elements: { q: { value: q }, status: { value: status } } }, preventDefault() {} }),
    change: input => handlers.change({ target: input }) };
}
const settle = () => new Promise(resolve => setImmediate(resolve));
const quest = (i = 0) => ({ id: 'quest-' + i, title: 'Задание ' + i, description: '<img src=x onerror=alert(1)>', status: i % 2 ? 'completed' : 'active', steps: [{ id: 'step-' + i, title: 'Найти проводника ' + i, done: false }] });

test('quest screen searches steps, filters status, paginates and escapes text', async () => {
  const h = harness(); h.view(); h.tasks.shift()(); h.requests[0].resolve({ quests: Array.from({length:15},(_,i) => quest(i)) }); await settle();
  assert.match(h.region.innerHTML, /1–12 из 15/); assert.match(h.region.innerHTML, /&lt;img/); assert.doesNotMatch(h.region.innerHTML, /<img/);
  h.click('quests-next'); assert.match(h.region.innerHTML, /13–15 из 15/);
  h.search('проводника', 'active'); assert.match(h.region.innerHTML, /1–8 из 8/);
  h.click('', { personalEdit: 'quest-0' }); assert.equal(h.edits[0].id, 'quest-0');
  h.search('nothing'); assert.match(h.region.innerHTML, /Задания не найдены/);
});

test('quest screen ignores old campaign reads and stale edit clicks', async () => {
  const h = harness(); h.view(); h.tasks.shift()(); h.setKey('second'); h.view(); h.tasks.shift()();
  h.requests[1].resolve({ quests: [quest(1)] }); await settle(); const current = h.region.innerHTML;
  h.requests[0].resolve({ quests: [quest(0)] }); await settle(); assert.equal(h.region.innerHTML, current);
  h.setKey('third'); h.click('', { personalEdit: 'quest-1' }); assert.equal(h.edits.length, 0);
});

test('quick step uses stored quest and snapshot, does not show failed change as saved', async () => {
  const h = harness(); h.view(); h.tasks.shift()(); h.requests[0].resolve({ quests: [quest()] }); await settle();
  const input = { dataset: { personalStep: 'step-0', personalQuest: 'quest-0' }, checked: true, disabled: false };
  await h.change(input);
  assert.equal(input.checked, false); assert.equal(input.disabled, true);
  assert.equal(h.toggles[0][0].id, 'quest-0'); assert.equal(h.toggles[0][1], 'step-0'); assert.equal(h.toggles[0][2], true); assert.equal(h.toggles[0][3], 'first');
  assert.match(h.messages[0], /offline/); assert.match(h.region.innerHTML, /disabled/);
});

test('quest screen offers retry and creation for an empty campaign', async () => {
  const h = harness(); h.view(); h.tasks.shift()(); h.requests[0].reject(new Error('offline')); await settle();
  assert.match(h.region.innerHTML, /Задания недоступны/); h.click('quests-retry'); h.requests[1].resolve({ quests: [] }); await settle();
  assert.match(h.region.innerHTML, /Первая нить приключения/); h.click('create-personal-quest'); assert.equal(h.edits.length, 1);
});


test('quest page remains selected after a revision update within the same campaign', async () => {
  const h = harness(); h.view(); h.tasks.shift()(); const quests = Array.from({length:15},(_,i) => quest(i));
  h.requests[0].resolve({ quests }); await settle(); h.click('quests-next');
  h.setKey('first:1'); h.view(); h.tasks.shift()(); h.requests[1].resolve({ quests }); await settle();
  assert.match(h.region.innerHTML, /13–15 из 15/);
  h.setKey('second:1'); h.view(); h.tasks.shift()(); h.requests[2].resolve({ quests }); await settle();
  assert.match(h.region.innerHTML, /1–12 из 15/);
});

test('long quest notes expose an escaped full description without requiring editing or a nested text scroller',async()=>{
 const h=harness(),long='Known lead '.repeat(50)+'<script>attack()</script> hidden-tail';h.view();h.tasks.shift()();h.requests[0].resolve({quests:[{...quest(),description:long}]});await settle();
 assert.match(h.region.innerHTML,/<details class="quest-description-full"><summary>Полное описание/);assert.match(h.region.innerHTML,/&lt;script&gt;/);assert.doesNotMatch(h.region.innerHTML,/<script>/);assert.match(h.region.innerHTML,/hidden-tail/);
 h.search('hidden-tail');assert.match(h.region.innerHTML,/1–1 из 1/);assert.equal(h.edits.length,0);assert.equal(h.toggles.length,0);
});
