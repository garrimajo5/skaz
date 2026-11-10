import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync,backup} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPersonalArtStore,personalArtRetentionMs} from '../server/personal-art-store.mjs';
import {normalizePersonalArt} from '../server/personal-art-image.mjs';
import {openStore} from '../server/store.mjs';

const manifest=JSON.parse(readFileSync(new URL('../catalog/art-manifest.json',import.meta.url)));
const source=readFileSync(new URL('../'+manifest.entries[0].files.thumbnail.path,import.meta.url));
const catalogId='srd51:2014:spell:shield',characterId='character-one';
const command=(extra={})=>({characterId,catalogId,mutationId:randomUUID(),expectedRevision:0,action:'set',bytes:source,...extra});
function fixture(t,options={}){
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());
 db.exec("PRAGMA foreign_keys=ON; CREATE TABLE access_users(id TEXT PRIMARY KEY); CREATE TABLE characters(id TEXT PRIMARY KEY); INSERT INTO access_users VALUES ('alice'),('boris'); INSERT INTO characters VALUES ('character-one'),('character-two');");
 const grants=new Set(['alice/character-one','boris/character-one','alice/character-two']);let writable=true;
 const adapters={authorize:(u,c,w)=>grants.has(u+'/'+c)&&(!w||writable),catalogExists:id=>[catalogId,'srd51:2014:spell:aid'].includes(id),...options};
 const store=createPersonalArtStore(db,adapters);
 return {db,store,adapters,grants,alice:store.forUser('alice'),boris:store.forUser('boris'),readonly:()=>{writable=false;}};
}
test('same hero and catalog entry remain personal to each actor; bytes are defensive copies',t=>{
 const {alice,boris}=fixture(t);alice.change(command());
 assert.equal(boris.read(characterId,catalogId).standard,true);
 assert.equal(alice.read('character-two',catalogId).standard,true);
 const first=alice.read(characterId,catalogId,'master');assert.equal(first.revision,1);
 first.file.bytes[0]=0;assert.equal(alice.read(characterId,catalogId,'master').file.bytes[0],137);
 assert.throws(()=>boris.read('character-two',catalogId),{status:404});
});

test('usage includes own history across heroes without exposing another users bytes or mutable policy',t=>{
 const {alice,boris,grants}=fixture(t);alice.change(command());alice.change(command({characterId:'character-two'}));
 const usage=alice.usage(characterId);assert.equal(usage.versions,2);assert.equal(usage.bindings,2);assert.ok(usage.bytes>0);assert.equal(usage.retentionDays,30);
 assert.equal(boris.usage(characterId).bytes,0);usage.limits.bytes=0;assert.ok(alice.usage(characterId).limits.bytes>0);
 alice.change(command({action:'reset',bytes:undefined,expectedRevision:1}));assert.equal(alice.usage(characterId).bytes,usage.bytes);
 grants.delete('alice/'+characterId);assert.throws(()=>alice.usage(characterId),{status:404});
});

test('unversioned personal art migrates in place, retaining bytes and receipts; future schemas fail closed',t=>{
 const {db,alice,adapters}=fixture(t),request=command();alice.change(request);
 const before=alice.exportCharacter(characterId);db.exec('DROP TABLE personal_art_schema');
 const migrated=createPersonalArtStore(db,adapters).forUser('alice');
 assert.equal(db.prepare('SELECT version FROM personal_art_schema').get().version,1);
 assert.deepEqual(migrated.exportCharacter(characterId),before);assert.equal(migrated.change(request).replayed,true);
 db.exec('UPDATE personal_art_schema SET version=99');
 assert.throws(()=>createPersonalArtStore(db,adapters),/Неподдерживаемая версия/);
 assert.equal(db.prepare('SELECT version FROM personal_art_schema').get().version,99);
 assert.equal(db.prepare('SELECT count(*) AS n FROM personal_art_versions').get().n,1);
});

test('missing versioned storage is not silently recreated as an empty art library',t=>{
 const {db,adapters}=fixture(t);db.exec('DROP TABLE personal_art_imports');
 assert.throws(()=>createPersonalArtStore(db,adapters),/требуется восстановление/);
 assert.equal(db.prepare("SELECT 1 FROM sqlite_master WHERE name='personal_art_imports'").get(),undefined);
});
test('personal import joins an outer game transaction without committing it and rolls back with it',t=>{
 const {db,alice}=fixture(t);alice.change(command());const bundle=alice.exportCharacter('character-one');
 const request={characterId:'character-two',mutationId:randomUUID(),expectedRevisions:{[catalogId]:0},bundle};
 db.exec('BEGIN IMMEDIATE');
 alice.importCharacter(request);assert.equal(db.isTransaction,true);
 assert.equal(alice.read('character-two',catalogId).revision,1);
 db.exec('ROLLBACK');assert.equal(alice.read('character-two',catalogId).revision,0);
 assert.equal(db.prepare('SELECT count(*) AS n FROM personal_art_imports').get().n,0);
 db.exec('BEGIN IMMEDIATE');alice.importCharacter(request);db.exec('COMMIT');
 assert.equal(alice.read('character-two',catalogId).revision,1);
});
test('failed nested art mutation preserves the outer transaction for caller rollback',t=>{
 const {db,alice}=fixture(t);alice.change(command());
 db.exec('BEGIN IMMEDIATE');db.prepare("INSERT INTO characters VALUES ('outer-new-character')").run();
 assert.throws(()=>alice.change(command()),{status:409});
 assert.equal(db.isTransaction,true);
 assert.equal(db.prepare("SELECT count(*) AS n FROM characters WHERE id='outer-new-character'").get().n,1);
 db.exec('ROLLBACK');assert.equal(db.prepare("SELECT count(*) AS n FROM characters WHERE id='outer-new-character'").get().n,0);
 assert.equal(alice.history('character-one',catalogId).length,1);
});
test('receipts are idempotent, actor scoped and cannot be repurposed for another binding',t=>{
 const {alice,boris}=fixture(t),c=command();
 assert.equal(alice.change(c).replayed,false);assert.equal(alice.change(c).replayed,true);
 assert.equal(boris.change(c).replayed,false);
 assert.throws(()=>alice.change({...c,catalogId:'srd51:2014:spell:aid'}),{status:409});
 assert.throws(()=>alice.change(command()),{status:409});
 assert.equal(alice.history(characterId,catalogId).length,1);
});
test('revoked grant blocks reads, history and exact replay; read-only guard blocks writes',t=>{
 const f=fixture(t),c=command();f.alice.change(c);f.grants.delete('alice/character-one');
 for(const fn of [()=>f.alice.read(characterId,catalogId),()=>f.alice.history(characterId,catalogId),()=>f.alice.change(c)])assert.throws(fn,{status:404});
 f.grants.add('alice/character-one');f.readonly();assert.equal(f.alice.read(characterId,catalogId).revision,1);assert.throws(()=>f.alice.change(c),{status:404});
});
test('reset and addressed restoration preserve history and reject stale writes',t=>{
 const {alice}=fixture(t);alice.change(command());const initial=alice.read(characterId,catalogId,'master').file;
 alice.change(command({expectedRevision:1,action:'reset',bytes:undefined}));assert.equal(alice.read(characterId,catalogId).file,null);
 assert.throws(()=>alice.change(command({expectedRevision:1})),{status:409});
 alice.change(command({expectedRevision:2,action:'restore',bytes:undefined,targetRevision:1}));
 assert.deepEqual(alice.read(characterId,catalogId,'master').file,initial);
 alice.change(command({expectedRevision:3,action:'restore',bytes:undefined,targetRevision:2}));
 assert.equal(alice.read(characterId,catalogId).standard,true);
 assert.deepEqual(alice.history(characterId,catalogId).map(r=>r.standard),[true,false,true,false]);
 assert.throws(()=>alice.change(command({expectedRevision:4,action:'restore',bytes:undefined,targetRevision:99})),{status:404});
});
test('quota includes retained versions; failed update leaves no receipt or partial data',t=>{
 const normalized=normalizePersonalArt(source),bytes=Object.values(normalized.files).reduce((n,f)=>n+f.bytes.length,0);
 const {alice,db}=fixture(t,{limits:{bytes,versions:3}});alice.change(command());
 assert.throws(()=>alice.change(command({expectedRevision:1})),{status:409});
 assert.equal(db.prepare('SELECT count(*) AS n FROM personal_art_versions').get().n,1);
 alice.change(command({expectedRevision:1,action:'reset',bytes:undefined}));
 assert.throws(()=>alice.change(command({expectedRevision:2,action:'restore',bytes:undefined,targetRevision:1})),{status:409});
 assert.equal(alice.read(characterId,catalogId).revision,2);
});
test('full image quota still allows reset; repeated standard resets consume no rows',t=>{
 const {alice}=fixture(t,{limits:{bytes:1000000,versions:1}});
 const reset=command({expectedRevision:1,action:'reset',bytes:undefined});
 alice.change(command());assert.equal(alice.change(reset).standard,true);
 assert.equal(alice.change(reset).replayed,true);
 for(let i=0;i<20;i++)assert.equal(alice.change(command({expectedRevision:2,action:'reset',bytes:undefined})).unchanged,true);
 for(let i=0;i<20;i++)assert.equal(alice.change(command({expectedRevision:2,action:'restore',bytes:undefined,targetRevision:2})).unchanged,true);
 assert.equal(alice.history(characterId,catalogId).length,2);
 assert.equal(alice.change(command({characterId:'character-two',action:'reset',bytes:undefined})).revision,0);
 assert.throws(()=>alice.change(command({characterId:'character-two'})),{status:409});
});

test('cleanup expires only old history, retains current tombstone and rejects expired retries',t=>{
 let time=Date.UTC(2026,0,1);const {alice}=fixture(t,{now:()=>time,limits:{versions:1}});
 const original=command();alice.change(original);
 alice.change(command({expectedRevision:1,action:'reset',bytes:undefined}));
 time+=personalArtRetentionMs;
 assert.equal(alice.cleanup(characterId,catalogId).removed,0);
 time++;
 assert.equal(alice.cleanup(characterId,catalogId).removed,1);
 assert.equal(alice.read(characterId,catalogId).revision,2);
 assert.throws(()=>alice.change(original),{status:409});
 assert.throws(()=>alice.change(command({expectedRevision:2,action:'restore',bytes:undefined,targetRevision:1})),{status:404});
 assert.equal(alice.change(command({expectedRevision:2})).revision,3);
 assert.equal(alice.history(characterId,catalogId).length,2);
});

test('cleanup cannot remove current art or act on another actor, character or revoked grant',t=>{
 let time=Date.UTC(2026,0,1);const f=fixture(t,{now:()=>time});
 f.alice.change(command());f.boris.change(command());
 f.alice.change(command({characterId:'character-two'}));
 f.alice.change(command({expectedRevision:1,action:'reset',bytes:undefined}));
 time+=personalArtRetentionMs+1;
 assert.equal(f.alice.cleanup(characterId,catalogId).removed,1);
 assert.equal(f.boris.read(characterId,catalogId).standard,false);
 assert.equal(f.alice.cleanup('character-two',catalogId).removed,0);
 assert.equal(f.alice.read('character-two',catalogId).standard,false);
 f.readonly();assert.throws(()=>f.alice.cleanup(characterId,catalogId),{status:404});
 f.grants.delete('alice/character-one');assert.throws(()=>f.alice.cleanup(characterId,catalogId),{status:404});
});

test('current version stays protected by quota; binding limit never prevents reset',t=>{
 let time=Date.UTC(2026,0,1);const {alice}=fixture(t,{now:()=>time,limits:{versions:1,bindings:1}});
 alice.change(command());time+=personalArtRetentionMs+1;
 // Latest image remains protected even when old, so replacing it needs room.
 assert.throws(()=>alice.change(command({expectedRevision:1})),{status:409});
 assert.equal(alice.history(characterId,catalogId).length,1);
 alice.change(command({expectedRevision:1,action:'reset',bytes:undefined}));
 assert.equal(alice.cleanup(characterId,catalogId).removed,0);
 time+=personalArtRetentionMs+1;assert.equal(alice.cleanup(characterId,catalogId).removed,1);
 assert.throws(()=>alice.change(command({characterId:'character-two'})),{status:409});
 assert.equal(alice.change(command({expectedRevision:2})).revision,3);
});
test('corrupt or missing stored bytes fail explicitly, and a reset still recovers standard art',t=>{
 const {alice,db}=fixture(t);alice.change(command());
 db.prepare('UPDATE personal_art_versions SET master=?').run(Buffer.from('broken'));
 assert.throws(()=>alice.read(characterId,catalogId,'master'),{status:409});
 assert.throws(()=>alice.change(command({expectedRevision:1,action:'restore',bytes:undefined,targetRevision:1})),{status:409});
 alice.change(command({expectedRevision:1,action:'reset',bytes:undefined}));assert.equal(alice.read(characterId,catalogId).standard,true);
});
test('invalid input, catalog IDs and unknown fields do not write anything',t=>{
 const {alice,db}=fixture(t);
 for(const c of [command({bytes:Buffer.from('<svg/>')}),command({crop:{x:0,y:0,size:99999}}),command({url:'evil'}),command({action:'reset'}),command({targetRevision:1})])assert.throws(()=>alice.change(c),{status:422});
 assert.throws(()=>alice.change(command({catalogId:'not-in-catalog'})),{status:404});
 assert.equal(db.prepare('SELECT count(*) AS n FROM personal_art_versions').get().n,0);
});
test('SQLite online backup transfers normalized bytes, history and replay receipts together',async t=>{
 const f=fixture(t),c=command();f.alice.change(c);
 const transferred={characterId:'character-two',mutationId:randomUUID(),expectedRevisions:{[catalogId]:0},bundle:f.alice.exportCharacter(characterId)};
 f.alice.importCharacter(transferred);
 f.alice.change(command({expectedRevision:1,action:'reset',bytes:undefined}));
 const dir=mkdtempSync(join(tmpdir(),'skaz-personal-art-'));let restored;t.after(()=>{restored?.close();rmSync(dir,{recursive:true,force:true});});
 const path=join(dir,'backup.sqlite');await backup(f.db,path);
 restored=new DatabaseSync(path);
 const user=createPersonalArtStore(restored,f.adapters).forUser('alice');
 assert.deepEqual(user.history(characterId,catalogId),f.alice.history(characterId,catalogId));
 assert.equal(user.change(c).replayed,true);
 assert.equal(user.importCharacter(transferred).replayed,true);
 assert.deepEqual(user.read('character-two',catalogId,'master').file.bytes,normalizePersonalArt(source).files.master.bytes);
 user.change(command({expectedRevision:2,action:'restore',bytes:undefined,targetRevision:1}));
 assert.deepEqual(user.read(characterId,catalogId,'master').file.bytes,normalizePersonalArt(source).files.master.bytes);
 assert.equal(restored.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
});

test('real campaign grants and account disabling are checked on every stored-art access',t=>{
 const dir=mkdtempSync(join(tmpdir(),'skaz-personal-access-')),path=join(dir,'game.sqlite');
 const game=openStore(path),db=new DatabaseSync(path);db.exec('PRAGMA foreign_keys=ON');
 t.after(()=>{db.close();game.close();rmSync(dir,{recursive:true,force:true});});
 const ctx=game.read().context,userId='art-test-owner',otherId='art-test-player';
 game.access.apply({action:'bootstrap-owner',userId,displayName:'Art owner',campaignId:ctx.campaignId,characterId:ctx.characterId});
 game.access.apply({action:'create-user',userId:otherId,displayName:'Art player'});
 game.access.apply({action:'set-member',userId:otherId,campaignId:ctx.campaignId,role:'player'});
 game.access.apply({action:'grant-character',userId:otherId,campaignId:ctx.campaignId,characterId:ctx.characterId});
 const art=createPersonalArtStore(db,{authorize:(u,c)=>{game.access.character(u,ctx.campaignId,c);return true;},catalogExists:()=>true}).forUser(otherId);
 const request=command({characterId:ctx.characterId});art.change(request);
 game.access.apply({action:'revoke-character',userId:otherId,campaignId:ctx.campaignId,characterId:ctx.characterId});
 assert.throws(()=>art.change(request),{status:404});assert.throws(()=>art.read(ctx.characterId,catalogId),{status:404});
 game.access.apply({action:'grant-character',userId:otherId,campaignId:ctx.campaignId,characterId:ctx.characterId});
 assert.equal(art.read(ctx.characterId,catalogId).revision,1);
 game.access.apply({action:'set-enabled',userId:otherId,enabled:false});assert.throws(()=>art.history(ctx.characterId,catalogId),{status:404});
 assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
});

test('personal companion transfer copies only current owned images to explicitly chosen character',t=>{
 const {alice,boris}=fixture(t);alice.change(command());
 boris.change(command({catalogId:'srd51:2014:spell:aid'}));
 const bundle=alice.exportCharacter(characterId);
 assert.deepEqual(bundle.entries.map(e=>e.catalogId),[catalogId]);
 const request={characterId:'character-two',mutationId:randomUUID(),expectedRevisions:{[catalogId]:0},bundle};
 alice.importCharacter(request);
 assert.deepEqual(alice.read('character-two',catalogId,'master').file.bytes,alice.read(characterId,catalogId,'master').file.bytes);
 assert.equal(alice.importCharacter(request).replayed,true);
 assert.throws(()=>alice.importCharacter({...request,bundle:{...bundle,entries:[]},expectedRevisions:{}}),{status:409});
 assert.equal(alice.read(characterId,catalogId).revision,1);
 alice.change(command({expectedRevision:1,action:'reset',bytes:undefined}));
 assert.equal(alice.exportCharacter(characterId).entries.length,0);
});

test('multi-image transfer rolls back all preceding images and receipts on a later conflict',t=>{
 const {alice,db}=fixture(t),aid='srd51:2014:spell:aid';
 alice.change(command());alice.change(command({catalogId:aid}));
 const bundle=alice.exportCharacter(characterId);
 alice.change(command({characterId:'character-two'}));
 const request={characterId:'character-two',mutationId:randomUUID(),expectedRevisions:{[aid]:0,[catalogId]:0},bundle};
 assert.throws(()=>alice.importCharacter(request),{status:409});
 assert.equal(alice.read('character-two',aid).revision,0);
 assert.equal(db.prepare('SELECT count(*) AS n FROM personal_art_imports').get().n,0);
 request.expectedRevisions[catalogId]=1;
 assert.equal(alice.importCharacter(request).entries.length,2);
 assert.equal(alice.read('character-two',aid).revision,1);
});

test('transfer rejects missing catalog, bad SHA, unknown fields, malformed base64 and corrupt exports',t=>{
 const {alice,db}=fixture(t);alice.change(command());const original=alice.exportCharacter(characterId);
 const send=bundle=>alice.importCharacter({characterId:'character-two',mutationId:randomUUID(),expectedRevisions:Object.fromEntries(bundle.entries.map(e=>[e.catalogId,0])),bundle});
 for(const edit of [b=>b.entries.push({...b.entries[0]}),b=>b.entries[0].sha256='0'.repeat(64),b=>b.entries[0].png+='\n',b=>b.entries[0].url='https://invalid.test',b=>b.ruleset='5e-2024']){
  const b=structuredClone(original);edit(b);assert.throws(()=>send(b),{status:422});
 }
 const missing=structuredClone(original);missing.entries[0].catalogId='missing-entry';assert.throws(()=>send(missing),{status:404});
 assert.equal(alice.read('character-two',catalogId).revision,0);
 db.prepare('UPDATE personal_art_versions SET master=?').run(Buffer.from('missing'));
 assert.throws(()=>alice.exportCharacter(characterId),{status:409});
});

test('transfer replay rechecks access and cannot acquire source identity from the bundle',t=>{
 const f=fixture(t);f.alice.change(command());const bundle=f.alice.exportCharacter(characterId);
 const request={characterId:'character-two',mutationId:randomUUID(),expectedRevisions:{[catalogId]:0},bundle};f.alice.importCharacter(request);
 assert.throws(()=>f.boris.importCharacter(request),{status:404});
 f.grants.delete('alice/character-two');assert.throws(()=>f.alice.importCharacter(request),{status:404});
 assert.throws(()=>f.alice.exportCharacter('character-two'),{status:404});
 f.grants.add('alice/character-two');f.readonly();assert.throws(()=>f.alice.importCharacter(request),{status:404});
});

test('expired batch receipts cannot replay an import after its images were reset and pruned',t=>{
 let time=Date.UTC(2026,0,1);const {alice,db}=fixture(t,{now:()=>time});
 alice.change(command());const bundle=alice.exportCharacter(characterId);
 const request={characterId:'character-two',mutationId:randomUUID(),expectedRevisions:{[catalogId]:0},bundle};
 alice.importCharacter(request);
 alice.change(command({characterId:'character-two',expectedRevision:1,action:'reset',bytes:undefined}));
 time+=personalArtRetentionMs+1;
 alice.cleanup('character-two',catalogId);
 const aid='srd51:2014:spell:aid',other=structuredClone(bundle);other.entries[0].catalogId=aid;
 alice.importCharacter({characterId:'character-two',mutationId:randomUUID(),expectedRevisions:{[aid]:0},bundle:other});
 assert.equal(db.prepare('SELECT count(*) AS n FROM personal_art_imports WHERE mutation_id=?').get(request.mutationId).n,0);
 assert.throws(()=>alice.importCharacter(request),{status:409});
 assert.equal(alice.read('character-two',catalogId).revision,2);
 assert.equal(alice.read('character-two',catalogId).standard,true);
});

test('failed quota check restores history deleted earlier in the same transaction',t=>{
 let time=Date.UTC(2026,0,1);
 const small=normalizePersonalArt(source),cost=Object.values(small.files).reduce((n,f)=>n+f.bytes.length,0);
 const big=readFileSync(new URL('../'+manifest.entries[0].files.original.path,import.meta.url));
 const large=normalizePersonalArt(big);assert.ok(Object.values(large.files).reduce((n,f)=>n+f.bytes.length,0)>cost*2);
 const {alice}=fixture(t,{now:()=>time,limits:{bytes:cost*2,versions:10}});
 alice.change(command());alice.change(command({expectedRevision:1}));
 time+=personalArtRetentionMs+1;
 const before=alice.history(characterId,catalogId);
 assert.throws(()=>alice.change(command({expectedRevision:2,bytes:big})),{status:409});
 assert.deepEqual(alice.history(characterId,catalogId),before);
 assert.equal(alice.cleanup(characterId,catalogId).removed,1);
});
