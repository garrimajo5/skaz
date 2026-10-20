import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {openStore} from '../server/store.mjs';
import {administerAuthentication} from '../scripts/auth-admin.mjs';
test('password administration backs up before auth schema and never returns the password',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'skaz-auth-admin-')),database=join(dir,'game.sqlite'),requestFile=join(dir,'private.json'),backupFile=join(dir,'before.sqlite');
 let store=openStore(database);const before=store.read();store.access.apply({action:'create-user',userId:'new-player',displayName:'New'});store.close();
 const password='a long private test password';await writeFile(requestFile,JSON.stringify({action:'set-password',userId:'new-player',login:'player',password}));
 const result=await administerAuthentication({database,requestFile,backupFile});assert.ok(!JSON.stringify(result).includes(password));
 const copy=new DatabaseSync(backupFile);assert.equal(copy.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name='auth_credentials'").get().n,0);copy.close();
 store=openStore(database);try{
  assert.deepEqual(store.read(),before);const auth=store.authentication(),session=await auth.login('player',password);assert.equal(auth.authenticate(session.token),'new-player');
 }finally{store.close();}
 const content=await readFile(backupFile);await assert.rejects(()=>administerAuthentication({database,requestFile,backupFile}));assert.deepEqual(await readFile(backupFile),content);
 await writeFile(requestFile,JSON.stringify({action:'revoke-sessions',userId:'new-player'}));await administerAuthentication({database,requestFile,backupFile:join(dir,'revoke-before.sqlite')});
 const db=new DatabaseSync(database);assert.equal(db.prepare('SELECT count(*) AS n FROM auth_sessions').get().n,0);db.close();
});
