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
const create = s => cmd(s, { campaignId: s.read().context.campaignId, placeId: randomUUID(), operation: 'create', place: { title: 'North pass', description: 'Ask the keeper', x: 25.5, y: 60, visited: false } });

test('places persist across sessions and saves, isolate campaigns and replay safely', () => {
  const s = openStore(':memory:');
  try {
    const initial = s.read(), request = create(s); s.savePlace(request);
    assert.equal(s.savePlace(request).replayed, true); assert.equal(s.places().places.length, 1);
    assert.deepEqual(s.read().state, initial.state);
    assert.throws(() => s.savePlace({ ...request, mutationId: randomUUID() }), { status: 409 });
    s.savePlace(cmd(s, { campaignId: request.campaignId, placeId: request.placeId, operation: 'update', place: { ...request.place, x: 100, y: 0, visited: true } }));
    s.startSession(cmd(s, { session: { name: 'Next', playedOn: '2026-10-19' } }));
    const first = s.read().context;
    assert.equal(s.places().places[0].createdSessionId, initial.context.sessionId);
    s.update(cmd(s, { label: 'Save', state: seed })); assert.equal(s.places().places[0].visited, true);
    s.createCampaign(cmd(s, { state: seed })); assert.deepEqual(s.places().places, []);
    const replay = s.savePlace(request); assert.deepEqual(replay.affectedContext, initial.context);
    assert.deepEqual(s.places().places, []);
    assert.throws(() => s.savePlace(cmd(s, { campaignId: s.read().context.campaignId, placeId: request.placeId, operation: 'update', place: request.place })), { status: 404 });
    s.selectContext(cmd(s, { context: first })); assert.equal(s.places().places[0].x, 100);
  } finally { s.close(); }
});

test('place validation rejects bad numbers, unknown fields and duplicate identifiers', () => {
  const s = openStore(':memory:');
  try {
    const request = create(s);
    for (const edit of [p => p.title = ' ', p => p.description = 'x'.repeat(12001), p => p.x = NaN, p => p.x = Infinity, p => p.y = -1, p => p.x = 100.01, p => p.x = '50', p => p.visited = 1, p => p.kind = 'town']) {
      const invalid = structuredClone(request); edit(invalid.place);
      assert.throws(() => s.savePlace(invalid), { status: 422 });
    }
    assert.throws(() => s.savePlace({ ...request, campaignId: randomUUID() }), { status: 409 });
    assert.equal(s.read().revision, 0); assert.deepEqual(s.places().places, []);
    s.savePlace(request);
    assert.throws(() => s.savePlace({ ...request, expectedRevision: 1, mutationId: randomUUID() }), { status: 409 });
  } finally { s.close(); }
});

test('place changes roll back on audit failure, survive reopen and mutation replay', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'skaz-places-')), file = join(dir, 'game.sqlite');
  let s = openStore(file); const raw = new DatabaseSync(file);
  try {
    const request = create(s);
    raw.exec("CREATE TRIGGER reject_place BEFORE INSERT ON changes BEGIN SELECT RAISE(ABORT, 'place failure'); END");
    assert.throws(() => s.savePlace(request), /place failure/);
    assert.deepEqual(s.places().places, []); assert.equal(s.read().revision, 0);
    assert.equal(raw.prepare('SELECT count(*) AS n FROM place_changes').get().n, 0);
    raw.exec('DROP TRIGGER reject_place'); s.savePlace(request);
    s.close(); s = openStore(file);
    assert.equal(s.savePlace(request).replayed, true); assert.equal(s.places().places.length, 1);
  } finally { raw.close(); s.close(); }
});

test('v5 round trip preserves place notes, positions and original archived session', () => {
  const s = openStore(':memory:');
  try {
    const initial = s.read(), request = create(s); s.savePlace(request);
    s.startSession(cmd(s, { session: { name: 'Next', playedOn: '2026-10-19' } }));
    const before = s.places().places, file = s.exportActive(5), context = s.read().context;
    assert.equal(file.places[0].origin.sessionId, initial.context.sessionId);
    for (const version of [2,3,4]) assert.throws(() => s.exportActive(version), { status: 409 });
    const transfer = cmd(s, { destination: 'new-campaign', file });
    const result = s.importActive(transfer);
    const place = s.places().places[0]; assert.notEqual(place.id, before[0].id);
    assert.equal(place.createdSessionId, result.context.sessionId);
    assert.deepEqual(place.importedFrom, file.places[0].origin);
    assert.equal(place.x, request.place.x); assert.equal(place.description, request.place.description);
    assert.equal(s.importActive(transfer).replayed, true); assert.equal(s.places().places.length, 1);
    assert.deepEqual(s.exportActive(5).places, file.places);
    s.importActive(cmd(s, { destination: 'new-campaign', file: s.exportActive(5) }));
    assert.deepEqual(s.places().places[0].importedFrom, file.places[0].origin);
    s.selectContext(cmd(s, { context })); assert.deepEqual(s.places().places, before);
    for (const edit of [f => delete f.places, f => f.places.push(f.places[0]), f => f.places[0].place.x = 101, f => f.places[0].origin.sessionId = '../bad', f => f.places = Array(1001).fill(f.places[0])]) {
      const invalid = structuredClone(file); edit(invalid);
      assert.throws(() => s.importActive(cmd(s, { destination: 'new-campaign', file: invalid })), { status: 422 });
    }
    s.importActive(cmd(s, { destination: 'new-campaign', file: { ...file, places: [] } }));
    assert.deepEqual(s.places().places, []); assert.equal(s.exportActive(4).schemaVersion, 4);
  } finally { s.close(); }
});

test('v5 import rolls back map and provenance with the game and replays after reopen', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'skaz-places-transfer-')), file = join(dir, 'game.sqlite');
  let s = openStore(file); const raw = new DatabaseSync(file);
  try {
    s.savePlace(create(s)); const before = s.read();
    const request = cmd(s, { destination: 'new-campaign', file: s.exportActive(5) });
    raw.exec("CREATE TRIGGER reject_place_transfer BEFORE INSERT ON changes BEGIN SELECT RAISE(ABORT, 'place transfer failure'); END");
    assert.throws(() => s.importActive(request), /place transfer failure/); assert.deepEqual(s.read(), before);
    assert.equal(raw.prepare('SELECT count(*) AS n FROM campaign_places').get().n, 1);
    assert.equal(raw.prepare('SELECT count(*) AS n FROM place_origins').get().n, 0);
    assert.equal(raw.prepare('SELECT count(*) AS n FROM campaigns').get().n, 1);
    raw.exec('DROP TRIGGER reject_place_transfer'); s.importActive(request);
    const imported = s.places(); s.close(); s = openStore(file);
    assert.equal(s.importActive(request).replayed, true); assert.deepEqual(s.places(), imported);
  } finally { raw.close(); s.close(); }
});

test('places HTTP endpoints protect writes and export v5', async t => {
  const s = openStore(':memory:'), app = createApp(s);
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => app.close(resolve)); s.close(); });
  const base = `http://127.0.0.1:${app.address().port}`, body = JSON.stringify(create(s));
  const headers = { 'Content-Type': 'application/json', 'X-Skaz-Client': 'local-v1' };
  assert.equal((await fetch(base + '/api/places', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })).status, 403);
  assert.equal((await fetch(base + '/api/places', { method: 'POST', headers: { ...headers, Origin: 'https://other.example' }, body })).status, 403);
  assert.equal((await fetch(base + '/api/places', { method: 'POST', headers, body })).status, 200);
  const places = await fetch(base + '/api/places').then(r => r.json()); assert.equal(places.places.length, 1);
  const response = await fetch(base + '/api/export/active-v5'); assert.equal(response.status, 200);
  assert.match(response.headers.get('content-disposition'), /skaz-active-v5/);
  const file = await response.json(); assert.equal(file.places.length, 1);
  const imported = await fetch(base + '/api/import/active', { method: 'POST', headers, body: JSON.stringify(cmd(s, { destination: 'new-campaign', file })) });
  assert.equal(imported.status, 200); assert.deepEqual(s.places().places[0].importedFrom, file.places[0].origin);
});
