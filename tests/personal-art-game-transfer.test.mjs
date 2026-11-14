import {previewClassLevel,spellChoiceOptions} from '../server/class-progression.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {openStore} from '../server/store.mjs';
import {templateStats} from '../server/character-stats.mjs';
import {bundledCatalog} from '../server/bundled-catalog.mjs';
import {gameArtPackage} from '../server/game-art-package.mjs';
import {personalArtTransfer} from '../server/personal-art-transfer.mjs';
const catalogId='srd51:2014:spell:shield',userId='art-owner';
const manifest=JSON.parse(readFileSync(new URL('../catalog/art-manifest.json',import.meta.url)));
const png=readFileSync(new URL('../'+manifest.entries[0].files.thumbnail.path,import.meta.url));
function fixture(t,options={}){
 const dir=mkdtempSync(join(tmpdir(),'skaz-game-art-')),file=join(dir,'game.sqlite'),store=openStore(file,options),db=new DatabaseSync(file);
 t.after(()=>{db.close();store.close();rmSync(dir,{recursive:true,force:true});});
 store.catalog.installBundled({version:store.catalog.previewBundled().version});
 const context=store.read().context;
 store.access.apply({action:'bootstrap-owner',userId,displayName:'Test',campaignId:context.campaignId,characterId:context.characterId});
 let live=true;const guard=()=>{if(!live)throw Object.assign(new Error('Session expired'),{status:401});};
 const writer=store.forUser(userId,'art-window',{write:true,guard,personalArt:true});
 writer.personalArt.change({characterId:context.characterId,catalogId,mutationId:randomUUID(),expectedRevision:0,action:'set',bytes:png});
 const bundle=writer.exportActive('with-art');
 const request={mutationId:randomUUID(),expectedRevision:writer.read().revision,destination:'new-campaign',file:bundle};
 return {store,db,writer,context,bundle,request,guard,expire:()=>{live=false;}};
}
function counts(db){return Object.fromEntries(['campaigns','characters','sessions','changes','context_changes','user_changes','campaign_memberships','character_access','access_audit','personal_art_versions','personal_art_imports'].map(table=>[table,db.prepare('SELECT count(*) AS n FROM '+table).get().n]));}

test('opt-in game import carries personal art atomically and exact retry creates no second game',t=>{
 const f=fixture(t),before=counts(f.db),result=f.writer.importActive(f.request);
 assert.notEqual(result.context.characterId,f.context.characterId);
 const image=f.writer.personalArt.read(result.context.characterId,catalogId,'master');
 assert.equal(image.revision,1);
 assert.deepEqual(image.file.bytes,Buffer.from(f.bundle.personalArt.entries[0].png,'base64'));
 assert.equal(f.store.access.membership(userId,result.context.campaignId),'owner');
 const after=counts(f.db);assert.equal(after.campaigns,before.campaigns+1);assert.equal(after.personal_art_versions,before.personal_art_versions+1);
 assert.equal(f.writer.importActive(f.request).replayed,true);assert.deepEqual(counts(f.db),after);
 const changed=structuredClone(f.request);changed.file.personalArt.entries=[];
 assert.throws(()=>f.writer.importActive(changed),{status:409});assert.deepEqual(counts(f.db),after);
 assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);
});

test('image quota failure rolls back game, grants, context, global revision and every receipt',t=>{
 const f=fixture(t);
 // Exhaust real storage quota without creating a thousand fixtures. Existing
 // source bytes are not read by import; the valid package was captured above.
 f.db.prepare('UPDATE personal_art_versions SET master=zeroblob(?) WHERE user_id=?').run(32*1024*1024,userId);
 const before=counts(f.db),state=f.writer.read();
 assert.throws(()=>f.writer.importActive(f.request),error=>error.status===409&&/Лимит/.test(error.message));
 assert.deepEqual(counts(f.db),before);assert.deepEqual(f.writer.read(),state);
});

test('quota failure on the second image also rolls back the first imported image',t=>{
 const f=fixture(t),secondId='srd51:2014:spell:magic-missile';
 const entries=new Map(bundledCatalog().bundle.entries.map(e=>[e.id,e]));
 f.request.file=gameArtPackage(f.bundle.game,personalArtTransfer([catalogId,secondId].map(id=>({catalogId:id,bytes:Buffer.from(f.bundle.personalArt.entries[0].png,'base64')}))),{lookup:id=>entries.get(id)});
 const sizes=f.db.prepare('SELECT length(master) AS m,length(thumbnail) AS t FROM personal_art_versions WHERE user_id=?').get(userId),added=sizes.m+sizes.t;
 // Enough quota for exactly one new pair; importing the second must fail.
 f.db.prepare('UPDATE personal_art_versions SET master=zeroblob(?) WHERE user_id=?').run(32*1024*1024-added-Math.floor(added/2)-sizes.t,userId);
 const before=counts(f.db),state=f.writer.read();
 assert.throws(()=>f.writer.importActive(f.request),error=>error.status===409&&/Лимит/.test(error.message));
 assert.deepEqual(counts(f.db),before);assert.deepEqual(f.writer.read(),state);
 assert.equal(f.db.prepare('SELECT count(*) AS n FROM personal_art_versions WHERE catalog_id=?').get(secondId).n,0);
});

test('export cannot drop personal art and trusted opt-in does not bypass readonly/session/access rules',t=>{
 const f=fixture(t);
 assert.throws(()=>f.writer.exportActive(12),{status:409});
 const reader=f.store.forUser(userId,'art-window',{guard:f.guard,personalArt:true});
 assert.equal(reader.exportActive('with-art').personalArt.entries.length,1);
 assert.throws(()=>reader.importActive(f.request),{status:403});
 const legacy=f.store.forUser(userId,'art-window',{write:true,guard:f.guard});
 assert.equal(legacy.personalArt,undefined);assert.throws(()=>legacy.importActive(f.request),{status:403});
 assert.throws(()=>legacy.exportActive(12),{status:409});
 assert.throws(()=>f.store.exportActive('with-art'),{status:403});
 f.expire();assert.throws(()=>f.writer.importActive(f.request),{status:401});assert.throws(()=>reader.exportActive('with-art'),{status:401});
});

test('SQLite backup restores game and art together and another actor has no personal image',async t=>{
 const f=fixture(t),result=f.writer.importActive(f.request),backupFile=join(tmpdir(),'skaz-art-backup-'+randomUUID()+'.sqlite');
 let restored;t.after(()=>{restored?.close();rmSync(backupFile,{force:true});});await f.store.backup(backupFile);
 restored=openStore(backupFile);
 const owner=restored.forUser(userId,'art-window',{write:true,guard:f.guard,personalArt:true});
 assert.equal(owner.read().context.characterId,result.context.characterId);
 assert.equal(owner.importActive(f.request).replayed,true);
 assert.deepEqual(owner.exportActive('with-art').personalArt,f.bundle.personalArt);
 restored.access.apply({action:'create-user',userId:'art-other',displayName:'Other'});
 restored.access.apply({action:'set-member',userId:'art-other',campaignId:result.context.campaignId,role:'player'});
 restored.access.apply({action:'grant-character',userId:'art-other',campaignId:result.context.campaignId,characterId:result.context.characterId});
 const other=restored.forUser('art-other','art-window',{guard:f.guard,personalArt:true});
 assert.equal(other.personalArt.read(result.context.characterId,catalogId).standard,true);
 assert.equal(other.exportActive('with-art').personalArt.entries.length,0);
});

test('revoked source access blocks even a successful import receipt replay',t=>{
 const f=fixture(t);f.writer.importActive(f.request);const before=counts(f.db);
 f.store.access.apply({action:'revoke-character',userId,campaignId:f.context.campaignId,characterId:f.context.characterId});
 assert.throws(()=>f.writer.importActive(f.request),{status:404});
 const after=counts(f.db);assert.equal(after.campaigns,before.campaigns);assert.equal(after.personal_art_versions,before.personal_art_versions);
});

test('reset and restore after import stay scoped and round-trip only the current image',t=>{
 const f=fixture(t),result=f.writer.importActive(f.request),characterId=result.context.characterId;
 const source=f.writer.personalArt.read(f.context.characterId,catalogId,'master');
 f.writer.personalArt.change({characterId,catalogId,mutationId:randomUUID(),expectedRevision:1,action:'reset'});
 assert.equal(f.writer.personalArt.read(characterId,catalogId).standard,true);
 assert.equal(f.writer.exportActive('with-art').personalArt.entries.length,0);
 assert.deepEqual(f.writer.personalArt.read(f.context.characterId,catalogId,'master').file.bytes,source.file.bytes);
 f.writer.personalArt.change({characterId,catalogId,mutationId:randomUUID(),expectedRevision:2,action:'restore',targetRevision:1});
 const bundle=f.writer.exportActive('with-art');
 assert.equal(bundle.personalArt.entries.length,1);
 assert.deepEqual(bundle.personalArt,f.bundle.personalArt);
 const next=f.writer.importActive({mutationId:randomUUID(),expectedRevision:f.writer.read().revision,destination:'new-campaign',file:bundle});
 assert.notEqual(next.context.characterId,characterId);
 const image=f.writer.personalArt.read(next.context.characterId,catalogId,'master');
 assert.equal(image.revision,1);
 assert.deepEqual(image.file.bytes,source.file.bytes);
 assert.equal(f.writer.personalArt.read(characterId,catalogId).revision,3);
 assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);
});


test('v2 transfers advancement and artwork together, and late image failure rolls back both',t=>{
 const f=fixture(t,{classAdvancement:true}),w=f.writer;
 const command=extra=>({mutationId:randomUUID(),expectedRevision:w.read().revision,characterId:w.read().context.characterId,...extra});
 w.saveCharacterSheet(command({sheet:{ruleset:'5e-2014',ancestry:'',className:'fighter',subclass:'',level:1,counters:[]}}));
 w.saveCharacterStats(command({stats:structuredClone(templateStats)}));
 w.bindClassResources(command({classId:'fighter',bindings:[],create:['class-fighter-second-wind']}));
 const before=w.read(),bundle=w.exportActive('with-art');assert.equal(bundle.schemaVersion,2);assert.equal(bundle.game.schemaVersion,13);
 const request={mutationId:randomUUID(),expectedRevision:before.revision,destination:'new-campaign',file:bundle},original=counts(f.db);
 f.db.exec("CREATE TRIGGER fail_combined_art BEFORE INSERT ON personal_art_versions BEGIN SELECT RAISE(ABORT,'late artwork failed');END");
 assert.throws(()=>w.importActive(request),/late artwork failed/);assert.deepEqual(w.read(),before);assert.deepEqual(counts(f.db),original);assert.equal(f.db.prepare('SELECT count(*) AS n FROM character_advancement').get().n,1);
 f.db.exec('DROP TRIGGER fail_combined_art');const imported=w.importActive(request);assert.deepEqual(imported.advancement,before.advancement);assert.notEqual(imported.context.characterId,before.context.characterId);
 assert.deepEqual(w.personalArt.read(imported.context.characterId,catalogId,'master').file.bytes,Buffer.from(bundle.personalArt.entries[0].png,'base64'));
 const after=counts(f.db);assert.equal(w.importActive(request).replayed,true);assert.deepEqual(counts(f.db),after);assert.equal(w.exportActive('with-art').schemaVersion,2);
});

test('v3 transfers conditions, advancement and artwork atomically with a replayable receipt',t=>{
 const f=fixture(t,{classAdvancement:true}),w=f.writer;
 const command=extra=>({mutationId:randomUUID(),expectedRevision:w.read().revision,characterId:w.read().context.characterId,...extra});
 w.saveCharacterSheet(command({sheet:{ruleset:'5e-2014',ancestry:'',className:'fighter',subclass:'',level:1,counters:[]}}));
 w.saveCharacterStats(command({stats:structuredClone(templateStats)}));
 w.bindClassResources(command({classId:'fighter',bindings:[],create:['class-fighter-second-wind']}));
 w.update({mutationId:randomUUID(),expectedRevision:w.read().revision,label:'Conditions',state:{...w.read().state,conditions:{active:['prone'],exhaustion:1}}});
 const before=w.read(),bundle=w.exportActive('with-art');assert.equal(bundle.schemaVersion,3);assert.equal(bundle.game.schemaVersion,14);
 const request={mutationId:randomUUID(),expectedRevision:before.revision,destination:'new-campaign',file:bundle},original=counts(f.db);
 f.db.exec("CREATE TRIGGER fail_combined_art BEFORE INSERT ON personal_art_versions BEGIN SELECT RAISE(ABORT,'late artwork failed');END");
 assert.throws(()=>w.importActive(request),/late artwork failed/);assert.deepEqual(w.read(),before);assert.deepEqual(counts(f.db),original);assert.equal(f.db.prepare('SELECT count(*) AS n FROM character_advancement').get().n,1);
 f.db.exec('DROP TRIGGER fail_combined_art');const imported=w.importActive(request);assert.deepEqual(imported.state.conditions,before.state.conditions);assert.deepEqual(imported.advancement,before.advancement);assert.notEqual(imported.context.characterId,before.context.characterId);
 assert.deepEqual(w.personalArt.read(imported.context.characterId,catalogId,'master').file.bytes,Buffer.from(bundle.personalArt.entries[0].png,'base64'));
 const after=counts(f.db);assert.equal(w.importActive(request).replayed,true);assert.deepEqual(counts(f.db),after);assert.equal(w.exportActive('with-art').schemaVersion,3);
});


test('new style and metamagic histories travel with personal PNGs and conditions without partial import',t=>{
 for(const classId of ['paladin','sorcerer']){
  const f=fixture(t,{classAdvancement:true}),w=f.writer,level=classId==='paladin'?1:2;
  const command=extra=>({mutationId:randomUUID(),expectedRevision:w.read().revision,characterId:w.read().context.characterId,...extra});
  w.saveCharacterSheet(command({sheet:{ruleset:'5e-2014',ancestry:'',className:classId,subclass:'',level,counters:[]}}));w.saveCharacterStats(command({stats:structuredClone(templateStats)}));
  const plan=previewClassLevel({classId,fromLevel:level,toLevel:level+1,constitution:14}),choices={};
  if(classId==='paladin')choices['paladin:2:fighting-style']=['defense'];
  else{choices['sorcerer:3:metamagic']=['careful-spell','twinned-spell'];choices['sorcerer:3:known-spells']=spellChoiceOptions('sorcerer',3,'known-spells',{knownIds:w.read().spellbook.map(e=>e.catalogId)}).slice(0,1).map(o=>o.spellId);}
  w.advanceCharacter(command({classId,fromLevel:level,hpMethod:'fixed',hpRoll:null,choices,reviewedFeatures:plan.requiresFeatureReview}));
  w.update({mutationId:randomUUID(),expectedRevision:w.read().revision,label:'Synthetic condition',state:{...w.read().state,conditions:{active:['prone'],exhaustion:1}}});
  const before=w.read(),bundle=w.exportActive('with-art'),request={mutationId:randomUUID(),expectedRevision:before.revision,destination:'new-campaign',file:bundle},original=counts(f.db);
  assert.equal(bundle.game.advancement.version,classId==='paladin'?2:3);assert.equal(bundle.schemaVersion,3);
  f.db.exec("CREATE TRIGGER reject_new_history_art BEFORE INSERT ON personal_art_versions BEGIN SELECT RAISE(ABORT,'new history artwork failed');END");
  assert.throws(()=>w.importActive(request),/new history artwork failed/);assert.deepEqual(w.read(),before);assert.deepEqual(counts(f.db),original);assert.equal(f.db.prepare('SELECT count(*) AS n FROM character_advancement').get().n,1);
  f.db.exec('DROP TRIGGER reject_new_history_art');const saved=w.importActive(request);assert.deepEqual(saved.advancement,before.advancement);assert.deepEqual(saved.state.conditions,before.state.conditions);assert.ok(w.personalArt.read(saved.context.characterId,catalogId,'master').file.bytes.equals(Buffer.from(bundle.personalArt.entries[0].png,'base64')),'Imported PNG must equal the exported normalized image');
  const after=counts(f.db);assert.equal(w.importActive(request).replayed,true);assert.deepEqual(counts(f.db),after);assert.equal(f.db.prepare('SELECT count(*) AS n FROM character_advancement').get().n,2);
 }
});
