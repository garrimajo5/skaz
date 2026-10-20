import test from 'node:test';import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';import {mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {DatabaseSync} from 'node:sqlite';
import {openStore} from '../server/store.mjs';import {createApp} from '../server/app.mjs';import {templateStats,validateCharacterStats} from '../server/character-stats.mjs';
const stats=()=>({...structuredClone(templateStats),abilities:{str:1,dex:30,con:13,int:9,wis:10,cha:20},armorClass:0,initiative:-3,speed:0});
const command=(s,value=stats())=>({mutationId:randomUUID(),expectedRevision:s.read().revision,characterId:s.read().context.characterId,stats:value});
test('manual stats validate canonical numbers and never accept derived fields or 2024 metadata',()=>{
 assert.deepEqual(validateCharacterStats(stats()),stats());
 for(const change of [s=>s.abilities.str=0,s=>s.abilities.dex=31,s=>s.abilities.con=1.5,s=>s.armorClass=101,s=>s.initiative=-21,s=>s.speed=-1,s=>s.speed='30',s=>s.level=20,s=>s.ruleset='5e-2024',s=>s.abilities.modifier=3,s=>delete s.abilities.int]){const value=stats();change(value);assert.throws(()=>validateCharacterStats(value),{status:422});}
});
test('stats persist apart from legacy state, isolate heroes and replay once with global conflicts',()=>{
 const file=join(mkdtempSync(join(tmpdir(),'skaz-stats-')),'db.sqlite');let s=openStore(file);
 const before=s.read(),a=s.forView('stats-window-a'),b=s.forView('stats-window-b'),request=command(a),saved=a.saveCharacterStats(request);
 assert.deepEqual(saved.state,before.state);assert.deepEqual(saved.characterStats,stats());assert.equal(saved.revision,1);assert.equal(a.saveCharacterStats(request).replayed,true);assert.equal(s.history().length,1);
 assert.throws(()=>b.saveCharacterStats({...command(b),mutationId:request.mutationId}),{status:409});
 assert.throws(()=>a.saveCharacterStats({...command(a),expectedRevision:0}),{status:409});
 assert.throws(()=>a.saveCharacterStats({...command(a),characterId:'foreign-character'}),{status:409});
 s.close();s=openStore(file);assert.deepEqual(s.read().characterStats,stats());assert.deepEqual(s.read().state,before.state);
 const current=s.read();s.createCharacter({mutationId:randomUUID(),expectedRevision:current.revision,campaignId:current.context.campaignId,characterId:randomUUID(),template:'bard5-demo',profile:{name:'Separate hero',tagline:''}});assert.equal(s.read().characterStats,null);s.close();
});
test('stats audit failure rolls back values, receipt and revision atomically',()=>{
 const file=join(mkdtempSync(join(tmpdir(),'skaz-stats-rollback-')),'db.sqlite'),s=openStore(file),db=new DatabaseSync(file);try{
 const before=s.read();db.exec("CREATE TRIGGER fail_stats BEFORE INSERT ON character_stats_changes BEGIN SELECT RAISE(ABORT,'test audit failure');END");assert.throws(()=>s.saveCharacterStats(command(s)));assert.deepEqual(s.read(),before);assert.equal(s.history().length,0);assert.equal(db.prepare('SELECT count(*) AS n FROM character_stats').get().n,0);
 }finally{db.close();s.close();}
});
test('v8 round trips manual stats; older exports reject loss and older imports start with template',()=>{
 const a=openStore(':memory:'),b=openStore(':memory:');try{
 a.saveCharacterStats(command(a));for(const version of [2,3,4,5,6,7])assert.throws(()=>a.exportActive(version),{status:409});
 const file=a.exportActive(8);assert.deepEqual(file.characterStats,stats());const old=b.read(),request={mutationId:randomUUID(),expectedRevision:old.revision,destination:"new-campaign",file};b.importActive(request);assert.deepEqual(b.read().characterStats,stats());assert.deepEqual(b.read().state,a.read().state);assert.equal(b.importActive(request).replayed,true);
 for(const invalid of [undefined,{...stats(),speed:1001}]){const bad=structuredClone(file);if(invalid===undefined)delete bad.characterStats;else bad.characterStats=invalid;const before=b.read();assert.throws(()=>b.importActive({mutationId:randomUUID(),expectedRevision:before.revision,destination:"new-campaign",file:bad}),{status:422});assert.deepEqual(b.read(),before);}
 const v7={...file,schemaVersion:7};delete v7.characterStats;b.importActive({mutationId:randomUUID(),expectedRevision:b.read().revision,destination:"new-campaign",file:v7});assert.equal(b.read().characterStats,null);
 a.saveCharacterStats(command(a,null));assert.equal(a.read().characterStats,null);assert.equal(a.exportActive(7).schemaVersion,7);
 }finally{a.close();b.close();}
});
test('HTTP stats writes retain app/origin guards and v8 export while v1 rejects data loss',async t=>{
 const s=openStore(':memory:'),app=createApp(s);await new Promise(r=>app.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>app.close(r));s.close();});const base='http://127.0.0.1:'+app.address().port,headers={'Content-Type':'application/json','X-Skaz-Client':'local-v1'},body=JSON.stringify(command(s));
 assert.equal((await fetch(base+'/api/character-stats',{method:'POST',headers:{'Content-Type':'application/json'},body})).status,403);
 assert.equal((await fetch(base+'/api/character-stats',{method:'POST',headers:{...headers,Origin:'https://foreign.invalid'},body})).status,403);
 assert.equal((await fetch(base+'/api/character-stats',{method:'POST',headers,body})).status,200);
 assert.equal((await fetch(base+'/api/export')).status,409);assert.equal((await fetch(base+'/api/export/active-v7')).status,409);assert.deepEqual((await fetch(base+'/api/export/active-v8').then(r=>r.json())).characterStats,stats());
});
