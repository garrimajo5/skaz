import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,chmodSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import http from 'node:http';
import https from 'node:https';
import {randomUUID} from 'node:crypto';
import {openStore} from '../server/store.mjs';
import {createApp} from '../server/app.mjs';
const openssl=process.env.SKAZ_OPENSSL||(process.platform==='win32'?'C:/Program Files/Git/usr/bin/openssl.exe':'openssl');

test('recovery UI retains HTTPS cookies, manual data, exact retries, play and isolation',async t=>{
 const folder=mkdtempSync(join(tmpdir(),'skaz-profile-recovery-'));
 t.after(()=>rmSync(folder,{recursive:true,force:true}));
 const keyFile=join(folder,'key.pem'),certFile=join(folder,'cert.pem');
 execFileSync(openssl,['req','-x509','-newkey','rsa:2048','-nodes','-keyout',keyFile,'-out',certFile,'-days','1','-subj','/CN=localhost','-addext','subjectAltName=IP:127.0.0.1,DNS:localhost'],{stdio:'ignore'});
 chmodSync(keyFile,0o600);const cert=readFileSync(certFile),key=readFileSync(keyFile);
 const store=openStore(':memory:',{classAdvancement:true});t.after(()=>store.close());
 const initial=store.read();
 store.createCharacter({mutationId:randomUUID(),expectedRevision:initial.revision,campaignId:initial.context.campaignId,characterId:randomUUID(),template:'manual-2014',profile:{name:'Synthetic recovery hero',tagline:''},manual:{stats:{abilities:{str:16,dex:33,con:14,int:18,wis:12,cha:10},armorClass:17,initiative:3,speed:30},sheet:{ruleset:'5e-2014',ancestry:'',className:'Synthetic',subclass:'',level:21,counters:[{id:'counter-recovery',name:'Synthetic reserve',current:8,max:7}]},hp:10,maxHp:20,tempHp:0,gold:0}});
 const context=store.read().context;
 store.access.apply({action:'bootstrap-owner',userId:'qa-recovery-owner',displayName:'Synthetic owner',campaignId:context.campaignId,characterId:context.characterId});
 store.access.apply({action:'create-user',userId:'qa-recovery-player',displayName:'Synthetic player'});
 store.access.apply({action:'set-member',userId:'qa-recovery-player',campaignId:context.campaignId,role:'player'});
 store.access.apply({action:'grant-character',userId:'qa-recovery-player',campaignId:context.campaignId,characterId:initial.context.characterId});
 const auth=store.authentication(),password='synthetic recovery test password';
 await auth.setPassword('qa-recovery-owner','owner',password);await auth.setPassword('qa-recovery-player','player',password);
 let backend;
 const proxy=https.createServer({key,cert},(request,response)=>{
  const upstream=http.request({host:'127.0.0.1',port:backend.address().port,path:request.url,method:request.method,headers:{...request.headers,host:'127.0.0.1:'+backend.address().port}},reply=>{response.writeHead(reply.statusCode,reply.headers);reply.pipe(response);});upstream.on('error',()=>response.destroy());request.pipe(upstream);
 });
 await new Promise(resolve=>proxy.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>proxy.close(resolve)));
 const origin='https://127.0.0.1:'+proxy.address().port;
 backend=createApp(store,{publicOrigin:origin,sessions:auth,individualWrites:true,classAdvancement:true,profileEditors:false});
 await new Promise(resolve=>backend.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>backend.close(resolve)));
 function request(path,{method='GET',cookie,identity,body,originHeader=origin}={}){
  return new Promise((resolve,reject)=>{const encoded=body===undefined?undefined:JSON.stringify(body),out=https.request(origin+path,{method,ca:cert,headers:{Origin:originHeader,'X-Skaz-Client':'local-v1','X-Skaz-View':'qa-recovery-view',...(identity?{'X-Skaz-Identity':identity}:{}),...(cookie?{Cookie:cookie}:{}),...(encoded?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(encoded)}:{})}},reply=>{let text='';reply.setEncoding('utf8');reply.on('data',chunk=>text+=chunk);reply.on('end',()=>resolve({status:reply.statusCode,text,headers:reply.headers,json:()=>JSON.parse(text)}));});out.on('error',reject);out.end(encoded);});
 }
 assert.equal((await request('/api/workspace')).status,401);assert.match((await request('/')).text,/login-form/);
 const login=await request('/api/auth/login',{method:'POST',body:{login:'owner',password}});assert.equal(login.status,200);
 assert.match(login.headers['set-cookie'][0],/Secure; HttpOnly; SameSite=Strict/);
 const owner={cookie:login.headers['set-cookie'][0].split(';')[0],identity:'qa-recovery-owner'};
 const html=await request('/?profileEditors=1',owner);assert.equal(html.status,200);assert.match(html.text,/data-profile-editors="disabled"/);assert.match(html.text,/data-class-advancement="enabled"/);
 let current=(await request('/api/workspace',owner)).json();assert.equal(current.characterStats.abilities.dex,33);assert.equal(current.characterSheet.level,21);assert.equal(current.characterSheet.counters[0].current,8);
 const stats={mutationId:randomUUID(),expectedRevision:current.revision,characterId:context.characterId,stats:{...current.characterStats,armorClass:18}};
 const saved=await request('/api/character-stats',{...owner,method:'POST',body:stats});assert.equal(saved.status,200);
 const replay=await request('/api/character-stats',{...owner,method:'POST',body:stats});assert.equal(replay.json().replayed,true); // Pending writes must remain reconcilable in recovery.
 current=(await request('/api/workspace',owner)).json();
 const spend={mutationId:randomUUID(),expectedRevision:current.revision,context:current.context,resource:{kind:'counter',counterId:'counter-recovery'},delta:-1,before:8,maximum:7};
 assert.equal((await request('/api/resources/change',{...owner,method:'POST',body:spend})).status,200);
 assert.equal((await request('/api/resources/change',{...owner,method:'POST',body:spend})).json().replayed,true);
 current=(await request('/api/workspace',owner)).json();
 assert.equal((await request('/api/resources/undo',{...owner,method:'POST',body:{mutationId:randomUUID(),expectedRevision:current.revision,characterId:context.characterId,targetMutationId:spend.mutationId}})).status,200);
 current=(await request('/api/workspace',owner)).json();assert.equal(current.characterSheet.counters[0].current,8);assert.equal(current.characterStats.armorClass,18);
 const exported=await request('/api/export/active-v15',owner);assert.equal(exported.status,200);assert.equal(exported.json().schemaVersion,15);assert.equal(exported.json().characterStats.abilities.dex,33);
 assert.equal((await request('/api/workspace',{...owner,originHeader:'https://untrusted.invalid'})).status,403);
 const playerLogin=await request('/api/auth/login',{method:'POST',body:{login:'player',password}});const player={cookie:playerLogin.headers['set-cookie'][0].split(';')[0],identity:'qa-recovery-player'};
 const playerBefore=(await request('/api/workspace',player)).json();
 assert.equal((await request('/api/context/select',{...player,method:'POST',body:{mutationId:randomUUID(),expectedRevision:playerBefore.revision,context}})).status,404);
 assert.deepEqual((await request('/api/workspace',player)).json().context,playerBefore.context);
 assert.equal((await request('/api/auth/logout',{...owner,method:'POST',body:{}})).status,200);
 assert.equal((await request('/api/workspace',owner)).status,401);
});
