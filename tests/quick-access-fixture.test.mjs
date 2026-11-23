import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import test from 'node:test';
import Casting from '../client/casting.js';
import {createQuickAccessFixture} from '../scripts/quick-access-fixture.mjs';

async function start(t, options) {
  const fixture = createQuickAccessFixture(options);
  fixture.server.listen(0, '127.0.0.1');
  await once(fixture.server, 'listening');
  t.after(fixture.stop);
  const base = 'http://127.0.0.1:' + fixture.server.address().port;
  return (path, command) => fetch(base + path, command ? {
    method: 'POST',
    headers: {'Content-Type': 'application/json', 'X-Skaz-Client': 'local-v1'},
    body: JSON.stringify(command),
  } : undefined);
}

test('Quick Access fixture gives each run a fresh campaign and real prepared spells and inventory', async t => {
  const read = await start(t);
  const other = await start(t);
  const workspace = await (await read('/api/workspace')).json();
  const isolated = await (await other('/api/workspace')).json();
  assert.notEqual(workspace.context.campaignId, isolated.context.campaignId);
  assert.notEqual(workspace.context.characterId, isolated.context.characterId);
  assert.equal(workspace.state.profile.name, 'Мирен Таль');
  assert.equal(workspace.state.hp, 18);
  assert.equal(workspace.state.slots[1], 3);
  const {entries} = await (await read('/api/spellbook')).json();
  assert.equal(entries.length, 11);
  const bag = await (await read('/api/inventory')).json();
  assert.equal(bag.entries[0].quantity, 2);
});

test('Quick Access fixture loses one successful cast response and replay and undo use the same receipt', async t => {
  const read = await start(t, {loseCastResponse: true});
  const workspace = await (await read('/api/workspace')).json();
  const spellbook = await (await read('/api/spellbook')).json();
  const prepared = Casting.prepare(
    {...workspace, spellbook: spellbook.entries},
    'srd51:2014:spell:magic-missile',
    {kind: 'slot', level: 1},
  );
  const request = {
    expectedRevision: workspace.revision,
    mutationId: randomUUID(),
    context: workspace.context,
    resource: {kind: 'cast', operation: 'cast', command: prepared},
    delta: 1,
    before: prepared.before,
    maximum: prepared.maximum,
  };
  const first = await read('/api/resources/change', request);
  assert.equal(first.status, 200);
  await assert.rejects(first.json(), SyntaxError);
  const repeated = await read('/api/resources/change', request);
  assert.equal(repeated.status, 200);
  const saved = await repeated.json();
  assert.equal(saved.replayed, true);
  assert.equal(saved.state.slots[1], 2);

  const undo = await read('/api/resources/undo', {
    expectedRevision: saved.revision,
    mutationId: randomUUID(),
    characterId: workspace.context.characterId,
    targetMutationId: request.mutationId,
  });
  assert.equal(undo.status, 200);
  assert.equal((await undo.json()).state.slots[1], 3);
});
