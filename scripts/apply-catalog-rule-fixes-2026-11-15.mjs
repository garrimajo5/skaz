// Run offline, after a consistent backup and rehearsal on an independent copy.
// Only the two known canonical old versions may change; custom edits fail closed.
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {openStore} from '../server/store.mjs';
const [database,mode,...extra]=process.argv.slice(2);
assert.ok(database&&['--preview','--apply'].includes(mode)&&!extra.length);
const allowed=['srd51:2014:spell:globe-of-invulnerability','srd51:2014:spell:wall-of-force'];
function snapshot(){
 const db=new DatabaseSync(database,{readOnly:true});
 try{
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
  return db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' ORDER BY name").all().map(({name,sql})=>{
   const rows=db.prepare('SELECT * FROM "'+name.replaceAll('"','""')+'"').all().filter(r=>name!=='catalog_entries'||!allowed.includes(r.id));
   const serialized=rows.map(r=>JSON.stringify(r,(_,v)=>typeof v==='bigint'?String(v):v)).sort();
   return {name,sql,hash:createHash('sha256').update(JSON.stringify(serialized)).digest('hex')};
  });
 }finally{db.close();}
}
const before=snapshot();let store;
try{
 store=openStore(database,{classAdvancement:true});
 const preview=store.catalog.previewBundled();
 assert.equal(preview.added,0);assert.ok([0,2].includes(preview.updated));
 assert.deepEqual(preview.updates.map(e=>e.id).sort(),preview.updated?allowed:[]);
 if(mode==='--apply')store.catalog.installBundled({version:preview.version});
 assert.deepEqual(snapshot(),before);
 const remaining=store.catalog.previewBundled().updated;
 if(mode==='--apply')assert.equal(remaining,0);
 console.log(JSON.stringify({verified:true,mode,updated:mode==='--apply'?preview.updated:0,pending:remaining,otherTablesAndEntriesUnchanged:true}));
}finally{store?.close();}
