import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {startupOptions} from '../server/startup.mjs';
import {openStore} from '../server/store.mjs';

const fixture=()=>join(mkdtempSync(join(tmpdir(),'skaz-startup-')),'db.sqlite');
test('shared startup is the default and does not initialize individual authentication',()=>{
 const database=fixture(),store=openStore(database);store.close();const before=readFileSync(database);
 assert.equal(startupOptions({database}).mode,'shared');assert.deepEqual(readFileSync(database),before);
 const db=new DatabaseSync(database,{readOnly:true});assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name='auth_schema'").get().n,0);db.close();
});

test('invalid mode, origin and port fail before the real entry point creates a database',()=>{
 const entry=fileURLToPath(new URL('../server/index.mjs',import.meta.url));
 for(const override of [{SKAZ_AUTH_MODE:'automatic'},{SKAZ_AUTH_MODE:''},{PORT:'0'},{SKAZ_PUBLIC_ORIGIN:'http://example.test'},{SKAZ_AUTH_MODE:'individual',SKAZ_PUBLIC_ORIGIN:'https://example.test'}]){
  const database=fixture(),result=spawnSync(process.execPath,[entry],{env:{...process.env,SKAZ_DB:database,SKAZ_AUTH_MODE:'shared',SKAZ_PUBLIC_ORIGIN:'https://example.test',PORT:'4173',...override},encoding:'utf8',timeout:5000});
  assert.ifError(result.error);assert.equal(result.status,1,result.stderr);assert.equal(existsSync(database),false);
 }
});

test('individual startup refuses unassigned games without initializing credentials or rewriting progress',()=>{
 const database=fixture(),store=openStore(database),game=store.read();store.close();const before=readFileSync(database);
 assert.throws(()=>startupOptions({database,mode:'individual'}),/HTTPS/);
 assert.throws(()=>startupOptions({database,mode:'individual',origin:'https://example.test'}),/не готовы/);assert.deepEqual(readFileSync(database),before);
 const reopened=openStore(database);assert.deepEqual(reopened.read(),game);reopened.close();
});

test('only explicitly prepared individual startup passes, and revoked grants immediately block the next start',async()=>{
 const database=fixture(),store=openStore(database),game=store.read();
 store.access.apply({action:'bootstrap-owner',userId:'startup-owner',displayName:'Synthetic',campaignId:game.context.campaignId,characterId:game.context.characterId});
 await store.authentication().setPassword('startup-owner','owner','synthetic startup password');store.close();
 const before=readFileSync(database),config=startupOptions({database,mode:'individual',origin:'https://example.test',port:'4178'});
 assert.equal(config.mode,'individual');assert.equal(config.port,4178);assert.equal(config.publicOrigin,'https://example.test');assert.deepEqual(readFileSync(database),before);
 const db=new DatabaseSync(database);db.exec('DELETE FROM character_access');db.close();const revoked=readFileSync(database);
 assert.throws(()=>startupOptions({database,mode:'individual',origin:'https://example.test'}),/не готовы/);assert.deepEqual(readFileSync(database),revoked);
});
