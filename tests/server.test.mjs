import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { openStore } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';
import { seed } from '../server/state.mjs';

function mutation(state, expectedRevision = 0) {
  return { mutationId: randomUUID(), expectedRevision, label: 'Изменение в тесте', state };
}

test('progress survives closing and reopening the database', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'skaz-test-'));
  const filename = path.join(dir, 'state.sqlite');
  let store = openStore(filename);
  try {
    const state = structuredClone(seed);
    state.hp = 21; state.gold = 149; state.checks.q1 = true;
    state.notes.push({ title: 'Запись', text: 'Маяк на севере', at: 100, time: '00:01' });
    state.mapNotes.push({ place: 'lighthouse', text: 'Следы на лестнице' });
    store.update(mutation(state));
    store.catalog.importEntries({ schemaVersion: 1, entries: [{ id: 'test:reference', ruleset: '5e-2014', kind: 'mechanic', name: { ru: 'Тест', en: 'Test' }, source: { url: 'https://example.com/', title: 'Fixture', version: '1', usage: 'reference-only', terms: 'Synthetic fixture' }, links: [] }] }, { apply: true });
    store.close(); store = openStore(filename);
    assert.equal(store.catalog.coverage().total, 1);
    assert.equal(store.catalog.search().entries[0].id, 'test:reference');
    assert.deepEqual(store.read().state, state);
    assert.equal(store.read().revision, 1);
    assert.equal(store.history().length, 1);
  } finally { store.close(); await rm(dir, { recursive: true, force: true }); }
});

test('stale tab cannot overwrite newer character progress', () => {
  const store = openStore(':memory:');
  try {
    store.update(mutation({ ...seed, hp: 20 }));
    assert.throws(() => store.update(mutation({ ...seed, gold: 999 })), error => error.status === 409);
    assert.equal(store.read().state.hp, 20);
    assert.equal(store.read().state.gold, seed.gold);
    assert.equal(store.history().length, 1);
  } finally { store.close(); }
});

test('retry after a lost response does not apply twice, even after a later update', () => {
  const store = openStore(':memory:');
  try {
    const request = mutation({ ...seed, gold: 149 });
    store.update(request);
    store.update(mutation({ ...seed, gold: 159 }, 1));
    const replay = store.update(request);
    assert.equal(replay.replayed, true);
    assert.equal(replay.revision, 2);
    assert.equal(replay.state.gold, 159);
    assert.equal(store.history().length, 2);
    assert.throws(() => store.update({ ...request, state: { ...seed, gold: 200 } }), error => error.status === 409);
  } finally { store.close(); }
});

test('invalid resources and import structures leave the database unchanged', () => {
  const store = openStore(':memory:');
  try {
    const invalid = [
      { ...seed, hp: 39 }, { ...seed, hp: -1 }, { ...seed, gold: -1 },
      { ...seed, slots: { 1: -1, 2: 2, 3: 1 } }, { ...seed, profile: { name: '' } },
      { ...seed, accepted: ['gold'], dismissed: ['gold'] },
      { ...seed, mapNotes: [{ place: 'unknown', text: 'test' }] },
      { ...seed, notes: [{ title: 'note', text: 17, time: '0', at: 0 }] },
      { ...seed, extra: 'unexpected' },
    ];
    for (const state of invalid) assert.throws(() => store.update(mutation(state)), error => error.status === 422);
    assert.equal(store.read().revision, 0);
    assert.deepEqual(store.read().state, seed);
    assert.equal(store.history().length, 0);
  } finally { store.close(); }
});

test('undo is another revision and cannot erase the audit trail', () => {
  const store = openStore(':memory:');
  try {
    store.update(mutation({ ...seed, hp: 10 }));
    store.update({ ...mutation(structuredClone(seed), 1), label: 'Отмена урона' });
    assert.equal(store.read().state.hp, 28);
    assert.equal(store.read().revision, 2);
    assert.equal(store.history()[0].label, 'Отмена урона');
    assert.equal(store.history().length, 2);
  } finally { store.close(); }
});

test('online SQLite backup includes committed progress', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'skaz-backup-test-'));
  const store = openStore(path.join(dir, 'live.sqlite'));
  try {
    store.update(mutation({ ...seed, hp: 15 }));
    await store.backup(path.join(dir, 'backup.sqlite'));
    const backup = openStore(path.join(dir, 'backup.sqlite'));
    try { assert.equal(backup.read().state.hp, 15); assert.equal(backup.history().length, 1); }
    finally { backup.close(); }
  } finally { store.close(); await rm(dir, { recursive: true, force: true }); }
});

test('HTTP API: save, conflict, export, origin protection and private files', async t => {
  const store = openStore(':memory:');
  const app = createApp(store);
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => app.close(resolve)); store.close(); });
  const base = `http://127.0.0.1:${app.address().port}`;
  const headers = { 'Content-Type': 'application/json', 'X-Skaz-Client': 'local-v1', Origin: base };
  const request = mutation({ ...seed, hp: 19 });
  assert.equal((await fetch(base + '/')).status, 200);
  for (const asset of ['catalog.js', 'catalog.css']) assert.equal((await fetch(base + '/' + asset)).status, 200);
  assert.equal((await fetch(base + '/api/health').then(r => r.json())).storage, 'sqlite');
  assert.equal((await fetch(base + '/api/workspace', { method: 'PUT', headers, body: JSON.stringify(request) })).status, 200);
  assert.equal((await fetch(base + '/api/workspace', { method: 'PUT', headers, body: JSON.stringify(mutation(seed)) })).status, 409);
  assert.equal((await fetch(base + '/api/export').then(r => r.json())).state.hp, 19);
  const context = await fetch(base + '/api/context').then(r => r.json());
  assert.equal(context.character.data.hp, 19);
  assert.equal(context.campaign.id, context.session.campaignId);
  assert.equal(context.revision, 1);
  assert.equal((await fetch(base + '/api/workspace', { method: 'PUT', headers: { ...headers, Origin: 'https://other.example' }, body: JSON.stringify(request) })).status, 403);
  assert.equal((await fetch(base + '/api/workspace', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) })).status, 403);
  assert.equal((await fetch(base + '/api/workspace', { method: 'PUT', headers, body: '{broken' })).status, 400);
  assert.equal((await fetch(base + '/data/skaz.sqlite')).status, 404);
  assert.equal((await fetch(base + '/server/store.mjs')).status, 404);
  const wrongHostStatus = await new Promise((resolve, reject) => {
    http.get(base + '/api/health', { headers: { Host: `other.example:${app.address().port}` } }, response => { response.resume(); resolve(response.statusCode); }).on('error', reject);
  });
  assert.equal(wrongHostStatus, 403);
  assert.equal((await fetch(base + '/api/workspace', { method: 'PUT', headers, body: JSON.stringify({ text: 'x'.repeat(600000) }) })).status, 413);
});
