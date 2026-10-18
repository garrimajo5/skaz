import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../client/catalog.js', import.meta.url), 'utf8');
function harness(protocol = 'http:') {
  const handlers = {}, requests = [], tasks = [];
  const region = { innerHTML: '', setAttribute() {} };
  let dialog = '';
  const context = vm.createContext({
    location: { protocol }, page: 'library', URL, URLSearchParams, AbortSignal,
    queueMicrotask: task => tasks.push(task),
    fetch: url => new Promise((resolve, reject) => requests.push({ url, resolve, reject })),
    document: { addEventListener: (name, fn) => handlers[name] = fn, getElementById: () => region, querySelector: () => null },
    FormData: class { constructor(form) { this.form = form; } get(key) { return this.form[key] || ''; } },
    modal: html => dialog = html,
  });
  vm.runInContext(source, context);
  const view = () => vm.runInContext('SkazCatalog.view()', context);
  return { view, requests, tasks, region, dialog: () => dialog,
    submit: q => handlers.submit({ target: { id: 'catalog-search', q }, preventDefault() {} }),
    detail: () => handlers.click({ target: { closest: () => ({ hasAttribute: () => true, dataset: { catalogEntry: '0' } }) } }),
  };
}
const settle = () => new Promise(resolve => setImmediate(resolve));
function respond(request, payload) { request.resolve({ ok: true, json: async () => payload }); }
const entry = { kind: 'mechanic', name: { ru: '<img src=x onerror=alert(1)>', en: 'Test' }, source: { title: 'Fixture', usage: 'personal', url: 'javascript:alert(1)', version: '1', terms: '<script>unsafe</script>' }, text: '<b>plain text</b>' };
const coverage = { total: 1, referenceOnly: 0, personal: 1 };

test('late catalog responses cannot replace newer search results', async () => {
  const h = harness(); h.submit('old'); h.submit('new');
  respond(h.requests[2], { entries: [entry], total: 1 }); respond(h.requests[3], coverage);
  await settle();
  const current = h.region.innerHTML;
  respond(h.requests[0], { entries: [], total: 0 }); respond(h.requests[1], coverage);
  await settle();
  assert.equal(h.region.innerHTML, current);
  assert.match(current, /&lt;img/);
  assert.doesNotMatch(current, /<img/);
  h.detail();
  assert.match(h.dialog(), /&lt;b&gt;plain text/);
  assert.doesNotMatch(h.dialog(), /href=|<script>/);
});

test('catalog failure offers retry; empty search differs from empty database; file demo does not fetch', async () => {
  const h = harness(); h.submit('missing');
  h.requests[0].reject(new Error('offline')); respond(h.requests[1], coverage);
  await settle(); assert.match(h.region.innerHTML, /Повторить/);
  h.submit('missing'); respond(h.requests[2], { entries: [], total: 0 }); respond(h.requests[3], coverage);
  await settle(); assert.match(h.region.innerHTML, /Ничего не найдено/);
  h.submit(''); respond(h.requests[4], { entries: [], total: 0 }); respond(h.requests[5], coverage);
  await settle(); assert.match(h.region.innerHTML, /Каталог пока пуст/);
  const demo = harness('file:'); assert.match(demo.view(), /автономная демонстрация/);
  assert.equal(demo.requests.length, 0); assert.equal(demo.tasks.length, 0);
});
