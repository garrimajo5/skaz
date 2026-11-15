import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {deploymentOrigin} from './verify-deployment.mjs';

// Explicitly MUTATING acceptance: only a caller-pinned synthetic account/context.
// Credentials stay with the caller; no files, secrets or game contents are logged.
export async function verifyPersonalArtDeployment({origin,outerLogin,account,expectedUserId,expectedContext,png,syntheticOnly=false,fetchImpl=fetch}){
 origin=deploymentOrigin(origin);
 if(syntheticOnly!==true||!expectedUserId||!expectedContext?.characterId||!expectedContext?.campaignId)throw Error('Explicit synthetic account and context required');
 if(!account?.login||!account?.password||!outerLogin?.username||!outerLogin?.password||/[\r\n:]/.test(outerLogin.username)||/[\r\n]/.test(outerLogin.password)||!Buffer.isBuffer(png)||!png.length)throw Error('Invalid acceptance configuration');
 const qa={login:account.login,password:account.password,userId:expectedUserId,characterId:expectedContext.characterId,campaignId:expectedContext.campaignId};
 const basic='Basic '+Buffer.from(outerLogin.username+':'+outerLogin.password).toString('base64');
 try{
const catalogId='srd51:2014:spell:shield',view='personal-art-qa-'+randomUUID();let cookie,identity;
async function call(path,{method='GET',body,personal=true,outerAuth=true,extra={},pad=0}={}){await delay(120);return fetchImpl(origin+path,{method,redirect:'manual',signal:AbortSignal.timeout(15000),headers:{...(outerAuth?{Authorization:basic}:{}),...(personal&&cookie?{Cookie:cookie,...(identity?{'X-Skaz-Identity':identity}:{}),'X-Skaz-View':view}:{}),...(body?{Origin:origin,'Content-Type':'application/json','X-Skaz-Client':'local-v1'}:{}),...extra},...(body?{body:JSON.stringify(body)+' '.repeat(pad)}:{})});}
async function json(path,opt={}){const r=await call(path,opt);assert.equal(r.status,200,path);return r.json();}
async function status(path,opt,expected){const r=await call(path,opt);await r.body?.cancel();assert.equal(r.status,expected,path);}
let report;
try{
 for(const p of ['/api/personal-art/change','/api/personal-art/import','/api/import/game-with-art']){await status(p,{method:'POST',body:{},outerAuth:false,personal:false},401);await status(p,{method:'POST',body:{},personal:false},401);}
 const login=await call('/api/auth/login',{method:'POST',body:{login:qa.login,password:qa.password},personal:false});assert.equal(login.status,200);const header=login.headers.get('set-cookie');cookie=header?.split(';')[0];await login.body?.cancel();assert.match(header,/;\s*Secure(?:;|$)/);assert.match(header,/;\s*HttpOnly(?:;|$)/);assert.match(header,/;\s*SameSite=Strict(?:;|$)/);assert.match(header,/;\s*Path=\/(?:;|$)/);assert.ok(!/;\s*Domain=/i.test(header));assert.match(cookie,/^__Host-skaz-session=[a-f0-9]{64}$/);
 const page=await call('/');const html=await page.text();identity=html.match(/data-user-id="([a-zA-Z0-9-]{8,80})"/)?.[1];assert.equal(identity,qa.userId);assert.ok(html.includes('data-personal-art="enabled"'));
 const game=await json('/api/workspace');assert.equal(game.context.characterId,qa.characterId);assert.equal(game.context.campaignId,qa.campaignId);
 const query=new URLSearchParams({characterId:qa.characterId,catalogId});const history=await json('/api/personal-art/history?'+query);const revision=history.entries[0]?.revision??0;
 await status('/api/personal-art/usage?characterId='+qa.characterId,{extra:{Origin:'https://foreign.invalid'}},403);
 await status('/api/personal-art/usage?characterId=qa-nonexistent',{},404);
 await status('/api/personal-art/usage?characterId='+qa.characterId,{extra:{'X-Skaz-Identity':'wrong-identity'}},401);
 
 const command={characterId:qa.characterId,catalogId,mutationId:randomUUID(),expectedRevision:revision,action:'set',png:png.toString('base64')};
 const set=await json('/api/personal-art/change',{method:'POST',body:command,pad:600*1024});assert.equal(set.revision,revision+1);
 const retry=await json('/api/personal-art/change',{method:'POST',body:command,pad:600*1024});assert.equal(retry.replayed,true);assert.equal(retry.revision,set.revision);
 const image=await call('/api/personal-art/image?'+query);assert.equal(image.status,200);assert.match(image.headers.get('cache-control'),/no-store/);assert.equal(image.headers.get('content-type'),'image/png');const before=Buffer.from(await image.arrayBuffer());assert.equal(before[0],137);
 await status('/api/personal-art/change',{method:'POST',body:{...command,mutationId:randomUUID()}},409);
 const reset=await json('/api/personal-art/change',{method:'POST',body:{characterId:qa.characterId,catalogId,mutationId:randomUUID(),expectedRevision:set.revision,action:'reset'}});assert.equal(reset.standard,true);
 await status('/api/personal-art/image?'+query,{},404);
 const restore=await json('/api/personal-art/change',{method:'POST',body:{characterId:qa.characterId,catalogId,mutationId:randomUUID(),expectedRevision:reset.revision,action:'restore',targetRevision:set.revision}});assert.equal(restore.standard,false);
 const restored=await call('/api/personal-art/image?'+query);assert.deepEqual(Buffer.from(await restored.arrayBuffer()),before);
 const file=await json('/api/export/game-with-art');assert.equal(file.app,'skaz-game-with-art');assert.ok(file.personalArt.entries.some(e=>e.catalogId===catalogId));
 const campaignsBefore=(await json('/api/campaigns')).campaigns.length;
 const request={mutationId:randomUUID(),expectedRevision:(await json('/api/workspace')).revision,destination:'new-campaign',file};
 const imported=await json('/api/import/game-with-art',{method:'POST',body:request,pad:600*1024});assert.notEqual(imported.context.characterId,qa.characterId);
 const replay=await json('/api/import/game-with-art',{method:'POST',body:request,pad:600*1024});assert.equal(replay.replayed,true);assert.equal((await json('/api/campaigns')).campaigns.length,campaignsBefore+1);
 const transferred=await json('/api/export/game-with-art');assert.deepEqual(transferred.personalArt,file.personalArt);
 report={verified:true,https:true,outerAndPersonalAuth:true,originAndIdentity:true,uploadOver512KiB:true,exactReplay:true,conflict:true,resetRestore:true,privateNoStore:true,gamePackageReplay:true,onlySyntheticQA:true};
}finally{if(cookie){if(!identity){const page=await call('/');identity=(await page.text()).match(/data-user-id="([a-zA-Z0-9-]{8,80})"/)?.[1];}if(!identity)throw Error('Session cleanup could not be verified');await status('/api/auth/logout',{method:'POST',body:{}},200);await status('/api/workspace',{},401);}}
return report;

 }catch{throw Error('Personal-art acceptance failed; no credentials or game details are reported');}
}
