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
