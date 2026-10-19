import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { seed } from '../server/state.mjs';
const source = await readFile(new URL('../client/storage.js', import.meta.url), 'utf8');
const memory = () => { const values = new Map(); return { get length() { return values.size; }, key: index => [...values.keys()][index], getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key), values }; };
function harness(localStorage, sessionStorage, fetch, navigator) {
  const handlers = {}, elements = new Map(), messages = [], archiveCalls = [], references = []; let dialog='';
  const get = id => { if (!elements.has(id)) elements.set(id, { value: '', dataset: {}, innerHTML: '', style: {}, focus() {} }); return elements.get(id); };
  const context = vm.createContext({ location: { protocol: 'http:' }, localStorage, sessionStorage, fetch, navigator,
    crypto: { randomUUID }, AbortSignal, structuredClone, URL, Blob, setTimeout,
    state: { ...structuredClone(seed), theme: 'polar' }, initial: { ...structuredClone(seed), theme: 'polar' },
    document: { getElementById: id=>id==='inventory-view'&&!dialog.includes('id="inventory-view"')?null:get(id), addEventListener: (key, handler) => handlers[key] = handler },
    SkazArchive: { open: id => archiveCalls.push(id) }, SkazCatalog:{openReference:(...args)=>references.push(args)}, window: { addEventListener() {} }, $: get, $$: selector => selector === '[data-session-view]' ? [get('session-view-button')] : selector === '[data-select-character]' ? [get('character-choice')] : selector === '[data-inventory-read]' ? [get('inventory-read-button')] : selector === '[data-inventory-remove]' ? [get('inventory-remove-button')] : [], esc: String, render() {}, modal:html=>dialog=html, closeModal() {}, toast: value => messages.push(value),
  });
  vm.runInContext(source, context);
  return { api: vm.runInContext('SkazStorage', context), get, messages, archiveCalls, references, dialog:()=>dialog,
    click: id => handlers.click({ target: { closest: () => ({ id }) } }),
    visible: value => {context.document.visibilityState=value;return handlers.visibilitychange();},
    state:()=>JSON.parse(vm.runInContext('JSON.stringify(state)',context)),
  };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
const payload = (revision, campaignId = 'first') => ({ schemaVersion: 1, revision, state: seed, context: { campaignId, characterId: campaignId + '-hero', sessionId: campaignId + '-session' } });
const response = data => ({ ok: true, json: async () => data });

test('window header survives reload and failed-command retry without changing another window identity', async () => {
  const local = memory(), session = memory(), calls = [];
  let offline = false;
  const transport = async (url, options) => {
    calls.push({ url, options });
    if (offline && options.method) throw new Error('offline');
    return response(payload(options.method ? 1 : 0));
  };
  const first = harness(local, session, transport); await first.api.boot();
  const id = calls[0].options.headers['X-Skaz-View'];
  assert.match(id, /^[a-zA-Z0-9-]{8,80}$/);
  offline = true;
  await assert.rejects(first.api.commit(seed, 'Save'));
  const original = calls.at(-1).options;
  assert.equal(original.headers['X-Skaz-Client'], 'local-v1');
  const reloaded = harness(local, session, transport); await reloaded.api.boot();
  offline = false; await reloaded.click('sync-retry');
  assert.equal(calls.at(-1).options.headers['X-Skaz-View'], id);
  assert.equal(calls.at(-1).options.body, original.body);
  const other = harness(local, memory(), transport); await other.api.boot();
  assert.notEqual(calls.at(-1).options.headers['X-Skaz-View'], id);
});

test('duplicated session storage gets a new live-window identity and cannot consume the original pending command', async () => {
  const held = new Set(), local = memory(), originalSession = memory(), calls = [];
  const navigator = { locks: { request: async (name, options, callback) => {
    assert.equal(options.ifAvailable, true);
    if (held.has(name)) return callback(null);
    held.add(name); return callback({ name });
  } } };
  const transport = async (url, options) => { calls.push(options); return response(payload(0)); };
  const original = harness(local, originalSession, transport, navigator); await original.api.boot();
  const id = originalSession.getItem('skaz-tab-id');
  local.setItem('skaz-pending-v1:' + id, JSON.stringify({ mutationId: randomUUID(), expectedRevision: 0, state: seed, label: 'Original draft' }));
  const duplicateSession = memory(); duplicateSession.setItem('skaz-tab-id', id);
  const duplicate = harness(local, duplicateSession, transport, navigator); await duplicate.api.boot();
  assert.notEqual(duplicateSession.getItem('skaz-tab-id'), id);
  assert.notEqual(calls[0].headers['X-Skaz-View'], calls[1].headers['X-Skaz-View']);
  assert.equal(duplicate.api.editable(), true);
  assert.ok(local.getItem('skaz-pending-v1:' + id));
  // Once the original document unloads, reload retains its identity and queue.
  held.delete('skaz-window:' + id);
  const reloaded = harness(local, originalSession, transport, navigator); await reloaded.api.boot();
  assert.equal(calls.at(-1).headers['X-Skaz-View'], id);
  assert.equal(reloaded.api.editable(), false);
});

test('returning to an old tab warns without replacing state or an open form, then refreshes explicitly',async()=>{
 let current=payload(0),calls=0;
 const h=harness(memory(),memory(),async()=>{calls++;return response(current);});await h.api.boot();
 const original=h.state();h.get('dialog').open=true;h.get('#note-text').value='Несохранённый рассказ мастера';
 current={...payload(1,'other'),state:{...seed,hp:12}};
 h.visible('visible');await tick();assert.equal(h.api.editable(),false);assert.deepEqual(h.state(),original);assert.equal(h.get('#note-text').value,'Несохранённый рассказ мастера');
 h.api.paint();assert.match(h.get('sync-status').innerHTML,/В другом окне есть изменения/);
 await assert.rejects(h.api.commit(seed,'Must not write'));assert.equal(calls,2);
 await h.click('sync-refresh');assert.equal(calls,2);assert.match(h.messages.at(-1),/Скопируй/);
 h.get('dialog').open=false;await h.click('sync-refresh');assert.equal(calls,3);assert.equal(h.api.editable(),true);assert.equal(h.state().hp,12);assert.match(h.api.contextKey(),/other/);
});

test('remote checks ignore late snapshots after a successful write and coalesce concurrent checks',async()=>{
 let resolveCheck,calls=0;
 const h=harness(memory(),memory(),async(url,options)=>{
  calls++;if(calls===1)return response(payload(0));
  if(options.method)return response({...payload(1),state:{...seed,hp:20}});
  return new Promise(resolve=>resolveCheck=resolve);
 });await h.api.boot();
 const checking=h.click('sync-check');await h.click('sync-check');assert.equal(calls,2);
 await h.api.commit({...seed,hp:20},'Change');resolveCheck(response(payload(0)));await checking;
 assert.equal(h.api.editable(),true);assert.equal(h.state().hp,20);assert.equal(calls,3);
});

test('hidden or pending tabs do not check; a failed check preserves usability and clears on recovery',async()=>{
 let mode='ok',calls=0;
 const h=harness(memory(),memory(),async()=>{calls++;if(mode==='fail')throw new Error('offline');return response(payload(0));});await h.api.boot();
 h.visible('hidden');await tick();assert.equal(calls,1);
 mode='fail';await h.click('sync-check');assert.equal(h.api.editable(),true);h.api.paint();assert.match(h.get('sync-status').innerHTML,/Не удалось проверить/);
 mode='ok';await h.click('sync-check');h.api.paint();assert.doesNotMatch(h.get('sync-status').innerHTML,/Не удалось проверить/);
 mode='fail';await assert.rejects(h.api.commit(seed,'offline write'));const count=calls;
 h.visible('visible');await h.click('sync-check');await tick();assert.equal(calls,count);assert.equal(h.api.editable(),false);
});

test('same revision with a different context or a restored older revision is also stale',async()=>{
 for(const remote of [payload(4,'different'),payload(3)]){
  let first=true;const h=harness(memory(),memory(),async()=>response(first?(first=false,payload(4)):remote));
  await h.api.boot();await h.click('sync-check');assert.equal(h.api.editable(),false);assert.match(h.api.contextKey(),/first/);
 }
});

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
    return response({ revision: 4, context: payload(4).context, id: 'old-session', archived: true, data: { journal: [{ title: 'Запись', text: 'Текст', time: '01:00' }] } });
  });
  await h.api.boot(); const active = h.api.contextKey();
  await h.click('session-settings'); await tick();
  h.get('session-view-button').dataset.sessionView = '0';
  await h.get('session-view-button').onclick();
  assert.deepEqual(h.archiveCalls,['old-session']); await h.api.sessionReviewData('old-session');
  assert.equal(h.api.contextKey(), active);
  assert.ok(calls.every(call => call.method === 'GET'));
  assert.equal(calls.at(-1).url, '/api/sessions/old-session/review');
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

test('client requests v7 export and refuses a response from another revision', async () => {
  const calls = [];
  const h = harness(memory(), memory(), async url => {
    calls.push(url);
    return response(url === '/api/workspace' ? payload(0) : { source: { context: payload(0).context, revision: 1 } });
  });
  await h.api.boot(); h.api.settings(); await h.get('#export-active').onclick();
  assert.equal(calls.at(-1), '/api/export/active-v7');
  assert.match(h.messages.at(-1), /Игра изменилась/);
});


test('spell selection persists exact command across lost response and reload', async () => {
  const local = memory(), session = memory(), calls = [];
  const h = harness(local, session, async (url, options) => {
    if (url === '/api/workspace') return response(payload(0));
    calls.push({ url, body: options.body }); throw new Error('lost response');
  });
  await h.api.boot();
  h.api.editSpell({ id: 'test:spell', kind: 'spell', name: { ru: 'Test' }, source: { title: 'Test', version: '1', terms: 'Personal' } });
  h.get('#spellbook-status').value = 'prepared';
  await h.get('#spellbook-form').onsubmit({ preventDefault() {} });
  assert.equal(calls[0].url, '/api/spellbook'); assert.equal(JSON.parse(calls[0].body).status, 'prepared');
  assert.equal(h.api.editable(), false);
  const restored = harness(local, session, async (url, options) => {
    if (url !== '/api/workspace') calls.push({ url, body: options.body });
    return response(payload(1));
  });
  await restored.api.boot(); await restored.click('sync-retry');
  assert.deepEqual(calls[1], calls[0]); assert.equal(restored.api.editable(), true);
});


test('v4 requires quests before preview and preserves provenance through a lost-response retry', async () => {
  const local = memory(), session = memory(), calls = [];
  const h = harness(local, session, async (url, options) => {
    if (url === '/api/workspace') return response(payload(0));
    calls.push({ url, body: options.body }); throw new Error('lost response');
  });
  const file = { app: 'skaz-active', schemaVersion: 4, ruleset: '5e-2014', scope: 'active-game', state: seed, inventory: [], catalog: { entries: [] }, spellbook: [], quests: [{ origin: { campaignId: 'campaign-old', questId: 'quest-old', sessionId: 'session-old' }, quest: { title: 'Find map', description: '', status: 'active', steps: [] } }] };
  await h.api.boot(); h.api.settings();
  const invalid = { ...file }; delete invalid.quests;
  await h.get('#import-state').onchange({ target: { files: [{ size: 200, text: async () => JSON.stringify(invalid) }] } });
  assert.match(h.messages.at(-1), /отсутствует список заданий/); assert.equal(calls.length, 0);
  await h.get('#import-state').onchange({ target: { files: [{ size: 1000, text: async () => JSON.stringify(file) }] } });
  assert.equal(calls.length, 0);
  await h.get('#confirm-active-import').onclick();
  assert.deepEqual(JSON.parse(calls[0].body).file, file);
  const restored = harness(local, session, async (url, options) => {
    if (url !== '/api/workspace') calls.push({ url, body: options.body });
    return response(payload(1, 'imported'));
  });
  await restored.api.boot(); await restored.click('sync-retry');
  assert.deepEqual(calls[1], calls[0]); assert.equal(restored.api.editable(), true);
});


test('quest creation retries exact POST operation and IDs after lost response', async () => {
  const local = memory(), session = memory(), calls = [];
  const h = harness(local, session, async (url, options) => {
    if (url === '/api/workspace') return response(payload(0));
    calls.push({ url, body: options.body }); throw new Error('lost');
  });
  await h.api.boot(); h.api.editQuest();
  h.get('#quest-title').value = 'Find map'; h.get('#quest-description').value = 'Ask keeper'; h.get('#quest-status').value = 'active';
  await h.get('#quest-form').onsubmit({ preventDefault() {} });
  assert.equal(calls[0].url, '/api/quests');
  const body = JSON.parse(calls[0].body); assert.equal(body.operation, 'create'); assert.ok(body.questId);
  const restored = harness(local, session, async (url, options) => {
    if (url !== '/api/workspace') calls.push({ url, body: options.body });
    return response(payload(1));
  });
  await restored.api.boot(); await restored.click('sync-retry');
  assert.deepEqual(calls[1], calls[0]); assert.equal(restored.api.editable(), true);
});

test('quest edit preserves step IDs and refuses a form opened in another revision', async () => {
  let current = payload(0); const calls = [];
  const h = harness(memory(), memory(), async (url, options) => {
    if (url === '/api/workspace') return response(current);
    if (url === '/api/quests' && !options.method) return response({ revision: 1, context: payload(1).context, quests: [] });
    calls.push(JSON.parse(options.body)); return response(payload(1));
  });
  const quest = { id: 'quest-existing', title: 'Map', description: '', status: 'active', steps: [{ id: 'step-existing', title: 'Keeper', done: false }] };
  await h.api.boot(); h.api.editQuest(quest);
  h.get('#quest-title').value = 'Map'; h.get('#quest-description').value = 'Done'; h.get('#quest-status').value = 'completed'; h.get('#quest-step-0').value = 'Keeper'; h.get('#quest-done-0').checked = true;
  await h.get('#quest-form').onsubmit({ preventDefault() {} });
  assert.equal(calls[0].operation, 'update'); assert.equal(calls[0].questId, quest.id);
  assert.deepEqual(calls[0].quest.steps, [{ id: 'step-existing', title: 'Keeper', done: true }]);
  h.api.editQuest(quest); current = payload(2, 'other'); await h.api.boot();
  await h.get('#quest-form').onsubmit({ preventDefault() {} });
  assert.equal(calls.length, 1); assert.match(h.messages.at(-1), /Игра изменилась/);
});


test('place form persists create command and position through response loss', async () => {
  const local = memory(), session = memory(), calls = [];
  const h = harness(local, session, async (url, options) => {
    if (url === '/api/workspace') return response(payload(0));
    calls.push({ url, body: options.body }); throw new Error('lost');
  });
  await h.api.boot(); h.api.editPlace();
  h.get('#place-title').value = 'North pass'; h.get('#place-description').value = 'Snow'; h.get('#place-x').value = '25.5'; h.get('#place-y').value = '60'; h.get('#place-visited').checked = true;
  await h.get('#place-form').onsubmit({ preventDefault() {} });
  assert.equal(calls[0].url, '/api/places'); const command = JSON.parse(calls[0].body);
  assert.equal(command.operation, 'create'); assert.equal(command.place.x, 25.5); assert.equal(command.place.visited, true);
  const restored = harness(local, session, async (url, options) => {
    if (url !== '/api/workspace') calls.push({ url, body: options.body }); return response(payload(1));
  });
  await restored.api.boot(); await restored.click('sync-retry');
  assert.deepEqual(calls[1], calls[0]); assert.equal(restored.api.editable(), true);
});

test('place read and edit cannot cross revisions or active campaigns', async () => {
  let current = payload(0), mapPayload = { revision: 1, context: payload(0).context, places: [] };
  const calls = [];
  const h = harness(memory(), memory(), async (url, options) => {
    if (url === '/api/workspace') return response(current);
    if (!options.method) return response(mapPayload);
    calls.push(options.body); return response(payload(2));
  });
  await h.api.boot(); await assert.rejects(h.api.placesData(), /Игра изменилась/);
  mapPayload.revision = 0; assert.equal((await h.api.placesData()).places.length, 0);
  h.api.editPlace({ id: 'existing-place', title: 'Town', description: '', x: 50, y: 50, visited: false });
  current = payload(1, 'different'); await h.api.boot();
  await h.get('#place-form').onsubmit({ preventDefault() {} });
  assert.equal(calls.length, 0); assert.match(h.messages.at(-1), /Игра изменилась/);
});

test('v5 preview requires places and preserves full place payload on import', async () => {
  const calls = [], h = harness(memory(), memory(), async (url, options) => {
    if (url === '/api/workspace') return response(payload(0));
    calls.push(JSON.parse(options.body)); return response(payload(1));
  });
  const file = { app: 'skaz-active', schemaVersion: 5, ruleset: '5e-2014', scope: 'active-game', state: seed, inventory: [], catalog: { entries: [] }, spellbook: [], quests: [], places: [{ origin: { campaignId: 'campaign-old', placeId: 'place-old', sessionId: 'session-old' }, place: { title: 'Town', description: '', x: 0, y: 100, visited: false } }] };
  await h.api.boot(); h.api.settings();
  const invalid = { ...file }; delete invalid.places;
  await h.get('#import-state').onchange({ target: { files: [{ size: 1000, text: async () => JSON.stringify(invalid) }] } });
  assert.match(h.messages.at(-1), /отсутствует список мест/); assert.equal(calls.length, 0);
  await h.get('#import-state').onchange({ target: { files: [{ size: 1000, text: async () => JSON.stringify(file) }] } });
  assert.equal(calls.length, 0); await h.get('#confirm-active-import').onclick();
  assert.deepEqual(calls[0].file.places, file.places);
});


test('quick quest step preserves status and other steps, and rejects a stale snapshot', async () => {
  const calls = [], h = harness(memory(), memory(), async (url, options) => {
    if (url === '/api/workspace') return response(payload(0));
    calls.push(JSON.parse(options.body)); return response(payload(1));
  });
  await h.api.boot(); const key = h.api.snapshotKey();
  const selected = { id: 'quest-existing', title: 'Map', description: 'Ask', status: 'active', steps: [{ id: 'step-one', title: 'First', done: false }, { id: 'step-two', title: 'Second', done: true }] };
  await h.api.setQuestStep(selected, 'step-one', true, key);
  assert.equal(calls[0].operation, 'update'); assert.equal(calls[0].quest.status, 'active');
  assert.deepEqual(calls[0].quest.steps.map(s => s.done), [true,true]);
  assert.deepEqual(selected.steps.map(s => s.done), [false,true]);
  await assert.rejects(h.api.setQuestStep(selected, 'step-two', false, key), /Игра изменилась/);
  assert.equal(calls.length, 1);
});


test('manual proposal persists source, target and exact key across failed delivery', async () => {
  const local=memory(),session=memory(),calls=[];
  const h=harness(local,session,async(url,options)=>{if(url==='/api/workspace')return response(payload(0));calls.push({url,body:options.body});throw new Error('lost');});
  await h.api.boot();h.api.newProposal();
  h.get('#proposal-source').value='На перевале костёр.';h.get('#proposal-title').value='Костёр';h.get('#proposal-speaker').value='Мастер';h.get('#proposal-minute').value='102';h.get('#proposal-target').value='journal';
  await h.get('#proposal-form').onsubmit({preventDefault(){}});
  const command=JSON.parse(calls[0].body);assert.equal(calls[0].url,'/api/proposals');assert.equal(command.source.offsetMs,6120000);assert.equal(command.characterId,payload(0).context.characterId);assert.equal(command.suggestion.kind,'journal');
  const restored=harness(local,session,async(url,options)=>{if(url!=='/api/workspace')calls.push({url,body:options.body});return response(payload(1));});
  await restored.api.boot();await restored.click('sync-retry');assert.deepEqual(calls[1],calls[0]);
});

test('proposal review sends corrected text only on confirmation and blocks stale forms', async () => {
  let current=payload(0);const calls=[];
  const h=harness(memory(),memory(),async(url,options)=>{if(url==='/api/workspace')return response(current);calls.push(JSON.parse(options.body));return response(payload(1));});
  const item={id:'proposal-one',status:'pending',source:{text:'Original',speaker:'Master',offsetMs:0},suggestion:{kind:'journal',title:'Old',text:'Old'}};
  await h.api.boot();h.api.reviewProposal(item);assert.equal(calls.length,0);
  h.get('#review-title').value='Corrected';h.get('#review-text').value='Corrected text';
  await h.get('#proposal-review').onsubmit({preventDefault(){}});assert.equal(calls[0].decision,'accept');assert.deepEqual(calls[0].content,{title:'Corrected',text:'Corrected text'});assert.equal(item.source.text,'Original');
  h.api.reviewProposal(item);current=payload(2,'other');await h.api.boot();await h.get('#dismiss-proposal').onclick();assert.equal(calls.length,1);assert.match(h.messages.at(-1),/Игра изменилась/);
});

test('v6 preview requires proposals and passes decision state unchanged', async () => {
  const calls=[],h=harness(memory(),memory(),async(url,options)=>{if(url==='/api/workspace')return response(payload(0));calls.push(JSON.parse(options.body));return response(payload(1));});
  const file={app:'skaz-active',schemaVersion:6,ruleset:'5e-2014',scope:'active-game',state:seed,inventory:[],catalog:{entries:[]},spellbook:[],quests:[],places:[],proposals:[]};
  await h.api.boot();h.api.settings();const invalid={...file};delete invalid.proposals;
  await h.get('#import-state').onchange({target:{files:[{size:1000,text:async()=>JSON.stringify(invalid)}]}});assert.match(h.messages.at(-1),/отсутствует список предложений/);assert.equal(calls.length,0);
  await h.get('#import-state').onchange({target:{files:[{size:1000,text:async()=>JSON.stringify(file)}]}});await h.get('#confirm-active-import').onclick();assert.deepEqual(calls[0].file,file);
});


test('accepted proposal delivery retries the identical decision after response loss and reload', async () => {
  const local=memory(),session=memory(),calls=[];
  const h=harness(local,session,async(url,options)=>{if(url==='/api/workspace')return response(payload(0));calls.push({url,body:options.body});throw new Error('response lost after commit');});
  const item={id:'proposal-pending',status:'pending',source:{text:'Original',speaker:'Master',offsetMs:60000},suggestion:{kind:'personal-note',title:'Promise',text:'Original'}};
  await h.api.boot();h.api.reviewProposal(item);h.get('#review-title').value='Promise';h.get('#review-text').value='Return the compass';
  await h.get('#proposal-review').onsubmit({preventDefault(){}});
  assert.equal(h.api.editable(),false);assert.equal(calls[0].url,'/api/proposals/decide');
  const decision=JSON.parse(calls[0].body);assert.equal(decision.decision,'accept');assert.deepEqual(decision.content,{title:'Promise',text:'Return the compass'});
  const restored=harness(local,session,async(url,options)=>{if(url!=='/api/workspace')calls.push({url,body:options.body});return response(payload(1));});
  await restored.api.boot();assert.equal(restored.api.editable(),false);await restored.click('sync-retry');
  assert.deepEqual(calls[1],calls[0]);assert.equal(restored.api.editable(),true);
});


test('archive transport rejects an older snapshot and context switched during loading',async()=>{
 let current=payload(0),pending;
 const h=harness(memory(),memory(),async url=>url==='/api/workspace'?response(current):new Promise(resolve=>pending=resolve));
 await h.api.boot();const load=h.api.sessionReviewData('old-session');pending(response({revision:1,context:current.context}));await assert.rejects(load,/Игра изменилась/);
 const switched=h.api.sessionReviewData('old-session');current=payload(2,'another');await h.api.boot();pending(response({revision:0,context:payload(0).context}));await assert.rejects(switched,/Игра изменилась/);
});


test('new character persists explicit template and original ID after response loss',async()=>{
 const local=memory(),session=memory(),calls=[];
 const h=harness(local,session,async(url,options)=>{if(url==='/api/workspace')return response(payload(0));calls.push({url,body:options.body});throw new Error('lost');});
 await h.api.boot();h.api.newCharacter();h.get('#character-name').value='Лира';h.get('#character-tagline').value='Проводник';await h.get('#character-form').onsubmit({preventDefault(){}});
 assert.equal(calls[0].url,'/api/characters');const command=JSON.parse(calls[0].body);assert.equal(command.template,'bard5-demo');assert.equal(command.profile.name,'Лира');assert.equal(command.campaignId,'first');assert.equal(command.state,undefined);
 const restored=harness(local,session,async(url,options)=>{if(url!=='/api/workspace')calls.push({url,body:options.body});return response(payload(1));});await restored.api.boot();await restored.click('sync-retry');assert.deepEqual(calls[1],calls[0]);
});

test('character picker selects the requested hero in the current session and stale forms do not write',async()=>{
 const calls=[];let current=payload(0);
 const h=harness(memory(),memory(),async(url,options)=>{if(url==='/api/workspace')return response(current);if(url==='/api/campaigns')return response({campaigns:[{id:'first',name:'Campaign',characters:[{id:'first-hero',name:'First'},{id:'second-hero',name:'Second'}],sessions:[{id:'first-session'}]}]});calls.push(JSON.parse(options.body));return response(payload(1));});
 await h.api.boot();await h.click('campaign-settings');await tick();h.get('character-choice').dataset.selectCharacter='0:1';await h.get('character-choice').onclick();assert.equal(calls[0].context.characterId,'second-hero');assert.equal(calls[0].context.sessionId,'first-session');
 h.api.newCharacter();current=payload(2,'other');await h.api.boot();await h.get('#character-form').onsubmit({preventDefault(){}});assert.equal(calls.length,1);assert.match(h.messages.at(-1),/Игра изменилась/);
});

test('personal spellbook transport checks response revision and character context',async()=>{
 let current=payload(0),pending;
 const h=harness(memory(),memory(),async url=>url==='/api/workspace'?response(current):new Promise(resolve=>pending=resolve));await h.api.boot();
 let request=h.api.spellbookData();pending(response({revision:1,context:current.context,entries:[]}));await assert.rejects(request,/Игра изменилась/);
 request=h.api.spellbookData();current=payload(2,'another');await h.api.boot();pending(response({revision:0,context:payload(0).context,entries:[]}));await assert.rejects(request,/Игра изменилась/);
 request=h.api.spellbookData();pending(response({revision:2,context:current.context,entries:[]}));assert.deepEqual((await request).entries,[]);
});
test('inline spell edit returns to caller only after a confirmed save and rejects stale form',async()=>{
 let current=payload(0),completed=0;const calls=[];
 const h=harness(memory(),memory(),async(url,options)=>{if(url==='/api/workspace')return response(current);calls.push({url,body:options.body});current=payload(1);return response(current);});await h.api.boot();
 const entry={id:'test:spell',kind:'spell',name:{ru:'Test'},source:{title:'Own',version:'1',terms:'Own'}};
 h.api.editSpell(entry,'known',()=>completed++);h.get('#spellbook-status').value='prepared';await h.get('#spellbook-form').onsubmit({preventDefault(){}});assert.equal(completed,1);assert.equal(calls.length,1);
 h.api.editSpell(entry,'prepared',()=>completed++);current=payload(2,'new');await h.api.boot();await h.get('#spellbook-form').onsubmit({preventDefault(){}});assert.equal(completed,1);assert.equal(calls.length,1);
});

test('personal spell reading links the original source and rejects active or credential URLs',async()=>{
 const h=harness(memory(),memory(),async()=>response(payload(0)));await h.api.boot();
 const entry={id:'personal:spell',kind:'spell',name:{ru:'Пример'},source:{url:'https://example.com/source#page=1',title:'Source',version:'1',terms:'Personal'}};
 h.api.editSpell(entry,'known');assert.match(h.dialog(),/href="https:\/\/example.com\/source#page=1"/);assert.match(h.dialog(),/noopener noreferrer/);
 for(const url of ['javascript:alert(1)','data:text/html,test','https://user:password@example.com']){h.api.editSpell({...entry,source:{...entry.source,url}},'known');assert.doesNotMatch(h.dialog(),/href=/);}
});


test('inventory read button opens saved item without commands and rejects a stale character revision',async()=>{
 let version=0;const writes=[];
 const saved={catalogId:'test:saved',quantity:2,entry:{kind:'item',name:{ru:'Saved ring',en:'Ring'},text:'Saved description',source:{title:'Source',version:'1',url:'https://example.com',terms:'Personal'},item:{attunement:false}}};
 const h=harness(memory(),memory(),async(url,options)=>{if(options.method==='POST')writes.push(url);return response(url==='/api/workspace'?payload(version):{revision:version,context:payload(version).context,entries:[saved]});});
 await h.api.boot();await h.api.inventory();h.get('inventory-read-button').dataset.inventoryRead='0';const oldRead=h.get('inventory-read-button').onclick;oldRead();assert.match(h.dialog(),/Saved description/);assert.match(h.dialog(),/В наличии: 2/);assert.equal(writes.length,0);
 await h.get('#inventory-read-back').onclick();assert.match(h.dialog(),/data-inventory-read="0"/);version=1;await h.api.boot();oldRead();assert.match(h.messages.at(-1),/Игра изменилась/);assert.equal(writes.length,0);
});


test('late inventory responses cannot reopen a closed dialog or replace another form, including errors',async()=>{
 for(const mode of ['closed','replaced','error']){let resolve,reject;
  const h=harness(memory(),memory(),async url=>url==='/api/workspace'?response(payload(0)):new Promise((yes,no)=>{resolve=yes;reject=no;}));
  await h.api.boot();const pending=h.api.inventory();await tick();
  if(mode==='closed')h.get('dialog').open=false;else h.api.addInventory(inventoryEntry);
  const current=h.dialog();if(mode==='error')reject(new Error('offline'));else resolve(response({revision:0,context:payload(0).context,entries:[]}));
  await pending;assert.equal(h.dialog(),current);
 }
});


test('inventory search filters saved snapshots without writes and retains original indexes for reading and removal',async()=>{
 const items=Array.from({length:23},(_,i)=>({catalogId:'saved:'+i,quantity:i+1,entry:{kind:i===12?'artifact':'item',name:{ru:'Предмет '+i,en:i===12?'Unique Pearl':'Item '+i},text:'Description '+i,source:{title:'Fixture',version:'1',terms:'Personal'},...(i===22?{}:i===12?{artifact:{attunement:true}}:{item:{attunement:i%2===0}})}}));
 const calls=[];const h=harness(memory(),memory(),async(url,options)=>{calls.push([url,options.method]);return response(url==='/api/workspace'?payload(0):{...payload(0),entries:items});});
 await h.api.boot();await h.api.inventory();assert.match(h.dialog(),/1–10 из 23/);assert.doesNotMatch(h.dialog(),/data-inventory-read="10"/);
 h.get('#inventory-next').onclick();assert.match(h.dialog(),/11–20 из 23/);h.get('inventory-read-button').dataset.inventoryRead='12';h.get('inventory-read-button').onclick();assert.match(h.dialog(),/Description 12/);assert.match(h.dialog(),/В наличии: 13/);
 await h.get('#inventory-read-back').onclick();assert.match(h.dialog(),/11–20 из 23/);
 h.get('#inventory-query').value='  pEaRl ';h.get('#inventory-attunement').value='required';h.get('#inventory-search').onsubmit({preventDefault(){}});
 assert.match(h.dialog(),/1–1 из 1/);assert.match(h.dialog(),/data-inventory-read="12"/);assert.doesNotMatch(h.dialog(),/data-inventory-read="0"/);
 h.get('inventory-remove-button').dataset.inventoryRemove='12';h.get('inventory-remove-button').onclick();assert.match(h.dialog(),/Списать: Предмет 12/);assert.match(h.dialog(),/В наличии: 13/);
 await h.api.inventory();assert.match(h.dialog(),/1–1 из 1/);h.get('#inventory-reset').onclick();assert.match(h.dialog(),/1–10 из 23/);
 h.get('#inventory-query').value='';h.get('#inventory-attunement').value='none';h.get('#inventory-search').onsubmit({preventDefault(){}});assert.match(h.dialog(),/1–10 из 11/);assert.doesNotMatch(h.dialog(),/data-inventory-read="22"/);
 assert.equal(calls.some(([,method])=>method==='POST'),false);
});

test('inventory filters reset for a new hero, clamp shortened pages, and stale handlers cannot reopen another dialog',async()=>{
 let current=payload(0),count=21;
 const make=i=>({catalogId:'item:'+i,quantity:1,entry:{name:{ru:'Кольцо '+i,en:'Ring '+i},source:{title:'Source',version:'1'},item:{attunement:false}}});
 const h=harness(memory(),memory(),async url=>response(url==='/api/workspace'?current:{...current,entries:Array.from({length:count},(_,i)=>make(i))}));
 await h.api.boot();await h.api.inventory();h.get('#inventory-next').onclick();h.get('#inventory-next').onclick();assert.match(h.dialog(),/21–21 из 21/);
 count=2;await h.api.inventory();assert.match(h.dialog(),/1–2 из 2/);
 h.get('#inventory-query').value='no match';h.get('#inventory-attunement').value='';h.get('#inventory-search').onsubmit({preventDefault(){}});assert.match(h.dialog(),/По этим условиям ничего не найдено/);assert.match(h.dialog(),/0–0 из 0/);
 const stale=h.get('#inventory-reset').onclick;h.api.addInventory(inventoryEntry);const form=h.dialog();stale();assert.equal(h.dialog(),form);
 current=payload(1,'second');await h.api.boot();await h.api.inventory();assert.match(h.dialog(),/1–2 из 2/);assert.doesNotMatch(h.dialog(),/value="no match"/);
 const old=h.get('#inventory-search').onsubmit;current=payload(2,'third');await h.api.boot();const before=h.dialog();old({preventDefault(){}});assert.equal(h.dialog(),before);assert.match(h.messages.at(-1),/Игра изменилась/);
});


test('saved inventory charge facts and reference return keep the snapshot and reject changed context',async()=>{
 let current=payload(0);const entry={id:'test:wand',kind:'item',name:{ru:'Старая палочка',en:'Old Wand'},text:'Saved old text',source:{title:'Original',version:'old',terms:'Personal'},item:{attunement:true,charges:{max:7,recharge:'На рассвете'}}};
 const h=harness(memory(),memory(),async url=>response(url==='/api/workspace'?current:{...current,entries:[{catalogId:entry.id,quantity:1,entry}]}));
 await h.api.boot();await h.api.inventory();h.get('inventory-read-button').dataset.inventoryRead='0';h.get('inventory-read-button').onclick();assert.match(h.dialog(),/Максимум зарядов: 7/);assert.match(h.dialog(),/не текущий остаток/);
 const open=h.get('#inventory-reference').onclick;open();assert.equal(h.references[0][0],entry.id);assert.equal(h.references[0][2](),true);
 h.references[0][1]();assert.match(h.dialog(),/Saved old text/);current=payload(1,'new');await h.api.boot();assert.equal(h.references[0][2](),false);open();assert.equal(h.references.length,1);
});


test('charge form validates unknown balances and retries the exact manual operation after response loss',async()=>{
 const local=memory(),session=memory(),calls=[];
 const item={catalogId:'test:wand',quantity:2,chargeCounts:[5,null],entry:{id:'test:wand',name:{ru:'Палочка',en:'Wand'},item:{charges:{max:7,recharge:'Вручную'}},source:{url:'https://example.org',title:'Test',version:'1',terms:'Test'}}};
 const h=harness(local,session,async(url,options)=>{
  if(url==='/api/workspace')return response(payload(0));
  if(url==='/api/inventory'&&!options.method)return response({revision:0,context:payload(0).context,entries:[item]});
  calls.push({url,body:options.body});throw new Error('response lost');
 });
 await h.api.boot();await h.api.inventory();h.get('inventory-read-button').dataset.inventoryRead='0';h.get('inventory-read-button').onclick();h.get('#inventory-charges').onclick();
 h.get('#charges-unit').value='1';h.get('#charges-operation').value='spend';h.get('#charges-amount').value='1';
 await h.get('#charges-form').onsubmit({preventDefault(){}});assert.equal(calls.length,0);assert.match(h.messages.at(-1),/Сначала укажи/);
 h.get('#charges-unit').value='0';h.get('#charges-amount').value='6';await h.get('#charges-form').onsubmit({preventDefault(){}});assert.equal(calls.length,0);
 h.get('#charges-amount').value='2';h.get('#charges-amount').oninput();assert.match(h.get('#charges-preview').textContent,/3 \/ 7/);
 await h.get('#charges-form').onsubmit({preventDefault(){}});assert.equal(calls[0].url,'/api/inventory/charges');assert.equal(JSON.parse(calls[0].body).operation,'spend');assert.equal(JSON.parse(calls[0].body).unit,0);
 const restored=harness(local,session,async(url,options)=>{if(url!=='/api/workspace')calls.push({url,body:options.body});return response(payload(1));});
 await restored.api.boot();await restored.click('sync-retry');assert.deepEqual(calls[1],calls[0]);assert.equal(restored.api.editable(),true);
});

test('charge form keeps zero, accepts explicit unknown and rejects stale context before submission',async()=>{
 let current=payload(0);const calls=[];
 const item={catalogId:'test:wand',quantity:1,chargeCounts:[3],entry:{name:{ru:'Палочка',en:'Wand'},item:{charges:{max:7,recharge:'Вручную'}},source:{url:'https://example.org',title:'Test',version:'1',terms:'Test'}}};
 const h=harness(memory(),memory(),async(url,options)=>{
  if(url==='/api/workspace')return response(current);
  if(url==='/api/inventory'&&!options.method)return response({revision:current.revision,context:current.context,entries:[item]});
  calls.push(JSON.parse(options.body));current=payload(current.revision+1);return response(current);
 });
 async function open(){await h.api.inventory();h.get('inventory-read-button').dataset.inventoryRead='0';h.get('inventory-read-button').onclick();h.get('#inventory-charges').onclick();h.get('#charges-unit').value='0';}
 await h.api.boot();await open();h.get('#charges-operation').value='set';h.get('#charges-amount').value='';await h.get('#charges-form').onsubmit({preventDefault(){}});assert.equal(calls.length,0);
 h.get('#charges-amount').value='0';await h.get('#charges-form').onsubmit({preventDefault(){}});assert.equal(calls[0].amount,0);
 await open();h.get('#charges-operation').value='unknown';h.get('#charges-operation').onchange();assert.equal(h.get('#charges-amount').disabled,true);await h.get('#charges-form').onsubmit({preventDefault(){}});assert.equal(calls[1].amount,null);
 await open();current=payload(3,'other');await h.api.boot();await h.get('#charges-form').onsubmit({preventDefault(){}});assert.equal(calls.length,2);assert.match(h.messages.at(-1),/Игра изменилась/);
});

test('private server responses label storage honestly without changing local defaults',async()=>{
 const h=harness(memory(),memory(),async()=>({...response(payload(0)),headers:{get:()=> 'private-server'}}));
 await h.api.boot();h.api.paint();assert.match(h.get('sync-status').innerHTML,/Сохранено на сервере/);assert.match(h.get('app-mode').textContent,/Закрытый сервер/);
 h.api.settings();assert.match(h.dialog(),/Прогресс хранится на сервере/);assert.match(h.dialog(),/Вход общий/);
});


test('event form draft restores raw text after reload, remains local and is isolated by session and window', async () => {
  const local = memory(), session = memory(); let current = payload(0), writes = 0;
  const transport = async (url, options) => { if (options.method) writes++; return response(current); };
  const first = harness(local, session, transport); await first.api.boot(); first.api.newProposal();
  for (const [field,value] of Object.entries({ source: '<script>private story</script>', speaker: 'Мастер', minute: '36', title: 'Мост', target: 'journal' })) first.get('#proposal-'+field).value = value;
  first.get('#proposal-form').oninput();
  assert.equal(writes,0); assert.match(first.get('#proposal-draft-status').textContent,/сохранён в этом браузере/);
  const reloaded = harness(local, session, transport); await reloaded.api.boot(); reloaded.api.newProposal();
  assert.equal(reloaded.get('#proposal-source').value,'<script>private story</script>');
  assert.equal(reloaded.get('#proposal-minute').value,'36'); assert.match(reloaded.get('#proposal-draft-status').textContent,/Восстановлен/);
  assert.doesNotMatch(reloaded.dialog(),/<script>private story/);
  const other = harness(local, memory(), transport); await other.api.boot(); other.api.newProposal(); assert.equal(other.get('#proposal-source').value,'');
  current = { ...payload(1), context: { ...payload(1).context, sessionId: 'new-session' } };
  const nextSession = harness(local, session, transport); await nextSession.api.boot(); nextSession.api.newProposal(); assert.equal(nextSession.get('#proposal-source').value,'');
  nextSession.api.settings(); nextSession.get('#saved-drafts').onclick(); assert.match(nextSession.dialog(),/Текст события/);
  assert.equal(writes,0);
});

test('event draft survives failed submission and clears only after a confirmed retry without sending local metadata', async () => {
  const local = memory(), session = memory(), calls = []; let failed = true;
  const transport = async (url, options) => {
    if (!options.method) return response(payload(0));
    calls.push(JSON.parse(options.body)); if (failed) throw new Error('lost response');
    return response(payload(1));
  };
  const h = harness(local,session,transport); await h.api.boot(); h.api.newProposal();
  for (const [field,value] of Object.entries({ source: 'Мастер рассказал о мосте.', speaker: '', minute: '1', title: 'Мост', target: 'journal' })) h.get('#proposal-'+field).value=value;
  h.get('#proposal-form').oninput(); const draftKey=[...local.values.keys()].find(key=>key.startsWith('skaz-proposal-form-v1:'));
  await h.get('#proposal-form').onsubmit({preventDefault(){}});
  assert.ok(local.getItem(draftKey)); assert.equal(calls[0].formDraftKey,undefined);
  const restored=harness(local,session,transport); await restored.api.boot(); failed=false; await restored.click('sync-retry');
  assert.deepEqual(calls[1],calls[0]); assert.equal(local.getItem(draftKey),null);
});

test('event draft storage failure is visible and never reports a server save', async () => {
  const local=memory();local.setItem=()=>{throw new Error('quota');};
  const h=harness(local,memory(),async()=>response(payload(0)));await h.api.boot();h.api.newProposal();
  h.get('#proposal-source').value='Не потерять';h.get('#proposal-form').oninput();
  assert.match(h.get('#proposal-draft-status').textContent,/Черновик не сохранён/);
  assert.equal(h.get('#proposal-source').value,'Не потерять'); assert.equal(h.api.editable(),true);
});
