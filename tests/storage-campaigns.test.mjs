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

const inventoryEntry = { id: 'srd51:2014:item:potion-of-healing', kind: 'item', name: { ru: 'Зелье лечения' } };
test('inventory UI retries the identical command after lost response, reload and context change', async () => {
  const local = memory(), session = memory(), calls = [];
  const h = harness(local, session, async (url, options) => {
    if (url === '/api/workspace') return response(payload(0));
    calls.push({ url, body: options.body }); throw new Error('lost response');
  });
  await h.api.boot(); h.api.addInventory(inventoryEntry);
  h.get('#inventory-quantity').value = '2';
  await h.get('#inventory-add-form').onsubmit({ preventDefault() {} });
  assert.equal(h.api.editable(), false);
  await assert.rejects(h.api.commit(seed, 'blocked'));
  const command = JSON.parse(calls[0].body);
  assert.equal(calls[0].url, '/api/inventory');
  assert.equal(command.characterId, 'first-hero'); assert.equal(command.quantity, 2);
  assert.equal(command.expectedRevision, 0); assert.equal(command.operation, undefined);
  const restored = harness(local, session, async (url, options) => {
    if (url !== '/api/workspace') calls.push({ url, body: options.body });
    return response(payload(2, 'other'));
  });
  await restored.api.boot(); await restored.click('sync-retry');
  assert.deepEqual(calls[1], calls[0]); assert.equal(restored.api.editable(), true);
  assert.match(restored.api.contextKey(), /other-hero/);
});

test('inventory form rejects invalid quantity and a changed context without sending a command', async () => {
  let current = payload(0); const calls = [];
  const h = harness(memory(), memory(), async url => { calls.push(url); return response(current); });
  await h.api.boot(); h.api.addInventory(inventoryEntry);
  for (const value of ['', '0', '-1', '1.5', '1000', 'two']) {
    h.get('#inventory-quantity').value = value;
    await h.get('#inventory-add-form').onsubmit({ preventDefault() {} });
  }
  current = payload(1, 'other'); await h.api.boot();
  h.get('#inventory-quantity').value = '2';
  await h.get('#inventory-add-form').onsubmit({ preventDefault() {} });
  assert.ok(calls.every(url => url === '/api/workspace'));
  assert.equal(h.api.editable(), true);
});

test('inventory read from a newer revision requires refresh and never silently adopts it', async () => {
  const commands = [];
  const h = harness(memory(), memory(), async (url, options) => {
    if (options.method === 'POST') {
      commands.push(JSON.parse(options.body));
      return { ok: false, status: 409, json: async () => ({ error: 'Игра изменилась' }) };
    }
    return response(url === '/api/workspace' ? payload(0) : { revision: 1, context: payload(0).context, entries: [] });
  });
  await h.api.boot(); await h.api.inventory();
  assert.equal(typeof h.get('#inventory-reload').onclick, 'function');
  h.api.addInventory(inventoryEntry); h.get('#inventory-quantity').value = '1';
  await h.get('#inventory-add-form').onsubmit({ preventDefault() {} });
  assert.equal(commands[0].expectedRevision, 0);
  assert.equal(h.api.editable(), false);
  assert.equal(h.get('sync-status').dataset.status, 'conflict');
  await h.click('sync-retry');
  assert.deepEqual(commands[1], commands[0]);
});


test('removal and undo UI keep exact commands through failure and reload', async () => {
  for (const operation of ['remove', 'undo']) {
    const local = memory(), session = memory(), calls = [];
    const h = harness(local, session, async (url, options) => {
      if (url === '/api/workspace') return response(payload(0));
      if (url === '/api/inventory') return response({ revision: 0, context: payload(0).context, entries: [], undo: { mutationId: 'target-operation', label: 'Списание' } });
      calls.push({ url, body: options.body }); throw new Error('lost response');
    });
    await h.api.boot();
    if (operation === 'remove') {
      h.api.removeInventory({ catalogId: inventoryEntry.id, quantity: 2, entry: inventoryEntry });
      h.get('#inventory-remove-quantity').value = '3';
      await h.get('#inventory-remove-form').onsubmit({ preventDefault() {} });
      assert.equal(calls.length, 0);
      h.get('#inventory-remove-quantity').value = '2';
      await h.get('#inventory-remove-form').onsubmit({ preventDefault() {} });
    } else { await h.api.inventory(); await h.get('#inventory-undo').onclick(); }
    assert.equal(calls[0].url, '/api/inventory/' + operation);
    assert.equal(h.api.editable(), false);
    const restored = harness(local, session, async (url, options) => {
      if (url !== '/api/workspace') calls.push({ url, body: options.body });
      return response(payload(1));
    });
    await restored.api.boot(); await restored.click('sync-retry');
    assert.deepEqual(calls[1], calls[0]); assert.equal(restored.api.editable(), true);
  }
});


test('v2 import preview does not write before confirmation and retries identical command after reload', async () => {
  const local = memory(), session = memory(), calls = [];
  const file = { app: 'skaz-active', schemaVersion: 2, ruleset: '5e-2014', scope: 'active-game', state: seed, inventory: [], catalog: { entries: [] } };
  const h = harness(local, session, async (url, options) => {
    if (url === '/api/workspace') return response(payload(0));
    calls.push({ url, body: options.body }); throw new Error('lost response');
  });
  await h.api.boot(); h.api.settings();
  await h.get('#import-state').onchange({ target: { files: [{ size: 200, text: async () => JSON.stringify(file) }] } });
  assert.equal(calls.length, 0);
  await h.get('#confirm-active-import').onclick();
  assert.equal(calls[0].url, '/api/import/active');
  assert.equal(JSON.parse(calls[0].body).destination, 'new-campaign');
  assert.equal(h.api.editable(), false);
  const restored = harness(local, session, async (url, options) => {
    if (url !== '/api/workspace') calls.push({ url, body: options.body });
    return response(payload(1, 'imported'));
  });
  await restored.api.boot(); await restored.click('sync-retry');
  assert.deepEqual(calls[1], calls[0]); assert.equal(restored.api.editable(), true);
});

test('v2 import refuses oversized command before storing a pending draft', async () => {
  const local = memory(); const calls = [];
  const h = harness(local, memory(), async url => { calls.push(url); return response(payload(0)); });
  await h.api.boot(); h.api.settings();
  const file = { app: 'skaz-active', schemaVersion: 2, ruleset: '5e-2014', scope: 'active-game', state: seed, inventory: [], catalog: { entries: [] }, padding: 'я'.repeat(300000) };
  await h.get('#import-state').onchange({ target: { files: [{ size: 200, text: async () => JSON.stringify(file) }] } });
  await h.get('#confirm-active-import').onclick();
  assert.equal(h.api.editable(), true); assert.equal(calls.length, 1);
  assert.equal([...local.values.keys()].some(key => key.startsWith('skaz-pending')), false);
  assert.match(h.messages.at(-1), /512/);
});


test('v3 preview includes spell list in the durable import and rejects a missing list', async () => {
  const calls = [];
  const h = harness(memory(), memory(), async (url, options) => {
    if (url === '/api/workspace') return response(payload(0));
    calls.push({ url, body: JSON.parse(options.body) }); return response(payload(1, 'imported'));
  });
  const file = { app: 'skaz-active', schemaVersion: 3, ruleset: '5e-2014', scope: 'active-game', state: seed, inventory: [], catalog: { entries: [] }, spellbook: [{ catalogId: 'test:spell', status: 'prepared' }] };
  await h.api.boot(); h.api.settings();
  const invalid = { ...file }; delete invalid.spellbook;
  await h.get('#import-state').onchange({ target: { files: [{ size: 200, text: async () => JSON.stringify(invalid) }] } });
  assert.match(h.messages.at(-1), /отсутствует список/); assert.equal(calls.length, 0);
  await h.get('#import-state').onchange({ target: { files: [{ size: 200, text: async () => JSON.stringify(file) }] } });
  assert.equal(calls.length, 0); await h.get('#confirm-active-import').onclick();
  assert.equal(calls[0].url, '/api/import/active');
  assert.deepEqual(calls[0].body.file.spellbook, file.spellbook);
});

test('client requests v3 export and refuses a response from another revision', async () => {
  const calls = [];
  const h = harness(memory(), memory(), async url => {
    calls.push(url);
    return response(url === '/api/workspace' ? payload(0) : { source: { context: payload(0).context, revision: 1 } });
  });
  await h.api.boot(); h.api.settings(); await h.get('#export-active').onclick();
  assert.equal(calls.at(-1), '/api/export/active-v3');
  assert.match(h.messages.at(-1), /Игра изменилась/);
});
