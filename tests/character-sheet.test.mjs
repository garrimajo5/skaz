import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {mkdtempSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';import {DatabaseSync} from 'node:sqlite';
import {openStore} from '../server/store.mjs';import {createApp} from '../server/app.mjs';import {validateCharacterSheet} from '../server/character-sheet.mjs';
const sheet=()=>({ruleset:'5e-2014',ancestry:'Человек',className:'Воин',subclass:'',level:1,counters:[{id:'counter-second-wind',name:'Второе дыхание',current:0,max:1},{id:'counter-slot-nine',name:'Ячейки 9 круга',current:1,max:1}]});
const command=(s,value=sheet())=>({mutationId:randomUUID(),expectedRevision:s.read().revision,characterId:s.read().context.characterId,sheet:value});
test('manual class validates explicit 2014 identity, unique stable counters and bounded complete balances',()=>{
 const value=sheet();assert.deepEqual(validateCharacterSheet(value),value);const trimmed=sheet();trimmed.className='  Воин  ';assert.equal(validateCharacterSheet(trimmed).className,'Воин');
 for(const mutate of [s=>s.ruleset='5e-2024',s=>s.level=0,s=>s.level=21,s=>s.level=1.5,s=>s.className=' ',s=>s.level='1',s=>s.hp=12,s=>s.counters[0].current=-1,s=>s.counters[0].current=2,s=>s.counters[0].max=10000,s=>s.counters[0].max='1',s=>s.counters[0].recovery='short-rest',s=>s.counters[1].id=s.counters[0].id,s=>s.counters[1].name=' ВТОРОЕ ДЫХАНИЕ ',s=>s.counters=Array.from({length:21},(_,i)=>({id:'counter-'+String(i).padStart(8,'0'),name:'Ресурс '+i,current:0,max:0}))]){const invalid=sheet();mutate(invalid);assert.throws(()=>validateCharacterSheet(invalid),{status:422});}
});
test('manual class persists per hero and isolates its counters from legacy bard resources',()=>{
 const file=join(mkdtempSync(join(tmpdir(),'skaz-sheet-')),'db.sqlite');let s=openStore(file);const before=s.read(),req=command(s);s.saveCharacterSheet(req);assert.deepEqual(s.read().state,before.state);assert.deepEqual(s.read().characterSheet,sheet());assert.equal(s.saveCharacterSheet(req).replayed,true);
 assert.throws(()=>s.update({mutationId:randomUUID(),expectedRevision:s.read().revision,label:'Old bard inspiration',state:{...before.state,inspiration:4}}),{status:409});
 assert.throws(()=>s.update({mutationId:randomUUID(),expectedRevision:s.read().revision,label:'Old bard slots',state:{...before.state,slots:{1:4,2:3,3:2}}}),{status:409});
 s.update({mutationId:randomUUID(),expectedRevision:s.read().revision,label:'Manual HP and gold',state:{...before.state,hp:0,gold:0}});assert.deepEqual(s.read().characterSheet,sheet());s.close();s=openStore(file);assert.deepEqual(s.read().characterSheet,sheet());
 s.createCharacter({mutationId:randomUUID(),expectedRevision:s.read().revision,campaignId:s.read().context.campaignId,characterId:randomUUID(),template:'bard5-demo',profile:{name:'Other hero',tagline:''}});assert.equal(s.read().characterSheet,null);s.close();
});
test('class audit failures, stale revisions, wrong heroes and changed receipts never partially save counters',()=>{
 const file=join(mkdtempSync(join(tmpdir(),'skaz-sheet-rollback-')),'db.sqlite'),s=openStore(file),db=new DatabaseSync(file);try{
 const before=s.read();db.exec("CREATE TRIGGER fail_sheet BEFORE INSERT ON character_sheet_changes BEGIN SELECT RAISE(ABORT,'audit failed');END");assert.throws(()=>s.saveCharacterSheet(command(s)));assert.deepEqual(s.read(),before);assert.equal(s.history().length,0);assert.equal(db.prepare('SELECT count(*) AS n FROM character_sheets').get().n,0);db.exec('DROP TRIGGER fail_sheet');
 const req=command(s);s.saveCharacterSheet(req);assert.throws(()=>s.saveCharacterSheet({...command(s),expectedRevision:0}),{status:409});assert.throws(()=>s.saveCharacterSheet({...command(s),characterId:'foreign-character'}),{status:409});assert.throws(()=>s.saveCharacterSheet({...req,sheet:{...sheet(),level:2}}),{status:409});assert.equal(s.read().characterSheet.level,1);
 }finally{db.close();s.close();}
});
test('v9 preserves manual class and independent statistics; older transfers require explicit safe fallback',()=>{
 const a=openStore(':memory:'),b=openStore(':memory:');try{
 const original=a.read().state;a.saveCharacterSheet(command(a));for(const version of [2,3,4,5,6,7,8])assert.throws(()=>a.exportActive(version),{status:409});
 const file=a.exportActive(9),req={mutationId:randomUUID(),expectedRevision:0,destination:'new-campaign',file};b.importActive(req);assert.deepEqual(b.read().characterSheet,sheet());assert.equal(b.read().characterStats,null);assert.equal(b.importActive(req).replayed,true);
 const invalid=structuredClone(file);delete invalid.characterSheet;const before=b.read();assert.throws(()=>b.importActive({mutationId:randomUUID(),expectedRevision:before.revision,destination:'new-campaign',file:invalid}),{status:422});assert.deepEqual(b.read(),before);
 const old={...file,schemaVersion:8};delete old.characterSheet;b.importActive({mutationId:randomUUID(),expectedRevision:b.read().revision,destination:'new-campaign',file:old});assert.equal(b.read().characterSheet,null);
 a.saveCharacterSheet(command(a,null));assert.deepEqual(a.read().state,original);assert.equal(a.read().characterSheet,null);assert.equal(a.exportActive(8).schemaVersion,8);
 }finally{a.close();b.close();}
});
test('HTTP manual class writes retain application and origin checks and protect older exports',async t=>{
 const s=openStore(':memory:'),app=createApp(s);await new Promise(r=>app.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>app.close(r));s.close();});const base='http://127.0.0.1:'+app.address().port,headers={'Content-Type':'application/json','X-Skaz-Client':'local-v1'},body=JSON.stringify(command(s));
 assert.equal((await fetch(base+'/api/character-sheet',{method:'POST',headers:{'Content-Type':'application/json'},body})).status,403);assert.equal((await fetch(base+'/api/character-sheet',{method:'POST',headers:{...headers,Origin:'https://foreign.invalid'},body})).status,403);assert.equal((await fetch(base+'/api/character-sheet',{method:'POST',headers,body})).status,200);assert.equal((await fetch(base+'/api/export')).status,409);assert.equal((await fetch(base+'/api/export/active-v8')).status,409);assert.deepEqual((await fetch(base+'/api/export/active-v9').then(r=>r.json())).characterSheet,sheet());
 const counter=JSON.stringify({mutationId:randomUUID(),expectedRevision:s.read().revision,characterId:s.read().context.characterId,counterId:'counter-slot-nine',delta:-1}),route=base+'/api/character-sheet/counter';assert.equal((await fetch(route,{method:'POST',headers:{'Content-Type':'application/json'},body:counter})).status,403);assert.equal((await fetch(route,{method:'POST',headers:{...headers,Origin:'https://foreign.invalid'},body:counter})).status,403);assert.equal((await fetch(route,{method:'POST',headers,body:counter})).status,200);assert.equal((await fetch(route,{method:'POST',headers,body:counter}).then(r=>r.json())).replayed,true);assert.equal(s.read().characterSheet.counters[1].current,0);
});

test('counter commands spend once, reject stale/bounded/wrong targets and roll back a failed audit',()=>{
 const file=join(mkdtempSync(join(tmpdir(),'skaz-counter-')),'db.sqlite'),s=openStore(file),db=new DatabaseSync(file);try{
 s.saveCharacterSheet(command(s));const make=(counterId='counter-slot-nine',delta=-1)=>({mutationId:randomUUID(),expectedRevision:s.read().revision,characterId:s.read().context.characterId,counterId,delta});
 const request=make(),initial=s.read();s.changeCharacterCounter(request);assert.equal(s.read().characterSheet.counters[1].current,0);assert.equal(s.changeCharacterCounter(request).replayed,true);assert.equal(s.read().revision,initial.revision+1);assert.deepEqual(s.read().state,initial.state);
 assert.throws(()=>s.changeCharacterCounter(make()),{status:409});assert.throws(()=>s.changeCharacterCounter({...make(),counterId:'counter-missing'}),{status:404});assert.throws(()=>s.changeCharacterCounter({...make(),characterId:'foreign-character'}),{status:409});assert.throws(()=>s.changeCharacterCounter({...make(),delta:2}),{status:422});assert.throws(()=>s.changeCharacterCounter({...request,delta:1}),{status:409});
 const before=s.read();db.exec("CREATE TRIGGER fail_counter BEFORE INSERT ON character_sheet_changes BEGIN SELECT RAISE(ABORT,'audit failed');END");assert.throws(()=>s.changeCharacterCounter(make('counter-slot-nine',1)));assert.deepEqual(s.read(),before);db.exec('DROP TRIGGER fail_counter');
 s.changeCharacterCounter(make('counter-slot-nine',1));assert.equal(s.read().characterSheet.counters[1].current,1);assert.throws(()=>s.changeCharacterCounter(make('counter-slot-nine',1)),{status:409});assert.throws(()=>s.changeCharacterCounter({...make(),expectedRevision:initial.revision}),{status:409});
 }finally{db.close();s.close();}
});
