import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {openStore} from '../server/store.mjs';
import {bundledCatalog} from '../server/bundled-catalog.mjs';
import {validateCatalog} from '../server/catalog.mjs';
const previous=JSON.parse(readFileSync(new URL('./fixtures/rule-clauses-before-2026-11-15.json',import.meta.url),'utf8'));
const old=new Map(previous.entries.map(e=>[e.id,e]));
const {bundle,version,upgrades}=bundledCatalog();
const legacy=()=>({...bundle,entries:bundle.entries.map(e=>old.get(e.id)||e)});
const get=(s,id)=>s.catalog.lookup(new URLSearchParams({id})).entry;
const hash=e=>createHash('sha256').update(JSON.stringify(e)).digest('hex');
test('two corrected clauses preserve SRD version boundaries and have exact reviewed upgrade hashes',()=>{
  const entries=validateCatalog(bundle);
  for(const before of validateCatalog(previous)) {
    const next=entries.find(e=>e.id===before.id);
    assert.deepEqual(next.spell,before.spell);
    assert.deepEqual(next.links,before.links);
    assert.equal(next.source.url,before.source.url);
    assert.ok(upgrades.some(u=>u.id===before.id&&u.fromSha256===hash(before)&&u.toSha256===hash(next)));
  }
  assert.match(entries.find(e=>e.id.endsWith(':wall-of-force')).text,/плоская поверхность из десяти панелей 10×10 футов, каждая.*примыкает/);
  assert.match(entries.find(e=>e.id.endsWith(':globe-of-invulnerability')).text,/могут выбирать цели внутри преграды, но не воздействуют/);
  assert.ok(previous.entries.every(e=>!e.text.includes('плоская поверхность')&&!e.text.includes('могут выбирать цели внутри')));
});
test('review then installation updates both exact old cards once and leaves game state unchanged',()=>{
  const s=openStore(':memory:');
  try {
    s.catalog.importEntries(legacy(),{apply:true});
    const state=s.read(),history=s.history();
    const preview=s.catalog.previewBundled();
    assert.equal(preview.updated,2); assert.equal(preview.added,0);
    for(const [id]of old)assert.equal(get(s,id).text,old.get(id).text);
    assert.throws(()=>s.catalog.installBundled({version:'outdated'}),{status:409});
    const result=s.catalog.installBundled({version}); assert.equal(result.updated,2);
    for(const [id]of old)assert.equal(get(s,id).text,bundle.entries.find(e=>e.id===id).text);
    assert.equal(s.catalog.installBundled({version}).unchanged,bundle.entries.length);
    assert.deepEqual(s.read(),state); assert.deepEqual(s.history(),history);
  } finally {s.close();}
});
test('a personal edit is a conflict and prevents upgrading the other card atomically',()=>{
  const s=openStore(':memory:');
  try {
    const personal=structuredClone(legacy());
    personal.entries.find(e=>e.id===previous.entries[0].id).text+=' Личная пометка.';
    s.catalog.importEntries(personal,{apply:true});
    assert.throws(()=>s.catalog.installBundled({version}),{status:409});
    for(const e of personal.entries.filter(e=>old.has(e.id)))assert.equal(get(s,e.id).text,e.text);
  } finally {s.close();}
});
