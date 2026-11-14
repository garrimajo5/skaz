import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {openStore} from '../server/store.mjs';import {draconicAncestors,confirmDraconic,validateDraconic} from '../server/class-draconic.mjs';import {prepareDraconic,draconicCommand} from '../scripts/fixtures/draconic-commands.mjs';
import {previewClassLevel} from '../server/class-progression.mjs';
test('all ten SRD ancestors retain their exact damage type and source without accepting injected fields',()=>{
 assert.deepEqual(draconicAncestors().map(o=>[o.id,o.damageType]),[['black','acid'],['blue','lightning'],['brass','fire'],['bronze','lightning'],['copper','acid'],['gold','fire'],['green','poison'],['red','fire'],['silver','cold'],['white','cold']]);
 for(const a of draconicAncestors()){
  const q={id:'sorcerer-draconic',ancestorId:a.id,rulesConfirmed:true,baselineHpConfirmed:true},o=confirmDraconic(q);
  assert.equal(o.acquiredLevel,null);assert.equal(o.confirmedAt,2);assert.equal(o.ancestor.sourcePage,a.sourcePage);
  assert.deepEqual(validateDraconic(o,{classId:'sorcerer',baselineLevel:1,level:20}),o);
  for(const bad of [{...q,rulesConfirmed:false},{...q,baselineHpConfirmed:false},{...q,ancestorId:'purple'},{...q,damageType:'fire'}])assert.throws(()=>confirmDraconic(bad));
  assert.throws(()=>validateDraconic({...o,ancestor:{...o.ancestor,damageType:'force'}},{classId:'sorcerer',baselineLevel:1,level:20}));
 }
});
test('Draconic1 to20 adds only the new level HP bonus, preserves current HP and metamagic, and imports once',()=>{
 const s=openStore(':memory:',{classAdvancement:true});try{
  prepareDraconic(s);const initial=s.read(),bad=draconicCommand(s);bad.choices['sorcerer:2:confirm-draconic'].baselineHpConfirmed=false;assert.throws(()=>s.advanceCharacter(bad),{status:422});assert.deepEqual(s.read(),initial);
  for(let level=2;level<=20;level++){
   const before=s.read(),q=draconicCommand(s),plan=previewClassLevel({classId:'sorcerer',fromLevel:level-1,toLevel:level,constitution:before.characterStats.abilities.con});
   const r=s.advanceCharacter(q);assert.equal(r.advancement.version,13);assert.equal(r.state.hp,initial.state.hp);
   assert.equal(r.state.maxHp,before.state.maxHp+plan.hitPoints.maximumDelta+1);assert.equal(s.advanceCharacter(q).replayed,true);
  }
  assert.equal(s.read().advancement.metamagic.length,4);
  const file=s.exportActive(14),q={mutationId:randomUUID(),expectedRevision:s.read().revision,destination:'new-campaign',file};
  const forged=structuredClone(q);forged.file.advancement.subclass.ancestor.damageType='force';assert.throws(()=>s.importActive(forged),{status:422});
  const r=s.importActive(q);assert.deepEqual(r.advancement,file.advancement);assert.equal(r.state.maxHp,file.state.maxHp);assert.equal(s.importActive(q).replayed,true);
 }finally{s.close();}
});
import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {DatabaseSync} from 'node:sqlite';import {seed} from '../server/state.mjs';
test('Draconic late failure, backup, inactive provenance and capability downgrade are safe',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'skaz-draconic-')),file=join(dir,'fixture.sqlite'),s=openStore(file,{classAdvancement:true}),db=new DatabaseSync(file);
 t.after(()=>{s.close();db.close();rmSync(dir,{recursive:true,force:true});});prepareDraconic(s);const before=s.read(),q=draconicCommand(s);
 await s.backup(join(dir,'before.sqlite'));db.exec("CREATE TRIGGER reject_draconic BEFORE INSERT ON advancement_changes BEGIN SELECT RAISE(ABORT,'late draconic');END");
 assert.throws(()=>s.advanceCharacter(q),/late draconic/);assert.deepEqual(s.read(),before);assert.equal(db.prepare('SELECT version FROM class_advancement_schema').get().version,1);db.exec('DROP TRIGGER reject_draconic');
 s.advanceCharacter(q);assert.equal(db.prepare('SELECT version FROM class_advancement_schema').get().version,12);const after=s.read();await s.backup(join(dir,'after.sqlite'));
 for(const [name,expected]of [['before',before],['after',after]]){const restored=openStore(join(dir,name+'.sqlite'),{classAdvancement:true});try{assert.deepEqual(restored.read(),expected);if(name==='after')assert.equal(restored.advanceCharacter(q).replayed,true);}finally{restored.close();}}
 const hero=after.context.characterId;s.createCampaign({mutationId:randomUUID(),expectedRevision:s.read().revision,state:structuredClone(seed)});
 const workspace=db.prepare('SELECT * FROM workspace').get();db.prepare('UPDATE class_advancement_schema SET version=11').run();assert.throws(()=>openStore(file,{classAdvancement:true}),{status:409});db.prepare('UPDATE class_advancement_schema SET version=12').run();
 const row=db.prepare('SELECT ledger_json FROM character_advancement WHERE character_id=?').get(hero),bad=JSON.parse(row.ledger_json);bad.subclass.baselineHpConfirmed=false;db.prepare('UPDATE character_advancement SET ledger_json=? WHERE character_id=?').run(JSON.stringify(bad),hero);assert.throws(()=>openStore(file,{classAdvancement:true}),{status:409});assert.deepEqual(db.prepare('SELECT * FROM workspace').get(),workspace);db.prepare('UPDATE character_advancement SET ledger_json=? WHERE character_id=?').run(row.ledger_json,hero);
 const reopened=openStore(file,{classAdvancement:true});reopened.close();assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
});
test('Draconic rolled HP and Constitution improvement stack once without healing or changing AC',()=>{
 const s=openStore(':memory:',{classAdvancement:true});try{
  prepareDraconic(s,2);let before=s.read(),q=draconicCommand(s);q.hpMethod='roll';q.hpRoll=1;let r=s.advanceCharacter(q);
  assert.equal(r.state.maxHp,before.state.maxHp+4);assert.equal(r.state.hp,before.state.hp);assert.deepEqual(r.characterStats,before.characterStats);
  before=r;q=draconicCommand(s);q.choices['sorcerer:4:ability-score-improvement-or-feat']={increases:{str:0,dex:0,con:2,int:0,wis:0,cha:0}};
  // Use the stable class choice ID returned by the command, independent of label.
  const asi=Object.keys(q.choices).find(k=>k.includes('ability')&&k!=='sorcerer:4:ability-score-improvement-or-feat');if(asi){q.choices[asi]=q.choices['sorcerer:4:ability-score-improvement-or-feat'];delete q.choices['sorcerer:4:ability-score-improvement-or-feat'];}
  r=s.advanceCharacter(q);assert.equal(r.characterStats.abilities.con,16);assert.equal(r.state.maxHp,before.state.maxHp+11);assert.equal(r.state.hp,before.state.hp);assert.equal(s.advanceCharacter(q).replayed,true);
 }finally{s.close();}
});
test('Draconic managed resources cannot be silently removed by the sheet editor',()=>{
 const s=openStore(':memory:',{classAdvancement:true});try{prepareDraconic(s,3);const before=s.read();
  for(const change of [sheet=>sheet.counters=[],sheet=>sheet.counters.find(c=>c.id==='class-sorcerer-sorcery').max=100]){
   const sheet=structuredClone(before.characterSheet);change(sheet);assert.throws(()=>s.saveCharacterSheet({mutationId:randomUUID(),expectedRevision:before.revision,characterId:before.context.characterId,sheet}),{status:422});assert.deepEqual(s.read(),before);
  }
 }finally{s.close();}
});
test('inactive Draconic spellbook damage is rejected before startup writes',t=>{
 const dir=mkdtempSync(join(tmpdir(),'skaz-draconic-book-')),file=join(dir,'fixture.sqlite'),s=openStore(file,{classAdvancement:true});prepareDraconic(s,3);const hero=s.read().context.characterId,spell=s.read().advancement.spells[0].catalogId;s.createCampaign({mutationId:randomUUID(),expectedRevision:s.read().revision,state:structuredClone(seed)});s.close();
 const db=new DatabaseSync(file);t.after(()=>{db.close();rmSync(dir,{recursive:true,force:true});});const workspace=db.prepare('SELECT * FROM workspace').get(),row=db.prepare('SELECT * FROM character_spells WHERE character_id=? AND catalog_id=?').get(hero,spell);db.prepare('DELETE FROM character_spells WHERE character_id=? AND catalog_id=?').run(hero,spell);
 assert.throws(()=>openStore(file,{classAdvancement:true}),{status:409});assert.deepEqual(db.prepare('SELECT * FROM workspace').get(),workspace);db.prepare('INSERT INTO character_spells VALUES (?,?,?,?)').run(hero,spell,row.status,row.entry_json);const repaired=openStore(file,{classAdvancement:true});repaired.close();
});
test('Draconic learned spells cannot be removed through the normal book leaving an unloadable history',()=>{
 const s=openStore(':memory:',{classAdvancement:true});try{prepareDraconic(s,3);const before=s.read(),id=before.advancement.spells[0].catalogId;assert.ok(before.classGrantedSpellIds.includes(id));
  assert.throws(()=>s.setSpell({mutationId:randomUUID(),expectedRevision:before.revision,characterId:before.context.characterId,catalogId:id,status:'remove'}),{status:409});assert.deepEqual(s.read(),before);
 }finally{s.close();}
});
