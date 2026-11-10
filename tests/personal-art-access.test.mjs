import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import vm from 'node:vm';
import {openStore} from '../server/store.mjs';
import {createAccess} from '../server/access.mjs';
import {createPersonalArtAccess} from '../server/personal-art-access.mjs';
import {createApp} from '../server/app.mjs';
import {request as httpRequest} from 'node:http';
const catalogId='srd51:2014:spell:shield';
const manifest=JSON.parse(readFileSync(new URL('../catalog/art-manifest.json',import.meta.url)));
const bytes=readFileSync(new URL('../'+manifest.entries[0].files.thumbnail.path,import.meta.url));
function fixture(t){
 const dir=mkdtempSync(join(tmpdir(),'skaz-art-bridge-')),file=join(dir,'game.sqlite');
 const game=openStore(file),db=new DatabaseSync(file);db.exec('PRAGMA foreign_keys=ON');
 game.catalog.installBundled({version:game.catalog.previewBundled().version});
 t.after(()=>{db.close();game.close();rmSync(dir,{recursive:true,force:true});});
 const access=createAccess(db),context=game.read().context;
 access.apply({action:'bootstrap-owner',userId:'owner-art',displayName:'Owner',campaignId:context.campaignId,characterId:context.characterId});
 access.apply({action:'create-user',userId:'player-art',displayName:'Player'});
 access.apply({action:'set-member',userId:'player-art',campaignId:context.campaignId,role:'player'});
 access.apply({action:'grant-character',userId:'player-art',campaignId:context.campaignId,characterId:context.characterId});
 const forUser=createPersonalArtAccess(db,access);let live=true;
 const guard=()=>{if(!live)throw Object.assign(new Error('Expired'),{status:401});};
 const art=forUser('player-art',{write:true,guard});
 const request={characterId:context.characterId,catalogId,bytes,action:'set',expectedRevision:0,mutationId:randomUUID()};
 return {game,db,access,context,forUser,art,request,guard,expire:()=>{live=false;}};
}
test('trusted bridge isolates users and preserves readonly and revoked-character permissions',t=>{
 const f=fixture(t);f.art.change(f.request);
 const owner=f.forUser('owner-art',{write:true,guard:f.guard});
 assert.equal(owner.read(f.context.characterId,catalogId).standard,true);
 const reader=f.forUser('player-art',{guard:f.guard});
 assert.equal(reader.read(f.context.characterId,catalogId).revision,1);
 for(const fn of [()=>reader.change(f.request),()=>reader.cleanup(f.context.characterId,catalogId),()=>reader.importCharacter({characterId:f.context.characterId,mutationId:randomUUID(),expectedRevisions:{},bundle:f.art.exportCharacter(f.context.characterId)})])assert.throws(fn,{status:403});
 f.access.apply({action:'revoke-character',userId:'player-art',campaignId:f.context.campaignId,characterId:f.context.characterId});
 for(const fn of [()=>f.art.read(f.context.characterId,catalogId),()=>f.art.change(f.request),()=>f.art.exportCharacter(f.context.characterId)])assert.throws(fn,{status:404});
});
test('captured personal capability checks session on reads, history, export and exact retries',t=>{
 const f=fixture(t);f.art.change(f.request);const bundle=f.art.exportCharacter(f.context.characterId);
 f.expire();
 for(const fn of [()=>f.art.read(f.context.characterId,catalogId),()=>f.art.history(f.context.characterId,catalogId),()=>f.art.change(f.request),()=>f.art.cleanup(f.context.characterId,catalogId),()=>f.art.exportCharacter(f.context.characterId),()=>f.art.importCharacter({characterId:f.context.characterId,mutationId:randomUUID(),expectedRevisions:{[catalogId]:1},bundle})])assert.throws(fn,{status:401});
 assert.equal(f.db.prepare('SELECT count(*) AS n FROM personal_art_versions').get().n,1);
});
test('changed private catalog record blocks reads and retries without nested transactions',t=>{
 const f=fixture(t);f.art.change(f.request);
 const original=f.db.prepare('SELECT entry_json FROM catalog_entries WHERE id=?').get(catalogId).entry_json;
 const changed=JSON.parse(original);changed.name.ru+=' private';
 f.db.prepare('UPDATE catalog_entries SET entry_json=? WHERE id=?').run(JSON.stringify(changed),catalogId);
 assert.throws(()=>f.art.read(f.context.characterId,catalogId),{status:404});
 assert.throws(()=>f.art.change(f.request),{status:404});
 f.db.prepare('UPDATE catalog_entries SET entry_json=? WHERE id=?').run(original,catalogId);
 assert.equal(f.art.change(f.request).replayed,true);
 const bundle=f.art.exportCharacter(f.context.characterId);
 assert.equal(f.art.importCharacter({characterId:f.context.characterId,mutationId:randomUUID(),expectedRevisions:{[catalogId]:1},bundle}).entries.length,1);
 assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);
});

async function httpFixture(t,{enabled=true,write=true}={}){
 const f=fixture(t),sessions=f.game.authentication(),origin='https://skaz.test';
 await sessions.setPassword('player-art','player','test-only password phrase');
 await sessions.setPassword('owner-art','owner','other test password phrase');
 let reached;const authorized=new Promise(resolve=>{reached=resolve;});
 const app=createApp(f.game,{publicOrigin:origin,sessions,individualWrites:write,...(enabled?{personalArt:(...args)=>{const capability=f.forUser(...args);reached();return capability;}}:{})});
 await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>app.close(resolve)));
 const base='http://127.0.0.1:'+app.address().port;
 const tokens={player:await sessions.login('player','test-only password phrase'),owner:await sessions.login('owner','other test password phrase')};
 const {sessionCookie}=await import('../server/authentication.mjs');
 const headers=who=>({'Content-Type':'application/json','X-Skaz-Client':'local-v1',Origin:origin,'X-Skaz-Identity':who==='owner'?'owner-art':'player-art',Cookie:sessionCookie(tokens[who].token).split(';')[0]});
 const call=(route,{who='player',method='GET',body,extra={}}={})=>fetch(base+'/api/personal-art/'+route,{method,headers:{...headers(who),...extra},body:body===undefined?undefined:JSON.stringify(body)});
 const query=new URLSearchParams({characterId:f.context.characterId,catalogId}).toString();
 const {bytes:raw,...command}=f.request;command.png=raw.toString('base64');
 return {...f,sessions,tokens,call,query,command,base,headers,authorized};
}
test('cookie HTTP art read/write/export is personal, non-cacheable and replay safe',async t=>{
 const f=await httpFixture(t);
 let response=await f.call('change',{method:'POST',body:f.command});assert.equal(response.status,200);assert.equal((await response.json()).revision,1);
 response=await f.call('change',{method:'POST',body:f.command});assert.equal((await response.json()).replayed,true);
 response=await f.call('image?'+f.query,{extra:{'If-None-Match':'anything'}});assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);assert.equal(response.headers.get('content-type'),'image/png');assert.equal(Buffer.from(await response.arrayBuffer())[0],137);
 assert.equal((await f.call('image?'+f.query,{who:'owner'})).status,404);
 response=await f.call('image?'+f.query,{method:'HEAD'});assert.equal(response.status,200);assert.equal((await response.arrayBuffer()).byteLength,0);
 response=await f.call('export?characterId='+f.context.characterId);const bundle=await response.json();assert.equal(bundle.entries.length,1);assert.equal(bundle.userId,undefined);
 response=await f.call('import',{method:'POST',body:{characterId:f.context.characterId,mutationId:randomUUID(),expectedRevisions:{[catalogId]:1},bundle}});assert.equal(response.status,200);
 assert.equal((await f.call('change',{method:'POST',body:{...f.command,mutationId:randomUUID()}})).status,409);
 f.sessions.logout(f.tokens.player.token);
 assert.equal((await f.call('image?'+f.query,{extra:{'If-None-Match':'anything'}})).status,401);
});

test('cookie game package transfers unused catalog art and safely repeats a lost import response',async t=>{
 const f=await httpFixture(t);
 assert.equal((await f.call('change',{method:'POST',body:f.command})).status,200);
 const call=(route,{method='GET',body,who='player',extra={}}={})=>fetch(f.base+'/api/'+route,{method,headers:{...f.headers(who),...extra},body:body===undefined?undefined:JSON.stringify(body)});
 assert.equal((await call('export/active-v12')).status,409);
 const exported=await call('export/game-with-art');assert.equal(exported.status,200);assert.match(exported.headers.get('cache-control'),/no-store/);
 const file=await exported.json();assert.equal(file.personalArt.entries.length,1);assert.ok(file.game.catalog.entries.some(e=>e.id===catalogId));
 const command={mutationId:randomUUID(),expectedRevision:file.game.source.revision,destination:'new-campaign',file};
 const first=await call('import/game-with-art',{method:'POST',body:command});assert.equal(first.status,200);await first.arrayBuffer(); // Caller loses acknowledgement.
 const campaigns=f.db.prepare('SELECT count(*) AS n FROM campaigns').get().n;
 const retry=await call('import/game-with-art',{method:'POST',body:command});assert.equal(retry.status,200);const result=await retry.json();assert.equal(result.replayed,true);
 assert.equal(f.db.prepare('SELECT count(*) AS n FROM campaigns').get().n,campaigns);
 assert.notEqual(result.affectedContext.characterId,f.context.characterId);
 const newImage=await f.call('image?'+new URLSearchParams({characterId:result.affectedContext.characterId,catalogId}));assert.equal(newImage.status,200);
 assert.equal((await call('import/game-with-art',{method:'POST',body:command,who:'owner'})).status,404);
 assert.equal((await call('import/game-with-art',{method:'POST',body:command,extra:{Origin:'https://other.test'}})).status,403);
 assert.equal((await call('import/game-with-art',{method:'POST',body:command,extra:{'X-Skaz-Client':''}})).status,403);
 f.sessions.logout(f.tokens.player.token);
 assert.equal((await call('export/game-with-art')).status,401);
 assert.equal((await call('import/game-with-art',{method:'POST',body:command})).status,401);
});

test('game package routes remain disabled by default and readonly import is forbidden',async t=>{
 const f=await httpFixture(t,{enabled:false});
 for(const route of ['export/game-with-art','import/game-with-art'])assert.equal((await fetch(f.base+'/api/'+route,{headers:f.headers('player')})).status,404);
 const r=await httpFixture(t,{write:false});
 const response=await fetch(r.base+'/api/export/game-with-art',{headers:r.headers('player')});assert.equal(response.status,200);const file=await response.json();
 const imported=await fetch(r.base+'/api/import/game-with-art',{method:'POST',headers:r.headers('player'),body:JSON.stringify({mutationId:randomUUID(),expectedRevision:file.game.source.revision,destination:'new-campaign',file})});assert.equal(imported.status,403);
});

test('large game transfer has a bounded body and does not raise the ordinary mutation limit',async t=>{
 const f=await httpFixture(t),before=f.game.read();
 async function oversized(route,length){
  return new Promise((resolve,reject)=>{
   const request=httpRequest(f.base+'/api/'+route,{method:'POST',headers:{...f.headers('player'),'Content-Length':length}},response=>{
    response.resume();response.on('end',()=>{request.destroy();resolve(response.statusCode);});
   });request.on('error',reject);request.write('{');
  });
 }
 assert.equal(await oversized('import/game-with-art',64*1024*1024+4097),413);
 assert.equal(await oversized('import/active',512*1024+1),413);
 assert.deepEqual(f.game.read(),before);
});
test('browser transport works with actual cookie HTTP and rejects identity change and revoked access',async t=>{
 const f=await httpFixture(t),context=vm.createContext({URLSearchParams,AbortController,AbortSignal});
 vm.runInContext(readFileSync(new URL('../client/personal-art-transport.js',import.meta.url),'utf8')+';globalThis.transport=SkazPersonalArtTransport;',context);
 let who='player';
 const client=context.transport.create({identity:'player-art',characterId:f.context.characterId,catalogId,request:(url,options)=>fetch(f.base+url,{...options,headers:{...f.headers(who),...options.headers}})});
 t.after(()=>client.destroy());const binding={characterId:f.context.characterId,catalogId};
 assert.equal((await client.snapshot(binding)).standard,true);
 assert.equal((await client.change(JSON.stringify(f.command))).revision,1);
 const current=await client.snapshot(binding);assert.equal(current.revision,1);assert.equal(new Uint8Array(await current.blob.arrayBuffer())[0],137);
 who='owner';await assert.rejects(client.snapshot(binding),{status:401});who='player';
 f.access.apply({action:'revoke-character',userId:'player-art',campaignId:f.context.campaignId,characterId:f.context.characterId});
 await assert.rejects(client.snapshot(binding),{status:404});
 await assert.rejects(client.change(JSON.stringify(f.command)),{status:404});
 assert.equal(f.db.prepare('SELECT count(*) AS n FROM personal_art_versions').get().n,1);
});
test('HTTP rejects forged identity, CSRF, bad payloads, invalid image and ambiguous query',async t=>{
 const f=await httpFixture(t);
 for(const extra of [{Origin:'https://evil.test'},{Origin:''},{'X-Skaz-Client':''}])assert.equal((await f.call('change',{method:'POST',body:f.command,extra})).status,403);
 assert.equal((await f.call('change',{method:'POST',body:f.command,extra:{'X-Skaz-Identity':'owner-art'}})).status,401);
 for(const body of [{...f.command,userId:'owner-art'},{...f.command,png:'data:image/png;base64,'+f.command.png},{...f.command,png:'PHN2Zz4='},{...f.command,png:f.command.png+'\n'},{...f.command,action:'reset'}])assert.equal((await f.call('change',{method:'POST',body})).status,422);
 assert.equal((await f.call('image?'+f.query+'&catalogId='+catalogId)).status,422);
 assert.equal((await f.call('image?'+f.query+'&userId=owner-art')).status,422);
 assert.equal((await f.call('change?extra=1',{method:'POST',body:f.command})).status,422);
 assert.equal((await f.call('image?'+f.query,{method:'DELETE'})).status,405);
 assert.equal(f.db.prepare('SELECT count(*) AS n FROM personal_art_versions').get().n,0);
});
test('HTTP disabled feature remains closed and requires cookie-session authentication',async t=>{
 const f=await httpFixture(t,{enabled:false});
 assert.equal((await f.call('change',{method:'POST',body:f.command})).status,404);
 assert.throws(()=>createApp(f.game,{authenticate:()=> 'player-art',personalArt:f.forUser}),/cookie/);
});

test('usage and scoped cleanup retain cookie isolation, readonly permissions and strict fields',async t=>{
 const f=await httpFixture(t);await f.call('change',{method:'POST',body:f.command});
 const route='usage?characterId='+f.context.characterId;
 const response=await f.call(route);assert.match(response.headers.get('cache-control'),/no-store/);assert.equal((await response.json()).versions,1);
 assert.equal((await (await f.call(route,{who:'owner'})).json()).versions,0);
 const scope={characterId:f.context.characterId,catalogId};
 assert.equal((await (await f.call('cleanup',{method:'POST',body:scope})).json()).removed,0);
 assert.equal((await f.call('cleanup',{method:'POST',body:{...scope,userId:'owner-art'}})).status,422);
 assert.equal((await f.call('cleanup',{method:'POST',body:scope,extra:{Origin:'https://other.test'}})).status,403);
 f.access.apply({action:'revoke-character',userId:'player-art',campaignId:f.context.campaignId,characterId:f.context.characterId});
 assert.equal((await f.call(route)).status,404);assert.equal((await f.call('cleanup',{method:'POST',body:scope})).status,404);
 const r=await httpFixture(t,{write:false});assert.equal((await r.call('cleanup',{method:'POST',body:{characterId:r.context.characterId,catalogId}})).status,403);
});
test('session revoked while HTTP upload is streaming cannot commit or replay',async t=>{
 const f=await httpFixture(t),payload=JSON.stringify(f.command);
 let request;
 const response=new Promise((resolve,reject)=>{
  request=httpRequest(f.base+'/api/personal-art/change',{method:'POST',headers:{...f.headers('player'),'Content-Length':Buffer.byteLength(payload)}},r=>{r.resume();r.on('end',()=>resolve(r.statusCode));});request.on('error',reject);request.write(payload.slice(0,10));
 });
 await f.authorized;f.sessions.logout(f.tokens.player.token);request.end(payload.slice(10));
 assert.equal(await response,401);
 assert.equal(f.db.prepare('SELECT count(*) AS n FROM personal_art_versions').get().n,0);
});

test('session revoked during game-package upload leaves no new game or image',async t=>{
 const f=await httpFixture(t);await f.call('change',{method:'POST',body:f.command});
 const file=await (await fetch(f.base+'/api/export/game-with-art',{headers:f.headers('player')})).json();
 const payload=JSON.stringify({mutationId:randomUUID(),expectedRevision:file.game.source.revision,destination:'new-campaign',file});
 const before=f.game.read(),campaigns=f.db.prepare('SELECT count(*) AS n FROM campaigns').get().n;
 const original=f.game.forUser;let reached;
 const authorized=new Promise(resolve=>{reached=resolve;});
 f.game.forUser=(...args)=>{const result=original(...args);reached();return result;};
 t.after(()=>{f.game.forUser=original;});
 let request;const response=new Promise((resolve,reject)=>{
  request=httpRequest(f.base+'/api/import/game-with-art',{method:'POST',headers:{...f.headers('player'),'Content-Length':Buffer.byteLength(payload)}},r=>{r.resume();r.on('end',()=>resolve(r.statusCode));});request.on('error',reject);request.write(payload.slice(0,10));
 });
 await authorized;f.sessions.logout(f.tokens.player.token);request.end(payload.slice(10));
 assert.equal(await response,401);assert.deepEqual(f.game.read(),before);
 assert.equal(f.db.prepare('SELECT count(*) AS n FROM campaigns').get().n,campaigns);
 assert.equal(f.db.prepare('SELECT count(*) AS n FROM personal_art_versions').get().n,1);
});
test('HTTP readonly mode and revoked character block image mutations and reads',async t=>{
 const f=await httpFixture(t,{write:false});f.art.change(f.request);
 assert.equal((await f.call('image?'+f.query)).status,200);
 assert.equal((await f.call('change',{method:'POST',body:f.command})).status,403);
 f.access.apply({action:'revoke-character',userId:'player-art',campaignId:f.context.campaignId,characterId:f.context.characterId});
 assert.equal((await f.call('image?'+f.query)).status,404);
});
