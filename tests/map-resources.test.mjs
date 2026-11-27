import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../client/map.js', import.meta.url), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));

test('map keeps its form during a resource save and refreshes results only for its current context', async () => {
  let context = 'one', snapshot = 'confirmed', writable = true, writes = 0;
  const pendingGets = [];
  const region = { set innerHTML(html) { this.markup = html; writes++; }, setAttribute() {} };
  const add = { disabled: true, removeAttribute() {} };
  const runtime = vm.createContext({
    document: {
      addEventListener() {},
      getElementById: id => id === 'map-results' ? region : null,
    },
    queueMicrotask,
    SkazStorage: {
      contextKey: () => context,
      snapshotKey: () => snapshot,
      can: action => action === 'shared' && writable,
      placesData: () => new Promise((resolve, reject) => pendingGets.push({ resolve, reject })),
    },
  });
  vm.runInContext(source, runtime);
  const map = vm.runInContext('SkazMap', runtime);
  const response = { places: [{id:'fixture-map',title:'Northern ferry',description:'Safe landing',x:20,y:30,visited:true}] };
  const screen = { querySelector: selector => selector === '#campaign-map' ? {} : null, querySelectorAll: () => [add] };
  map.view();
  await tick();
  pendingGets.shift().resolve(response);
  await tick();
  assert.match(region.markup, /Northern ferry/);
  const readyWrites = writes;

  snapshot = 'pending';
  assert.equal(map.updateResources(screen, false), true);
  assert.equal(add.disabled, true);
  assert.equal(pendingGets.length, 0);
  snapshot = 'saved';
  assert.equal(map.updateResources(screen, true), true);
  assert.equal(add.disabled, false);
  pendingGets.shift().resolve(structuredClone(response));
  await tick();
  assert.equal(writes, readyWrites);

  snapshot = 'saved-after-lock';
  writable = false;
  add.disabled = true;
  assert.equal(map.updateResources(screen, true), true);
  assert.equal(add.disabled, true);
  pendingGets.shift().reject(Error('Read denied'));
  await tick();
  assert.match(region.markup, /Read denied/);
  assert.doesNotMatch(region.markup, /Northern ferry/);
  context = 'another campaign';
  assert.equal(map.updateResources(screen, true), false);
  assert.equal(map.updateResources(null, true), false);
});
