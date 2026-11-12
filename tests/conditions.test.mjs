import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID}from'node:crypto';import {mkdtempSync,rmSync}from'node:fs';import{tmpdir}from'node:os';import{join}from'node:path';
import Conditions from '../client/conditions.js';import{openStore}from'../server/store.mjs';import{validateState,seed}from'../server/state.mjs';import{validateTransfer}from'../server/transfer.mjs';import{gameArtPackage,validateGameArtPackage}from'../server/game-art-package.mjs';
const marks={active:['poisoned','prone'],exhaustion:2};const request=(s,conditions=marks)=>({mutationId:randomUUID(),expectedRevision:s.read().revision,label:'Состояния',state:{...s.read().state,conditions}});
test('2014 manual conditions reject unknown ids, duplicates, malformed levels and extra fields without mutating input',()=>{
 assert.deepEqual(Conditions.validate(),{active:[],exhaustion:0});assert.equal(Object.keys(Conditions.labels).length,14);
 const source={active:['prone','poisoned'],exhaustion:6};assert.deepEqual(Conditions.validate(source),{active:['poisoned','prone'],exhaustion:6});assert.deepEqual(source.active,['prone','poisoned']);
 for(const bad of [null,[],{}, {active:['constructor'],exhaustion:0},{active:['prone','prone'],exhaustion:0},{active:[],exhaustion:7},{active:[],exhaustion:-1},{active:[],exhaustion:1.5},{active:[],exhaustion:'2'},{active:[],exhaustion:0,other:true}]){assert.throws(()=>Conditions.validate(bad));assert.throws(()=>validateState({...structuredClone(seed),conditions:bad}),{status:422});}
 assert.deepEqual(Conditions.names(marks),['Отравлен','Сбит с ног','Истощение 2']);assert.equal(validateState(seed).conditions,undefined);
});
test('conditions survive restart and exact retry; stale or old clients cannot overwrite them; resources stay manual',()=>{
 const dir=mkdtempSync(join(tmpdir(),'skaz-conditions-')),path=join(dir,'game.sqlite');let s=openStore(path);try{
 const before=s.read(),cmd=request(s);const result=s.update(cmd);assert.deepEqual(result.state.conditions,marks);assert.equal(result.state.hp,before.state.hp);assert.deepEqual(result.state.slots,before.state.slots);
 assert.equal(s.update(cmd).revision,result.revision);assert.equal(s.history().length,1);
 assert.throws(()=>s.update({...cmd,mutationId:randomUUID()}),{status:409});
 const missing=request(s);delete missing.state.conditions;assert.throws(()=>s.update(missing),{status:409});
 s.close();s=openStore(path);assert.deepEqual(s.read().state.conditions,marks);assert.equal(s.update(cmd).revision,result.revision);
 s.update(request(s,{active:[],exhaustion:0}));assert.deepEqual(s.read().state.conditions,{active:[],exhaustion:0});
 }finally{s.close();rmSync(dir,{recursive:true,force:true});}
});
test('v14 roundtrip retains conditions and v3 art package; legacy envelopes cannot silently lose them',()=>{
 const s=openStore(':memory:'),b=openStore(':memory:');try{
 s.update(request(s));for(const v of [2,12,13])assert.throws(()=>s.exportActive(v),{status:409});
 const file=s.exportActive(14);assert.deepEqual(file.state.conditions,marks);assert.equal(file.advancement,null);validateTransfer(file);
 const cmd={mutationId:randomUUID(),expectedRevision:0,destination:'new-campaign',file};const result=b.importActive(cmd);assert.deepEqual(result.state.conditions,marks);assert.equal(b.importActive(cmd).revision,result.revision);assert.equal(b.campaigns().length,2);
 for(const v of [12,13]){const bad=structuredClone(file);bad.schemaVersion=v;if(v===12)delete bad.advancement;assert.throws(()=>validateTransfer(bad),{status:422});}
 const art={app:'skaz-personal-art',schemaVersion:1,ruleset:'5e-2014',scope:'personal-character',entries:[]},bundle=gameArtPackage(file,art);assert.equal(bundle.schemaVersion,3);validateGameArtPackage(bundle);assert.throws(()=>validateGameArtPackage({...bundle,schemaVersion:2}),{status:422});
 }finally{s.close();b.close();}
});

test('conditions update checks write permission and rejects replay after access revocation',()=>{
 const s=openStore(':memory:');try{const context=s.read().context;s.access.apply({action:'bootstrap-owner',userId:'conditions-owner',displayName:'Synthetic',campaignId:context.campaignId,characterId:context.characterId});
 const writer=s.forUser('conditions-owner','conditions-window',{write:true}),reader=s.forUser('conditions-owner','conditions-read');const cmd=request(writer);
 assert.throws(()=>reader.update(cmd),{status:403});writer.update(cmd);assert.deepEqual(writer.update(cmd).state.conditions,marks);
 s.access.apply({action:'revoke-character',userId:'conditions-owner',campaignId:context.campaignId,characterId:context.characterId});assert.throws(()=>writer.update(cmd),{status:404});
 }finally{s.close();}
});
import{createApp}from'../server/app.mjs';
test('v14 HTTP export and import protect writes and retain manual conditions',async()=>{
 const s=openStore(':memory:'),app=createApp(s);await new Promise(r=>app.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+app.address().port,headers={'Content-Type':'application/json','X-Skaz-Client':'local-v1',Origin:origin};try{
 const cmd=request(s);assert.equal((await fetch(origin+'/api/workspace',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(cmd)})).status,403);
 assert.equal((await fetch(origin+'/api/workspace',{method:'PUT',headers,body:JSON.stringify(cmd)})).status,200);
 const response=await fetch(origin+'/api/export/active-v14');assert.equal(response.status,200);assert.match(response.headers.get('content-disposition'),/v14/);const file=await response.json();assert.deepEqual(file.state.conditions,marks);
 const transfer={mutationId:randomUUID(),expectedRevision:s.read().revision,destination:'new-campaign',file};assert.equal((await fetch(origin+'/api/import/active',{method:'POST',headers,body:JSON.stringify(transfer)})).status,200);assert.deepEqual(s.read().state.conditions,marks);
 }finally{app.closeAllConnections();await new Promise(r=>app.close(r));s.close();}
});
