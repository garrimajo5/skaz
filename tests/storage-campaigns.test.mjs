import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { seed } from '../server/state.mjs';
const source = await readFile(new URL('../client/storage.js', import.meta.url), 'utf8');
const memory = () => { const values = new Map(); return { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key), values }; };
function harness(localStorage, sessionStorage, fetch) {
  const handlers = {}, elements = new Map(), messages = [];
  const get = id => { if (!elements.has(id)) elements.set(id, { value: '', dataset: {}, innerHTML: '' }); return elements.get(id); };
  const context = vm.createContext({ location: { protocol: 'http:' }, localStorage, sessionStorage, fetch,
    crypto: { randomUUID }, AbortSignal, structuredClone, URL, Blob, setTimeout,
    state: { ...structuredClone(seed), theme: 'polar' }, initial: { ...structuredClone(seed), theme: 'polar' },
    document: { getElementById: get, addEventListener: (key, handler) => handlers[key] = handler },
    window: { addEventListener() {} }, $: get, $$: selector => selector === '[data-session-view]' ? [get('session-view-button')] : [], esc: String, render() {}, modal() {}, closeModal() {}, toast: value => messages.push(value),
  });
  vm.runInContext(source, context);
  return { api: vm.runInContext('SkazStorage', context), get, messages,
    click: id => handlers.click({ target: { closest: () => ({ id }) } }),
  };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
const payload = (revision, campaignId = 'first') => ({ schemaVersion: 1, revision, state: seed, context: { campaignId, characterId: campaignId + '-hero', sessionId: campaignId + '-session' } });
const response = data => ({ ok: true, json: async () => data });

test('failed creation survives reload and retries the original POST key; pending blocks writes and switching', async () => {
  const local = memory(), session = memory(), calls = [];
  const h = harness(local, session, async (url, options) => {
    if (url === '/api/workspace') return response(payload(0));
    if (url === '/api/campaigns' && !options.method) return response({ campaigns: [] });
    calls.push({ url, options }); throw new Error('network lost');
  });
  await h.api.boot(); await h.click('campaign-settings'); await tick();
  h.get('#new-campaign').onclick();
  h.get('#new-campaign-name').value = 'Новая'; h.get('#new-hero-name').value = 'Герой';
  await h.get('#create-campaign-form').onsubmit({ preventDefault() {} });
  assert.equal(h.api.editable(), false);
  await assert.rejects(h.api.commit(seed, 'Blocked'));
  await h.click('campaign-settings'); await tick();
  assert.equal(calls.length, 1);
  const original = JSON.parse(calls[0].options.body);
  assert.equal(calls[0].url, '/api/campaigns'); assert.equal(calls[0].options.method, 'POST');
  assert.equal(original.operation, undefined); assert.equal(original.state.profile.campaign, 'Новая');
  const restored = harness(local, session, async (url, options) => {
    if (url === '/api/workspace') return response(payload(1, 'new'));
    calls.push({ url, options }); return response(payload(1, 'new'));
  });
  await restored.api.boot(); assert.equal(restored.api.editable(), false);
  await restored.click('sync-retry');
  assert.equal(restored.api.editable(), true);
  assert.equal(calls[1].url, '/api/campaigns');
  assert.equal(calls[1].options.body, calls[0].options.body);
  assert.equal([...local.values.keys()].filter(key => key.startsWith('skaz-pending')).length, 0);
});

test('reloading another active context invalidates the previous undo notification', async () => {
  let current = payload(0);
  const h = harness(memory(), memory(), async () => response(current));
  await h.api.boot(); const old = h.api.contextKey();
  current = payload(1, 'other'); await h.api.boot();
  assert.notEqual(h.api.contextKey(), old);
  assert.ok(h.messages.includes('Активная игра изменена'));
});

test('session UI retains failed start command and retries POST with the same key after reload', async () => {
  const local = memory(), session = memory(), calls = [];
  const h = harness(local, session, async (url, options) => {
    if (url === '/api/workspace') return response(payload(0));
    if (url.endsWith('/sessions') && !options.method) return response({ sessions: [] });
    calls.push({ url, body: options.body }); throw new Error('offline');
  });
  await h.api.boot(); await h.click('session-settings'); await tick();
  h.get('#new-session').onclick();
  h.get('#session-name').value = 'Новая сессия'; h.get('#session-date').value = '2026-10-19';
  await h.get('#new-session-form').onsubmit({ preventDefault() {} });
  assert.equal(h.api.editable(), false);
  assert.equal(calls[0].url, '/api/sessions');
  assert.deepEqual(JSON.parse(calls[0].body).session, { name: 'Новая сессия', playedOn: '2026-10-19' });
  const updated = { ...payload(1), session: { name: 'Новая сессия', playedOn: '2026-10-19' } };
  const restored = harness(local, session, async (url, options) => {
    if (url !== '/api/workspace') calls.push({ url, body: options.body });
    return response(updated);
  });
  await restored.api.boot(); await restored.click('sync-retry');
  assert.deepEqual(calls[1], calls[0]);
  assert.equal(restored.api.sessionTitle(), 'Новая сессия');
  assert.equal(restored.api.sessionDate(), '2026-10-19');
  assert.equal(restored.api.editable(), true);
});

test('archive view uses GET only and does not change the active context', async () => {
  const calls = [];
  const h = harness(memory(), memory(), async (url, options) => {
    calls.push({ url, method: options.method || 'GET' });
    if (url === '/api/workspace') return response(payload(4));
    if (url.endsWith('/sessions')) return response({ sessions: [{ id: 'old-session', archived: true, name: 'Старая', playedOn: null }] });
    return response({ id: 'old-session', archived: true, data: { journal: [{ title: 'Запись', text: 'Текст', time: '01:00' }] } });
  });
  await h.api.boot(); const active = h.api.contextKey();
  await h.click('session-settings'); await tick();
  h.get('session-view-button').dataset.sessionView = '0';
  await h.get('session-view-button').onclick();
  assert.equal(h.api.contextKey(), active);
  assert.ok(calls.every(call => call.method === 'GET'));
  assert.equal(calls.at(-1).url, '/api/sessions/old-session');
  assert.equal(h.api.editable(), true);
});
