import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, basename } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openStore } from '../server/store.mjs';

const command = (view, fields) => ({ mutationId: randomUUID(), expectedRevision: view.read().revision, ...fields });

test('six-hour event timeline survives concurrent heroes, response loss, restart and full backup restore', async t => {
  // Simulated timestamps, not six elapsed hours or a physical-tablet soak test.
  const dir = mkdtempSync(join(tmpdir(), 'skaz-soak-')), file = join(dir, 'session.sqlite'), copy = join(dir, 'copy.sqlite');
  let store = openStore(file);
  t.after(() => {
    store.close();
    assert.equal(dirname(resolve(dir)), resolve(tmpdir())); assert.ok(basename(dir).startsWith('skaz-soak-'));
    rmSync(dir, { recursive: true, force: true });
  });
  let a = store.forView('soak-first'), b = store.forView('soak-second');
  a.createCharacter(command(a, { campaignId: a.read().context.campaignId, characterId: randomUUID(), template: 'bard5-demo', profile: { name: 'Soak hero', tagline: '' } }));
  a.startSession(command(a, { session: { name: 'Six-hour simulation', playedOn: '2026-10-20' } }));
  const sessionId = a.read().context.sessionId, heroA = a.read().context.characterId, heroB = b.read().context.characterId;
  for (let i = 0; i < 120; i++) {
    let actor = i % 2 ? b : a, other = i % 2 ? a : b;
    const stale = command(other, { label: 'Stale draft', state: other.read().state });
    const proposalId = randomUUID();
    const request = command(actor, {
      ...actor.read().context, proposalId,
      source: { kind: 'manual-text', speaker: 'Мастер', text: `Синтетический фрагмент ${i}: путники уточняют дорогу и отмечают найденные ориентиры.`, offsetMs: i * 3 * 60000 },
      suggestion: { kind: i % 5 ? 'journal' : 'personal-note', title: 'Event ' + i, text: 'Synthetic detail ' + i },
    });
    actor.createProposal(request);
    if (i === 59) {
      store.close(); store = openStore(file); a = store.forView('soak-first'); b = store.forView('soak-second');
      actor = b; other = a;
    }
    // A delivered request whose response was lost must never add a second event.
    assert.equal(actor.createProposal(request).replayed, true);
    assert.throws(() => other.update(stale), { status: 409 });
    const decision = command(actor, { proposalId, decision: 'accept', content: { title: 'Checked ' + i, text: 'Corrected synthetic detail ' + i } });
    actor.decideProposal(decision); assert.equal(actor.decideProposal(decision).replayed, true);
    actor.update(command(actor, { label: 'Manual resource update', state: { ...actor.read().state, hp: 20 + i % 10 } }));
    assert.equal(a.read().context.characterId, heroA); assert.equal(b.read().context.characterId, heroB);
  }
  assert.equal(a.read().revision, 362);
  assert.equal(a.read().state.journal.length, 96); assert.equal(b.read().state.journal.length, 96);
  assert.equal(a.read().state.notes.length, 12); assert.equal(b.read().state.notes.length, 12);
  assert.equal(a.proposals().proposals.length, 60); assert.equal(b.proposals().proposals.length, 60);
  assert.ok(a.proposals().proposals.every(p => p.status === 'accepted'));
  const exportA = a.exportActive(7), exportB = b.exportActive(7);
  assert.equal(exportA.proposals.length, 60); assert.equal(exportB.proposals.length, 60);
  a.startSession(command(a, { session: { name: 'After the long game', playedOn: '2026-10-21' } }));
  assert.equal(store.session(sessionId).data.journal.length, 96);
  assert.equal(a.read().state.journal.length, 0); assert.equal(b.read().state.notes.length, 12);
  assert.equal(a.sessionReview(sessionId).proposals.length, 60);
  await store.backup(copy);
  const restored = openStore(copy), db = new DatabaseSync(copy);
  try {
    assert.deepEqual(restored.forView('soak-first').read(), a.read());
    assert.deepEqual(restored.forView('soak-second').read(), b.read());
    assert.deepEqual(restored.forView('soak-first').sessionReview(sessionId), a.sessionReview(sessionId));
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    assert.equal(db.prepare('SELECT count(*) AS n FROM changes').get().n, 363);
    assert.equal(db.prepare('SELECT count(*) AS n FROM event_proposals').get().n, 120);
    t.diagnostic(`120 source fragments, 240 exact retries, 120 stale-write rejections; backup ${(statSync(copy).size / 1024 / 1024).toFixed(2)} MiB`);
  } finally { db.close(); restored.close(); }
});
