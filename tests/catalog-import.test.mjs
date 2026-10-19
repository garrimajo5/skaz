import test from 'node:test';
import assert from 'node:assert/strict';
import {openStore} from '../server/store.mjs';
import {createApp} from '../server/app.mjs';
const entry=(id='personal:rule')=>({id,ruleset:'5e-2014',kind:'mechanic',name:{ru:'Правило стола',en:'Table rule'},source:{url:'https://example.com/table',title:'Personal table',version:'1',usage:'personal',terms:'Own text for personal play'},text:'Тестовый собственный материал.',links:[]});
const bundle={schemaVersion:1,entries:[entry()]};
test('personal catalog preview writes nothing, requires reviewed content and safely replays normalized order',()=>{
 const store=openStore(':memory:');try{
  const before=store.read(),file={schemaVersion:1,entries:[entry('personal:two'),entry('personal:one')]};
  const preview=store.catalog.reviewedImport({bundle:file});assert.equal(preview.added,2);assert.equal(preview.usage.personal,2);assert.equal(store.catalog.coverage().total,0);
  const altered=structuredClone(file);altered.entries[0].text='Changed';assert.throws(()=>store.catalog.reviewedImport({bundle:altered,version:preview.version},true),{status:409});assert.equal(store.catalog.coverage().total,0);
  const request={bundle:{...file,entries:[...file.entries].reverse()},version:preview.version};assert.equal(store.catalog.reviewedImport(request,true).added,2);assert.equal(store.catalog.reviewedImport(request,true).unchanged,2);assert.deepEqual(store.read(),before);
  assert.throws(()=>store.catalog.reviewedImport({bundle:file,extra:1}),{status:422});
 }finally{store.close();}
});
test('personal catalog rejects mixed editions, dangling relations and conflicts atomically',()=>{
 const store=openStore(':memory:');try{
  for(const mutate of [e=>e.ruleset='5e-2024',e=>e.links=['missing:entry'],e=>e.source.url='javascript:alert(1)',e=>e.source.usage='cc-by-4.0']){
   const bad=entry('personal:bad');mutate(bad);assert.throws(()=>store.catalog.reviewedImport({bundle:{schemaVersion:1,entries:[entry(),bad]}}),{status:422});assert.equal(store.catalog.coverage().total,0);
  }
  const p=store.catalog.reviewedImport({bundle});store.catalog.reviewedImport({bundle,version:p.version},true);
  const changed=entry();changed.text='Another version';assert.throws(()=>store.catalog.reviewedImport({bundle:{schemaVersion:1,entries:[entry('personal:new'),changed]}}),{status:409});assert.equal(store.catalog.coverage().total,1);
 }finally{store.close();}
});
test('HTTP personal import enforces headers for preview and apply and never modifies game state',async t=>{
 const store=openStore(':memory:'),app=createApp(store);await new Promise(r=>app.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>app.close(r));store.close();});
 const base=`http://127.0.0.1:${app.address().port}/api/catalog/import`,headers={'Content-Type':'application/json','X-Skaz-Client':'local-v1'},body=JSON.stringify({bundle});
 assert.equal((await fetch(base+'/preview',{method:'POST',headers:{'Content-Type':'application/json'},body})).status,403);
 const preview=await fetch(base+'/preview',{method:'POST',headers,body}).then(r=>r.json());assert.equal(store.catalog.coverage().total,0);
 const applied=await fetch(base,{method:'POST',headers,body:JSON.stringify({bundle,version:preview.version})});assert.equal(applied.status,200);assert.equal(store.read().revision,0);
 assert.equal((await fetch(base,{method:'POST',headers:{...headers,Origin:'https://other.example'},body:JSON.stringify({bundle,version:preview.version})})).status,403);
});
