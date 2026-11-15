import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {openStore} from '../server/store.mjs';import {prepareFiend,fiendCommand,fiendFields} from '../scripts/fixtures/fiend-commands.mjs';
import {fiendSpellOptions,confirmFiend} from '../server/class-fiend.mjs';
for(const pact of ['blade','chain','tome'])test('Fiend1 to20 with '+pact+' retains invocation history and learns only selected expanded spells',()=>{
 const s=openStore(':memory:',{classAdvancement:true});try{prepareFiend(s);const initial=s.read();
  for(let level=2;level<=20;level++){
   const before=s.read(),q=fiendCommand(s,{pact}),r=s.advanceCharacter(q);assert.equal(r.advancement.version,14);assert.equal(r.advancement.invocations.length,level-1);assert.equal(r.advancement.subclass.acquiredLevel,null);assert.equal(r.advancement.subclass.confirmedAt,2);assert.equal(r.state.hp,initial.state.hp);assert.equal(r.state.tempHp,initial.state.tempHp);assert.equal(s.advanceCharacter(q).replayed,true);
   if(level===2){assert.equal(r.advancement.spells.length,1);assert.ok(r.advancement.spells[0].expandedSource);assert.equal(r.spellbook.length,before.spellbook.length+1);assert.equal(r.alwaysPreparedSpellIds.length,0);}
  }
  const file=s.exportActive(14),before=s.read(),q={mutationId:randomUUID(),expectedRevision:before.revision,destination:'new-campaign',file};
  const r=s.importActive(q);assert.deepEqual(r.advancement,before.advancement);assert.equal(r.advancement.pact.id,pact);assert.equal(r.advancement.fiendResources.length,2);assert.equal(s.importActive(q).replayed,true);
 }finally{s.close();}
});
test('Fiend expansion never changes count, circle or cantrip/arcanum lists; unconfirmed path stays manual',()=>{
 const s=openStore(':memory:',{classAdvancement:true});try{prepareFiend(s);const before=s.read(),q=fiendCommand(s),bad=structuredClone(q);delete bad.choices['warlock:2:confirm-fiend'];assert.throws(()=>s.advanceCharacter(bad),{status:422});assert.deepEqual(s.read(),before);
  const options=fiendSpellOptions(2,'known-spells').filter(o=>o.expandedSource);assert.equal(options.length,2);assert.ok(options.every(o=>o.level===1));assert.equal(fiendSpellOptions(2,'cantrips').filter(o=>o.expandedSource).length,0);assert.equal(fiendSpellOptions(11,'mystic-arcanum').filter(o=>o.expandedSource).length,0);
  for(const ids of [options.map(o=>o.spellId),['srd51:2014:spell:fireball']]){const invalid=structuredClone(q);invalid.choices['warlock:2:known-spells']=ids;assert.throws(()=>s.advanceCharacter(invalid),{status:422});assert.deepEqual(s.read(),before);}
  const ordinary=fiendSpellOptions(2,'known-spells',{knownIds:before.spellbook.map(o=>o.catalogId)}).find(o=>!o.expandedSource);bad.choices['warlock:2:known-spells']=[ordinary.spellId];const r=s.advanceCharacter(bad);assert.equal(r.advancement.version,4);assert.equal(r.characterSheet.subclass,'');assert.equal(r.alwaysPreparedSpellIds.length,0);
 }finally{s.close();}
});

import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {DatabaseSync} from 'node:sqlite';import {seed} from '../server/state.mjs';
test('Fiend late failure, backup, inactive provenance and capability downgrade are safe',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'skaz-fiend-')),file=join(dir,'fixture.sqlite'),s=openStore(file,{classAdvancement:true}),db=new DatabaseSync(file);
 t.after(()=>{s.close();db.close();rmSync(dir,{recursive:true,force:true});});prepareFiend(s);const before=s.read(),q=fiendCommand(s);
 await s.backup(join(dir,'before.sqlite'));db.exec("CREATE TRIGGER reject_fiend BEFORE INSERT ON advancement_changes BEGIN SELECT RAISE(ABORT,'late fiend');END");
 assert.throws(()=>s.advanceCharacter(q),/late fiend/);assert.deepEqual(s.read(),before);assert.equal(db.prepare('SELECT version FROM class_advancement_schema').get().version,1);db.exec('DROP TRIGGER reject_fiend');
 s.advanceCharacter(q);assert.equal(db.prepare('SELECT version FROM class_advancement_schema').get().version,13);const after=s.read();await s.backup(join(dir,'after.sqlite'));
 for(const [name,expected]of [['before',before],['after',after]]){const restored=openStore(join(dir,name+'.sqlite'),{classAdvancement:true});try{assert.deepEqual(restored.read(),expected);if(name==='after')assert.equal(restored.advanceCharacter(q).replayed,true);}finally{restored.close();}}
 const hero=after.context.characterId;s.createCampaign({mutationId:randomUUID(),expectedRevision:s.read().revision,state:structuredClone(seed)});
 const workspace=db.prepare('SELECT * FROM workspace').get();db.prepare('UPDATE class_advancement_schema SET version=12').run();assert.throws(()=>openStore(file,{classAdvancement:true}),{status:409});db.prepare('UPDATE class_advancement_schema SET version=13').run();
 const row=db.prepare('SELECT ledger_json FROM character_advancement WHERE character_id=?').get(hero),bad=JSON.parse(row.ledger_json);bad.subclass.sourcePage=999;db.prepare('UPDATE character_advancement SET ledger_json=? WHERE character_id=?').run(JSON.stringify(bad),hero);assert.throws(()=>openStore(file,{classAdvancement:true}),{status:409});assert.deepEqual(db.prepare('SELECT * FROM workspace').get(),workspace);db.prepare('UPDATE character_advancement SET ledger_json=? WHERE character_id=?').run(row.ledger_json,hero);
 const reopened=openStore(file,{classAdvancement:true});reopened.close();assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
});

test('Fiend learned and pact spells cannot be deleted through the normal book',()=>{
 const s=openStore(':memory:',{classAdvancement:true});try{prepareFiend(s,3,{pact:'tome'});const before=s.read();
  for(const id of [...before.advancement.spells.map(o=>o.catalogId),...before.advancement.pact.spells]){assert.ok(before.classGrantedSpellIds.includes(id));assert.throws(()=>s.setSpell(fiendFields(s,{catalogId:id,status:'remove'})),{status:409});assert.deepEqual(s.read(),before);}
 }finally{s.close();}
});
test('Fiend counters preserve spent uses, reject manual collisions and cannot be removed',()=>{
 const s=openStore(':memory:',{classAdvancement:true});try{prepareFiend(s,5);const before=s.read(),sheet=structuredClone(before.characterSheet);sheet.counters.push({id:'manual-luck',name:'Удача Тёмного',current:1,max:1});s.saveCharacterSheet(fiendFields(s,{sheet}));const collision=s.read();assert.throws(()=>s.advanceCharacter(fiendCommand(s)),{status:409});assert.deepEqual(s.read(),collision);
  s.saveCharacterSheet(fiendFields(s,{sheet:before.characterSheet}));s.advanceCharacter(fiendCommand(s));const spent=structuredClone(s.read().characterSheet);spent.counters.find(c=>c.id==='class-warlock-fiend-luck').current=0;s.saveCharacterSheet(fiendFields(s,{sheet:spent}));s.advanceCharacter(fiendCommand(s));assert.equal(s.read().characterSheet.counters.find(c=>c.id==='class-warlock-fiend-luck').current,0);
  const current=s.read(),bad=structuredClone(current.characterSheet);bad.counters=[];assert.throws(()=>s.saveCharacterSheet(fiendFields(s,{sheet:bad})),{status:422});assert.deepEqual(s.read(),current);
 }finally{s.close();}
});
test('Fiend import rejects altered expanded sources and version downgrade atomically',()=>{
 const s=openStore(':memory:',{classAdvancement:true});try{prepareFiend(s,3);const file=s.exportActive(14),before=s.read();
  for(const mutate of [f=>f.advancement.spells.find(o=>o.expandedSource).expandedSource.sourcePage=999,f=>delete f.advancement.spells.find(o=>o.expandedSource).expandedSource,f=>f.advancement.version=4]){const bad=structuredClone(file);mutate(bad);assert.throws(()=>s.importActive({mutationId:randomUUID(),expectedRevision:before.revision,destination:'new-campaign',file:bad}),{status:422});assert.deepEqual(s.read(),before);}
 }finally{s.close();}
});

import {initialRitualOptions} from '../server/class-rituals.mjs';
import {activeInvocationOrigins} from '../server/class-invocations.mjs';
test('Fiend retains ritual-only origins through invocation replacement and transfer',()=>{
 const s=openStore(':memory:',{classAdvancement:true});try{prepareFiend(s,2);const rituals=initialRitualOptions().slice(0,2).map(o=>o.id),remove=activeInvocationOrigins(s.read().advancement.invocations,s.read().advancement)[0].id;
  s.advanceCharacter(fiendCommand(s,{pact:'tome',replace:{remove,add:{id:'book-of-ancient-secrets',rituals}}}));const three=s.read();assert.deepEqual(three.advancement.invocations.at(-1).replacement.add.rituals,rituals);assert.ok(rituals.every(id=>!three.advancement.spells.some(o=>o.catalogId===id)));
  const q=fiendCommand(s,{replace:{remove:'book-of-ancient-secrets',add:remove}});s.advanceCharacter(q);const before=s.read();assert.deepEqual(before.advancement.invocations[1].replacement.add.rituals,rituals);assert.equal(activeInvocationOrigins(before.advancement.invocations,before.advancement).some(o=>o.id==='book-of-ancient-secrets'),false);
  const result=s.importActive({mutationId:randomUUID(),expectedRevision:before.revision,destination:'new-campaign',file:s.exportActive(14)});assert.deepEqual(result.advancement,before.advancement);
 }finally{s.close();}
});
test('Fiend late counter creation failure rolls back level, spells and the counter together',t=>{
 const dir=mkdtempSync(join(tmpdir(),'skaz-fiend-counter-')),file=join(dir,'fixture.sqlite'),s=openStore(file,{classAdvancement:true}),db=new DatabaseSync(file);t.after(()=>{s.close();db.close();rmSync(dir,{recursive:true,force:true});});prepareFiend(s,5);const before=s.read(),q=fiendCommand(s);db.exec("CREATE TRIGGER reject_fiend_counter BEFORE INSERT ON advancement_changes BEGIN SELECT RAISE(ABORT,'late counter');END");assert.throws(()=>s.advanceCharacter(q),/late counter/);assert.deepEqual(s.read(),before);db.exec('DROP TRIGGER reject_fiend_counter');assert.equal(s.advanceCharacter(q).characterSheet.counters.find(c=>c.id==='class-warlock-fiend-luck').current,1);assert.equal(s.advanceCharacter(q).replayed,true);
});
test('inactive Fiend canonical expanded card and pact book damage block startup before writes',t=>{
 const dir=mkdtempSync(join(tmpdir(),'skaz-fiend-inactive-')),file=join(dir,'fixture.sqlite'),s=openStore(file,{classAdvancement:true});prepareFiend(s,3,{pact:'tome'});const before=s.read(),hero=before.context.characterId;s.createCampaign({mutationId:randomUUID(),expectedRevision:before.revision,state:structuredClone(seed)});s.close();const db=new DatabaseSync(file);t.after(()=>{db.close();rmSync(dir,{recursive:true,force:true});});const workspace=db.prepare('SELECT * FROM workspace').get();
 for(const id of [before.advancement.spells.find(o=>o.expandedSource).catalogId,...before.advancement.pact.spells]){const row=db.prepare('SELECT * FROM character_spells WHERE character_id=? AND catalog_id=?').get(hero,id);db.prepare('DELETE FROM character_spells WHERE character_id=? AND catalog_id=?').run(hero,id);assert.throws(()=>openStore(file,{classAdvancement:true}),{status:409});assert.deepEqual(db.prepare('SELECT * FROM workspace').get(),workspace);db.prepare('INSERT INTO character_spells VALUES (?,?,?,?)').run(hero,id,row.status,row.entry_json);}
 const id=before.advancement.spells.find(o=>o.expandedSource).catalogId,row=db.prepare('SELECT entry_json FROM character_spells WHERE character_id=? AND catalog_id=?').get(hero,id),bad=JSON.parse(row.entry_json);bad.name.ru='Подмена';db.prepare('UPDATE character_spells SET entry_json=? WHERE character_id=? AND catalog_id=?').run(JSON.stringify(bad),hero,id);assert.throws(()=>openStore(file,{classAdvancement:true}),{status:409});assert.deepEqual(db.prepare('SELECT * FROM workspace').get(),workspace);db.prepare('UPDATE character_spells SET entry_json=? WHERE character_id=? AND catalog_id=?').run(row.entry_json,hero,id);const reopened=openStore(file,{classAdvancement:true});reopened.close();
});
