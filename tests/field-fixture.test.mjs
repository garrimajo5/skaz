import test from 'node:test';
import assert from 'node:assert/strict';
import {createFieldFixture,createManualFieldFixture} from '../scripts/field-fixture.mjs';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync,rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {openStore} from '../server/store.mjs';
import {randomUUID} from 'node:crypto';
const counts=s=>({items:s.inventory().entries.length,spells:s.spellbook().entries.length,journal:s.read().state.journal.length,quests:s.quests().quests.length,places:s.places().places.length});
test('field fixture provides the exact filled synthetic workload',()=>{const s=createFieldFixture();try{assert.deepEqual(counts(s),{items:30,spells:20,journal:50,quests:10,places:15});assert.equal(new Set(s.inventory().entries.map(x=>x.catalogId)).size,30);assert.equal(s.read().state.hp,40);assert(s.spellbook().entries.some(x=>x.catalogId==='srd51:2014:spell:shield'));assert.equal(s.read().state.profile.name,'Тестовый странник');}finally{s.close();}});
test('field fixture export/import preserves workload in a separate RAM store',()=>{const a=createFieldFixture(),b=openStore(':memory:');try{const file=a.exportActive(12);b.importActive({mutationId:randomUUID(),expectedRevision:b.read().revision,destination:'new-campaign',file});assert.deepEqual(counts(b),counts(a));assert.notEqual(b.read().context.campaignId,a.read().context.campaignId);assert.equal(b.read().state.profile.name,'Тестовый странник');}finally{a.close();b.close();}});

test('manual non-bard fixture retains explicit counters across transfer',()=>{const a=createManualFieldFixture(),b=openStore(':memory:');try{const file=a.exportActive(12);b.importActive({mutationId:randomUUID(),expectedRevision:b.read().revision,destination:'new-campaign',file});assert.deepEqual(b.read().sheet?.counters??b.read().characterSheet?.counters,[{id:'qa-manual-counter',name:'Ручной тестовый ресурс',current:2,max:3}]);assert.deepEqual(counts(b),counts(a));}finally{a.close();b.close();}});


test('field fixture CLI writes two independently importable v15 JSON files without overwriting', () => {
  const directory = mkdtempSync(join(tmpdir(), 'skaz-field-transfer-'));
  const script = fileURLToPath(new URL('../scripts/field-fixture.mjs', import.meta.url));
  const paths = [join(directory, 'slots fixture.json'), join(directory, 'manual fixture.json')];
  try {
    for (const [index, path] of paths.entries()) {
      const manual = index === 1;
      const args = [script, '--output', path, ...(manual ? ['--manual'] : [])];
      const created = spawnSync(process.execPath, args, {encoding: 'utf8'});
      assert.equal(created.status, 0, created.stderr);

      const raw = readFileSync(path, 'utf8');
      assert.ok(Buffer.byteLength(raw) < 512 * 1024);
      const file = JSON.parse(raw);
      assert.equal(file.schemaVersion, 15);
      assert.equal(file.scope, 'active-game');

      const destination = openStore(':memory:');
      try {
        const original = destination.read();
        destination.importActive({
          mutationId: randomUUID(), expectedRevision: original.revision, destination: 'new-campaign', file,
        });
        const imported = destination.read();
        assert.notEqual(imported.context.campaignId, original.context.campaignId);
        assert.deepEqual(counts(destination), {items:30, spells:20, journal:50, quests:10, places:15});
        assert.deepEqual(imported.state.slots, {1:4, 2:3, 3:2});
        assert.equal(imported.state.hp, 40);
        if (manual) {
          assert.equal(imported.characterSheet.className, 'Тестовый воин');
          assert.deepEqual(imported.characterSheet.counters, [
            {id:'qa-manual-counter', name:'Ручной тестовый ресурс', current:2, max:3},
          ]);
        }
      } finally {
        destination.close();
      }
      const duplicate = spawnSync(process.execPath, args, {encoding: 'utf8'});
      assert.notEqual(duplicate.status, 0);
      assert.match(duplicate.stderr, /EEXIST/);
      assert.equal(readFileSync(path, 'utf8'), raw);
    }
  } finally {
    for (const path of paths) rmSync(path, {force: true});
    rmdirSync(directory);
  }
});
