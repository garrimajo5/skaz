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

test('v14 keeps conditions alongside a nonempty advancement ledger and permits the next level',()=>{
 const a=openStore(':memory:',{classAdvancement:true}),b=openStore(':memory:',{classAdvancement:true});try{
 prepare(a,'cleric');a.advanceCharacter(command(a));a.update({mutationId:randomUUID(),expectedRevision:a.read().revision,label:'Manual conditions',state:{...a.read().state,conditions:{active:['poisoned'],exhaustion:2}}});
 const file=a.exportActive(14),before=a.read();b.importActive({mutationId:randomUUID(),expectedRevision:0,destination:'new-campaign',file});assert.deepEqual(b.read().advancement,before.advancement);assert.deepEqual(b.read().state.conditions,before.state.conditions);
 const next=b.advanceCharacter(command(b));assert.equal(next.characterSheet.level,3);assert.deepEqual(next.state.conditions,before.state.conditions);assert.equal(next.state.hp,before.state.hp);
 }finally{a.close();b.close();}
});

test('style choice persists, retries exactly, and survives v13 without changing manual combat numbers',()=>{
 const a=openStore(':memory:',{classAdvancement:true}),b=openStore(':memory:',{classAdvancement:true});
 try{
  prepare(a,'paladin',1);const before=a.read(),q=command(a);q.choices['paladin:2:fighting-style']=['defense'];
  const saved=a.advanceCharacter(q);assert.equal(saved.advancement.styles[0].id,'defense');assert.equal(saved.characterStats.armorClass,before.characterStats.armorClass);
  assert.equal(a.advanceCharacter(q).replayed,true);assert.equal(a.read().advancement.styles.length,1);
  assert.throws(()=>a.advanceCharacter({...q,choices:{'paladin:2:fighting-style':['dueling']}}),{status:409});
  const file=a.exportActive(13),req={mutationId:randomUUID(),expectedRevision:0,destination:'new-campaign',file};
  const imported=b.importActive(req);assert.deepEqual(imported.advancement,saved.advancement);assert.equal(b.importActive(req).replayed,true);
  const bad=structuredClone(file);bad.advancement.styles=[];const count=b.campaigns().length;
  assert.throws(()=>b.importActive({...req,mutationId:randomUUID(),expectedRevision:b.read().revision,file:bad}),{status:422});assert.equal(b.campaigns().length,count);
 }finally{a.close();b.close();}
});


test('ranger style and two spells commit together, roll back a late receipt failure, and survive restart and v14',t=>{
 const file=disk(t,false);let s=openStore(file,{classAdvancement:true});const db=new DatabaseSync(file);
 t.after(()=>{db.close();s.close();rmSync(join(file,'..'),{recursive:true,force:true});});
 prepare(s,'ranger',1);s.catalog.installBundled({version:s.catalog.previewBundled().version});
 const q=command(s);q.choices['ranger:2:fighting-style']=['archery'];q.choices['ranger:2:known-spells']=spellChoiceOptions('ranger',2,'known-spells').slice(0,2).map(x=>x.spellId);
 const before=s.read(),counts=()=>['changes','character_spells','character_sheet_changes','character_stats_changes','character_advancement','advancement_changes'].map(table=>db.prepare('SELECT count(*) AS n FROM '+table).get().n),original=counts();
 const missing={...q,choices:{'ranger:2:fighting-style':['archery']}};assert.throws(()=>s.advanceCharacter(missing),{status:422});assert.deepEqual(s.read(),before);
 db.exec("CREATE TRIGGER fail_style_receipt BEFORE INSERT ON advancement_changes BEGIN SELECT RAISE(ABORT,'style audit failed');END");
 assert.throws(()=>s.advanceCharacter(q),/style audit failed/);assert.deepEqual(s.read(),before);assert.deepEqual(counts(),original);assert.equal(db.prepare('SELECT version FROM class_advancement_schema').get().version,1);
 db.exec('DROP TRIGGER fail_style_receipt');const result=s.advanceCharacter(q);assert.equal(db.prepare('SELECT version FROM class_advancement_schema').get().version,2);assert.equal(result.advancement.styles[0].id,'archery');assert.equal(result.spellbook.length,2);assert.equal(result.advancement.spells.length,2);assert.deepEqual(result.characterStats,before.characterStats);
 s.close();s=openStore(file,{classAdvancement:true});assert.deepEqual(s.read().advancement,result.advancement);assert.equal(s.advanceCharacter(q).replayed,true);
 const b=openStore(':memory:',{classAdvancement:true});try{const exported=s.exportActive(14);b.importActive({mutationId:randomUUID(),expectedRevision:0,destination:'new-campaign',file:exported});assert.deepEqual(b.read().advancement,result.advancement);assert.equal(b.read().spellbook.length,2);
 const next=command(b),blockedBefore=b.read();assert.throws(()=>b.advanceCharacter(next),{status:422});assert.deepEqual(b.read(),blockedBefore);
 }finally{b.close();}
});


test('metamagic follows levels 3, 10 and 17 without refilling points and transfers its complete history',()=>{
 const s=openStore(':memory:',{classAdvancement:true}),b=openStore(':memory:',{classAdvancement:true});
 try{
  prepare(s,'sorcerer',2);s.catalog.installBundled({version:s.catalog.previewBundled().version});
  s.bindClassResources(fields(s,{classId:'sorcerer',bindings:[],create:['class-sorcerer-sorcery']}));
  let sheet=s.read().characterSheet;sheet.counters.find(c=>c.id==='class-sorcerer-sorcery').current=0;s.saveCharacterSheet(fields(s,{sheet}));
  const options=['careful-spell','twinned-spell','subtle-spell','distant-spell'];
  for(let level=3;level<=17;level++){
   const q=command(s),before=s.read(),plan=previewClassLevel({classId:'sorcerer',fromLevel:level-1,toLevel:level,constitution:before.characterStats.abilities.con});
   for(const c of plan.choices){if(!c.required)continue;
    if(c.kind==='metamagic')q.choices[c.id]=level===3?options.slice(0,2):[options[level===10?2:3]];
    else if(c.kind==='ability-score-improvement-or-feat'){const abilities=before.characterStats.abilities,key=Object.keys(abilities).find(k=>abilities[k]<=18);q.choices[c.id]={increases:Object.fromEntries(Object.keys(abilities).map(k=>[k,k===key?2:0]))};}
    else q.choices[c.id]=spellChoiceOptions('sorcerer',level,c.kind,{knownIds:before.spellbook.map(e=>e.catalogId)}).slice(0,c.count).map(o=>o.spellId);
   }
   if(level===10){const bad=structuredClone(q);bad.choices['sorcerer:10:metamagic']=['careful-spell'];assert.throws(()=>s.advanceCharacter(bad),{status:422});assert.deepEqual(s.read(),before);}
   const after=s.advanceCharacter(q);assert.equal(after.state.hp,before.state.hp);assert.equal(after.advancement.metamagic.length,level<10?2:level<17?3:4);
   const counter=after.characterSheet.counters.find(c=>c.id==='class-sorcerer-sorcery');assert.equal(counter.max-counter.current,2);assert.equal(s.advanceCharacter(q).replayed,true);
  }
  const saved=s.read();assert.deepEqual(saved.advancement.metamagic.map(o=>o.id),options);assert.deepEqual(saved.advancement.metamagic.map(o=>o.acquiredLevel),[3,3,10,17]);
  b.importActive({mutationId:randomUUID(),expectedRevision:0,destination:'new-campaign',file:s.exportActive(14)});assert.deepEqual(b.read().advancement,saved.advancement);assert.deepEqual(b.read().characterSheet.counters,saved.characterSheet.counters);
 }finally{s.close();b.close();}
});


test('startup rejects damaged or mismarked histories of inactive heroes before any database writes',t=>{
 const file=disk(t,false),s=openStore(file,{classAdvancement:true});prepare(s,'paladin',1);const q=command(s);q.choices['paladin:2:fighting-style']=['defense'];s.advanceCharacter(q);const first=s.read().context.characterId;
 s.createCharacter(fields(s,{campaignId:s.read().context.campaignId,characterId:randomUUID(),template:'bard5-demo',profile:{name:'Другой тестовый герой',tagline:''}}));prepare(s,'fighter',1);s.close();
 const db=new DatabaseSync(file);t.after(()=>{db.close();rmSync(join(file,'..'),{recursive:true,force:true});});
 assert.equal(db.prepare('SELECT version FROM class_advancement_schema').get().version,2);
 const raw=db.prepare('SELECT ledger_json FROM character_advancement WHERE character_id=?').get(first).ledger_json,before=db.prepare('SELECT * FROM workspace').get(),tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
 const bad=JSON.parse(raw);bad.styles=[];db.prepare('UPDATE character_advancement SET ledger_json=? WHERE character_id=?').run(JSON.stringify(bad),first);
 assert.throws(()=>openStore(file,{classAdvancement:true}),{status:409});assert.deepEqual(db.prepare('SELECT * FROM workspace').get(),before);assert.deepEqual(db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all(),tables);
 db.prepare('UPDATE character_advancement SET ledger_json=? WHERE character_id=?').run(raw,first);db.exec('UPDATE class_advancement_schema SET version=1');assert.throws(()=>openStore(file,{classAdvancement:true}),{status:409});assert.deepEqual(db.prepare('SELECT * FROM workspace').get(),before);
 db.exec('UPDATE class_advancement_schema SET version=2');const restored=openStore(file,{classAdvancement:true});assert.equal(restored.read().characterSheet.className,'fighter');restored.close();
});

test('style import upgrades compatibility atomically and a late failure restores the old marker',t=>{
 const source=openStore(':memory:',{classAdvancement:true}),file=disk(t,false),target=openStore(file,{classAdvancement:true}),db=new DatabaseSync(file);t.after(()=>{source.close();target.close();db.close();rmSync(join(file,'..'),{recursive:true,force:true});});
 prepare(source,'paladin',1);const q=command(source);q.choices['paladin:2:fighting-style']=['defense'];source.advanceCharacter(q);
 const request={mutationId:randomUUID(),expectedRevision:target.read().revision,destination:'new-campaign',file:source.exportActive(13)},before=target.read();
 db.exec("CREATE TRIGGER reject_import BEFORE INSERT ON changes BEGIN SELECT RAISE(ABORT,'late style import');END");assert.throws(()=>target.importActive(request),/late style import/);assert.deepEqual(target.read(),before);assert.equal(db.prepare('SELECT version FROM class_advancement_schema').get().version,1);
 db.exec('DROP TRIGGER reject_import');target.importActive(request);assert.equal(db.prepare('SELECT version FROM class_advancement_schema').get().version,2);assert.equal(target.read().advancement.styles[0].id,'defense');
});


test('SQLite backups restore both old baseline and v2/v3 histories with exact retry receipts',async t=>{
 for(const classId of ['paladin','sorcerer']){
  const file=disk(t),s=openStore(file,{classAdvancement:true});
  try{
   prepare(s,classId,classId==='paladin'?1:2);if(classId==='sorcerer')s.catalog.installBundled({version:s.catalog.previewBundled().version});
   const before=s.read(),q=command(s);if(classId==='paladin')q.choices['paladin:2:fighting-style']=['defense'];else{q.choices['sorcerer:3:metamagic']=['careful-spell','twinned-spell'];q.choices['sorcerer:3:known-spells']=spellChoiceOptions('sorcerer',3,'known-spells').slice(0,1).map(x=>x.spellId);}
   await s.backup(file+'.before');s.advanceCharacter(q);const after=s.read();await s.backup(file+'.after');
   const baseline=openStore(file+'.before',{classAdvancement:true}),restored=openStore(file+'.after',{classAdvancement:true});
   try{assert.deepEqual(baseline.read(),before);assert.deepEqual(restored.read(),after);assert.equal(restored.advanceCharacter(q).replayed,true);assert.equal(restored.read().state.maxHp,after.state.maxHp);
    const db=new DatabaseSync(file+'.after',{readOnly:true});try{assert.equal(db.prepare('SELECT version FROM class_advancement_schema').get().version,2);assert.deepEqual(db.prepare('PRAGMA integrity_check').all().map(r=>r.integrity_check),['ok']);assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);}finally{db.close();}
    assert.equal(baseline.advanceCharacter(q).replayed,undefined);assert.deepEqual(baseline.read().advancement,after.advancement);
   }finally{baseline.close();restored.close();}
  }finally{s.close();}
 }
});

import {invocationEligibility,validateInvocationHistory,ELDRITCH_BLAST_ID} from '../server/class-invocations.mjs';
import {pactCantripOptions,FIND_FAMILIAR_ID} from '../server/class-pacts.mjs';
function warlockCommand(s,{pact='blade',replace=null}={}){
 const q=command(s),v=s.read(),level=q.fromLevel+1,known=v.advancement?.version===4?validateInvocationHistory(v.advancement.invocations,v.advancement):[];
 const pactId=level===3?pact:v.advancement?.pact?.id??null;
 for(const choice of previewClassLevel({classId:'warlock',fromLevel:q.fromLevel,toLevel:level,constitution:v.characterStats.abilities.con}).choices){if(!choice.required)continue;
  if(choice.kind==='invocations')q.choices[choice.id]=invocationEligibility({warlockLevel:level,pact:pactId,hasEldritchBlast:v.spellbook.some(o=>o.catalogId===ELDRITCH_BLAST_ID),knownInvocations:known}).filter(o=>o.eligible&&o.id!=='book-of-ancient-secrets').slice(0,choice.count).map(o=>o.id);
  else if(choice.kind==='pact-boon')q.choices[choice.id]={id:pact,cantrips:pact==='tome'?pactCantripOptions().slice(0,3).map(o=>o.spellId):[]};
  else if(choice.kind==='ability-score-improvement-or-feat'){const key=Object.keys(v.characterStats.abilities).find(k=>v.characterStats.abilities[k]<=18);q.choices[choice.id]={increases:Object.fromEntries(Object.keys(v.characterStats.abilities).map(k=>[k,k===key?2:0]))};}
  else q.choices[choice.id]=spellChoiceOptions('warlock',level,choice.kind,{knownIds:v.spellbook.map(o=>o.catalogId)}).slice(0,choice.count).map(o=>o.spellId);
 }
 if(replace)q.choices['warlock:'+level+':replace-invocation']=replace;return q;
}
test('warlock invocation/pact history survives 1 through 20, exact retry, transfer and resource expenditure',()=>{
 const s=openStore(':memory:',{classAdvancement:true}),target=openStore(':memory:',{classAdvancement:true});try{
  prepare(s,'warlock',1);s.catalog.installBundled({version:s.catalog.previewBundled().version});
  const resource='class-warlock-pact-slots';s.bindClassResources(fields(s,{classId:'warlock',bindings:[],create:[resource]}));s.changeCharacterCounter(fields(s,{counterId:resource,delta:-1}));
  for(let level=2;level<=20;level++){
   const q=warlockCommand(s),before=s.read();
   const saved=s.advanceCharacter(q);assert.equal(saved.characterSheet.level,level);assert.equal(saved.advancement.invocations.length,level-1);assert.equal(validateInvocationHistory(saved.advancement.invocations,saved.advancement).length,level<5?2:level<7?3:level<9?4:level<12?5:level<15?6:level<18?7:8);
   assert.equal(saved.state.hp,before.state.hp);const counter=saved.characterSheet.counters.find(c=>c.id===resource);assert.equal(counter.max-counter.current,1);assert.equal(s.advanceCharacter(q).replayed,true);
  }
  target.importActive({mutationId:randomUUID(),expectedRevision:0,destination:'new-campaign',file:s.exportActive(14)});assert.deepEqual(target.read().advancement,s.read().advancement);assert.deepEqual(target.read().spellbook,s.read().spellbook);
 }finally{s.close();target.close();}
});
test('all three pacts preserve bonus spell origins without duplicate grants and cantrip-dependent replacement uses same-step facts',()=>{
 for(const pact of ['blade','chain','tome']){const s=openStore(':memory:',{classAdvancement:true}),target=openStore(':memory:',{classAdvancement:true});try{
  prepare(s,'warlock',1);s.catalog.installBundled({version:s.catalog.previewBundled().version});s.advanceCharacter(warlockCommand(s));
  const q=warlockCommand(s,{pact});
  if(pact==='chain')s.setSpell(fields(s,{catalogId:FIND_FAMILIAR_ID,status:'known'}));
  q.expectedRevision=s.read().revision;
  if(pact==='tome'){
   q.choices['warlock:3:pact-boon'].cantrips=[ELDRITCH_BLAST_ID,...pactCantripOptions().filter(o=>o.spellId!==ELDRITCH_BLAST_ID).slice(0,2).map(o=>o.spellId)];
   q.choices['warlock:3:replace-invocation']={remove:s.read().advancement.invocations[0].added[0].id,add:'agonizing-blast'};
  }
  const saved=s.advanceCharacter(q);assert.equal(saved.advancement.pact.id,pact);assert.equal(saved.advancement.pact.spells.length,pact==='blade'?0:pact==='chain'?1:3);
  for(const id of saved.advancement.pact.spells)assert.equal(saved.spellbook.filter(o=>o.catalogId===id).length,1);
  assert.equal(s.advanceCharacter(q).replayed,true);
  const exported=s.exportActive(14);target.importActive({mutationId:randomUUID(),expectedRevision:0,destination:'new-campaign',file:exported});assert.deepEqual(target.read().advancement,saved.advancement);
  if(pact!=='blade'){
   const bad=structuredClone(exported);bad.spellbook=bad.spellbook.filter(o=>o.catalogId!==saved.advancement.pact.spells[0]);assert.throws(()=>target.importActive({mutationId:randomUUID(),expectedRevision:target.read().revision,destination:'new-campaign',file:bad}),{status:422});
  }
 }finally{s.close();target.close();}}
});
test('late invocation write failure rolls back new marker, spells, HP and entire origin; backups preserve retry',async t=>{
 const file=disk(t,false),s=openStore(file,{classAdvancement:true}),db=new DatabaseSync(file);t.after(()=>{db.close();s.close();rmSync(join(file,'..'),{recursive:true,force:true});});prepare(s,'warlock',1);s.catalog.installBundled({version:s.catalog.previewBundled().version});
 const q=warlockCommand(s),before=s.read();await s.backup(file+'.before');
 db.exec("CREATE TRIGGER reject_invocation BEFORE INSERT ON advancement_changes BEGIN SELECT RAISE(ABORT,'late invocation');END");assert.throws(()=>s.advanceCharacter(q),/late invocation/);assert.deepEqual(s.read(),before);assert.equal(db.prepare('SELECT version FROM class_advancement_schema').get().version,1);
 db.exec('DROP TRIGGER reject_invocation');s.advanceCharacter(q);assert.equal(db.prepare('SELECT version FROM class_advancement_schema').get().version,3);await s.backup(file+'.after');
 const a=openStore(file+'.before',{classAdvancement:true}),b=openStore(file+'.after',{classAdvancement:true});try{assert.deepEqual(a.read(),before);assert.deepEqual(b.read(),s.read());assert.equal(b.advanceCharacter(q).replayed,true);assert.deepEqual(a.advanceCharacter(q).advancement,b.read().advancement);}finally{a.close();b.close();}
 assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
});

test('a forged prerequisite spell snapshot or transferred pact source cannot authorize a class choice',t=>{
 const file=disk(t,false),s=openStore(file,{classAdvancement:true}),db=new DatabaseSync(file),target=openStore(':memory:',{classAdvancement:true});t.after(()=>{target.close();db.close();s.close();rmSync(join(file,'..'),{recursive:true,force:true});});prepare(s,'warlock',1);s.catalog.installBundled({version:s.catalog.previewBundled().version});
 s.setSpell(fields(s,{catalogId:ELDRITCH_BLAST_ID,status:'known'}));
 const original=db.prepare('SELECT entry_json FROM character_spells WHERE catalog_id=?').get(ELDRITCH_BLAST_ID).entry_json,bad=JSON.parse(original);bad.name.ru='Подменённое требование';db.prepare('UPDATE character_spells SET entry_json=? WHERE catalog_id=?').run(JSON.stringify(bad),ELDRITCH_BLAST_ID);
 const q=warlockCommand(s);q.choices['warlock:2:invocations']=['agonizing-blast','devils-sight'];const before=s.read();assert.throws(()=>s.advanceCharacter(q),{status:422});assert.deepEqual(s.read(),before);assert.equal(db.prepare('SELECT version FROM class_advancement_schema').get().version,1);
 db.prepare('UPDATE character_spells SET entry_json=? WHERE catalog_id=?').run(original,ELDRITCH_BLAST_ID);s.advanceCharacter(q);s.advanceCharacter(warlockCommand(s,{pact:'chain'}));
 const exported=s.exportActive(14),familiar=exported.catalog.entries.find(e=>e.id===FIND_FAMILIAR_ID);familiar.name.ru='Подменённый дар';const targetBefore=target.read();assert.throws(()=>target.importActive({mutationId:randomUUID(),expectedRevision:0,destination:'new-campaign',file:exported}),{status:422});assert.deepEqual(target.read(),targetBefore);
});

test('inactive invocation history cannot bypass startup by lowering its capability marker or stripping origin',t=>{
 const file=disk(t,false),s=openStore(file,{classAdvancement:true});prepare(s,'warlock',1);s.catalog.installBundled({version:s.catalog.previewBundled().version});s.advanceCharacter(warlockCommand(s));const hero=s.read().context.characterId;
 s.createCharacter(fields(s,{campaignId:s.read().context.campaignId,characterId:randomUUID(),template:'bard5-demo',profile:{name:'Синтетический другой герой',tagline:''}}));s.close();
 const db=new DatabaseSync(file);t.after(()=>{db.close();rmSync(join(file,'..'),{recursive:true,force:true});});
 const raw=db.prepare('SELECT ledger_json FROM character_advancement WHERE character_id=?').get(hero).ledger_json,before=db.prepare('SELECT * FROM workspace').get();
 for(const marker of [1,2]){db.prepare('UPDATE class_advancement_schema SET version=?').run(marker);assert.throws(()=>openStore(file,{classAdvancement:true}),{status:409});assert.deepEqual(db.prepare('SELECT * FROM workspace').get(),before);}
 db.exec('UPDATE class_advancement_schema SET version=3');
 const stripped=JSON.parse(raw);stripped.version=3;delete stripped.invocations;delete stripped.pact;
 db.prepare('UPDATE character_advancement SET ledger_json=? WHERE character_id=?').run(JSON.stringify(stripped),hero);assert.throws(()=>openStore(file,{classAdvancement:true}),{status:409});assert.deepEqual(db.prepare('SELECT * FROM workspace').get(),before);
 db.prepare('UPDATE character_advancement SET ledger_json=? WHERE character_id=?').run(raw,hero);const restored=openStore(file,{classAdvancement:true});try{assert.notEqual(restored.read().context.characterId,hero);}finally{restored.close();}
});
