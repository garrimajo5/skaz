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


const undo = (store, targetMutationId, fields = {}) => cmd(store, { characterId: store.read().context.characterId, targetMutationId, ...fields });
test('inventory undo reverses add and full removal, preserves sources and rejects double undo', () => {
  const store = openStore(':memory:');
  try {
    store.catalog.importEntries(items, { apply: true });
    const addition = add(store); store.addInventory(addition);
    const inventory = store.inventory().entries, state = store.read().state;
    const removal = add(store); store.removeInventory(removal);
    const reversal = undo(store, removal.mutationId); store.undoInventory(reversal);
    assert.deepEqual(store.inventory().entries, inventory);
    assert.deepEqual(store.read().state, state);
    assert.equal(store.undoInventory(reversal).replayed, true);
    assert.throws(() => store.undoInventory(undo(store, removal.mutationId)), { status: 409 });
    assert.throws(() => store.undoInventory(undo(store, reversal.mutationId)), { status: 409 });
    const more = add(store, { quantity: 1 }); store.addInventory(more);
    store.undoInventory(undo(store, more.mutationId));
    assert.deepEqual(store.inventory().entries, inventory);
    store.createCampaign(cmd(store, { state: seed }));
    const first = add(store); store.addInventory(first);
    store.undoInventory(undo(store, first.mutationId));
    assert.deepEqual(store.inventory().entries, []);
    const replay = store.undoInventory(reversal);
    assert.notEqual(replay.context.characterId, replay.affectedContext.characterId);
    assert.deepEqual(store.inventory().entries, []);
  } finally { store.close(); }
});

test('undo refuses later progress, invalid targets and foreign characters without changing state', () => {
  const store = openStore(':memory:');
  try {
    store.catalog.importEntries(items, { apply: true });
    const addition = add(store); store.addInventory(addition);
    const before = store.inventory();
    assert.throws(() => store.undoInventory(undo(store, addition.mutationId, { characterId: 'other' })), { status: 409 });
    assert.throws(() => store.undoInventory(undo(store, 'missing-operation')), { status: 404 });
    assert.throws(() => store.undoInventory(undo(store, addition.mutationId, { extra: true })), { status: 400 });
    for (const target of [null, '', 5, 'short']) assert.throws(() => store.undoInventory(undo(store, target)), { status: 422 });
    assert.deepEqual(store.inventory(), before);
    const old = undo(store, addition.mutationId);
    store.update(cmd(store, { label: 'HP change', state: { ...seed, hp: 20 } }));
    assert.throws(() => store.undoInventory(old), { status: 409 });
    assert.throws(() => store.undoInventory(undo(store, addition.mutationId)), { status: 409 });
    assert.equal(store.read().state.hp, 20);
    assert.deepEqual(store.inventory().entries, before.entries);
  } finally { store.close(); }
});

test('undo failure rolls back inventory and audit, successful receipt survives reopen', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'skaz-undo-')), file = join(dir, 'game.sqlite');
  let store = openStore(file); const raw = new DatabaseSync(file);
  try {
    store.catalog.importEntries(items, { apply: true });
    const addition = add(store); store.addInventory(addition);
    const before = store.inventory(), reversal = undo(store, addition.mutationId);
    raw.exec("CREATE TRIGGER reject_undo BEFORE INSERT ON changes BEGIN SELECT RAISE(ABORT, 'undo failure'); END");
    assert.throws(() => store.undoInventory(reversal), /undo failure/);
    assert.deepEqual(store.inventory(), before);
    assert.equal(raw.prepare('SELECT count(*) AS n FROM inventory_changes').get().n, 1);
    raw.exec('DROP TRIGGER reject_undo');
    store.undoInventory(reversal);
    const audit = raw.prepare('SELECT * FROM inventory_changes WHERE mutation_id=?').get(reversal.mutationId);
    assert.deepEqual(JSON.parse(audit.before_json), before.entries);
    assert.deepEqual(JSON.parse(audit.after_json), []);
    store.close(); store = openStore(file);
    assert.equal(store.undoInventory(reversal).replayed, true);
    assert.deepEqual(store.inventory().entries, []);
    assert.equal(store.history().length, 2);
  } finally { raw.close(); store.close(); }
});

test('HTTP undo enforces local headers, origin and identical replay', async t => {
  const store = openStore(':memory:'); store.catalog.importEntries(items, { apply: true });
  const addition = add(store); store.addInventory(addition);
  const app = createApp(store); await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => app.close(resolve)); store.close(); });
  const url = `http://127.0.0.1:${app.address().port}/api/inventory/undo`;
  const headers = { 'Content-Type': 'application/json', 'X-Skaz-Client': 'local-v1' }, body = JSON.stringify(undo(store, addition.mutationId));
  assert.equal((await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })).status, 403);
  assert.equal((await fetch(url, { method: 'POST', headers: { ...headers, Origin: 'https://other.example' }, body })).status, 403);
  assert.equal((await fetch(url, { method: 'POST', headers, body })).status, 200);
  assert.equal((await fetch(url, { method: 'POST', headers, body }).then(r => r.json())).replayed, true);
  assert.deepEqual(store.inventory().entries, []);
});


test('inventory advertises undo only for the latest eligible operation', () => {
  const store = openStore(':memory:');
  try {
    store.catalog.importEntries(items, { apply: true });
    assert.equal(store.inventory().undo, null);
    const addition = add(store); store.addInventory(addition);
    assert.equal(store.inventory().undo.mutationId, addition.mutationId);
    const removal = add(store); store.removeInventory(removal);
    assert.equal(store.inventory().undo.mutationId, removal.mutationId);
    store.undoInventory(undo(store, removal.mutationId));
    assert.equal(store.inventory().undo, null);
    store.addInventory(add(store));
    store.update(cmd(store, { label: 'Save', state: seed }));
    assert.equal(store.inventory().undo, null);
  } finally { store.close(); }
});


test('active export includes inventory source and transitive cyclic links without unrelated games or catalog rows', () => {
  const store = openStore(':memory:');
  try {
    const a = { ...items.entries[0], id: 'test:item-a', links: ['test:item-b'] };
    const b = { ...items.entries[0], id: 'test:item-b', links: ['test:item-a'] };
    store.catalog.importEntries({ schemaVersion: 1, entries: [a, b, ...items.entries] }, { apply: true });
    store.addInventory(add(store, { catalogId: a.id, quantity: 3 }));
    const before = store.read();
    const exported = store.exportActive();
    assert.equal(exported.schemaVersion, 2); assert.equal(exported.app, 'skaz-active');
    assert.deepEqual(exported.state, before.state);
    assert.deepEqual(exported.session, before.session);
    assert.deepEqual(exported.source, { revision: before.revision, context: before.context });
    assert.deepEqual(exported.inventory, [{ catalogId: a.id, quantity: 3 }]);
    assert.deepEqual(exported.catalog.entries.map(e => e.id), [a.id, b.id]);
    assert.deepEqual(exported.catalog.entries[0].source, a.source);
    assert.deepEqual(store.read(), before); assert.equal(store.history().length, 1);
    store.createCampaign(cmd(store, { state: seed }));
    const empty = store.exportActive();
    assert.deepEqual(empty.inventory, []); assert.deepEqual(empty.catalog.entries, []);
    assert.notEqual(empty.source.context.characterId, before.context.characterId);
  } finally { store.close(); }
});

test('export rejects broken provenance and leaves the transaction usable', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'skaz-export-')), file = join(dir, 'game.sqlite');
  const store = openStore(file), raw = new DatabaseSync(file);
  try {
    store.catalog.importEntries(items, { apply: true }); store.addInventory(add(store));
    const id = items.entries[0].id;
    const original = raw.prepare('SELECT entry_json FROM catalog_entries WHERE id=?').get(id).entry_json;
    const changed = JSON.parse(original); changed.links = ['missing:dependency'];
    raw.prepare('UPDATE catalog_entries SET entry_json=? WHERE id=?').run(JSON.stringify(changed), id);
    assert.throws(() => store.exportActive(), { status: 409 });
    changed.links = []; changed.name.ru = 'Different';
    raw.prepare('UPDATE catalog_entries SET entry_json=? WHERE id=?').run(JSON.stringify(changed), id);
    assert.throws(() => store.exportActive(), { status: 409 });
    raw.prepare('UPDATE catalog_entries SET entry_json=? WHERE id=?').run(original, id);
    assert.equal(store.exportActive().inventory[0].quantity, 2);
    assert.equal(store.read().revision, 1);
  } finally { raw.close(); store.close(); }
});

test('HTTP active export is downloadable v2 while legacy export remains v1', async t => {
  const store = openStore(':memory:'); store.catalog.importEntries(items, { apply: true }); store.addInventory(add(store));
  const app = createApp(store); await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => app.close(resolve)); store.close(); });
  const url = `http://127.0.0.1:${app.address().port}/api/export`;
  const response = await fetch(url + '/active');
  assert.equal(response.status, 200); assert.match(response.headers.get('content-disposition'), /skaz-active-v2.json/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const data = await response.json(); assert.equal(data.inventory[0].quantity, 2);
  assert.equal(data.catalog.entries.length, 1); assert.equal(data.schemaVersion, 2);
  assert.equal((await fetch(url).then(r => r.json())).schemaVersion, 1);
  assert.equal((await fetch(url + '/active', { headers: { Origin: 'https://other.example' } })).status, 403);
});


test('active transfer round trip creates isolated IDs, preserves inventory and replays once', () => {
  const source = openStore(':memory:'), target = openStore(':memory:');
  try {
    source.catalog.importEntries(items, { apply: true }); source.addInventory(add(source));
    const file = source.exportActive(), original = target.read();
    const request = cmd(target, { destination: 'new-campaign', file });
    const result = target.importActive(request);
    assert.notEqual(result.context.characterId, file.source.context.characterId);
    assert.notEqual(result.context.campaignId, original.context.campaignId);
    assert.deepEqual(result.state, file.state); assert.deepEqual(result.session, file.session);
    assert.deepEqual(target.inventory().entries, source.inventory().entries);
    assert.equal(target.inventory().undo, null);
    assert.equal(target.importActive(request).replayed, true);
    assert.equal(target.campaigns().length, 2);
    target.selectContext(cmd(target, { context: original.context }));
    const replay = target.importActive(request);
    assert.deepEqual(replay.context, original.context); assert.deepEqual(replay.affectedContext, result.context);
    assert.deepEqual(target.inventory().entries, []);
    assert.deepEqual(target.read().state, original.state);
  } finally { source.close(); target.close(); }
});

test('transfer rejects wrong edition, counts, links and conflicting sources without partial creation', () => {
  const source = openStore(':memory:'), target = openStore(':memory:');
  try {
    source.catalog.importEntries(items, { apply: true }); source.addInventory(add(source));
    const file = source.exportActive();
    for (const edit of [f => f.ruleset = '5e-2024', f => f.inventory[0].quantity = -1,
      f => f.inventory.push(f.inventory[0]), f => f.catalog.entries[0].links = ['missing:link'],
      f => f.session.playedOn = '2026-02-30', f => f.extra = true]) {
      const invalid = structuredClone(file); edit(invalid);
      assert.throws(() => target.importActive(cmd(target, { destination: 'new-campaign', file: invalid })), { status: 422 });
      assert.equal(target.read().revision, 0); assert.equal(target.campaigns().length, 1);
      assert.equal(target.catalog.coverage().total, 0);
    }
    assert.throws(() => target.importActive(cmd(target, { destination: 'replace', file })), { status: 400 });
    const conflict = structuredClone(items); conflict.entries[0].name.ru = 'Конфликт';
    target.catalog.importEntries(conflict, { apply: true });
    assert.throws(() => target.importActive(cmd(target, { destination: 'new-campaign', file })), { status: 409 });
    assert.equal(target.campaigns().length, 1); assert.equal(target.read().revision, 0);
    const empty = target.exportActive();
    target.importActive(cmd(target, { destination: 'new-campaign', file: empty }));
    assert.deepEqual(target.inventory().entries, []);
  } finally { source.close(); target.close(); }
});

test('transfer rolls back catalog, game and inventory on audit failure, then persists on retry', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'skaz-transfer-')), file = join(dir, 'game.sqlite');
  const source = openStore(':memory:'); let target = openStore(file); const raw = new DatabaseSync(file);
  try {
    source.catalog.importEntries(items, { apply: true }); source.addInventory(add(source));
    const request = cmd(target, { destination: 'new-campaign', file: source.exportActive() });
    raw.exec("CREATE TRIGGER reject_transfer BEFORE INSERT ON changes BEGIN SELECT RAISE(ABORT, 'transfer failure'); END");
    assert.throws(() => target.importActive(request), /transfer failure/);
    assert.equal(target.catalog.coverage().total, 0); assert.equal(target.campaigns().length, 1);
    assert.equal(raw.prepare('SELECT count(*) AS n FROM inventory_changes').get().n, 0);
    raw.exec('DROP TRIGGER reject_transfer'); target.importActive(request);
    target.close(); target = openStore(file);
    assert.equal(target.importActive(request).replayed, true);
    assert.equal(target.inventory().entries[0].quantity, 2);
  } finally { raw.close(); target.close(); source.close(); }
});

test('HTTP import requires explicit destination and local protection and rejects stale revision', async t => {
  const store = openStore(':memory:'); const file = store.exportActive();
  const app = createApp(store); await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => app.close(resolve)); store.close(); });
  const url = `http://127.0.0.1:${app.address().port}/api/import/active`;
  const headers = { 'Content-Type': 'application/json', 'X-Skaz-Client': 'local-v1' };
  const request = cmd(store, { destination: 'new-campaign', file }), body = JSON.stringify(request);
  assert.equal((await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })).status, 403);
  assert.equal((await fetch(url, { method: 'POST', headers: { ...headers, Origin: 'https://other.example' }, body })).status, 403);
  assert.equal((await fetch(url, { method: 'POST', headers, body })).status, 200);
  assert.equal((await fetch(url, { method: 'POST', headers, body }).then(r => r.json())).replayed, true);
  assert.equal((await fetch(url, { method: 'POST', headers, body: JSON.stringify({ ...request, mutationId: randomUUID() }) })).status, 409);
});
