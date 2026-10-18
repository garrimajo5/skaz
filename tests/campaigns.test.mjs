import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { openStore } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';
import { seed } from '../server/state.mjs';

const command = (expectedRevision, fields) => ({ mutationId: randomUUID(), expectedRevision, ...fields });
const secondState = () => ({ ...structuredClone(seed), hp: 11, gold: 7,
  profile: { name: 'Второй герой', tagline: '', campaign: 'Вторая кампания' },
  notes: [{ title: 'Только здесь', text: 'Личная запись', at: 0, time: '00:00' }] });

test('campaign creation and switching preserve isolated progress and reject stale drafts', () => {
  const store = openStore(':memory:');
  try {
    const first = store.read();
    const staleDraft = command(0, { label: 'Старый черновик', state: { ...seed, gold: 999 } });
    const create = command(0, { state: secondState() });
    const second = store.createCampaign(create);
    assert.equal(second.revision, 1);
    assert.notEqual(second.context.campaignId, first.context.campaignId);
    assert.equal(store.campaigns().length, 2);
    assert.deepEqual(store.read().state, secondState());
    assert.throws(() => store.update(staleDraft), { status: 409 });
    store.update(command(1, { label: 'Хиты второй игры', state: { ...secondState(), hp: 8 } }));
    const select = command(2, { context: first.context });
    const back = store.selectContext(select);
    assert.equal(back.revision, 3);
    assert.deepEqual(back.state, seed);
    const replayCreate = store.createCampaign(create);
    assert.equal(replayCreate.replayed, true);
    assert.deepEqual(replayCreate.context, first.context);
    assert.deepEqual(replayCreate.affectedContext, second.context);
    assert.equal(store.campaigns().length, 2);
    assert.equal(store.read().revision, 3);
    store.selectContext(command(3, { context: second.context }));
    assert.equal(store.read().state.hp, 8);
    assert.equal(store.read().state.notes[0].title, 'Только здесь');
    const replaySelect = store.selectContext(select);
    assert.equal(replaySelect.replayed, true);
    assert.deepEqual(replaySelect.context, second.context);
    assert.equal(store.read().revision, 4);
    assert.equal(store.history().length, 4);
    assert.throws(() => store.createCampaign({ ...create, state: seed }), { status: 409 });
    assert.throws(() => store.selectContext({ ...select, context: second.context }), { status: 409 });
    // A key used for a progress update cannot be reused for a command.
    assert.throws(() => store.update({ ...select, label: 'Другая операция', state: seed }), { status: 409 });
  } finally { store.close(); }
});

test('invalid campaign commands leave active context, revision and audit untouched', () => {
  const store = openStore(':memory:');
  try {
    const first = store.read();
    const second = store.createCampaign(command(0, { state: secondState() }));
    const before = store.read();
    assert.throws(() => store.selectContext(command(1, { context: { ...second.context, sessionId: first.context.sessionId } })), { status: 404 });
    assert.throws(() => store.selectContext(command(1, { context: { ...second.context, characterId: 'missing' } })), { status: 404 });
    assert.throws(() => store.selectContext(command(1, { context: { ...second.context, extra: 'field' } })), { status: 400 });
    assert.throws(() => store.createCampaign(command(1, { state: { ...seed, gold: -1 } })), { status: 422 });
    assert.throws(() => store.createCampaign(command(0, { state: seed })), { status: 409 });
    assert.deepEqual(store.read(), before);
    assert.equal(store.campaigns().length, 2);
    assert.equal(store.history().length, 1);
  } finally { store.close(); }
});

test('campaign HTTP API enforces local write protection and supports create/list/select', async t => {
  const store = openStore(':memory:'), app = createApp(store);
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => app.close(resolve)); store.close(); });
  const base = `http://127.0.0.1:${app.address().port}`;
  const headers = { 'Content-Type': 'application/json', 'X-Skaz-Client': 'local-v1' };
  const first = await fetch(base + '/api/workspace').then(r => r.json());
  const body = JSON.stringify(command(0, { state: secondState() }));
  assert.equal((await fetch(base + '/api/campaigns', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })).status, 403);
  assert.equal((await fetch(base + '/api/campaigns', { method: 'POST', headers: { ...headers, Origin: 'https://other.example' }, body })).status, 403);
  const response = await fetch(base + '/api/campaigns', { method: 'POST', headers, body });
  assert.equal(response.status, 200);
  const second = await response.json();
  const list = await fetch(base + '/api/campaigns').then(r => r.json());
  assert.equal(list.campaigns.length, 2);
  assert.equal(list.campaigns[1].characters[0].id, second.context.characterId);
  assert.equal(list.campaigns[1].sessions[0].id, second.context.sessionId);
  assert.equal(list.campaigns[1].characters[0].name, 'Второй герой');
  const selection = await fetch(base + '/api/context/select', { method: 'POST', headers, body: JSON.stringify(command(1, { context: first.context })) });
  assert.equal(selection.status, 200);
  assert.deepEqual((await selection.json()).state, seed);
  assert.equal((await fetch(base + '/api/campaigns', { method: 'POST', headers, body: '[]' })).status, 400);
});
