import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync,chmodSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import http from 'node:http';
import https from 'node:https';
import {openStore} from '../server/store.mjs';
import {createApp} from '../server/app.mjs';
import {verifyPersonalArtDeployment} from '../scripts/verify-personal-art-deployment.mjs';
const origin='https://art-acceptance.invalid',outerLogin={username:'synthetic-basic',password:'synthetic outer password'},account={login:'codex-qa',password:'synthetic inner password'},userId='synthetic-art-acceptance';
const manifest=JSON.parse(readFileSync(new URL('../catalog/art-manifest.json',import.meta.url))),png=readFileSync(new URL('../'+manifest.entries[0].files.thumbnail.path,import.meta.url));
async function fixture(t,{wrongContext=false,badCookie=false,tls=false}={}){
 let actualOrigin=origin,proxy,cert;
 if(tls){
  const folder=mkdtempSync(join(tmpdir(),'skaz-art-https-'));t.after(()=>rmSync(folder,{recursive:true,force:true}));
  const keyFile=join(folder,'key.pem'),certFile=join(folder,'cert.pem');
  const openssl=process.env.SKAZ_OPENSSL||(process.platform==='win32'?'C:/Program Files/Git/usr/bin/openssl.exe':'openssl');
  execFileSync(openssl,['req','-x509','-newkey','rsa:2048','-nodes','-keyout',keyFile,'-out',certFile,'-days','1','-subj','/CN=localhost','-addext','subjectAltName=IP:127.0.0.1,DNS:localhost'],{stdio:'ignore'});chmodSync(keyFile,0o600);cert=readFileSync(certFile);
  proxy=https.createServer({key:readFileSync(keyFile),cert});await new Promise(r=>proxy.listen(0,'127.0.0.1',r));actualOrigin='https://127.0.0.1:'+proxy.address().port;t.after(()=>new Promise(r=>proxy.close(r)));
 }
 const store=openStore(':memory:',{classAdvancement:true}),context=store.read().context;
 store.catalog.installBundled({version:store.catalog.previewBundled().version});
 store.access.apply({action:'bootstrap-owner',userId,displayName:'Synthetic QA',campaignId:context.campaignId,characterId:context.characterId});
 const sessions=store.authentication();await sessions.setPassword(userId,account.login,account.password);
 const app=createApp(store,{publicOrigin:actualOrigin,sessions,individualWrites:true,classAdvancement:true,personalArt:(id,options)=>store.forUser(id,'art-acceptance-view',{...options,personalArt:true}).personalArt});
 await new Promise(r=>app.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>app.close(()=>{store.close();r();})));
 if(tls){proxy.on('request',(req,res)=>{if(req.headers.authorization!=='Basic '+Buffer.from(outerLogin.username+':'+outerLogin.password).toString('base64')){res.writeHead(401);res.end();return;}const headers={...req.headers,host:'127.0.0.1:'+app.address().port};delete headers.authorization;const upstream=http.request({hostname:'127.0.0.1',port:app.address().port,path:req.url,method:req.method,headers},reply=>{res.writeHead(reply.statusCode,reply.headers);reply.pipe(res);});upstream.on('error',()=>res.destroy());req.pipe(upstream);});}
 let token;const calls=[];const fetchImpl=async(url,options)=>{
  assert.equal(new URL(url).origin,actualOrigin);assert.equal(options.redirect,'manual');const route=new URL(url);calls.push({path:route.pathname,body:options.body});
  if(!tls&&options.headers.Authorization!=='Basic '+Buffer.from(outerLogin.username+':'+outerLogin.password).toString('base64'))return new Response(null,{status:401});
  const headers=new Headers(options.headers);headers.delete('Authorization');const r=tls?await new Promise((resolve,reject)=>{const req=https.request(url,{method:options.method,ca:cert,headers:options.headers,signal:options.signal},res=>{const parts=[];res.on('data',p=>parts.push(p));res.on('end',()=>{const h=new Headers();for(const [k,v]of Object.entries(res.headers))for(const value of Array.isArray(v)?v:[v])if(value!==undefined)h.append(k,value);resolve(new Response(Buffer.concat(parts),{status:res.statusCode,headers:h}));});});req.on('error',reject);req.end(options.body);}):await fetch('http://127.0.0.1:'+app.address().port+route.pathname+route.search,{...options,headers});
  if(route.pathname==='/api/auth/login'&&r.status===200){token=r.headers.get('set-cookie').split(';')[0].split('=')[1];if(badCookie){const h=new Headers(r.headers);h.set('set-cookie',h.get('set-cookie').replace('; Secure',''));return new Response(await r.text(),{status:200,headers:h});}}
  return r;
 };
 return {store,sessions,calls,fetchImpl,context,actualOrigin,token:()=>token,options:{origin:actualOrigin,outerLogin,account,expectedUserId:userId,expectedContext:wrongContext?{...context,characterId:'other-synthetic-character'}:context,png,syntheticOnly:true,fetchImpl}};
}
test('personal-art acceptance covers real commands, replay, package transfer and revokes its session',async t=>{
 const f=await fixture(t,{tls:true}),state=structuredClone(f.store.read().state),before=f.store.campaigns().length;
 const report=await verifyPersonalArtDeployment(f.options);assert.equal(report.verified,true);assert.equal(f.store.campaigns().length,before+1);assert.deepEqual(f.store.read().state,state);assert.equal(f.sessions.check(f.token()),null);
 assert.ok(f.calls.some(c=>c.path==='/api/personal-art/change'&&c.body?.length>512*1024));
 for(const secret of [account.password,outerLogin.password,f.token()])assert.ok(!JSON.stringify(report).includes(secret));
 const other='synthetic-art-second';f.store.access.apply({action:'create-user',userId:other,displayName:'Second synthetic tester'});f.store.access.apply({action:'set-member',userId:other,campaignId:f.context.campaignId,role:'player'});f.store.access.apply({action:'grant-character',userId:other,campaignId:f.context.campaignId,characterId:f.context.characterId});await f.sessions.setPassword(other,'second','synthetic second password');
 const login=await f.fetchImpl(f.actualOrigin+'/api/auth/login',{method:'POST',redirect:'manual',headers:{Authorization:'Basic '+Buffer.from(outerLogin.username+':'+outerLogin.password).toString('base64'),Origin:f.actualOrigin,'Content-Type':'application/json','X-Skaz-Client':'local-v1'},body:JSON.stringify({login:'second',password:'synthetic second password'})});assert.equal(login.status,200);const otherCookie=login.headers.get('set-cookie').split(';')[0];await login.body.cancel();
 try{const image=await f.fetchImpl(f.actualOrigin+'/api/personal-art/image?'+new URLSearchParams({characterId:f.context.characterId,catalogId:'srd51:2014:spell:shield'}),{redirect:'manual',headers:{Authorization:'Basic '+Buffer.from(outerLogin.username+':'+outerLogin.password).toString('base64'),Cookie:otherCookie,'X-Skaz-Identity':other}});assert.equal(image.status,404);await image.body.cancel();}finally{f.sessions.logout(otherCookie.split('=')[1]);}

});
test('wrong pinned synthetic context prevents all art writes and still logs out',async t=>{
 const f=await fixture(t,{wrongContext:true}),before=f.store.campaigns().length;
 await assert.rejects(verifyPersonalArtDeployment(f.options),/acceptance failed/);assert.equal(f.store.campaigns().length,before);assert.equal(f.sessions.check(f.token()),null);assert.ok(!f.calls.some(c=>c.path==='/api/personal-art/change'&&c.body?.includes('"action"')));
});
test('bad cookie flags stop before game writes and still revoke the session',async t=>{
 const f=await fixture(t,{badCookie:true});await assert.rejects(verifyPersonalArtDeployment(f.options),/acceptance failed/);assert.equal(f.sessions.check(f.token()),null);assert.ok(!f.calls.some(c=>c.path==='/api/personal-art/change'&&c.body?.includes('"action"')));
});
test('mutating acceptance requires explicit synthetic scope and HTTPS before sending credentials',async()=>{
 let count=0;const base={origin,outerLogin,account,png,fetchImpl:async()=>{count++;throw Error(account.password);}};
 await assert.rejects(verifyPersonalArtDeployment(base),/synthetic/);
 await assert.rejects(verifyPersonalArtDeployment({...base,origin:'http://unsafe.invalid',syntheticOnly:true,expectedUserId:userId,expectedContext:{campaignId:'qa',characterId:'qa'}}));assert.equal(count,0);
});
