import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateCatalog } from '../server/catalog.mjs';
import { openStore } from '../server/store.mjs';
const read = name => JSON.parse(readFileSync(new URL('../catalog/' + name, import.meta.url), 'utf8'));
const pack = read('srd51-common-npcs.json'), manifest = read('srd51-common-npcs.coverage.json');

test('common NPCs retain SRD base statistics and source boundaries', () => {
  const entries = validateCatalog(pack);
  assert.equal(entries.length, 6); assert.equal(manifest.expectedSubsetCount, 6); assert.equal(manifest.completeGameCatalog, false);
  assert.deepEqual(entries.map(e => [e.name.en, e.monster.armorClass, e.monster.hitPoints, e.monster.challenge, e.monster.xp]), [
    ['Bandit', 12, 11, '1/8', 25], ['Cultist', 12, 9, '1/8', 25], ['Guard', 16, 11, '1/8', 25],
    ['Scout', 13, 16, '1/2', 100], ['Thug', 11, 32, '1/2', 100], ['Veteran', 17, 58, '3', 700],
  ]);
  for (const entry of entries) {
    const ref = manifest.entries.find(e => e.id === entry.id);
    assert.equal(entry.name.en, ref.nameEn);
    assert.equal(entry.source.url, manifest.sourceUrl + '#page=' + ref.pages[0]);
    assert.equal(entry.source.usage, 'cc-by-4.0'); assert.match(entry.source.attribution, /Wizards of the Coast/);
    assert.equal(entry.monster.type, 'humanoid'); assert.equal(entry.monster.size, 'medium');
    assert.deepEqual(entry.monster.speed, { walk: 30 });
  }
  assert.deepEqual(manifest.entries.at(-1).pages, [403]);
});

test('NPC multiattack, saving throw advantage and equipment conditions are not overstated', () => {
  const get = name => pack.entries.find(e => e.name.en === name);
  assert.match(get('Bandit').text, /Мультиатаки нет/);
  assert.match(get('Cultist').text, /преимущество на спасброски против очарования и испуга; это не иммунитет/);
  assert.match(get('Guard').text, /КД 16 указана со щитом/);
  assert.match(get('Guard').text, /рукопашной атаке двумя руками/);
  assert.match(get('Scout').text, /две рукопашные либо две дальнобойные/);
  assert.match(get('Thug').text, /не даёт двух выстрелов/);
  assert.match(get('Veteran').text, /если обнажён короткий меч/);
  assert.match(get('Veteran').text, /6 \(1d10\+1\)/);
});

test('NPC import is repeatable, links resolve and local edits remain protected', () => {
  const store = openStore(':memory:');
  try {
    const before = store.read(), preview = store.catalog.previewBundled();
    store.catalog.installBundled({ version: preview.version });
    assert.equal(store.catalog.importEntries(pack, { apply: true }).unchanged, 6);
    const detail = store.catalog.lookup(new URLSearchParams({ id: 'srd51:2014:monster:cultist' }));
    assert.deepEqual(detail.related.map(e => e.name.en).sort(), ['Charmed', 'Frightened']);
    assert.deepEqual(store.read(), before); assert.deepEqual(store.history(), []);
    const altered = structuredClone(pack); altered.entries[0].monster.hitPoints = 12;
    assert.throws(() => store.catalog.importEntries(altered, { apply: true }), { status: 409 });
    assert.deepEqual(store.read(), before);
  } finally { store.close(); }
});
