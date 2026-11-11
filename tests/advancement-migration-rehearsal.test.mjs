import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {openStore} from '../server/store.mjs';
import {verifyAdvancementMigration} from '../scripts/verify-advancement-migration.mjs';
async function fixture(t){const dir=await mkdtemp(join(tmpdir(),'skaz-migration-qa-'));t.after(()=>rm(dir,{recursive:true,force:true}));return {source:join(dir,'source.sqlite'),copy:join(dir,'copy.sqlite')};}
test('migration rehearsal preserves source bytes and all existing tables including opaque personal blobs',async t=>{
 const {source,copy}=await fixture(t);const store=openStore(source);store.close();
 const db=new DatabaseSync(source);db.exec("CREATE TABLE fixture_private_blob(id TEXT PRIMARY KEY,bytes BLOB); INSERT INTO fixture_private_blob VALUES ('private',x'0001ff')");db.close();
 const before=await readFile(source),report=await verifyAdvancementMigration(source,copy);
 assert.equal(report.verified,true);assert.equal(report.addedTables.length,3);assert.deepEqual(await readFile(source),before);
 assert.ok(!JSON.stringify(report).includes('private'));const disabled=openStore(copy);assert.equal(Object.hasOwn(disabled.read(),'advancement'),false);disabled.close();
 const reopened=openStore(copy,{classAdvancement:true});assert.equal(reopened.read().advancement,null);reopened.close();
});
test('rehearsal refuses same/existing destination and unrelated input without overwriting files',async t=>{
 const {source,copy}=await fixture(t);const s=openStore(source);s.close();const before=await readFile(source);
 await assert.rejects(verifyAdvancementMigration(source,source));assert.deepEqual(await readFile(source),before);
 await writeFile(copy,'reserved');await assert.rejects(verifyAdvancementMigration(source,copy));assert.equal(await readFile(copy,'utf8'),'reserved');
 const foreign=source+'.foreign';const db=new DatabaseSync(foreign);db.exec('CREATE TABLE example(id INTEGER)');db.close();await assert.rejects(verifyAdvancementMigration(foreign,copy+'.unused'),/SKAZ/);
});
