import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {openStore} from '../server/store.mjs';
import {templateStats} from '../server/character-stats.mjs';
import {previewClassLevel,spellChoiceOptions} from '../server/class-progression.mjs';
const fields=(s,extra)=>({mutationId:randomUUID(),expectedRevision:s.read().revision,characterId:s.read().context.characterId,...extra});
function prepare(s,classId='fighter',level=1){
 s.saveCharacterStats(fields(s,{stats:structuredClone(templateStats)}));
 s.saveCharacterSheet(fields(s,{sheet:{ruleset:'5e-2014',ancestry:'',className:classId,subclass:'',level,counters:[]}}));
}
function command(s){const v=s.read(),classId=v.characterSheet.className,fromLevel=v.characterSheet.level;return fields(s,{classId,fromLevel,hpMethod:'fixed',hpRoll:null,choices:{},reviewedFeatures:previewClassLevel({classId,fromLevel,toLevel:fromLevel+1,constitution:v.characterStats.abilities.con}).requiresFeatureReview});}
function disk(t,cleanup=true){const dir=mkdtempSync(join(tmpdir(),'skaz-advancement-'));if(cleanup)t.after(()=>rmSync(dir,{recursive:true,force:true}));return join(dir,'fixture.sqlite');}

test('opt-in persists all character fields and one receipt; retry cannot apply HP twice',t=>{
 const file=disk(t);let s=openStore(file,{classAdvancement:true});prepare(s);const q=command(s),before=s.read(),r=s.advanceCharacter(q);
 assert.equal(r.characterSheet.level,2);assert.equal(r.state.maxHp,before.state.maxHp+8);assert.equal(r.state.hp,before.state.hp);assert.equal(r.revision,before.revision+1);assert.equal(s.advanceCharacter(q).replayed,true);assert.equal(s.read().state.maxHp,r.state.maxHp);
 assert.throws(()=>s.advanceCharacter({...q,hpMethod:'roll',hpRoll:10}),{status:409});assert.throws(()=>s.advanceCharacter({...q,mutationId:randomUUID()}),{status:409});
 s.close();s=openStore(file,{classAdvancement:true});const {affectedContext,...saved}=r;assert.deepEqual(s.read(),saved);s.close();
 assert.throws(()=>openStore(file),{status:409});
});

test('failure after spell, sheet, stats and ledger writes rolls back everything',t=>{
 const file=disk(t,false),s=openStore(file,{classAdvancement:true}),db=new DatabaseSync(file);t.after(()=>{db.close();s.close();rmSync(join(file,'..'),{recursive:true,force:true});});prepare(s,'wizard',2);s.catalog.installBundled({version:s.catalog.previewBundled().version});const q=command(s);q.choices['wizard:3:spellbook-spells']=spellChoiceOptions('wizard',3,'spellbook-spells').slice(0,2).map(x=>x.spellId);
 const before=s.read(),count=()=>['changes','spell_changes','character_sheet_changes','character_stats_changes','advancement_changes','character_advancement'].map(table=>db.prepare('SELECT count(*) AS n FROM '+table).get().n),counts=count();
 db.exec("CREATE TRIGGER fail_advance BEFORE INSERT ON advancement_changes BEGIN SELECT RAISE(ABORT,'late audit failed');END");assert.throws(()=>s.advanceCharacter(q),/late audit/);assert.deepEqual(s.read(),before);assert.deepEqual(count(),counts);
 db.exec('DROP TRIGGER fail_advance');const r=s.advanceCharacter(q);assert.equal(r.spellbook.length,2);assert.equal(r.characterSheet.level,3);assert.equal(r.advancement.spells.length,2);assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
});

test('baseline remains exportable; advanced heroes cannot silently lose provenance in v12',()=>{
 const s=openStore(':memory:',{classAdvancement:true});try{prepare(s);assert.equal(s.exportActive(12).schemaVersion,12);s.advanceCharacter(command(s));assert.throws(()=>s.exportActive(12),{status:409});assert.throws(()=>s.saveCharacterSheet(fields(s,{sheet:null})),{status:409});assert.throws(()=>s.saveCharacterSheet(fields(s,{sheet:{...s.read().characterSheet,level:1}})),{status:409});}finally{s.close();}
});

test('feature stays unavailable by default and no advancement schema is created',t=>{
 const file=disk(t),s=openStore(file),db=new DatabaseSync(file);try{prepare(s);assert.throws(()=>s.advanceCharacter(command(s)),{status:403});assert.equal(Object.hasOwn(s.read(),'advancement'),false);assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name='character_advancement'").get(),undefined);}finally{db.close();s.close();}
});

test('switching heroes rejects queued command and never touches either hero',()=>{
 const s=openStore(':memory:',{classAdvancement:true});try{prepare(s);const q=command(s),first=s.read();s.createCharacter(fields(s,{campaignId:first.context.campaignId,template:'bard5-demo',profile:{name:'Р’С‹РјС‹С€Р»РµРЅРЅС‹Р№ РІС‚РѕСЂРѕР№',tagline:''},characterId:randomUUID()}));prepare(s);const before=s.read();assert.throws(()=>s.advanceCharacter({...q,expectedRevision:before.revision}),{status:409});assert.deepEqual(s.read(),before);s.selectContext({mutationId:randomUUID(),expectedRevision:s.read().revision,context:first.context});assert.equal(s.read().characterSheet.level,1);}finally{s.close();}
});

test('user-bound command checks read-only access, revocation and actor-owned replay',()=>{
 const s=openStore(':memory:',{classAdvancement:true});try{prepare(s);const context=s.read().context;s.access.apply({action:'bootstrap-owner',userId:'user-advance',displayName:'Р’С‹РјС‹С€Р»РµРЅРЅС‹Р№',...{campaignId:context.campaignId,characterId:context.characterId}});
 const writer=s.forUser('user-advance','advance-window',{write:true}),reader=s.forUser('user-advance','advance-reader'),q=command(writer);
 assert.throws(()=>reader.advanceCharacter(q),{status:403});const r=writer.advanceCharacter(q);assert.equal(r.advancement.level,2);assert.equal(writer.advanceCharacter(q).replayed,true);
 assert.throws(()=>s.forUser('user-advance','different-window',{write:true}).advanceCharacter(q),{status:409});
 s.access.apply({action:'revoke-character',userId:'user-advance',campaignId:context.campaignId,characterId:context.characterId});assert.throws(()=>writer.advanceCharacter(q),{status:404});
 }finally{s.close();}
});

test('SQLite backup retains the ledger and replay receipt',async t=>{
 const file=disk(t),s=openStore(file,{classAdvancement:true});prepare(s);const q=command(s);s.advanceCharacter(q);const dest=file+'.backup';await s.backup(dest);const restored=openStore(dest,{classAdvancement:true});try{assert.deepEqual(restored.read(),s.read());assert.equal(restored.advanceCharacter(q).replayed,true);}finally{restored.close();s.close();}
});

test('v13 transfer preserves provenance under a new hero and continues without replaying old levels',()=>{
 const a=openStore(':memory:',{classAdvancement:true}),b=openStore(':memory:',{classAdvancement:true}),disabled=openStore(':memory:');try{
  prepare(a,'cleric',1);a.advanceCharacter(command(a));a.changeCharacterCounter(fields(a,{counterId:'class-cleric-channel',delta:-1}));const file=a.exportActive(13),req={mutationId:randomUUID(),expectedRevision:b.read().revision,destination:'new-campaign',file};
  const saved=b.importActive(req);assert.notEqual(saved.context.characterId,a.read().context.characterId);assert.deepEqual(saved.advancement,a.read().advancement);assert.equal(saved.characterSheet.counters.find(c=>c.id==='class-cleric-channel').current,0);assert.equal(b.importActive(req).replayed,true);assert.equal(b.campaigns().length,2);
  const advanced=b.advanceCharacter(command(b));assert.equal(advanced.characterSheet.level,3);assert.equal(advanced.advancement.events.length,2);assert.equal(advanced.characterSheet.counters.find(c=>c.id==='class-cleric-channel').current,0);
  assert.throws(()=>disabled.importActive({...req,expectedRevision:0}),{status:403});assert.equal(disabled.campaigns().length,1);
  const old={...file,schemaVersion:12};assert.throws(()=>b.importActive({...req,mutationId:randomUUID(),expectedRevision:b.read().revision,file:old}),{status:422});
 }finally{a.close();b.close();disabled.close();}
});

test('v13 transfer rejects missing spells, forged resource provenance and lost ledger before any game is created',()=>{
 const a=openStore(':memory:',{classAdvancement:true}),b=openStore(':memory:',{classAdvancement:true});try{
  prepare(a,'wizard',2);a.catalog.installBundled({version:a.catalog.previewBundled().version});const q=command(a);q.choices['wizard:3:spellbook-spells']=spellChoiceOptions('wizard',3,'spellbook-spells').slice(0,2).map(x=>x.spellId);a.advanceCharacter(q);const file=a.exportActive(13),before=b.read();
  for(const change of [f=>delete f.advancement,f=>f.spellbook.pop(),f=>f.advancement.spells.pop(),f=>f.advancement.resources[0].resourceId='class-wizard-forged',f=>f.characterSheet.level=10]){const bad=structuredClone(file);change(bad);assert.throws(()=>b.importActive({mutationId:randomUUID(),expectedRevision:0,destination:'new-campaign',file:bad}),{status:422});assert.deepEqual(b.read(),before);assert.equal(b.campaigns().length,1);}
  const req={mutationId:randomUUID(),expectedRevision:0,destination:'new-campaign',file};b.importActive(req);assert.deepEqual(b.read().advancement,a.read().advancement);assert.equal(b.read().spellbook.length,2);
 }finally{a.close();b.close();}
});

test('late import audit failure restores campaigns, provenance, context and revision',t=>{
 const file=disk(t,false),a=openStore(':memory:',{classAdvancement:true}),b=openStore(file,{classAdvancement:true}),db=new DatabaseSync(file);t.after(()=>{db.close();a.close();b.close();rmSync(join(file,'..'),{recursive:true,force:true});});prepare(a);a.advanceCharacter(command(a));const req={mutationId:randomUUID(),expectedRevision:0,destination:'new-campaign',file:a.exportActive(13)},before=b.read();
 db.exec("CREATE TRIGGER fail_import_advance BEFORE INSERT ON changes BEGIN SELECT RAISE(ABORT,'receipt failed');END");assert.throws(()=>b.importActive(req),/receipt failed/);assert.deepEqual(b.read(),before);assert.equal(b.campaigns().length,1);assert.equal(db.prepare('SELECT count(*) AS n FROM character_advancement').get().n,0);
 db.exec('DROP TRIGGER fail_import_advance');assert.equal(b.importActive(req).advancement.level,2);
});

test('explicit baseline binding retains spent uses and scales only the selected counters at the next level',()=>{
 const s=openStore(':memory:',{classAdvancement:true});try{
  prepare(s,'cleric',5);s.saveCharacterSheet(fields(s,{sheet:{...s.read().characterSheet,counters:[{id:'my-channel-counter',name:'Мой канал',current:0,max:1},{id:'my-manual-counter',name:'Ручной запас',current:1,max:7}]}}));const before=s.read(),q=fields(s,{classId:'cleric',bindings:[{resourceId:'class-cleric-channel',counterId:'my-channel-counter'}],create:['class-cleric-slot-1']});
  const bound=s.bindClassResources(q);assert.equal(bound.characterSheet.level,5);assert.deepEqual(bound.state,before.state);assert.equal(bound.characterSheet.counters[0].current,0);assert.equal(bound.advancement.resources[0].origin,'baseline-bound');assert.equal(s.bindClassResources(q).replayed,true);
  const advanced=s.advanceCharacter(command(s));assert.equal(advanced.characterSheet.level,6);assert.deepEqual(advanced.characterSheet.counters.find(c=>c.id==='my-channel-counter'),{id:'my-channel-counter',name:'Мой канал',current:1,max:2});assert.deepEqual(advanced.characterSheet.counters.find(c=>c.id==='my-manual-counter'),before.characterSheet.counters[1]);
  const file=s.exportActive(13),copy=openStore(':memory:',{classAdvancement:true});try{copy.importActive({mutationId:randomUUID(),expectedRevision:0,destination:'new-campaign',file});assert.deepEqual(copy.read().advancement,advanced.advancement);}finally{copy.close();}
 }finally{s.close();}
});

test('binding requires explicit unique targets and exact baseline maxima; no names are inferred',()=>{
 const s=openStore(':memory:',{classAdvancement:true});try{
  prepare(s,'cleric',5);s.saveCharacterSheet(fields(s,{sheet:{...s.read().characterSheet,counters:[{id:'manual-channel',name:'Божественный канал',current:0,max:2}]}}));const before=s.read(),q=fields(s,{classId:'cleric',bindings:[{resourceId:'class-cleric-channel',counterId:'manual-channel'}],create:[]});
  assert.throws(()=>s.bindClassResources(q),{status:409});assert.throws(()=>s.bindClassResources({...q,bindings:[],create:['class-cleric-channel']}),{status:409});assert.throws(()=>s.bindClassResources({...q,bindings:[...q.bindings,...q.bindings]}),{status:422});assert.throws(()=>s.bindClassResources({...q,bindings:[],create:['class-cleric-slot-9']}),{status:422});assert.throws(()=>s.bindClassResources({...q,bindings:[],create:[]}),{status:422});assert.deepEqual(s.read(),before);
 }finally{s.close();}
});

test('resource binding obeys read-only access and cannot silently repeat initialization',()=>{
 const s=openStore(':memory:',{classAdvancement:true});try{prepare(s,'cleric',5);const c=s.read().context;s.access.apply({action:'bootstrap-owner',userId:'bind-test-owner',displayName:'Тестер',campaignId:c.campaignId,characterId:c.characterId});const w=s.forUser('bind-test-owner','bind-test-window',{write:true}),q=fields(w,{classId:'cleric',bindings:[],create:['class-cleric-channel']});assert.throws(()=>s.forUser('bind-test-owner','bind-test-reader').bindClassResources(q),{status:403});w.bindClassResources(q);assert.equal(w.bindClassResources(q).replayed,true);assert.throws(()=>w.bindClassResources({...q,mutationId:randomUUID(),expectedRevision:w.read().revision}),{status:409});}finally{s.close();}
});

test('unavailable spell or altered catalog source rolls back a complete advancement',t=>{
 const file=disk(t,false),s=openStore(file,{classAdvancement:true}),db=new DatabaseSync(file);t.after(()=>{db.close();s.close();rmSync(join(file,'..'),{recursive:true,force:true});});prepare(s,'wizard',2);const q=command(s);q.choices['wizard:3:spellbook-spells']=spellChoiceOptions('wizard',3,'spellbook-spells').slice(0,2).map(x=>x.spellId);const before=s.read();assert.throws(()=>s.advanceCharacter(q),{status:409});assert.deepEqual(s.read(),before);s.catalog.installBundled({version:s.catalog.previewBundled().version});const id=q.choices['wizard:3:spellbook-spells'][1],row=JSON.parse(db.prepare('SELECT entry_json FROM catalog_entries WHERE id=?').get(id).entry_json);row.name.ru='Подменённая карточка';db.prepare('UPDATE catalog_entries SET entry_json=? WHERE id=?').run(JSON.stringify(row),id);assert.throws(()=>s.advanceCharacter(q),{status:409});assert.deepEqual(s.read(),before);
});

test('future and partially missing advancement schemas fail before changing a database',t=>{
 for(const corrupt of ['future','missing']){
  const file=disk(t),s=openStore(file,{classAdvancement:true});prepare(s);s.close();const db=new DatabaseSync(file);
  if(corrupt==='future')db.exec('UPDATE class_advancement_schema SET version=99');else db.exec('DROP TABLE advancement_changes');
  const before=db.prepare('SELECT * FROM workspace').get(),names=db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
  for(const enabled of [true,false])assert.throws(()=>openStore(file,{classAdvancement:enabled}),{status:409});
  assert.deepEqual(db.prepare('SELECT * FROM workspace').get(),before);assert.deepEqual(db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all(),names);db.close();
 }
});

test('binding audit failure rolls back counters and ownership; changed retry cannot acquire extra resources',t=>{
 const file=disk(t,false),s=openStore(file,{classAdvancement:true}),db=new DatabaseSync(file);
 t.after(()=>{db.close();s.close();rmSync(join(file,'..'),{recursive:true,force:true});});
 prepare(s,'fighter',3);const before=s.read(),q=fields(s,{classId:'fighter',bindings:[],create:['class-fighter-second-wind']});
 const counts=()=>['changes','character_sheet_changes','character_stats_changes','character_advancement','advancement_changes'].map(table=>db.prepare('SELECT count(*) AS n FROM '+table).get().n),original=counts();
 db.exec("CREATE TRIGGER fail_binding_receipt BEFORE INSERT ON changes BEGIN SELECT RAISE(ABORT,'binding receipt failed');END");
 assert.throws(()=>s.bindClassResources(q),/binding receipt failed/);assert.deepEqual(s.read(),before);assert.deepEqual(counts(),original);
 db.exec('DROP TRIGGER fail_binding_receipt');const bound=s.bindClassResources(q);assert.equal(bound.advancement.resources.length,1);assert.equal(s.bindClassResources(q).replayed,true);
 assert.throws(()=>s.bindClassResources({...q,create:[...q.create,'class-fighter-action-surge']}),{status:409});assert.equal(s.read().advancement.resources.length,1);assert.deepEqual(s.read().state,before.state);
});
