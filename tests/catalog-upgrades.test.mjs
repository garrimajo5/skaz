import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {openStore} from '../server/store.mjs';
import {bundledCatalog} from '../server/bundled-catalog.mjs';
import {validateCatalog,createCatalog} from '../server/catalog.mjs';
import {DatabaseSync} from 'node:sqlite';
const previous=JSON.parse(readFileSync(new URL('./fixtures/create-undead-v1.json',import.meta.url),'utf8'));
const old=validateCatalog(previous)[0],id=old.id;
const oldCelestial=validateCatalog(JSON.parse(readFileSync(new URL('./fixtures/conjure-celestial-v1.json',import.meta.url),'utf8')))[0];
const read=s=>s.catalog.lookup(new URLSearchParams({id})).entry;
const legacy=()=>({schemaVersion:1,entries:bundledCatalog().bundle.entries.filter(e=>!['ghoul','ghast','wight','mummy','couatl','pegasus','unicorn'].some(slug=>e.id==='srd51:2014:monster:'+slug)).map(e=>e.id===id?old:e.id===oldCelestial.id?oldCelestial:e)});

test('known bundled revision upgrades only after review, preserves saved spell snapshots and survives reopen',()=>{
 const dir=mkdtempSync(join(tmpdir(),'skaz-upgrades-')),file=join(dir,'test.sqlite');let s=openStore(file);
 try{
  s.catalog.importEntries(legacy(),{apply:true});assert.equal(s.catalog.coverage().total,393);
  s.setSpell({mutationId:randomUUID(),expectedRevision:s.read().revision,characterId:s.read().context.characterId,catalogId:id,status:'known'});
  const before=s.read(),book=s.spellbook(),history=s.history(),exported=s.exportActive(6);
  const preview=s.catalog.previewBundled();assert.deepEqual([preview.added,preview.updated,preview.unchanged],[7,2,391]);
  assert.equal(s.catalog.coverage().scopes.srd51Spells.upgradable,2);assert.equal(preview.updates[0].id,id);assert.equal(preview.updates[0].fromVersion,old.source.version);assert.ok(preview.updates[0].reason);
  assert.deepEqual(read(s),old);assert.equal(s.catalog.spellInventory().entries.find(e=>e.id===id).status,'update-available');
  assert.throws(()=>s.catalog.installBundled({version:'old'}),{status:409});assert.deepEqual(read(s),old);
  const report=s.catalog.installBundled({version:preview.version});assert.deepEqual([report.added,report.updated,report.unchanged],[7,2,391]);
  assert.equal(read(s).links.filter(x=>x.includes(':monster:')).length,4);assert.doesNotMatch(read(s).text,/не все эти формы/);
  assert.deepEqual(s.read(),before);assert.deepEqual(s.spellbook(),book);assert.deepEqual(s.history(),history);
  assert.deepEqual(s.exportActive(6).catalog,exported.catalog);
  assert.equal(s.catalog.coverage().scopes.srd51Spells.upgradable,0);
  const again=s.catalog.installBundled({version:preview.version});assert.deepEqual([again.added,again.updated,again.unchanged],[0,0,400]);
  s.close();s=openStore(file);assert.equal(s.catalog.coverage().total,400);assert.deepEqual(s.spellbook(),book);assert.equal(s.catalog.spellInventory().entries.find(e=>e.id===id).status,'installed');
 }finally{s.close();rmSync(dir,{recursive:true,force:true});}
});

test('personal edits block additions and upgrades atomically, even if the source version matches',()=>{
 for(const change of [e=>e.text+=' Личная пометка',e=>e.name.ru+=' моё',e=>e.spell.range.feet=30,e=>e.source.terms+=' locally reviewed']){
  const s=openStore(':memory:');try{
   const personal=structuredClone(old);change(personal);s.catalog.importEntries({schemaVersion:1,entries:[personal]},{apply:true});
   const before=read(s),version=bundledCatalog().version;
   assert.throws(()=>s.catalog.previewBundled(),{status:409});assert.throws(()=>s.catalog.installBundled({version}),{status:409});
   assert.deepEqual(read(s),before);assert.equal(s.catalog.coverage().total,1);assert.equal(s.read().revision,0);
   assert.equal(s.catalog.spellInventory().entries.find(e=>e.id===id).status,'conflict');
  }finally{s.close();}
 }
});

test('a different conflict rolls back the known upgrade; personal import cannot invoke the upgrade policy',()=>{
 const s=openStore(':memory:');try{
  const pack=legacy(),other=pack.entries.find(e=>e.id==='srd51:2014:monster:zombie');other.text+=' Private';s.catalog.importEntries(pack,{apply:true});
  const before=s.catalog.search(new URLSearchParams({limit:'100'}));const {bundle,version,upgrades}=bundledCatalog();
  assert.throws(()=>s.catalog.installBundled({version}),{status:409});assert.deepEqual(read(s),old);assert.equal(s.catalog.coverage().total,393);assert.deepEqual(s.catalog.search(new URLSearchParams({limit:'100'})),before);
  assert.throws(()=>s.catalog.importEntries(bundle,{apply:true,upgrades}),{status:409});assert.deepEqual(read(s),old);
  assert.throws(()=>s.catalog.reviewedImport({bundle,upgrades}),{status:422});
 }finally{s.close();}
});

test('fresh catalogs do not count absent historical cards as updates',()=>{
 const s=openStore(':memory:');try{const p=s.catalog.previewBundled();assert.deepEqual([p.added,p.updated,p.unchanged],[400,0,0]);assert.deepEqual(p.updates,[]);s.catalog.installBundled({version:p.version});assert.equal(s.catalog.coverage().scopes.srd51Spells.installed,319);}finally{s.close();}
});

test('old saved versions transfer into a current catalog without downgrading it or losing the snapshot',()=>{
 const source=openStore(':memory:'),target=openStore(':memory:');try{
  source.catalog.importEntries(previous,{apply:true});source.setSpell({mutationId:randomUUID(),expectedRevision:0,characterId:source.read().context.characterId,catalogId:id,status:'prepared'});
  const file=source.exportActive(6);target.catalog.installBundled({version:target.catalog.previewBundled().version});const latest=read(target);
  const command={mutationId:randomUUID(),expectedRevision:target.read().revision,destination:'new-campaign',file};
  target.importActive(command);assert.equal(target.importActive(command).replayed,true);
  assert.deepEqual(target.spellbook().entries,source.spellbook().entries);assert.deepEqual(read(target),latest);assert.deepEqual(target.exportActive(6).catalog,file.catalog);
  const edited=structuredClone(file);edited.catalog.entries[0].text+=' Private change';const before=target.read(),count=target.campaigns().length;
  assert.throws(()=>target.importActive({...command,mutationId:randomUUID(),expectedRevision:before.revision,file:edited}),{status:409});assert.deepEqual(target.read(),before);assert.equal(target.campaigns().length,count);
 }finally{source.close();target.close();}
});

test('conflict introduced after preview is checked again before applying a known update',()=>{
 const s=openStore(':memory:');try{
  s.catalog.importEntries(legacy(),{apply:true});const preview=s.catalog.previewBundled();
  const ghoul=structuredClone(bundledCatalog().bundle.entries.find(e=>e.id.endsWith(':monster:ghoul')));ghoul.text+=' Private';s.catalog.importEntries({schemaVersion:1,entries:[ghoul]},{apply:true});
  assert.throws(()=>s.catalog.installBundled({version:preview.version}),{status:409});assert.deepEqual(read(s),old);assert.equal(s.catalog.coverage().total,394);
 }finally{s.close();}
});

test('storage failure after an update rolls back both replacement and preceding additions',()=>{
 const db=new DatabaseSync(':memory:');try{const catalog=createCatalog(db);catalog.importEntries(previous,{apply:true});
  db.exec("CREATE TRIGGER fail_ghoul BEFORE INSERT ON catalog_entries WHEN NEW.id='srd51:2014:monster:ghoul' BEGIN SELECT RAISE(ABORT,'test storage failure'); END");
  const p=catalog.previewBundled();assert.throws(()=>catalog.installBundled({version:p.version}),/test storage failure/);
  assert.equal(catalog.coverage().total,1);assert.deepEqual(catalog.lookup(new URLSearchParams({id})).entry,old);
 }finally{db.close();}
});
