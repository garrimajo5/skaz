import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openStore } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';
import { seed } from '../server/state.mjs';

const cmd = (view, fields) => ({ mutationId: randomUUID(), expectedRevision: view.read().revision, ...fields });
const character = view => view.createCharacter(cmd(view, {
  campaignId: view.read().context.campaignId, characterId: randomUUID(), template: 'bard5-demo',
  profile: { name: 'Второй герой', tagline: '' },
}));
const otherGame = () => ({ ...structuredClone(seed), hp: 11, profile: { name: 'Третий герой', tagline: '', campaign: 'Другая кампания' } });
const fixture = { ...JSON.parse(readFileSync(new URL('../catalog/srd51-wands.json', import.meta.url), 'utf8')).entries[0], links: [] };

test('view selection persists across reopening and leaves default and other windows unchanged', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'skaz-views-')), 'test.sqlite');
  let store = openStore(file);
  const first = store.read(), a = store.forView('window-one'), b = store.forView('window-two');
  const second = character(a);
  assert.deepEqual(b.read().context, first.context);
  assert.deepEqual(store.read().context, first.context);
  a.update(cmd(a, { label: 'Личные хиты', state: { ...a.read().state, hp: 9 } }));
  assert.equal(b.read().state.hp, seed.hp);
  const created = b.createCampaign(cmd(b, { state: otherGame() }));
  assert.deepEqual(a.read().context, second.context);
  store.close(); store = openStore(file);
  try {
    assert.deepEqual(store.forView('window-one').read().context, second.context);
    assert.equal(store.forView('window-one').read().state.hp, 9);
    assert.deepEqual(store.forView('window-two').read().context, created.context);
    assert.deepEqual(store.read().context, first.context);
    assert.deepEqual(store.forView('new-window').read().context, first.context);
    const db = new DatabaseSync(file);
    assert.deepEqual(JSON.parse(db.prepare('SELECT state_json FROM workspace').get().state_json), store.read().state);
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    db.close();
  } finally { store.close(); }
});

test('receipts stay in their originating window and stale saves cannot overwrite another hero', () => {
  const store = openStore(':memory:');
  try {
    const a = store.forView('window-one'), b = store.forView('window-two');
    const stale = cmd(b, { label: 'Старые хиты', state: { ...b.read().state, hp: 2 } });
    character(a);
    assert.throws(() => b.update(stale), { status: 409 });
    const request = cmd(a, { label: 'Хиты', state: { ...a.read().state, hp: 10 } });
    a.update(request);
    const current = a.read(), revision = current.revision;
    assert.equal(a.update(request).replayed, true);
    assert.throws(() => b.update(request), { status: 409 });
    assert.throws(() => store.update(request), { status: 409 });
    assert.equal(a.read().revision, revision);
    assert.equal(b.read().state.hp, seed.hp);
    const selected = cmd(a, { context: b.read().context });
    a.selectContext(selected);
    assert.deepEqual(a.update(request).affectedContext, undefined);
    assert.deepEqual(a.read().context, b.read().context);
    assert.equal(a.read().state.hp, seed.hp);
  } finally { store.close(); }
});

test('campaign session transition updates every affected window but preserves their heroes and other campaigns', () => {
  const store = openStore(':memory:');
  try {
    const a = store.forView('window-one'), b = store.forView('window-two'), c = store.forView('window-three');
    const original = a.read(); character(a);
    const hero = a.read().context.characterId;
    c.createCampaign(cmd(c, { state: otherGame() })); const unrelated = c.read();
    const stale = cmd(b, { label: 'Старая сессия', state: b.read().state });
    const started = a.startSession(cmd(a, { session: { name: 'Новый день', playedOn: '2026-10-20' } }));
    assert.equal(b.read().context.sessionId, started.context.sessionId);
    assert.equal(store.read().context.sessionId, started.context.sessionId);
    assert.equal(a.read().context.characterId, hero);
    assert.equal(b.read().context.characterId, original.context.characterId);
    assert.deepEqual(c.read().context, unrelated.context);
    assert.throws(() => b.update(stale), { status: 409 });
    b.update(cmd(b, { label: 'Хиты в новой сессии', state: { ...b.read().state, hp: 14 } }));
    assert.equal(store.session(original.context.sessionId).archived, true);
    assert.equal(b.read().state.hp, 14);
  } finally { store.close(); }
});

test('scoped inventory, export and import target only the chosen hero', () => {
  const store = openStore(':memory:');
  try {
    store.catalog.importEntries({ schemaVersion: 1, entries: [fixture] }, { apply: true });
    const a = store.forView('window-one'), b = store.forView('window-two'); character(a);
    const request = cmd(a, { characterId: a.read().context.characterId, catalogId: fixture.id, quantity: 2 });
    a.addInventory(request);
    assert.equal(a.inventory().entries.length, 1); assert.equal(b.inventory().entries.length, 0);
    a.changeCharges(cmd(a, { characterId: a.read().context.characterId, catalogId: fixture.id, unit: 1, operation: 'set', amount: 3 }));
    const file = a.exportActive(7);
    assert.deepEqual(file.inventory[0].chargeCounts, [null, 3]);
    const before = b.read();
    a.importActive(cmd(a, { destination: 'new-campaign', file }));
    assert.deepEqual(b.read().context, before.context);
    assert.deepEqual(b.read().state, before.state);
    assert.deepEqual(a.inventory().entries[0].chargeCounts, [null, 3]);
    assert.equal(a.addInventory(request).replayed, true);
    assert.equal(a.inventory().entries[0].quantity, 2);
  } finally { store.close(); }
});

test('shared quests and accepted story are visible to other heroes, personal notes stay with their target', () => {
  const store = openStore(':memory:');
  try {
    const a = store.forView('window-one'), b = store.forView('window-two'); character(a);
    a.saveQuest(cmd(a, { campaignId: a.read().context.campaignId, questId: randomUUID(), operation: 'create', quest: { title: 'Найти мост', description: '', status: 'active', steps: [] } }));
    assert.equal(b.quests().quests[0].title, 'Найти мост');
    for (const kind of ['journal', 'personal-note']) {
      const proposalId = randomUUID();
      a.createProposal(cmd(a, { ...a.read().context, proposalId, source: { kind: 'manual-text', speaker: 'Мастер', text: 'Запись', offsetMs: 1000 }, suggestion: { kind, title: kind, text: 'Текст' } }));
      a.decideProposal(cmd(a, { proposalId, decision: 'accept', content: { title: kind, text: 'Текст' } }));
    }
    assert.equal(a.read().state.journal.length, 1); assert.equal(b.read().state.journal.length, 1);
    assert.equal(a.read().state.notes.length, 1); assert.equal(b.read().state.notes.length, 0);
  } finally { store.close(); }
});

test('failed scoped mutation rolls back selection, entities, revision and session transitions', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'skaz-views-')), 'test.sqlite');
  const store = openStore(file), db = new DatabaseSync(file);
  try {
    const a = store.forView('window-one'), b = store.forView('window-two'); character(a);
    const before = a.read(), other = b.read();
    db.exec("CREATE TRIGGER fail_view_audit BEFORE INSERT ON changes BEGIN SELECT RAISE(ABORT, 'audit failure'); END");
    assert.throws(() => a.createCampaign(cmd(a, { state: otherGame() })), /audit failure/);
    assert.throws(() => a.startSession(cmd(a, { session: { name: 'Fail', playedOn: '2026-10-20' } })), /audit failure/);
    assert.deepEqual(a.read(), before); assert.deepEqual(b.read(), other);
    assert.equal(store.campaigns().length, 1); assert.equal(store.sessions(before.context.campaignId).length, 1);
  } finally { db.close(); store.close(); }
});

test('reopening after a legacy session transition repairs archived window selections without losing the hero', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'skaz-views-')), 'test.sqlite');
  let store = openStore(file);
  const a = store.forView('window-one'); character(a);
  const old = a.read().context;
  const next = store.startSession(cmd(store, { session: { name: 'Legacy transition', playedOn: '2026-10-20' } }));
  store.close();
  const db = new DatabaseSync(file);
  db.prepare('UPDATE browser_contexts SET session_id=? WHERE view_id=?').run(old.sessionId, 'window-one'); db.close();
  store = openStore(file);
  try {
    const repaired = store.forView('window-one');
    assert.equal(repaired.read().context.sessionId, next.context.sessionId);
    assert.equal(repaired.read().context.characterId, old.characterId);
    assert.equal(repaired.read().revision, next.revision);
    repaired.update(cmd(repaired, { label: 'After recovery', state: { ...repaired.read().state, hp: 12 } }));
    assert.equal(repaired.read().state.hp, 12);
  } finally { store.close(); }
});

test('HTTP view header isolates concurrent clients and never relaxes origin protection', async t => {
  const store = openStore(':memory:'), app = createApp(store);
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => app.close(resolve)); store.close(); });
  const base = `http://127.0.0.1:${app.address().port}`;
  const headers = id => ({ 'X-Skaz-View': id, 'X-Skaz-Client': 'local-v1', 'Content-Type': 'application/json' });
  const [first, second] = await Promise.all(['window-one', 'window-two'].map(id => fetch(base + '/api/workspace', { headers: headers(id) }).then(r => r.json())));
  assert.deepEqual(first.context, second.context);
  const request = { mutationId: randomUUID(), expectedRevision: first.revision, state: otherGame() };
  assert.equal((await fetch(base + '/api/campaigns', { method: 'POST', headers: headers('window-one'), body: JSON.stringify(request) })).status, 200);
  const [a, b] = await Promise.all(['window-one', 'window-two'].map(id => fetch(base + '/api/workspace', { headers: headers(id) }).then(r => r.json())));
  assert.equal(a.state.profile.name, 'Третий герой'); assert.deepEqual(b.context, first.context);
  assert.equal((await fetch(base + '/api/campaigns', { method: 'POST', headers: headers('window-two'), body: JSON.stringify(request) })).status, 409);
  assert.equal((await fetch(base + '/api/workspace', { headers: headers('../bad') })).status, 400);
  assert.equal((await fetch(base + '/api/workspace', { headers: { ...headers('window-one'), Origin: 'https://other.example' } })).status, 403);
});
