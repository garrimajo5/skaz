import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync,backup} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPersonalArtStore} from '../server/personal-art-store.mjs';
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
test('version quota also bounds reset-only commands and cross-character usage',t=>{
 const {alice}=fixture(t,{limits:{bytes:1000000,versions:1}});
 alice.change(command({action:'reset',bytes:undefined}));
 assert.throws(()=>alice.change(command({characterId:'character-two',action:'reset',bytes:undefined})),{status:409});
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
 f.alice.change(command({expectedRevision:1,action:'reset',bytes:undefined}));
 const dir=mkdtempSync(join(tmpdir(),'skaz-personal-art-'));let restored;t.after(()=>{restored?.close();rmSync(dir,{recursive:true,force:true});});
 const path=join(dir,'backup.sqlite');await backup(f.db,path);
 restored=new DatabaseSync(path);
 const user=createPersonalArtStore(restored,f.adapters).forUser('alice');
 assert.deepEqual(user.history(characterId,catalogId),f.alice.history(characterId,catalogId));
 assert.equal(user.change(c).replayed,true);
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
