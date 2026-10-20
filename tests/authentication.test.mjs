import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openStore} from '../server/store.mjs';
import {createAuthentication,sessionCookie,clearSessionCookie,cookieToken,SESSION_COOKIE} from '../server/authentication.mjs';
const password='correct horse battery staple';
function fixture(t){
 const file=join(mkdtempSync(join(tmpdir(),'skaz-auth-')),'auth.sqlite'),store=openStore(file);
 store.access.apply({action:'create-user',userId:'test-user',displayName:'Test'});
 const db=new DatabaseSync(file);db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000');
 let time=1_000_000;const auth=createAuthentication(db,{now:()=>time});
 t.after(()=>{db.close();store.close();});
 return {auth,db,store,file,advance:ms=>time+=ms};
}
test('credentials and sessions store only salted derivations and token digests; cookies resist ambiguity',async t=>{
 const {auth,db}=fixture(t);await auth.setPassword('test-user','Player',password);
 const row=db.prepare('SELECT * FROM auth_credentials').get();assert.equal(row.login,'player');assert.equal(row.salt.length,32);assert.equal(row.key_hex.length,64);assert.ok(!JSON.stringify(row).includes(password));
 const session=await auth.login('PLAYER',password);assert.equal(auth.authenticate(session.token),'test-user');
 assert.notEqual(db.prepare('SELECT token_hash FROM auth_sessions').get().token_hash,session.token);
 const cookie=sessionCookie(session.token);assert.match(cookie,/Secure; HttpOnly; SameSite=Strict/);assert.match(cookie,/Path=\//);assert.ok(!cookie.includes('Domain='));
 assert.equal(cookieToken('other=x; '+cookie.split(';')[0]),session.token);
 for(const value of [cookie.split(';')[0]+'; '+cookie.split(';')[0],SESSION_COOKIE+'=invalid','other='+session.token,null])assert.equal(cookieToken(value),null);
 assert.match(clearSessionCookie(),/Max-Age=0/);auth.logout(session.token);assert.equal(auth.authenticate(session.token),null);auth.logout(session.token);
});
test('password reset and disable invalidate sessions permanently; no automatic account creation',async t=>{
 const {auth,store,db}=fixture(t);await auth.setPassword('test-user','player',password);const first=await auth.login('player',password);
 await auth.setPassword('test-user','player','different long password here');assert.equal(auth.authenticate(first.token),null);
 await assert.rejects(()=>auth.login('player',password),{status:401});const second=await auth.login('player','different long password here');
 store.access.apply({action:'set-enabled',userId:'test-user',enabled:false});store.access.apply({action:'set-enabled',userId:'test-user',enabled:true});assert.equal(auth.authenticate(second.token),null);
 await assert.rejects(()=>auth.setPassword('missing-user','another',password),{status:404});assert.equal(db.prepare('SELECT count(*) AS n FROM access_users').get().n,1);
});
test('idle and absolute expiry are enforced by server clock',async t=>{
 const {auth,db,advance}=fixture(t);await auth.setPassword('test-user','player',password);
 const session=await auth.login('player',password);advance(119*60*1000);assert.equal(auth.authenticate(session.token),'test-user');
 advance(2*60*60*1000);assert.equal(auth.authenticate(session.token),null);
 const fresh=await auth.login('player',password);
 for(let i=0;i<11;i++){advance(60*60*1000);assert.equal(auth.authenticate(fresh.token),'test-user');}
 advance(60*60*1000);assert.equal(auth.authenticate(fresh.token),null);assert.equal(db.prepare('SELECT count(*) AS n FROM auth_sessions').get().n,0);
});
test('wrong and unknown accounts share error and persistent attempt budget',async t=>{
 const {auth,db}=fixture(t);await auth.setPassword('test-user','player',password);
 for(let i=0;i<5;i++)await assert.rejects(()=>auth.login('player','wrong long password value'),{status:401});
 await assert.rejects(()=>auth.login('player',password),{status:429});
 const reopened=createAuthentication(db,{now:()=>1_000_000});await assert.rejects(()=>reopened.login('player',password),{status:429});
 await assert.rejects(()=>auth.login('unknown',password),{status:401});
 for(const value of ['short',' '.repeat(129),null])await assert.rejects(()=>auth.setPassword('test-user','player',value),{status:422});
});
test('revocation during asynchronous password check cannot issue a new session',async t=>{
 const {auth,store}=fixture(t);await auth.setPassword('test-user','player',password);
 const pending=auth.login('player',password);auth.revokeAll('test-user');await assert.rejects(()=>pending,{status:401});
 const pendingDisable=auth.login('player',password);store.access.apply({action:'set-enabled',userId:'test-user',enabled:false});store.access.apply({action:'set-enabled',userId:'test-user',enabled:true});await assert.rejects(()=>pendingDisable,{status:401});
});
test('concurrent resets detect version changes and login names cannot be stolen',async t=>{
 const {auth,store}=fixture(t);await auth.setPassword('test-user','player',password);
 store.access.apply({action:'create-user',userId:'second-user',displayName:'Second'});
 await assert.rejects(()=>auth.setPassword('second-user','PLAYER',password),{status:409});
 const results=await Promise.allSettled([auth.setPassword('test-user','player','first replacement password'),auth.setPassword('test-user','player','second replacement password')]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.status,409);
});

test('HTTP cookie login reaches scoped API; CSRF, logout and disabled users fail closed',async t=>{
 const {auth,store}=fixture(t);const {createApp}=await import('../server/app.mjs');const context=store.read().context;
 store.access.apply({action:'set-member',userId:'test-user',campaignId:context.campaignId,role:'owner'});
 store.access.apply({action:'grant-character',userId:'test-user',campaignId:context.campaignId,characterId:context.characterId});
 await auth.setPassword('test-user','player',password);
 assert.throws(()=>createApp(store,{sessions:auth}));assert.throws(()=>createApp(store,{publicOrigin:'http://example.test',sessions:auth}));
 const app=createApp(store,{publicOrigin:'https://example.test',sessions:auth,individualWrites:true});
 await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>app.close(resolve)));
 const base='http://127.0.0.1:'+app.address().port;
 const api=async(route,{method='GET',body,headers={}}={})=>{
  const r=await fetch(base+route,{method,headers:{'Content-Type':'application/json','X-Skaz-Client':'local-v1',Origin:'https://example.test',...headers},body:body===undefined?undefined:JSON.stringify(body)});
  return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')};
 };
 assert.equal((await api('/api/workspace')).status,401);
 for(const origin of ['https://evil.test','null',''])assert.equal((await api('/api/auth/login',{method:'POST',body:{login:'player',password},headers:{Origin:origin}})).status,403);
 assert.equal((await api('/api/auth/login',{method:'POST',body:{login:'player',password,extra:true}})).status,422);
 assert.equal((await api('/api/auth/login',{method:'POST',body:{login:'player',password:'x'.repeat(9000)}})).status,413);
 const signed=await api('/api/auth/login',{method:'POST',body:{login:'player',password}});assert.equal(signed.status,200);assert.equal(signed.body.token,undefined);assert.match(signed.cookie,/HttpOnly/);
 const headers={'X-Skaz-Identity':'test-user',Cookie:signed.cookie.split(';')[0]};assert.equal((await api('/api/me',{headers})).body.user.id,'test-user');
 const anonymous=await fetch(base+'/');assert.match(await anonymous.text(),/login-form/);
 const page=await fetch(base+'/',{headers});assert.match(await page.text(),/data-user-id="test-user"/);assert.equal(page.headers.get('cache-control'),'no-store');
 for(const route of ['/api/workspace','/api/me'])assert.equal((await api(route,{headers:{...headers,'X-Skaz-Identity':'other-user'}})).status,401);
 assert.equal((await api('/api/auth/logout',{method:'POST',body:{},headers:{...headers,'X-Skaz-Identity':'other-user'}})).status,401);
 const workspace=(await api('/api/workspace',{headers})).body;assert.deepEqual(workspace.context,context);
 const command={mutationId:'http-session-mutation',expectedRevision:workspace.revision,label:'My health',state:{...workspace.state,hp:12}};
 assert.equal((await api('/api/workspace',{method:'PUT',body:command,headers:{...headers,Origin:''}})).status,403);
 assert.equal((await api('/api/workspace',{method:'PUT',body:command,headers})).body.state.hp,12);
 const again=await api('/api/auth/login',{method:'POST',body:{login:'player',password},headers});assert.equal(again.status,200);assert.notEqual(again.cookie,signed.cookie);assert.equal((await api('/api/me',{headers})).status,401);
 const nextHeaders={'X-Skaz-Identity':'test-user',Cookie:again.cookie.split(';')[0]};
 const out=await api('/api/auth/logout',{method:'POST',body:{},headers:nextHeaders});assert.equal(out.status,200);assert.match(out.cookie,/Max-Age=0/);assert.equal((await api('/api/me',{headers:nextHeaders})).status,401);
 assert.equal((await api('/api/auth/logout',{method:'POST',body:{}})).status,200);
});

test('captured writer cannot finish a request after its authenticated session is revoked',async t=>{
 const {store}=fixture(t),auth=store.authentication(),context=store.read().context;
 store.access.apply({action:'set-member',userId:'test-user',campaignId:context.campaignId,role:'owner'});store.access.apply({action:'grant-character',userId:'test-user',campaignId:context.campaignId,characterId:context.characterId});
 await auth.setPassword('test-user','player',password);const session=await auth.login('player',password);
 const writer=store.forUser('test-user','guarded-window',{write:true,guard:()=>{if(auth.check(session.token)!=='test-user')throw Object.assign(new Error('Expired'),{status:401});}});
 const before=writer.read(),request={mutationId:'guarded-write-request',expectedRevision:before.revision,label:'Health',state:{...before.state,hp:1}};
 auth.logout(session.token);
 assert.throws(()=>writer.update(request),{status:401});assert.throws(()=>writer.exportActive(),{status:401});assert.equal(store.read().revision,before.revision);
});
test('HTTP request with delayed body rechecks logout before applying its mutation',async t=>{
 const {store}=fixture(t),auth=store.authentication(),context=store.read().context;
 store.access.apply({action:'set-member',userId:'test-user',campaignId:context.campaignId,role:'owner'});store.access.apply({action:'grant-character',userId:'test-user',campaignId:context.campaignId,characterId:context.characterId});
 await auth.setPassword('test-user','player',password);const session=await auth.login('player',password),before=store.read();
 let entered;const checked=new Promise(resolve=>entered=resolve);
 const {createApp}=await import('../server/app.mjs'),{request}=await import('node:http');
 const app=createApp(store,{publicOrigin:'https://example.test',individualWrites:true,sessions:{...auth,authenticate:token=>{const id=auth.authenticate(token);entered();return id;}}});
 await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>app.close(resolve)));
 const payload=JSON.stringify({mutationId:'delayed-http-mutation',expectedRevision:before.revision,label:'Delayed',state:{...before.state,hp:1}});
 let outgoing;const result=new Promise((resolve,reject)=>{
  outgoing=request({host:'127.0.0.1',port:app.address().port,path:'/api/workspace',method:'PUT',headers:{'X-Skaz-Identity':'test-user',Origin:'https://example.test','X-Skaz-Client':'local-v1','Content-Type':'application/json','Content-Length':Buffer.byteLength(payload),Cookie:sessionCookie(session.token).split(';')[0]}},r=>{r.resume();r.on('end',()=>resolve(r.statusCode));});outgoing.on('error',reject);outgoing.write(payload.slice(0,1));
 });
 await checked;auth.logout(session.token);outgoing.end(payload.slice(1));assert.equal(await result,401);assert.equal(store.read().revision,before.revision);
});

test('session cap evicts oldest device while recent tokens remain valid',async t=>{
 const {auth,db,advance}=fixture(t);await auth.setPassword('test-user','player',password);const tokens=[];
 for(let i=0;i<11;i++){if(i&&i%4===0)advance(15*60*1000);tokens.push((await auth.login('player',password)).token);}
 assert.equal(db.prepare('SELECT count(*) AS n FROM auth_sessions').get().n,10);
 assert.equal(auth.authenticate(tokens[0]),null);assert.equal(auth.authenticate(tokens[1]),'test-user');assert.equal(auth.authenticate(tokens[10]),'test-user');
});

test('password derivation concurrency is bounded and rejects excess work',async t=>{
 const {auth}=fixture(t);await auth.setPassword('test-user','player',password);
 const results=await Promise.allSettled([auth.login('player',password),auth.login('player',password),auth.login('player',password)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,2);assert.equal(results.find(r=>r.status==='rejected').reason.status,503);
});

test('signed-in user without a hero receives waiting screen without game data and can retry after grant',async t=>{
 const {store,auth}=fixture(t),{createApp}=await import('../server/app.mjs');await auth.setPassword('test-user','player',password);const session=await auth.login('player',password);
 const app=createApp(store,{publicOrigin:'https://example.test',sessions:auth});await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>app.close(resolve)));
 const base='http://127.0.0.1:'+app.address().port,headers={Cookie:sessionCookie(session.token).split(';')[0]};
 const waiting=await (await fetch(base+'/',{headers})).text();assert.match(waiting,/Вход выполнен/);assert.match(waiting,/data-user-id="test-user"/);assert.ok(!waiting.includes('app.js'));
 const context=store.read().context;store.access.apply({action:'set-member',userId:'test-user',campaignId:context.campaignId,role:'player'});assert.equal(store.access.hasPlayableCharacter('test-user'),false);
 store.access.apply({action:'grant-character',userId:'test-user',campaignId:context.campaignId,characterId:context.characterId});
 const ready=await (await fetch(base+'/',{headers})).text();assert.match(ready,/app.js/);assert.ok(!ready.includes('Вход выполнен'));
 store.access.apply({action:'revoke-character',userId:'test-user',campaignId:context.campaignId,characterId:context.characterId});assert.match(await (await fetch(base+'/',{headers})).text(),/Вход выполнен/);
});

test('global login budget limits distinct names and recovers after its window',async t=>{
 const {auth,advance}=fixture(t);
 for(let i=0;i<20;i++)await assert.rejects(auth.login('unknown-'+i,password),{status:401});
 await assert.rejects(auth.login('unknown-next',password),{status:429});advance(60_001);await assert.rejects(auth.login('unknown-next',password),{status:401});
});

test('future authentication schema is refused without changing credentials or sessions',async t=>{
 const {auth,db}=fixture(t);await auth.setPassword('test-user','player',password);const session=await auth.login('player',password);
 db.prepare('UPDATE auth_schema SET version=2').run();assert.throws(()=>createAuthentication(db),/версия/);
 assert.equal(db.prepare('SELECT version FROM auth_schema').get().version,2);assert.equal(auth.check(session.token),'test-user');
 assert.equal(db.prepare('SELECT count(*) AS n FROM auth_credentials').get().n,1);
});
