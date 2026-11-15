import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {openStore} from '../server/store.mjs';import {preparePrimal,primalCommand,primalFields} from '../scripts/fixtures/primal-commands.mjs';
for(const bound of [false,true])test('Barbarian20 persists Primal Champion and infinity with '+(bound?'explicitly bound':'unmanaged')+' earlier rage',()=>{
 const s=openStore(':memory:',{classAdvancement:true});try{preparePrimal(s,{bound});if(bound)s.changeCharacterCounter(primalFields(s,{counterId:'class-barbarian-rage',delta:-1}));const before=s.read(),q=primalCommand(s),r=s.advanceCharacter(q);assert.equal(r.advancement.version,16);assert.equal(r.characterStats.abilities.str,before.characterStats.abilities.str+4);assert.equal(r.characterStats.abilities.con,before.characterStats.abilities.con+4);assert.equal(r.state.maxHp,before.state.maxHp+49);assert.equal(r.state.hp,before.state.hp);assert.equal(r.state.tempHp,before.state.tempHp);assert.equal(r.characterStats.armorClass,before.characterStats.armorClass);assert.equal(r.characterSheet.counters.some(c=>c.id==='class-barbarian-rage'),false);assert.equal(r.unlimitedResources[0].name,'Ярость');assert.equal(r.unlimitedResources[0].unlimited,true);assert.equal(r.advancement.unlimitedResources[0].previousCounterId,bound?'class-barbarian-rage':null);assert.equal(s.advanceCharacter(q).replayed,true);assert.throws(()=>s.changeCharacterCounter(primalFields(s,{counterId:'class-barbarian-rage',delta:-1})));
 const file=s.exportActive(14),request={mutationId:randomUUID(),expectedRevision:s.read().revision,destination:'new-campaign',file},imported=s.importActive(request);assert.deepEqual(imported.advancement,r.advancement);assert.deepEqual(imported.unlimitedResources,r.unlimitedResources);assert.equal(imported.state.maxHp,r.state.maxHp);assert.equal(s.importActive(request).replayed,true);
 }finally{s.close();}
});
test('Primal Champion refuses conflicting manual rage without changing the hero',()=>{
 const s=openStore(':memory:',{classAdvancement:true});try{preparePrimal(s);const sheet=structuredClone(s.read().characterSheet);sheet.counters.push({id:'manual-rage',name:'Ярость',current:3,max:6});s.saveCharacterSheet(primalFields(s,{sheet}));const before=s.read();assert.throws(()=>s.advanceCharacter(primalCommand(s)),{status:409});assert.deepEqual(s.read(),before);
 }finally{s.close();}
});

import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {DatabaseSync} from 'node:sqlite';import {seed} from '../server/state.mjs';
test('Primal late failure, backup, inactive provenance and capability downgrade are safe',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'skaz-primal-')),file=join(dir,'fixture.sqlite'),s=openStore(file,{classAdvancement:true}),db=new DatabaseSync(file);
 t.after(()=>{s.close();db.close();rmSync(dir,{recursive:true,force:true});});preparePrimal(s);const before=s.read(),q=primalCommand(s);
 await s.backup(join(dir,'before.sqlite'));db.exec("CREATE TRIGGER reject_primal BEFORE INSERT ON advancement_changes BEGIN SELECT RAISE(ABORT,'late primal');END");
 assert.throws(()=>s.advanceCharacter(q),/late primal/);assert.deepEqual(s.read(),before);assert.equal(db.prepare('SELECT version FROM class_advancement_schema').get().version,4);db.exec('DROP TRIGGER reject_primal');
 s.advanceCharacter(q);assert.equal(db.prepare('SELECT version FROM class_advancement_schema').get().version,15);const after=s.read();await s.backup(join(dir,'after.sqlite'));
 for(const [name,expected]of [['before',before],['after',after]]){const restored=openStore(join(dir,name+'.sqlite'),{classAdvancement:true});try{assert.deepEqual(restored.read(),expected);if(name==='after')assert.equal(restored.advanceCharacter(q).replayed,true);}finally{restored.close();}}
 const hero=after.context.characterId;s.createCampaign({mutationId:randomUUID(),expectedRevision:s.read().revision,state:structuredClone(seed)});
 const workspace=db.prepare('SELECT * FROM workspace').get();db.prepare('UPDATE class_advancement_schema SET version=14').run();assert.throws(()=>openStore(file,{classAdvancement:true}),{status:409});db.prepare('UPDATE class_advancement_schema SET version=15').run();
 const row=db.prepare('SELECT ledger_json FROM character_advancement WHERE character_id=?').get(hero),bad=JSON.parse(row.ledger_json);bad.primalChampion.sourcePage=999;db.prepare('UPDATE character_advancement SET ledger_json=? WHERE character_id=?').run(JSON.stringify(bad),hero);assert.throws(()=>openStore(file,{classAdvancement:true}),{status:409});assert.deepEqual(db.prepare('SELECT * FROM workspace').get(),workspace);db.prepare('UPDATE character_advancement SET ledger_json=? WHERE character_id=?').run(row.ledger_json,hero);
 const reopened=openStore(file,{classAdvancement:true});reopened.close();assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
});



test('Primal Champion cannot infer an unrecorded subclass and locks only the applied STR/CON origin',()=>{
 const s=openStore(':memory:',{classAdvancement:true});try{preparePrimal(s);s.advanceCharacter(primalCommand(s));const before=s.read(),changed=structuredClone(before.characterStats);changed.abilities.str--;assert.throws(()=>s.saveCharacterStats(primalFields(s,{stats:changed})),{status:422});assert.deepEqual(s.read(),before);changed.abilities.str++;changed.armorClass++;s.saveCharacterStats(primalFields(s,{stats:changed}));assert.equal(s.read().characterStats.armorClass,before.characterStats.armorClass+1);
 const other=openStore(':memory:',{classAdvancement:true});try{other.saveCharacterStats(primalFields(other,{stats:before.characterStats}));other.saveCharacterSheet(primalFields(other,{sheet:{ruleset:'5e-2014',ancestry:'',className:'barbarian',subclass:'Путь берсерка',level:19,counters:[]}}));const unknown=other.read();assert.throws(()=>other.advanceCharacter(primalCommand(other)),{status:422});assert.deepEqual(other.read(),unknown);}finally{other.close();}
 }finally{s.close();}
});
