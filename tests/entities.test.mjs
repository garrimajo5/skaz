import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { openStore } from '../server/store.mjs';
import { seed } from '../server/state.mjs';
import { splitState, joinState } from '../server/entities.mjs';

async function fixture(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'skaz-entities-'));
  t.after(async () => {
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(dir).startsWith('skaz-entities-'));
    await rm(dir, { recursive: true, force: true });
  });
  return path.join(dir, 'state.sqlite');
}
const mutation = (state, expectedRevision = 0) => ({ mutationId: randomUUID(), expectedRevision, label: 'Fixture update', state });
function legacy(filename, request) {
  const db = new DatabaseSync(filename);
  db.exec(`CREATE TABLE workspace(id INTEGER PRIMARY KEY, schema_version INTEGER NOT NULL, revision INTEGER NOT NULL, state_json TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE changes(mutation_id TEXT PRIMARY KEY, revision INTEGER NOT NULL UNIQUE, request_hash TEXT NOT NULL, label TEXT NOT NULL, before_json TEXT NOT NULL, after_json TEXT NOT NULL, created_at TEXT NOT NULL);`);
  db.prepare('INSERT INTO workspace VALUES(1,1,1,?,?)').run(JSON.stringify(request.state), '2026-10-18T00:00:00.000Z');
  const { expectedRevision, label, state } = request;
  const hash = createHash('sha256').update(JSON.stringify({ expectedRevision, label, state })).digest('hex');
  db.prepare('INSERT INTO changes VALUES(?,1,?,?,?,?,?)').run(request.mutationId, hash, label, JSON.stringify(seed), JSON.stringify(state), '2026-10-18T00:00:00.000Z');
  db.close();
}

test('v1 migration preserves every state field, audit replay and stable entity IDs', async t => {
  const filename = await fixture(t);
  const state = { ...structuredClone(seed), hp: 7, gold: 321, inspiration: 2, concentration: 'Тест',
    profile: { name: 'Другой герой', tagline: 'Описание', campaign: 'Другая кампания' },
    accepted: ['quest'], dismissed: ['damage'], eventEdits: { quest: 'Найти ключ', gold: 9 },
    journal: [{ title: 'Сюжет', text: 'Запись', kind: 'Личное', at: 1, time: '00:01' }],
    notes: [{ title: 'Заметка', text: 'Текст', at: 2, time: '00:02' }],
    mapNotes: [{ place: 'town', text: 'Запись карты' }], checks: { q0: true } };
  assert.deepEqual(joinState(splitState(state)), state);
  const request = mutation(state); legacy(filename, request);
  let store = openStore(filename);
  try {
    const context = store.context();
    assert.deepEqual(store.read().state, state);
    assert.equal(store.read().schemaVersion, 1);
    assert.equal(store.read().revision, 1);
    assert.equal(context.character.campaignId, context.campaign.id);
    assert.equal(context.session.campaignId, context.campaign.id);
    assert.equal(store.update(request).replayed, true);
    assert.equal(store.history().length, 1);
    store.close(); store = openStore(filename);
    assert.deepEqual(store.context(), context);
    const next = { ...state, hp: 8, profile: { ...state.profile, campaign: 'Новое название' } };
    store.update(mutation(next, 1));
    assert.equal(store.context().campaign.id, context.campaign.id);
    assert.equal(store.context().campaign.data.name, 'Новое название');
    assert.equal(store.context().character.data.hp, 8);
    await store.backup(path.join(path.dirname(filename), 'copy.sqlite'));
    const copy = openStore(path.join(path.dirname(filename), 'copy.sqlite'));
    try { assert.deepEqual(copy.context(), store.context()); assert.deepEqual(copy.read().state, next); }
    finally { copy.close(); }
  } finally { store.close(); }
});

test('failed legacy migration rolls back its schema and preserves original data', async t => {
  const filename = await fixture(t);
  const request = mutation({ ...seed, hp: -1 }); legacy(filename, request);
  assert.throws(() => openStore(filename), { status: 422 });
  const db = new DatabaseSync(filename);
  try {
    assert.equal(db.prepare('SELECT schema_version FROM workspace').get().schema_version, 1);
    assert.deepEqual(JSON.parse(db.prepare('SELECT state_json FROM workspace').get().state_json), request.state);
    assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name IN ('campaigns','characters','sessions','active_context')").get().n, 0);
  } finally { db.close(); }
});

test('entity write failure rolls back all progress and unrelated campaigns remain isolated', async t => {
  const filename = await fixture(t);
  const store = openStore(filename), db = new DatabaseSync(filename);
  db.exec('PRAGMA foreign_keys=ON');
  try {
    const before = store.context();
    db.prepare('INSERT INTO campaigns VALUES(?,?,?)').run('other-campaign', '5e-2014', JSON.stringify({ name: 'Other', mapNotes: [], checks: {} }));
    db.prepare('INSERT INTO characters VALUES(?,?,?)').run('other-character', 'other-campaign', JSON.stringify(splitState(seed).character));
    db.prepare('INSERT INTO sessions VALUES(?,?,?)').run('other-session', 'other-campaign', JSON.stringify(splitState(seed).session));
    assert.throws(() => db.prepare('UPDATE active_context SET character_id=? WHERE id=1').run('other-character'), /FOREIGN KEY/);
    assert.throws(() => db.prepare('UPDATE active_context SET session_id=? WHERE id=1').run('other-session'), /FOREIGN KEY/);
    db.exec("CREATE TRIGGER reject_session BEFORE UPDATE ON sessions BEGIN SELECT RAISE(ABORT, 'test fault'); END");
    assert.throws(() => store.update(mutation({ ...seed, hp: 3 })), /test fault/);
    assert.deepEqual(store.context(), before);
    assert.equal(store.history().length, 0);
    assert.deepEqual(JSON.parse(db.prepare('SELECT state_json FROM workspace').get().state_json), seed);
    db.exec('DROP TRIGGER reject_session');
    store.update(mutation({ ...seed, hp: 3 }));
    assert.equal(JSON.parse(db.prepare("SELECT data_json FROM characters WHERE id='other-character'").get().data_json).hp, seed.hp);
    assert.equal(store.context().character.data.hp, 3);
  } finally { db.close(); store.close(); }
});

test('campaign command rolls back partial creation and persists receipts across reopen', async t => {
  const filename = await fixture(t);
  let store = openStore(filename);
  const db = new DatabaseSync(filename);
  try {
    const first = store.read();
    const request = { mutationId: randomUUID(), expectedRevision: 0, state: { ...seed, gold: 12 } };
    db.exec("CREATE TRIGGER reject_new_session BEFORE INSERT ON sessions BEGIN SELECT RAISE(ABORT, 'test create fault'); END");
    assert.throws(() => store.createCampaign(request), /test create fault/);
    assert.equal(store.campaigns().length, 1);
    assert.equal(db.prepare('SELECT count(*) AS n FROM characters').get().n, 1);
    assert.deepEqual(store.read(), first);
    assert.equal(store.history().length, 0);
    db.exec('DROP TRIGGER reject_new_session');
    const created = store.createCampaign(request);
    store.close(); store = openStore(filename);
    const { affectedContext, ...workspace } = created;
    assert.deepEqual(store.read(), workspace);
    assert.deepEqual(affectedContext, created.context);
    const replay = store.createCampaign(request);
    assert.equal(replay.replayed, true);
    assert.deepEqual(replay.affectedContext, created.context);
    store.selectContext({ mutationId: randomUUID(), expectedRevision: 1, context: first.context });
    assert.deepEqual(store.read().state, first.state);
  } finally { db.close(); store.close(); }
});
