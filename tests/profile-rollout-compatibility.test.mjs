import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { openStore } from '../server/store.mjs';

const stats = { abilities:{str:8,dex:16,con:14,int:12,wis:10,cha:18}, armorClass:14, initiative:2, speed:30 };
const sheet = {
  ruleset:'5e-2014', ancestry:'', className:'Synthetic class', subclass:'', level:3,
  counters:[{id:'rollout-counter',name:'Synthetic reserve',current:7,max:7}],
};
const command = (store, fields) => ({ mutationId:randomUUID(), expectedRevision:store.read().revision, ...fields });
const denied = {status:409,message:/после завершения обновления формата профилей/};

function assertNoWrite(store, action) {
  const before = { workspace:store.read(), history:store.history(), campaigns:store.campaigns() };
  assert.throws(action, denied);
  assert.deepEqual({workspace:store.read(),history:store.history(),campaigns:store.campaigns()}, before);
}

test('v14 rollout rolls back incompatible fresh writes and preserves an exact compatible repeat', t => {
  const store = openStore(':memory:', {profileWriteFormat:14});
  t.after(() => store.close());
  const { characterId } = store.read().context;
  const saved = command(store, {characterId, stats});
  store.saveCharacterStats(saved);
  store.saveCharacterSheet(command(store, {characterId, sheet}));
  const widerStats = {...stats, abilities:{...stats.abilities,dex:33}};
  assertNoWrite(store, () => store.saveCharacterStats(command(store, {characterId, stats:widerStats})));
  assertNoWrite(store, () => store.saveCharacterStats(command(store, {characterId, stats:{...stats,ruleAcknowledgements:[]}})));
  assertNoWrite(store, () => store.saveCharacterSheet(command(store, {characterId, sheet:{...sheet,level:21}})));
  const counter = {context:store.read().context,resource:{kind:'counter',counterId:'rollout-counter'},maximum:7};
  assertNoWrite(store, () => store.changeResource(command(store, {...counter,delta:1,before:7})));
  assertNoWrite(store, () => store.changeCharacterCounter(command(store, {characterId,counterId:'rollout-counter',delta:1})));
  const spend = command(store, {...counter,delta:-1,before:7});
  store.changeResource(spend);
  const beforeRepeat = store.read();
  assert.equal(beforeRepeat.characterSheet.counters[0].current,6);
  assert.equal(store.saveCharacterStats(saved).replayed,true);
  assert.equal(store.changeResource(spend).replayed,true);
  assert.deepEqual(store.read(), beforeRepeat);
  assert.throws(() => store.saveCharacterStats({...saved,stats:widerStats}), {status:409,message:/уже использован/});
});

test('v14 rollout retains legacy creation and transfer paths and refuses new write contracts', t => {
  const store = openStore(':memory:', {profileWriteFormat:14});
  t.after(() => store.close());
  const create = {
    campaignId:store.read().context.campaignId, characterId:randomUUID(),
    profile:{name:'Synthetic rollout hero',tagline:''},
  };
  assertNoWrite(store, () => store.createCharacter(command(store, {
    ...create, template:'manual-2014', manual:{stats,sheet,hp:10,maxHp:20,tempHp:0,gold:0},
  })));
  const demo = command(store, {...create,template:'bard5-demo'});
  store.createCharacter(demo);
  assert.equal(store.createCharacter(demo).replayed, true);
  const oldFile = store.exportActive(14);
  assert.throws(() => store.exportActive(15), denied);
  const upgraded = {...oldFile,schemaVersion:15,characterStats:{...stats,abilities:{...stats.abilities,dex:33}},characterSheet:{...sheet,level:21}};
  assertNoWrite(store, () => store.importActive(command(store, {destination:'new-campaign',file:upgraded})));
  assertNoWrite(store, () => store.importActive(command(store, {destination:'new-campaign',file:{...oldFile,schemaVersion:15}})));
  const imported = command(store, {destination:'new-campaign',file:oldFile});
  store.importActive(imported);
  assert.equal(store.importActive(imported).replayed,true);
  assert.equal(store.campaigns().length,2);
});

test('v14 rollout scan catches an inactive v15 profile and leaves the SQLite file unchanged', t => {
  const directory = mkdtempSync(join(tmpdir(),'skaz-profile-write-format-'));
  t.after(() => rmSync(directory,{recursive:true,force:true}));
  const filename = join(directory,'synthetic.sqlite');
  const compatible = openStore(filename, {profileWriteFormat:14});
  const original = compatible.read().context;
  const compatibleCommand = command(compatible, {characterId:original.characterId,stats});
  compatible.saveCharacterStats(compatibleCommand);
  const deferred = command(compatible, {
    characterId:original.characterId,stats:{...stats,abilities:{...stats.abilities,dex:32}},
  });
  assertNoWrite(compatible, () => compatible.saveCharacterStats(deferred));
  compatible.close();

  const enabled = openStore(filename);
  assert.equal(enabled.saveCharacterStats(compatibleCommand).replayed,true);
  const accepted = enabled.saveCharacterStats(deferred);
  assert.notEqual(accepted.replayed,true);
  assert.equal(accepted.characterStats.abilities.dex,32);
  enabled.saveCharacterStats(command(enabled, {characterId:original.characterId,stats}));
  const { affectedContext } = enabled.createCharacter(command(enabled, {
    campaignId:original.campaignId, characterId:randomUUID(), template:'manual-2014',
    profile:{name:'Synthetic incompatible hero',tagline:''},
    manual:{stats:{...stats,abilities:{...stats.abilities,dex:33}},sheet,hp:10,maxHp:20,tempHp:0,gold:0},
  }));
  enabled.selectContext(command(enabled, {context:original}));
  assert.equal(enabled.read().context.characterId, original.characterId);
  enabled.close();
  const before = readFileSync(filename);
  assert.throws(() => openStore(filename, {profileWriteFormat:14}), /В базе есть профили формата v15/);
  assert.deepEqual(readFileSync(filename),before);
  const recovery = openStore(filename);
  try {
    recovery.selectContext(command(recovery, {context:affectedContext}));
    assert.equal(recovery.read().characterStats.abilities.dex,33);
  } finally {
    recovery.close();
  }
});
