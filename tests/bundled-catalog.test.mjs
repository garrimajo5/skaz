import test from 'node:test';
import assert from 'node:assert/strict';
import {openStore} from '../server/store.mjs';
import {bundledCatalog} from '../server/bundled-catalog.mjs';
import {createApp} from '../server/app.mjs';

test('bundled preview is read-only and installation is complete, repeatable and independent of progress',()=>{
 const store=openStore(':memory:');try{
  const before=store.read(),preview=store.catalog.previewBundled();assert.equal(preview.total,543);assert.equal(preview.added,543);assert.equal(preview.complete,false);assert.equal(store.catalog.coverage().total,0);
  const request={version:preview.version};const first=store.catalog.installBundled(request);assert.equal(first.added,543);assert.equal(first.unchanged,0);
  assert.equal(store.catalog.installBundled(request).unchanged,543);assert.equal(store.catalog.previewBundled().added,0);
  assert.deepEqual(store.read(),before);assert.deepEqual(store.history(),[]);
  assert.equal(store.catalog.coverage().openlyLicensed,542);assert.equal(store.catalog.coverage().referenceOnly,1);
  assert.throws(()=>store.catalog.installBundled({version:'old'}),{status:409});assert.throws(()=>store.catalog.installBundled({...request,path:'../other'}),{status:422});
 }finally{store.close();}
});
test('conflict prevents every bundled addition and preserves installed personal materials',()=>{
 const store=openStore(':memory:');try{
  const {bundle,version}=bundledCatalog(),existing=structuredClone(bundle.entries[0]);existing.name.ru+=' — личная версия';
  store.catalog.importEntries({schemaVersion:1,entries:[existing]},{apply:true});
  const before=store.catalog.search();assert.throws(()=>store.catalog.previewBundled(),{status:409});assert.throws(()=>store.catalog.installBundled({version}),{status:409});
  assert.deepEqual(store.catalog.search(),before);assert.equal(store.catalog.coverage().total,1);
 }finally{store.close();}
});
test('bundled HTTP install requires app headers and a reviewed version, handles replay without new keys',async t=>{
 const store=openStore(':memory:'),app=createApp(store);await new Promise(r=>app.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>app.close(r));store.close();});
 const url=`http://127.0.0.1:${app.address().port}/api/catalog/bundled`,preview=await fetch(url).then(r=>r.json()),body=JSON.stringify({version:preview.version}),headers={'Content-Type':'application/json','X-Skaz-Client':'local-v1'};
 assert.equal((await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body})).status,403);
 assert.equal((await fetch(url,{method:'POST',headers:{...headers,Origin:'https://other.example'},body})).status,403);
 assert.equal((await fetch(url,{method:'POST',headers,body}).then(r=>r.json())).added,543);
 assert.equal((await fetch(url,{method:'POST',headers,body}).then(r=>r.json())).unchanged,543);
 assert.equal(store.read().revision,0);
});
