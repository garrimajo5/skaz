import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { openStore } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';
import { seed } from '../server/state.mjs';
const cmd = (expectedRevision, fields) => ({ mutationId: randomUUID(), expectedRevision, ...fields });
const details = { name: 'Возвращение к маяку', playedOn: '2026-10-19' };

test('next session preserves resources and archives the previous journal without reviving demo events', () => {
  const store = openStore(':memory:');
  try {
    const state = { ...structuredClone(seed), hp: 5, gold: 800, concentration: 'Невидимость',
      journal: [{ title: 'Старая сессия', text: 'Важное событие', at: 1, time: '00:01' }],
      notes: [{ title: 'Личное', text: 'Запомнить', at: 1, time: '00:01' }],
      checks: { q1: true }, mapNotes: [{ place: 'town', text: 'Встреча' }], accepted: ['gold'] };
    store.update(cmd(0, { label: 'Подготовка', state }));
    const previous = store.read();
    const request = cmd(1, { session: details });
    const next = store.startSession(request);
    assert.equal(next.revision, 2);
    assert.equal(next.context.characterId, previous.context.characterId);
    assert.notEqual(next.context.sessionId, previous.context.sessionId);
    assert.deepEqual(next.state, { ...state, journal: [], accepted: [], dismissed: ['quest', 'gold', 'damage'], eventEdits: {} });
    const archived = store.session(previous.context.sessionId);
    assert.equal(archived.archived, true);
    assert.equal(archived.playedOn, null); assert.equal(archived.name, null);
    assert.deepEqual(archived.data.journal, state.journal);
    assert.equal(store.session(next.context.sessionId).name, details.name);
    assert.equal(store.sessions(next.context.campaignId).length, 2);
    assert.deepEqual(store.campaigns()[0].sessions, [{ id: next.context.sessionId }]);
    assert.throws(() => store.selectContext(cmd(2, { context: previous.context })), { status: 409 });
    assert.throws(() => store.update(cmd(1, { label: 'Старый черновик', state })), { status: 409 });
    store.update(cmd(2, { label: 'Новые хиты', state: { ...next.state, hp: 4 } }));
    const replay = store.startSession(request);
    assert.equal(replay.replayed, true); assert.equal(replay.state.hp, 4);
    assert.equal(store.sessions(next.context.campaignId).length, 2);
    assert.deepEqual(store.session(previous.context.sessionId), archived);
    assert.throws(() => store.startSession({ ...request, session: { ...details, name: 'Другое' } }), { status: 409 });
  } finally { store.close(); }
});

test('session dates and names are validated without changing progress', () => {
  const store = openStore(':memory:');
  try {
    const before = store.read();
    for (const session of [null, {}, { ...details, name: ' ' }, { ...details, name: 'x'.repeat(121) },
      { ...details, playedOn: '2026-02-29' }, { ...details, playedOn: '2026-04-31' },
      { ...details, playedOn: '2026-10-19T00:00:00Z' }, { ...details, extra: true }]) {
      assert.throws(() => store.startSession(cmd(0, { session })), { status: 422 });
    }
    assert.deepEqual(store.read(), before);
    store.startSession(cmd(0, { session: { ...details, playedOn: '2028-02-29' } }));
    assert.equal(store.sessions(before.context.campaignId).length, 2);
  } finally { store.close(); }
});

test('partial session creation rolls back archival; archive and receipt survive backup/reopen', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'skaz-sessions-'));
  const filename = path.join(dir, 'state.sqlite');
  let store = openStore(filename); const db = new DatabaseSync(filename);
  try {
    const previous = store.read(), request = cmd(0, { session: details });
    db.exec("CREATE TRIGGER fail_session BEFORE INSERT ON sessions BEGIN SELECT RAISE(ABORT,'test failure'); END");
    assert.throws(() => store.startSession(request), /test failure/);
    assert.deepEqual(store.read(), previous);
    assert.equal(store.session(previous.context.sessionId).archived, false);
    assert.equal(store.history().length, 0);
    db.exec('DROP TRIGGER fail_session');
    store.startSession(request);
    assert.throws(() => db.prepare('UPDATE sessions SET data_json=? WHERE id=?').run('{}', previous.context.sessionId), /read-only/);
    await store.backup(path.join(dir, 'backup.sqlite'));
    store.close(); store = openStore(filename);
    assert.equal(store.startSession(request).replayed, true);
    const copy = openStore(path.join(dir, 'backup.sqlite'));
    try { assert.deepEqual(copy.sessions(previous.context.campaignId), store.sessions(previous.context.campaignId)); assert.deepEqual(copy.session(previous.context.sessionId), store.session(previous.context.sessionId)); }
    finally { copy.close(); }
  } finally {
    db.close(); store.close();
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(dir).startsWith('skaz-sessions-'));
    await rm(dir, { recursive: true, force: true });
  }
});

test('session HTTP endpoints return metadata and archives and require protected writes', async t => {
  const store = openStore(':memory:'), app = createApp(store);
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => app.close(resolve)); store.close(); });
  const base = `http://127.0.0.1:${app.address().port}`;
  const before = store.read();
  const headers = { 'Content-Type': 'application/json', 'X-Skaz-Client': 'local-v1' };
  const body = JSON.stringify(cmd(0, { session: details }));
  assert.equal((await fetch(base + '/api/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })).status, 403);
  assert.equal((await fetch(base + '/api/sessions', { method: 'POST', headers: { ...headers, Origin: 'https://other.example' }, body })).status, 403);
  assert.equal((await fetch(base + '/api/sessions', { method: 'POST', headers, body })).status, 200);
  assert.equal((await fetch(`${base}/api/campaigns/${before.context.campaignId}/sessions`).then(r => r.json())).sessions.length, 2);
  assert.equal((await fetch(`${base}/api/sessions/${before.context.sessionId}`).then(r => r.json())).archived, true);
  assert.equal((await fetch(base + '/api/sessions/missing')).status, 404);
  assert.equal((await fetch(base + '/api/campaigns/missing/sessions')).status, 404);
});
