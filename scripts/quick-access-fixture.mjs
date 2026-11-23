import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createApp} from '../server/app.mjs';
import {openStore} from '../server/store.mjs';

const spellNames = [
  'acid-splash', 'detect-magic', 'healing-word', 'cure-wounds',
  'magic-missile', 'shield', 'invisibility', 'hold-person',
  'misty-step', 'fireball', 'counterspell',
];

export function createQuickAccessFixture({loseCastResponse = false} = {}) {
  const store = openStore(':memory:');
  const initial = store.read();
  store.createCampaign({
    mutationId: randomUUID(),
    expectedRevision: initial.revision,
    state: {
      ...initial.state,
      profile: {...initial.state.profile, name: 'Мирен Таль', campaign: 'Старая пристань'},
      hp: 18,
      maxHp: 22,
      slots: {1: 3, 2: 3, 3: 2},
    },
  });
  store.catalog.installBundled({version: store.catalog.previewBundled().version});
  const command = fields => {
    const {revision, context} = store.read();
    return {mutationId: randomUUID(), expectedRevision: revision, characterId: context.characterId, ...fields};
  };
  for (const name of spellNames) {
    store.setSpell(command({catalogId: 'srd51:2014:spell:' + name, status: 'prepared'}));
  }
  store.addInventory(command({catalogId: 'srd51:2014:item:potion-of-healing', quantity: 2}));

  const server = createApp(store);
  if (loseCastResponse) {
    let pending = true;
    server.prependListener('request', (request, response) => {
      if (!pending || request.method !== 'POST' || request.url !== '/api/resources/change') return;
      const finish = response.end;
      response.end = function (chunk, ...args) {
        if (this.statusCode === 200 && pending) {
          pending = false;
          return finish.call(this, '{', ...args);
        }
        return finish.call(this, chunk, ...args);
      };
    });
  }

  const stop = () => new Promise((resolve, reject) => {
    server.close(error => {
      store.close();
      if (error) reject(error);
      else resolve();
    });
    server.closeAllConnections();
  });
  return {server, stop};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== '--lose-cast-response')) {
    throw new Error('Usage: node scripts/quick-access-fixture.mjs [--lose-cast-response]');
  }
  const fixture = createQuickAccessFixture({loseCastResponse: args.length === 1});
  fixture.server.listen(4337, '127.0.0.1', () => {
    console.log('Synthetic Quick Access QA: http://127.0.0.1:4337/#play');
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => fixture.stop());
  }
}
