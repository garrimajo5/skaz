import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {realpath} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {privateDatabaseBackup} from './private-backup.mjs';
import {openStore} from '../server/store.mjs';
const quote=name=>'"'+name.replaceAll('"','""')+'"';
function snapshot(file){
 const db=new DatabaseSync(file,{readOnly:true});
 try{
  if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'||db.prepare('PRAGMA foreign_key_check').all().length)throw Error('Database integrity check failed');
  return new Map(db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(({name,sql})=>{
   const rows=db.prepare('SELECT * FROM '+quote(name)).all().map(row=>JSON.stringify(row,(_,v)=>typeof v==='bigint'?String(v):v)).sort();
   return [name,{sql,digest:createHash('sha256').update(JSON.stringify(rows)).digest('hex'),count:rows.length}];
  }));
 }finally{db.close();}
}
// Input is read-only. Only a newly reserved independent copy is migrated.
// Reports counts, never campaign contents or row digests.
export async function verifyAdvancementMigration(source,destination){
 const before=snapshot(source);
 const required=['workspace','campaigns','characters','sessions','changes'];
 if(required.some(name=>!before.has(name)))throw Error('Existing SKAZ database required');
 await privateDatabaseBackup(source,destination);
 const copied=snapshot(destination);
 if(JSON.stringify([...copied])!==JSON.stringify([...before]))throw Error('Source changed during backup; use a stable backup as input');
 let store;
 try{store=openStore(destination,{classAdvancement:true});store.read();}finally{store?.close();}
 const after=snapshot(destination),added=[...after.keys()].filter(name=>!before.has(name));
 for(const [name,value]of before)if(JSON.stringify(after.get(name))!==JSON.stringify(value))throw Error('Existing table changed during migration: '+name);
 const allowed=['class_advancement_schema','character_advancement','advancement_changes'];
 if(added.some(name=>!allowed.includes(name))||allowed.some(name=>!after.has(name)))throw Error('Unexpected advancement schema');
 return {verified:true,originalTables:before.size,addedTables:added,sourceModified:false,rollback:'Use the unchanged pre-migration backup with the previous release; retain newer data separately.'};
}
if(process.argv[1]&&await realpath(process.argv[1]).catch(()=>null)===fileURLToPath(import.meta.url)){
 const [source,destination,...rest]=process.argv.slice(2);
 try{if(!source||!destination||rest.length)throw Error('Two paths required');console.log(JSON.stringify(await verifyAdvancementMigration(source,destination)));}
 catch{console.error('Migration rehearsal failed. Source remains read-only; inspect the separate copy.');process.exitCode=1;}
}
