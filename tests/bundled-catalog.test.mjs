import {CATALOG_TOTAL, OPEN_CATALOG_TOTAL} from './catalog-expectations.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {openStore} from '../server/store.mjs';
import {bundledCatalog} from '../server/bundled-catalog.mjs';
import {createApp} from '../server/app.mjs';

test('bundled preview is read-only and installation is complete, repeatable and independent of progress',()=>{
 const store=openStore(':memory:');try{
  const before=store.read(),preview=store.catalog.previewBundled();assert.equal(preview.total,CATALOG_TOTAL);assert.equal(preview.added,CATALOG_TOTAL);assert.equal(preview.complete,false);assert.equal(store.catalog.coverage().total,0);
  const request={version:preview.version};const first=store.catalog.installBundled(request);assert.equal(first.added,CATALOG_TOTAL);assert.equal(first.unchanged,0);
  assert.equal(store.catalog.installBundled(request).unchanged,CATALOG_TOTAL);assert.equal(store.catalog.previewBundled().added,0);
  assert.deepEqual(store.read(),before);assert.deepEqual(store.history(),[]);
  assert.equal(store.catalog.coverage().openlyLicensed,OPEN_CATALOG_TOTAL);assert.equal(store.catalog.coverage().referenceOnly,1);
  assert.throws(()=>store.catalog.installBundled({version:'old'}),{status:409});assert.throws(()=>store.catalog.installBundled({...request,path:'../other'}),{status:422});
 }finally{store.close();}
});
// Import conflicts use the same path for every creature pack. Keep the contract
// here; pack tests cover source content, links, installation and scoped access.
for (const field of ['name', 'text']) {
 test(`bundled ${field} conflict preserves every installed card and blocks all additions`, () => {
  const store = openStore(':memory:');
  try {
   const {bundle, version} = bundledCatalog();
   // Exercise an early conflict and a later, linked monster conflict.
   const source = field === 'name' ? bundle.entries[0] : bundle.entries.findLast(entry => entry.monster);
   const personal = structuredClone(source);
   if (field === 'name') personal.name.ru += ' — личная версия';
   else personal.text += ' Личная правка';

   const byId = new Map(bundle.entries.map(entry => [entry.id, entry]));
   const installed = new Map([[personal.id, personal]]);
   const pending = [...personal.links];
   while (pending.length) {
    const id = pending.pop();
    if (installed.has(id)) continue;
    const dependency = byId.get(id);
    assert.ok(dependency, `Missing fixture dependency: ${id}`);
    installed.set(id, dependency);
    pending.push(...dependency.links);
   }
   store.catalog.importEntries({schemaVersion:1, entries:[...installed.values()]}, {apply:true});
   const lookup = id => store.catalog.lookup(new URLSearchParams({id})).entry;
   const before = [...installed.keys()].map(lookup);
   const missing = bundle.entries.filter(entry => !installed.has(entry.id));
   assert.ok(missing.length > 0);
   const game = store.read(), history = store.history();

   for (const operation of [() => store.catalog.previewBundled(), () => store.catalog.installBundled({version})]) {
    assert.throws(operation, {status:409});
    assert.equal(store.catalog.coverage().total, installed.size);
    assert.deepEqual([...installed.keys()].map(lookup), before);
    // Check every missing ID, not a search page that could hide partial writes.
    for (const entry of missing) assert.throws(() => lookup(entry.id), {status:404});
    assert.deepEqual(store.read(), game);
    assert.deepEqual(store.history(), history);
   }
  } finally { store.close(); }
 });
}
test('bundled HTTP install requires app headers and a reviewed version, handles replay without new keys',async t=>{
 const store=openStore(':memory:'),app=createApp(store);await new Promise(r=>app.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>app.close(r));store.close();});
 const url=`http://127.0.0.1:${app.address().port}/api/catalog/bundled`,preview=await fetch(url).then(r=>r.json()),body=JSON.stringify({version:preview.version}),headers={'Content-Type':'application/json','X-Skaz-Client':'local-v1'};
 assert.equal((await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body})).status,403);
 assert.equal((await fetch(url,{method:'POST',headers:{...headers,Origin:'https://other.example'},body})).status,403);
 assert.equal((await fetch(url,{method:'POST',headers,body}).then(r=>r.json())).added,CATALOG_TOTAL);
 assert.equal((await fetch(url,{method:'POST',headers,body}).then(r=>r.json())).unchanged,CATALOG_TOTAL);
 assert.equal(store.read().revision,0);
});
