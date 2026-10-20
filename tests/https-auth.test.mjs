import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import http from 'node:http';
import https from 'node:https';
import {openStore} from '../server/store.mjs';
import {createApp} from '../server/app.mjs';
import {randomUUID} from 'node:crypto';
const openssl=process.env.SKAZ_OPENSSL||(process.platform==='win32'?'C:/Program Files/Git/usr/bin/openssl.exe':'openssl');

test('HTTPS proxy preserves authenticated identity, rejects cross-tab account changes and never reveals another sheet',async t=>{
 const folder=mkdtempSync(join(tmpdir(),'skaz-https-auth-')),keyFile=join(folder,'key.pem'),certFile=join(folder,'cert.pem');
 execFileSync(openssl,['req','-x509','-newkey','rsa:2048','-nodes','-keyout',keyFile,'-out',certFile,'-days','1','-subj','/CN=localhost','-addext','subjectAltName=IP:127.0.0.1,DNS:localhost'],{stdio:'ignore'});
 chmodSync(keyFile,0o600);const cert=readFileSync(certFile),key=readFileSync(keyFile);
 const store=openStore(join(folder,'fixture.sqlite'));t.after(()=>store.close());const first=store.read().context;
 store.access.apply({action:'bootstrap-owner',userId:'https-alice',displayName:'Alice',campaignId:first.campaignId,characterId:first.characterId});
 const alternate=store.forView('fixture-boris');alternate.createCharacter({mutationId:randomUUID(),expectedRevision:alternate.read().revision,campaignId:first.campaignId,characterId:randomUUID(),template:'bard5-demo',profile:{name:'BORIS_ONLY',tagline:'Private'}});
 store.access.apply({action:'create-user',userId:'https-boris',displayName:'Boris'});store.access.apply({action:'set-member',userId:'https-boris',campaignId:first.campaignId,role:'player'});store.access.apply({action:'grant-character',userId:'https-boris',campaignId:first.campaignId,characterId:alternate.read().context.characterId});
 const auth=store.authentication(),password='synthetic HTTPS test password';await auth.setPassword('https-alice','alice',password);await auth.setPassword('https-boris','boris',password);
 let backend;
 const proxy=https.createServer({key,cert},(request,response)=>{
  const upstream=http.request({host:'127.0.0.1',port:backend.address().port,path:request.url,method:request.method,headers:{...request.headers,host:'127.0.0.1:'+backend.address().port}},reply=>{response.writeHead(reply.statusCode,reply.headers);reply.pipe(response);});upstream.on('error',()=>response.destroy());request.pipe(upstream);
 });
 await new Promise(resolve=>proxy.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>proxy.close(resolve)));
 const origin='https://127.0.0.1:'+proxy.address().port;
 backend=createApp(store,{publicOrigin:origin,sessions:auth,individualWrites:true});await new Promise(resolve=>backend.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>backend.close(resolve)));
 function request(path,{method='GET',cookie,identity,body,ca=cert,originHeader=origin}={}){
  return new Promise((resolve,reject)=>{const encoded=body===undefined?undefined:JSON.stringify(body),out=https.request(origin+path,{method,ca,headers:{Origin:originHeader,'X-Skaz-Client':'local-v1',...(identity?{'X-Skaz-Identity':identity}:{}),...(cookie?{Cookie:cookie}:{}),...(encoded?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(encoded)}:{})}},reply=>{let text='';reply.setEncoding('utf8');reply.on('data',chunk=>text+=chunk);reply.on('end',()=>resolve({status:reply.statusCode,text,headers:reply.headers,json:()=>JSON.parse(text)}));});out.on('error',reject);out.end(encoded);});
 }
 await assert.rejects(request('/',{ca:[]}),error=>/certificate|self.signed/i.test(error.message));
 assert.equal((await request('/api/workspace')).status,401);assert.match((await request('/')).text,/login-form/);
 const alice=await request('/api/auth/login',{method:'POST',body:{login:'alice',password}});assert.equal(alice.status,200);const cookieA=alice.headers['set-cookie'][0].split(';')[0];assert.match(alice.headers['set-cookie'][0],/Secure; HttpOnly; SameSite=Strict/);assert.equal(alice.json().token,undefined);
 const boris=await request('/api/auth/login',{method:'POST',body:{login:'boris',password}});const cookieB=boris.headers['set-cookie'][0].split(';')[0];
 const sheet=await request('/api/workspace',{cookie:cookieB,identity:'https-boris'});assert.equal(sheet.status,200);assert.equal(sheet.json().state.profile.name,'BORIS_ONLY');assert.equal(sheet.json().permissions.shared,false);
 const own=await request('/api/workspace',{cookie:cookieA,identity:'https-alice'});assert.equal(own.status,200);assert.ok(!own.text.includes('BORIS_ONLY'));assert.equal(own.json().permissions.shared,true);
 const roster=await request('/api/members',{cookie:cookieA,identity:'https-alice'});assert.equal(roster.status,200);assert.equal((await request('/api/members',{cookie:cookieB,identity:'https-boris'})).status,403);
 const grant={action:'grant-character',mutationId:randomUUID(),expectedVersion:roster.json().version,campaignId:first.campaignId,userId:'https-boris',characterId:first.characterId};
 assert.equal((await request('/api/members',{method:'POST',cookie:cookieA,identity:'https-alice',body:grant,originHeader:'https://foreign.test'})).status,403);
 assert.equal((await request('/api/members',{method:'POST',cookie:cookieB,identity:'https-alice',body:grant})).status,401);
 assert.equal((await request('/api/members',{method:'POST',cookie:cookieA,identity:'https-alice',body:grant})).status,200);
 assert.equal((await request('/api/members',{method:'POST',cookie:cookieA,identity:'https-alice',body:grant})).json().replayed,true);
 const stale={method:'PUT',cookie:cookieB,identity:'https-alice',body:{mutationId:randomUUID(),expectedRevision:sheet.json().revision,label:'Old tab',state:{...sheet.json().state,hp:1}}};assert.equal((await request('/api/workspace',stale)).status,401);assert.equal((await request('/api/workspace',{cookie:cookieB,identity:'https-boris'})).json().state.hp,28);
 assert.equal((await request('/api/auth/logout',{method:'POST',cookie:cookieB,identity:'https-boris',body:{},originHeader:'https://foreign.test'})).status,403);
 assert.equal((await request('/api/auth/logout',{method:'POST',cookie:cookieB,identity:'https-boris',body:{}})).status,200);assert.equal((await request('/api/workspace',{cookie:cookieB,identity:'https-boris'})).status,401);assert.equal((await request('/api/workspace',{cookie:cookieA,identity:'https-alice'})).status,200);
});
