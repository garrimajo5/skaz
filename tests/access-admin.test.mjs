import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openStore } from '../server/store.mjs';
import { administerAccess } from '../scripts/access-admin.mjs';

test('administrative command backs up before assignment without changing game progress',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'skaz-access-admin-')),database=join(dir,'db.sqlite'),requestFile=join(dir,'request.json'),backupFile=join(dir,'before.sqlite');
  let store=openStore(database);const before=store.read();store.close();
  await writeFile(requestFile,JSON.stringify({action:'bootstrap-owner',userId:'test-owner',displayName:'Owner',campaignId:before.context.campaignId,characterId:before.context.characterId}));
  const result=await administerAccess({database,requestFile,backupFile});assert.equal(result.applied,true);
  store=openStore(database);
  try {assert.deepEqual(store.read(),before);assert.deepEqual(store.forUser('test-owner','window-one').read().context,before.context);}
  finally {store.close();}
  const db=new DatabaseSync(backupFile);
  try { assert.equal(db.prepare('SELECT count(*) AS n FROM access_users').get().n,0);assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok'); }
  finally {db.close();}
});

test('admin tool refuses overwriting existing backup or database and keeps partial commands atomic',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'skaz-access-admin-')),database=join(dir,'db.sqlite'),requestFile=join(dir,'request.json'),backupFile=join(dir,'existing.sqlite');
  const store=openStore(database),before=store.read();store.close();
  await writeFile(backupFile,'KEEP_EXISTING');
  await writeFile(requestFile,JSON.stringify({action:'bootstrap-owner',userId:'test-owner',displayName:'Owner',campaignId:before.context.campaignId,characterId:'missing-character'}));
  await assert.rejects(()=>administerAccess({database,requestFile,backupFile}));
  assert.equal(await readFile(backupFile,'utf8'),'KEEP_EXISTING');
  await assert.rejects(()=>administerAccess({database,requestFile,backupFile:database}));
  const failedCopy=join(dir,'failed-before.sqlite');
  await assert.rejects(()=>administerAccess({database,requestFile,backupFile:failedCopy}),{status:404});
  const reopened=openStore(database);
  try { assert.deepEqual(reopened.read(),before);assert.throws(()=>reopened.access.user('test-owner'),{status:404}); }
  finally {reopened.close();}
  const db=new DatabaseSync(failedCopy);
  try { assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok'); }
  finally {db.close();}
});
