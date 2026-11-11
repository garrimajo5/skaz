import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,stat,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {prepareAuthFixture,serveAuthFixture} from '../scripts/auth-fixture.mjs';
import {accessReadiness} from '../scripts/access-readiness.mjs';

const credentialName='skaz-fixture-credentials.json';
async function directory(){return path.join(await mkdtemp(path.join(tmpdir(),'skaz-auth-fixture-')),'new');}
function gameSnapshot(database){
 const db=new DatabaseSync(database,{readOnly:true});
 try{return ['workspace','campaigns','characters','sessions','changes'].map(name=>db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all());}finally{db.close();}
}

test('synthetic fixture creates private independent users without touching an existing directory',async()=>{
 const folder=await directory(),result=await prepareAuthFixture(folder,'https://fixture.example:8443');
 const file=path.join(folder,'fixture.sqlite'),before=await readFile(file),manifest=JSON.parse(await readFile(path.join(folder,'fixture.json'),'utf8'));
 const secrets=JSON.parse(await readFile(path.join(folder,credentialName),'utf8'));
 assert.equal(result.syntheticOnly,true);assert.equal(manifest.id,secrets.id);assert.equal(new Set(secrets.credentials.map(user=>user.password)).size,3);
 for(const user of secrets.credentials){assert.equal(user.password.length,32);assert.ok(!JSON.stringify(result).includes(user.password));assert.ok(!JSON.stringify(manifest).includes(user.password));}
 const report=accessReadiness(file);assert.deepEqual(report.blockers,['user-without-usable-character']);assert.equal(report.campaigns[0].unassignedCharacters,0);assert.equal(report.enabledUsers.filter(user=>user.credentialsValid).length,3);
 const db=new DatabaseSync(file,{readOnly:true});assert.equal(db.prepare('SELECT count(*) AS n FROM auth_sessions').get().n,0);assert.equal(db.prepare('SELECT count(*) AS n FROM characters').get().n,2);db.close();
 await assert.rejects(prepareAuthFixture(folder,'https://fixture.example:8443'),error=>error.code==='EEXIST');assert.deepEqual(await readFile(file),before);
 if(process.platform!=='win32')for(const [name,mode]of [['',0o700],['fixture.sqlite',0o600],[credentialName,0o600],['fixture.json',0o600]])assert.equal((await stat(path.join(folder,name))).mode&0o777,mode);
});

test('fixture refuses invalid origins before creating files, unrelated databases and unsafe ports',async()=>{
 const folder=await directory();
 for(const origin of ['http://localhost:4177','https://user:secret@example.test','https://example.test/path'])await assert.rejects(prepareAuthFixture(folder,origin));
 await assert.rejects(stat(folder),error=>error.code==='ENOENT');
 await prepareAuthFixture(folder,'https://fixture.example');
 for(const port of [-1,65536,1.5,'4177'])await assert.rejects(serveAuthFixture(folder,port));
 const file=path.join(folder,'fixture.sqlite'),db=new DatabaseSync(file);db.exec('DROP TABLE auth_fixture_marker');db.close();const before=await readFile(file);
 await assert.rejects(serveAuthFixture(folder,0));assert.deepEqual(await readFile(file),before);
});

test('fixture CLI preparation runs through the current release symlink',{skip:process.platform==='win32'},async()=>{
 const folder=await directory(),link=path.join(path.dirname(folder),'current');
 await symlink(fileURLToPath(new URL('../',import.meta.url)),link,'dir');
 const result=spawnSync(process.execPath,[path.join(link,'scripts/auth-fixture.mjs'),'prepare',folder,'https://fixture.example:8443'],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).prepared,true);
 assert.equal(JSON.parse(await readFile(path.join(folder,'fixture.json'),'utf8')).kind,'skaz-synthetic-auth-fixture');
});

test('loopback fixture runs actual sessions, waiting assignment and withdrawal without changing games',async t=>{
 const folder=await directory(),prepared=await prepareAuthFixture(folder,'https://fixture.example:8443'),fixture=await serveAuthFixture(folder,0);t.after(()=>fixture.close());
 assert.equal(fixture.server.address().address,'127.0.0.1');
 const origin=prepared.origin,url='http://127.0.0.1:'+fixture.server.address().port,users=JSON.parse(await readFile(path.join(folder,credentialName),'utf8')).credentials;
 const game=gameSnapshot(path.join(folder,'fixture.sqlite'));
 async function request(route,{user,cookie,method='GET',body}={}){
  return fetch(url+route,{method,headers:{Origin:origin,'X-Skaz-Client':'local-v1',...(user?{'X-Skaz-Identity':user.id}:{}),...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 }
 assert.equal((await request('/api/workspace')).status,401);
 const cookies=[];
 for(const user of users){const reply=await request('/api/auth/login',{method:'POST',body:{login:user.login,password:user.password}});assert.equal(reply.status,200);assert.match(reply.headers.get('set-cookie'),/Secure; HttpOnly; SameSite=Strict/);cookies.push(reply.headers.get('set-cookie').split(';')[0]);}
 const owner={user:users[0],cookie:cookies[0]},player={user:users[1],cookie:cookies[1]},waiting={user:users[2],cookie:cookies[2]};
 assert.match(await (await request('/',waiting)).text(),/account-user-code/);assert.equal((await request('/api/me',waiting)).status,200);assert.equal((await request('/api/workspace',waiting)).status,404);
 const own=await (await request('/api/workspace',owner)).json(),personal=await (await request('/api/workspace',player)).json();
 assert.notEqual(own.context.characterId,personal.context.characterId);assert.equal(personal.permissions.shared,false);assert.equal(own.permissions.members,true);
 assert.equal((await request('/api/members',player)).status,403);
 const exported=await (await request('/api/export/active-v9',owner)).text();assert.ok(!exported.includes(personal.state.profile.name));
 async function change(body){const roster=await (await request('/api/members',owner)).json();return request('/api/members',{...owner,method:'POST',body:{mutationId:randomUUID(),expectedVersion:roster.version,campaignId:own.context.campaignId,...body}});}
 assert.equal((await change({action:'set-member',userId:users[2].id,role:'player'})).status,200);
 assert.equal((await request('/api/workspace',waiting)).status,404);
 assert.equal((await change({action:'grant-character',userId:users[2].id,characterId:own.context.characterId})).status,200);
 assert.equal((await request('/api/workspace',waiting)).status,200);assert.equal(accessReadiness(path.join(folder,'fixture.sqlite')).dataReady,true);
 assert.equal((await change({action:'revoke-character',userId:users[2].id,characterId:own.context.characterId})).status,200);
 for(const route of ['/api/workspace','/api/history','/api/export/active-v9'])assert.equal((await request(route,waiting)).status,404);
 assert.equal((await request('/api/auth/logout',{...player,method:'POST',body:{}})).status,200);assert.equal((await request('/api/workspace',player)).status,401);assert.equal((await request('/api/workspace',owner)).status,200);
 assert.deepEqual(gameSnapshot(path.join(folder,'fixture.sqlite')),game);
 await fixture.close();await fixture.close();
});

test('fixture rejects a symlink in place of its own database before opening the target',{skip:process.platform==='win32'?'Creating symlinks needs a separate Windows privilege':false},async()=>{
 const folder=await directory();await prepareAuthFixture(folder,'https://fixture.example');
 const target=path.join(path.dirname(folder),'target.sqlite');await writeFile(target,'private target');
 const {unlink}=await import('node:fs/promises');await unlink(path.join(folder,'fixture.sqlite'));await symlink(target,path.join(folder,'fixture.sqlite'));
 await assert.rejects(serveAuthFixture(folder,0),/обычные файлы/);assert.equal(await readFile(target,'utf8'),'private target');
});

test('advancement fixture uses real cookies, preserves seeded provenance and isolates the player',async t=>{
 const folder=await directory(),origin='https://fixture.example:8443';
 await prepareAuthFixture(folder,origin,{classAdvancement:true});
 const fixture=await serveAuthFixture(folder,0);t.after(()=>fixture.close());
 const users=JSON.parse(await readFile(path.join(folder,credentialName),'utf8')).credentials;
 const url='http://127.0.0.1:'+fixture.server.address().port;
 const request=(route,{user,cookie,body}={})=>fetch(url+route,{method:body?'POST':'GET',headers:{Origin:origin,'X-Skaz-Client':'local-v1','X-Skaz-View':'advancement-auth-qa',...(user?{'X-Skaz-Identity':user.id}:{}),...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const sessions=[];
 for(const user of users.slice(0,2)){const r=await request('/api/auth/login',{body:{login:user.login,password:user.password}});assert.equal(r.status,200);assert.match(r.headers.get('set-cookie'),/Secure; HttpOnly; SameSite=Strict/);sessions.push({user,cookie:r.headers.get('set-cookie').split(';')[0]});}
 const [owner,player]=sessions;
 assert.equal((await request('/api/class-advancement/classes')).status,401);
 const own=await(await request('/api/workspace',owner)).json(),other=await(await request('/api/workspace',player)).json();
 assert.equal(own.characterSheet.level,4);assert.equal(own.advancement.events.length,1);assert.equal(own.state.maxHp,42);assert.equal(own.state.hp,12);
 assert.equal(other.characterSheet.level,2);assert.equal(other.advancement,null);assert.notEqual(own.context.characterId,other.context.characterId);
 const file=await(await request('/api/export/active-v13',owner)).json();assert.deepEqual(file.advancement,own.advancement);
 const plan=await(await request('/api/class-advancement/plan?classId=fighter',owner)).json();
 const command={mutationId:randomUUID(),expectedRevision:own.revision,characterId:own.context.characterId,classId:'fighter',fromLevel:4,hpMethod:'fixed',hpRoll:null,choices:{},reviewedFeatures:plan.plan.requiresFeatureReview};
 assert.equal((await request('/api/class-advancement/apply',{...player,body:command})).status,409);
 const applied=await request('/api/class-advancement/apply',{...owner,body:command});assert.equal(applied.status,200);const result=await applied.json();assert.equal(result.characterSheet.level,5);assert.equal(result.advancement.events.length,2);assert.equal(result.state.hp,12);
 assert.equal((await(await request('/api/class-advancement/apply',{...owner,body:command})).json()).replayed,true);
 const {revision:playerRevision,updatedAt:playerTime,...playerState}=await(await request('/api/workspace',player)).json();
 const {revision:beforeRevision,updatedAt:beforeTime,...beforePlayer}=other;
 assert.deepEqual(playerState,beforePlayer);assert.equal(playerRevision,beforeRevision+1); // Shared campaign revision, isolated character data.
 assert.equal((await request('/api/auth/logout',{...owner,body:{}})).status,200);
 assert.equal((await request('/api/class-advancement/apply',{...owner,body:command})).status,401);
});

test('fixture capability cannot be enabled by changing only its manifest',async()=>{
 const folder=await directory();await prepareAuthFixture(folder,'https://fixture.example');
 const file=path.join(folder,'fixture.json'),manifest=JSON.parse(await readFile(file,'utf8'));
 manifest.kind+='-advancement';await writeFile(file,JSON.stringify(manifest));
 const database=path.join(folder,'fixture.sqlite'),before=await readFile(database);
 await assert.rejects(serveAuthFixture(folder,0),/База не принадлежит/);assert.deepEqual(await readFile(database),before);
 const invalid=await directory();await assert.rejects(prepareAuthFixture(invalid,'https://fixture.example',{classAdvancement:'true'}));await assert.rejects(stat(invalid),{code:'ENOENT'});
});
