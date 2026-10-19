import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { openStore } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';
import { seed } from '../server/state.mjs';
const items = JSON.parse(readFileSync(new URL('../catalog/srd51-items.json', import.meta.url), 'utf8'));
const cmd = (store, fields) => ({ mutationId: randomUUID(), expectedRevision: store.read().revision, ...fields });
const add = (store, fields = {}) => cmd(store, { characterId: store.read().context.characterId, catalogId: items.entries[0].id, quantity: 2, ...fields });

test('inventory add replays once, survives session and workspace saves, and is isolated by character', () => {
  const store = openStore(':memory:');
  try {
    store.catalog.importEntries(items, { apply: true });
    const original = store.read(); const request = add(store);
    store.addInventory(request);
    assert.equal(store.addInventory(request).replayed, true);
    assert.equal(store.inventory().entries[0].quantity, 2);
    assert.deepEqual(store.read().state, original.state);
    assert.throws(() => store.addInventory({ ...request, quantity: 3 }), { status: 409 });
    assert.throws(() => store.addInventory({ ...request, mutationId: randomUUID() }), { status: 409 });
    store.update(cmd(store, { label: 'Old client save', state: seed }));
    store.startSession(cmd(store, { session: { name: 'Next', playedOn: '2026-10-19' } }));
    const first = store.read().context;
    assert.equal(store.inventory().entries[0].quantity, 2);
    store.createCampaign(cmd(store, { state: seed }));
    const second = store.read().context;
    assert.equal(store.inventory().entries.length, 0);
    const replay = store.addInventory(request);
    assert.deepEqual(replay.context, second);
    assert.deepEqual(replay.affectedContext, original.context);
    assert.equal(store.inventory().entries.length, 0);
    assert.throws(() => store.addInventory(add(store, { characterId: first.characterId })), { status: 409 });
    store.selectContext(cmd(store, { context: first }));
    store.addInventory(add(store, { quantity: 1 }));
    assert.equal(store.inventory().entries[0].quantity, 3);
  } finally { store.close(); }
});

test('invalid or overflowing inventory commands do not change revision, history or quantities', () => {
  const store = openStore(':memory:');
  try {
    store.catalog.importEntries(items, { apply: true });
    for (const quantity of [0, -1, 1.5, '2', 1000]) assert.throws(() => store.addInventory(add(store, { quantity })), { status: 422 });
    assert.throws(() => store.addInventory(add(store, { extra: 1 })), { status: 400 });
    assert.throws(() => store.addInventory(add(store, { catalogId: 'missing:item' })), { status: 404 });
    const spell = { ...items.entries[0], id: 'personal:spell', kind: 'spell' }; delete spell.item;
    store.catalog.importEntries({ schemaVersion: 1, entries: [spell] }, { apply: true });
    assert.throws(() => store.addInventory(add(store, { catalogId: spell.id })), { status: 422 });
    assert.equal(store.read().revision, 0);
    store.addInventory(add(store, { quantity: 999 }));
    const before = store.inventory();
    assert.throws(() => store.addInventory(add(store, { quantity: 1 })), { status: 422 });
    assert.deepEqual(store.inventory(), before); assert.equal(store.history().length, 1);
  } finally { store.close(); }
});

test('inventory and audit roll back together, persist after reopen and are included in SQLite backup', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'skaz-inventory-'));
  const file = join(dir, 'game.sqlite'), backup = join(dir, 'backup.sqlite');
  let store = openStore(file); const raw = new DatabaseSync(file);
  try {
    store.catalog.importEntries(items, { apply: true });
    const request = add(store);
    raw.exec("CREATE TRIGGER reject_inventory_receipt BEFORE INSERT ON changes BEGIN SELECT RAISE(ABORT, 'test failure'); END");
    assert.throws(() => store.addInventory(request), /test failure/);
    assert.equal(store.inventory().entries.length, 0); assert.equal(store.read().revision, 0);
    assert.equal(raw.prepare('SELECT count(*) AS n FROM inventory_changes').get().n, 0);
    raw.exec('DROP TRIGGER reject_inventory_receipt');
    store.addInventory(request);
    const audit = raw.prepare('SELECT * FROM inventory_changes').get();
    assert.deepEqual(JSON.parse(audit.before_json), []);
    assert.equal(JSON.parse(audit.after_json)[0].quantity, 2);
    await store.backup(backup);
    store.close(); store = openStore(file);
    assert.equal(store.addInventory(request).replayed, true);
    const copy = openStore(backup);
    try { assert.deepEqual(copy.inventory(), store.inventory()); } finally { copy.close(); }
  } finally { raw.close(); store.close(); }
});

test('inventory HTTP commands require local write protection and report current context', async t => {
  const store = openStore(':memory:'); store.catalog.importEntries(items, { apply: true });
  const app = createApp(store); await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => app.close(resolve)); store.close(); });
  const url = `http://127.0.0.1:${app.address().port}/api/inventory`;
  const headers = { 'Content-Type': 'application/json', 'X-Skaz-Client': 'local-v1' }, body = JSON.stringify(add(store));
  assert.equal((await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })).status, 403);
  assert.equal((await fetch(url, { method: 'POST', headers: { ...headers, Origin: 'https://other.example' }, body })).status, 403);
  assert.equal((await fetch(url, { method: 'POST', headers, body })).status, 200);
  assert.equal((await fetch(url, { method: 'POST', headers, body }).then(r => r.json())).replayed, true);
  const result = await fetch(url).then(r => r.json());
  assert.equal(result.entries[0].quantity, 2); assert.equal(result.revision, 1);
  assert.equal(result.context.characterId, store.read().context.characterId);
});


test('inventory removal is bounded, replayable and isolated, including full depletion', () => {
  const store = openStore(':memory:');
  try {
    store.catalog.importEntries(items, { apply: true });
    store.addInventory(add(store, { quantity: 3 }));
    const original = store.read();
    for (const quantity of [0, -1, 1.5, '1', 1000, 4]) assert.throws(() => store.removeInventory(add(store, { quantity })), { status: 422 });
    assert.throws(() => store.removeInventory(add(store, { extra: 1 })), { status: 400 });
    assert.throws(() => store.removeInventory(add(store, { characterId: 'another' })), { status: 409 });
    assert.throws(() => store.removeInventory(add(store, { catalogId: items.entries[1].id })), { status: 404 });
    assert.deepEqual(store.read(), original);
    const request = add(store, { quantity: 2 });
    store.removeInventory(request);
    assert.equal(store.inventory().entries[0].quantity, 1);
    assert.deepEqual(store.inventory().entries[0].entry, items.entries[0]);
    assert.equal(store.removeInventory(request).replayed, true);
    assert.throws(() => store.addInventory(request), { status: 409 });
    assert.throws(() => store.removeInventory({ ...request, mutationId: randomUUID() }), { status: 409 });
    assert.deepEqual(store.read().state, original.state);
    store.removeInventory(add(store, { quantity: 1 }));
    assert.equal(store.inventory().entries.length, 0);
    assert.equal(store.removeInventory(request).replayed, true);
    assert.equal(store.inventory().entries.length, 0);
    store.createCampaign(cmd(store, { state: seed }));
    const replay = store.removeInventory(request);
    assert.deepEqual(replay.affectedContext, original.context);
    assert.notEqual(replay.context.characterId, original.context.characterId);
    assert.equal(store.inventory().entries.length, 0);
  } finally { store.close(); }
});

test('removal rollback restores a depleted row and its source; receipt survives reopen', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'skaz-remove-'));
  const file = join(dir, 'game.sqlite');
  let store = openStore(file); const raw = new DatabaseSync(file);
  try {
    store.catalog.importEntries(items, { apply: true });
    store.addInventory(add(store));
    const before = store.inventory(), request = add(store);
    raw.exec("CREATE TRIGGER reject_remove BEFORE INSERT ON changes BEGIN SELECT RAISE(ABORT, 'remove failure'); END");
    assert.throws(() => store.removeInventory(request), /remove failure/);
    assert.deepEqual(store.inventory(), before);
    assert.equal(raw.prepare('SELECT count(*) AS n FROM inventory_changes').get().n, 1);
    raw.exec('DROP TRIGGER reject_remove');
    store.removeInventory(request);
    const audit = raw.prepare('SELECT * FROM inventory_changes WHERE mutation_id=?').get(request.mutationId);
    assert.deepEqual(JSON.parse(audit.before_json), before.entries);
    assert.deepEqual(JSON.parse(audit.after_json), []);
    store.close(); store = openStore(file);
    assert.equal(store.removeInventory(request).replayed, true);
    assert.equal(store.inventory().entries.length, 0);
    assert.equal(store.history().length, 2);
  } finally { raw.close(); store.close(); }
});

test('inventory removal HTTP endpoint protects writes and returns revision conflicts', async t => {
  const store = openStore(':memory:'); store.catalog.importEntries(items, { apply: true });
  store.addInventory(add(store));
  const app = createApp(store); await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => app.close(resolve)); store.close(); });
  const url = `http://127.0.0.1:${app.address().port}/api/inventory/remove`;
  const headers = { 'Content-Type': 'application/json', 'X-Skaz-Client': 'local-v1' };
  const request = add(store, { quantity: 1 }), body = JSON.stringify(request);
  assert.equal((await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })).status, 403);
  assert.equal((await fetch(url, { method: 'POST', headers: { ...headers, Origin: 'https://other.example' }, body })).status, 403);
  assert.equal(store.inventory().entries[0].quantity, 2);
  assert.equal((await fetch(url, { method: 'POST', headers, body })).status, 200);
  assert.equal((await fetch(url, { method: 'POST', headers, body }).then(r => r.json())).replayed, true);
  assert.equal((await fetch(url, { method: 'POST', headers, body: JSON.stringify({ ...request, mutationId: randomUUID() }) })).status, 409);
  assert.equal(store.inventory().entries[0].quantity, 1);
});
