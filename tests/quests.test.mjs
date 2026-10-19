import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openStore } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';
import { seed } from '../server/state.mjs';
const cmd = (s, fields) => ({ mutationId: randomUUID(), expectedRevision: s.read().revision, ...fields });
const create = s => cmd(s, { campaignId: s.read().context.campaignId, questId: randomUUID(), operation: 'create', quest: { title: 'Find the map', description: 'Ask the keeper', status: 'active', steps: [{ id: randomUUID(), title: 'Meet keeper', done: false }] } });

test('quests create, edit and replay without touching resources; survive sessions and isolate campaigns', () => {
  const s = openStore(':memory:');
  try {
    const initial = s.read(), request = create(s); s.saveQuest(request);
    assert.equal(s.saveQuest(request).replayed, true); assert.equal(s.quests().quests.length, 1);
    assert.deepEqual(s.read().state, initial.state);
    assert.throws(() => s.saveQuest({ ...request, mutationId: randomUUID() }), { status: 409 });
    const update = cmd(s, { ...request, mutationId: randomUUID(), expectedRevision: s.read().revision, operation: 'update', quest: { ...request.quest, status: 'completed', steps: request.quest.steps.map(step => ({ ...step, done: true })) } });
    s.saveQuest(update); assert.equal(s.quests().quests[0].status, 'completed');
    s.startSession(cmd(s, { session: { name: 'Next', playedOn: '2026-10-19' } }));
    const first = s.read().context;
    assert.equal(s.quests().quests[0].createdSessionId, initial.context.sessionId);
    s.update(cmd(s, { label: 'save', state: seed })); assert.equal(s.quests().quests.length, 1);
    s.createCampaign(cmd(s, { state: seed })); assert.equal(s.quests().quests.length, 0);
    const replay = s.saveQuest(request); assert.deepEqual(replay.affectedContext, initial.context);
    assert.equal(s.quests().quests.length, 0);
    s.selectContext(cmd(s, { context: first })); assert.equal(s.quests().quests[0].steps[0].done, true);
  } finally { s.close(); }
});

test('invalid quests and foreign edits cannot mutate state', () => {
  const s = openStore(':memory:');
  try {
    const request = create(s);
    for (const edit of [q => q.title = '', q => q.status = 'unknown', q => q.steps.push(q.steps[0]), q => q.steps[0].done = 1, q => q.description = 'x'.repeat(12001)]) {
      const bad = structuredClone(request); edit(bad.quest);
      assert.throws(() => s.saveQuest(bad), { status: 422 });
    }
    assert.throws(() => s.saveQuest({ ...request, campaignId: randomUUID() }), { status: 409 });
    assert.throws(() => s.saveQuest({ ...request, operation: 'update' }), { status: 404 });
    assert.equal(s.read().revision, 0); assert.deepEqual(s.quests().quests, []);
    s.saveQuest(request); s.createCampaign(cmd(s, { state: seed }));
    assert.throws(() => s.saveQuest(cmd(s, { campaignId: s.read().context.campaignId, questId: request.questId, operation: 'update', quest: request.quest })), { status: 404 });
  } finally { s.close(); }
});

test('quest write and audit roll back together and replay persists after reopen', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'skaz-quest-')), file = join(dir, 'game.sqlite');
  let s = openStore(file); const raw = new DatabaseSync(file);
  try {
    const request = create(s);
    raw.exec("CREATE TRIGGER reject_quest BEFORE INSERT ON changes BEGIN SELECT RAISE(ABORT, 'quest failure'); END");
    assert.throws(() => s.saveQuest(request), /quest failure/);
    assert.deepEqual(s.quests().quests, []); assert.equal(s.read().revision, 0);
    assert.equal(raw.prepare('SELECT count(*) AS n FROM quest_changes').get().n, 0);
    raw.exec('DROP TRIGGER reject_quest'); s.saveQuest(request);
    s.close(); s = openStore(file);
    assert.equal(s.saveQuest(request).replayed, true); assert.equal(s.quests().quests.length, 1);
  } finally { raw.close(); s.close(); }
});

test('quest HTTP endpoint protects writes and reads active campaign', async t => {
  const s = openStore(':memory:'), app = createApp(s);
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => app.close(resolve)); s.close(); });
  const url = `http://127.0.0.1:${app.address().port}/api/quests`, body = JSON.stringify(create(s));
  const headers = { 'Content-Type': 'application/json', 'X-Skaz-Client': 'local-v1' };
  assert.equal((await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })).status, 403);
  assert.equal((await fetch(url, { method: 'POST', headers: { ...headers, Origin: 'https://other.example' }, body })).status, 403);
  assert.equal((await fetch(url, { method: 'POST', headers, body })).status, 200);
  const result = await fetch(url).then(r => r.json()); assert.equal(result.quests.length, 1);
  assert.equal(result.context.campaignId, result.quests[0].campaignId);
});


test('v4 quests round trip preserves archived origin, ordered steps and independent local IDs', () => {
  const s = openStore(':memory:');
  try {
    const initial = s.read(), request = create(s); s.saveQuest(request);
    s.startSession(cmd(s, { session: { name: 'Later', playedOn: '2026-10-19' } }));
    const second = create(s); second.quest.status = 'completed'; second.quest.steps[0].done = true; s.saveQuest(second);
    for (const version of [2,3]) assert.throws(() => s.exportActive(version), { status: 409 });
    const file = s.exportActive(4), original = s.quests().quests;
    assert.equal(file.quests[0].origin.sessionId, initial.context.sessionId);
    const transfer = cmd(s, { destination: 'new-campaign', file });
    const result = s.importActive(transfer), imported = s.quests().quests;
    assert.equal(imported.length, 2); assert.notEqual(imported[0].id, original[0].id);
    assert.equal(imported[0].createdSessionId, result.context.sessionId);
    assert.deepEqual(imported[0].importedFrom, file.quests[0].origin);
    assert.deepEqual(imported[0].steps, original[0].steps);
    assert.equal(imported[1].status, 'completed');
    assert.equal(s.importActive(transfer).replayed, true);
    assert.equal(s.quests().quests.length, 2);
    assert.deepEqual(s.exportActive(4).quests, file.quests);
    const { title, description, status, steps } = imported[0];
    s.saveQuest(cmd(s, { campaignId: result.context.campaignId, questId: imported[0].id, operation: 'update', quest: { title, description: description + '!', status, steps } }));
    assert.deepEqual(s.quests().quests[0].importedFrom, file.quests[0].origin);
    s.importActive(cmd(s, { destination: 'new-campaign', file: s.exportActive(4) }));
    assert.deepEqual(s.quests().quests[0].importedFrom, file.quests[0].origin);
    s.selectContext(cmd(s, { context: file.source.context }));
    assert.deepEqual(s.quests().quests, original);
  } finally { s.close(); }
});

test('v4 rejects missing, duplicate, malformed and excessive quests without writes', () => {
  const s = openStore(':memory:');
  try {
    s.saveQuest(create(s)); const file = s.exportActive(4), before = s.read();
    for (const edit of [f => delete f.quests, f => f.quests.push(f.quests[0]), f => f.quests[0].origin.sessionId = '../bad', f => f.quests[0].quest.steps[0].done = 1, f => f.quests[0].quest.reward = 100, f => f.quests = Array(1001).fill(f.quests[0])]) {
      const invalid = structuredClone(file); edit(invalid);
      assert.throws(() => s.importActive(cmd(s, { destination: 'new-campaign', file: invalid })), { status: 422 });
      assert.deepEqual(s.read(), before);
    }
    const empty = { ...file, quests: [] }; s.importActive(cmd(s, { destination: 'new-campaign', file: empty }));
    assert.deepEqual(s.quests().quests, []);
    assert.equal(s.exportActive(3).schemaVersion, 3);
  } finally { s.close(); }
});

test('v4 quest provenance rolls back with game and receipt; replay survives reopen', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'skaz-quest-transfer-')), file = join(dir, 'game.sqlite');
  let s = openStore(file); const raw = new DatabaseSync(file);
  try {
    s.saveQuest(create(s)); const before = s.read();
    const request = cmd(s, { destination: 'new-campaign', file: s.exportActive(4) });
    raw.exec("CREATE TRIGGER reject_transfer BEFORE INSERT ON changes BEGIN SELECT RAISE(ABORT, 'quest transfer failure'); END");
    assert.throws(() => s.importActive(request), /quest transfer failure/);
    assert.deepEqual(s.read(), before);
    assert.equal(raw.prepare('SELECT count(*) AS n FROM quests').get().n, 1);
    assert.equal(raw.prepare('SELECT count(*) AS n FROM quest_origins').get().n, 0);
    assert.equal(raw.prepare('SELECT count(*) AS n FROM campaigns').get().n, 1);
    raw.exec('DROP TRIGGER reject_transfer'); s.importActive(request);
    const imported = s.quests(); s.close(); s = openStore(file);
    assert.equal(s.importActive(request).replayed, true);
    assert.deepEqual(s.quests(), imported);
  } finally { raw.close(); s.close(); }
});

test('v4 HTTP export and protected import carry quests', async t => {
  const s = openStore(':memory:'); s.saveQuest(create(s)); const app = createApp(s);
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => app.close(resolve)); s.close(); });
  const base = `http://127.0.0.1:${app.address().port}`;
  const response = await fetch(base + '/api/export/active-v4');
  assert.equal(response.status, 200); assert.match(response.headers.get('content-disposition'), /skaz-active-v4/);
  const file = await response.json(); assert.equal(file.quests.length, 1);
  assert.equal((await fetch(base + '/api/export/active-v3')).status, 409);
  const body = JSON.stringify(cmd(s, { destination: 'new-campaign', file }));
  assert.equal((await fetch(base + '/api/import/active', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })).status, 403);
  assert.equal((await fetch(base + '/api/import/active', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Skaz-Client': 'local-v1' }, body })).status, 200);
  assert.deepEqual(s.quests().quests[0].importedFrom, file.quests[0].origin);
});
