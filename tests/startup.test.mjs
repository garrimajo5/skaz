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
 const before=readFileSync(database),config=startupOptions({database,mode:'individual',origin:'https://example.test',port:'4178',campaignPeople:'1'});
 assert.equal(config.campaignPeople,true);
 const inspection=new DatabaseSync(database,{readOnly:true});
 try { assert.equal(inspection.prepare("SELECT 1 FROM sqlite_master WHERE name='campaign_people'").get(),undefined); }
 finally { inspection.close(); }
 assert.equal(config.mode,'individual');assert.equal(config.port,4178);assert.equal(config.publicOrigin,'https://example.test');assert.deepEqual(readFileSync(database),before);
 const db=new DatabaseSync(database);db.exec('DELETE FROM character_access');db.close();const revoked=readFileSync(database);
 assert.throws(()=>startupOptions({database,mode:'individual',origin:'https://example.test'}),/не готовы/);assert.deepEqual(readFileSync(database),revoked);
});

test('campaign memory flag requires protected v15 startup before opening a database',()=>{
 const options={database:fixture()};
 assert.equal(startupOptions(options).campaignPeople,undefined);
 for(const value of ['',true,'true','yes','2']) {
  assert.throws(()=>startupOptions({...options,campaignPeople:value}),/SKAZ_CAMPAIGN_PEOPLE/);
 }
 assert.throws(()=>startupOptions({...options,campaignPeople:'1'}),/индивидуального HTTPS/);
 assert.throws(()=>startupOptions({...options,campaignPeople:'1',mode:'individual',profileWriteFormat:'14',profileEditors:'0'}),/v15/);
 assert.throws(()=>openStore(options.database,{campaignPeople:true,profileWriteFormat:14}),{status:422});
 const entry=fileURLToPath(new URL('../server/index.mjs',import.meta.url));
 const result=spawnSync(process.execPath,[entry],{env:{...process.env,SKAZ_DB:options.database,SKAZ_AUTH_MODE:'shared',
   SKAZ_CAMPAIGN_PEOPLE:'1',SKAZ_PROFILE_WRITE_FORMAT:'15'},encoding:'utf8',timeout:5000});
 assert.ifError(result.error);
 assert.equal(result.status,1);
 assert.match(result.stderr,/индивидуального HTTPS/);
 assert.equal(existsSync(options.database),false);
});

test('class advancement startup flag is explicit and invalid values fail before creating a database',()=>{
 assert.equal(startupOptions({database:fixture()}).classAdvancement,undefined);
 assert.equal(startupOptions({database:fixture(),classAdvancement:'1'}).classAdvancement,true);
 for(const value of ['',true,'true','yes','2'])assert.throws(()=>startupOptions({database:fixture(),classAdvancement:value}),/SKAZ_CLASS_ADVANCEMENT/);
 const database=fixture(),entry=fileURLToPath(new URL('../server/index.mjs',import.meta.url));
 const result=spawnSync(process.execPath,[entry],{env:{...process.env,SKAZ_DB:database,SKAZ_CLASS_ADVANCEMENT:'yes',SKAZ_AUTH_MODE:'shared'},encoding:'utf8',timeout:5000});assert.equal(result.status,1);assert.equal(existsSync(database),false);
});

test('personal art requires explicit individual HTTPS startup before any database creation',()=>{
 assert.equal(startupOptions({database:fixture()}).personalArt,undefined);
 for(const value of ['',true,'true','yes','2'])assert.throws(()=>startupOptions({database:fixture(),personalArt:value}),/SKAZ_PERSONAL_ART/);
 assert.throws(()=>startupOptions({database:fixture(),personalArt:'1'}),/индивидуального HTTPS/);
 assert.throws(()=>startupOptions({database:fixture(),personalArt:'1',mode:'individual'}),/HTTPS/);
 const entry=fileURLToPath(new URL('../server/index.mjs',import.meta.url));
 for(const override of [{SKAZ_PERSONAL_ART:'yes'},{SKAZ_PERSONAL_ART:'1'},{SKAZ_PERSONAL_ART:'1',SKAZ_AUTH_MODE:'individual'}]){
  const database=fixture(),result=spawnSync(process.execPath,[entry],{env:{...process.env,SKAZ_DB:database,SKAZ_AUTH_MODE:'shared',SKAZ_PUBLIC_ORIGIN:'https://example.test',PORT:'4173',...override},encoding:'utf8',timeout:5000});
  assert.ifError(result.error);assert.equal(result.status,1);assert.equal(existsSync(database),false);
 }
});

test('personal art opt-in preserves read-only preflight and does not initialize image tables',async()=>{
 const database=fixture(),store=openStore(database),game=store.read();
 store.access.apply({action:'bootstrap-owner',userId:'art-startup-owner',displayName:'Synthetic',campaignId:game.context.campaignId,characterId:game.context.characterId});
 await store.authentication().setPassword('art-startup-owner','owner','synthetic art startup password');store.close();
 const before=readFileSync(database),config=startupOptions({database,mode:'individual',origin:'https://example.test',personalArt:'1'});
 assert.equal(config.personalArt,true);assert.deepEqual(readFileSync(database),before);
 const db=new DatabaseSync(database,{readOnly:true});assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name='personal_art_schema'").get().n,0);db.close();
});

test('profile editor recovery is explicit and validates before opening a database',()=>{
 assert.equal(startupOptions({database:fixture()}).profileEditors,undefined);
 assert.equal(startupOptions({database:fixture(),profileEditors:'0'}).profileEditors,false);
 assert.equal(startupOptions({database:fixture(),profileEditors:'1'}).profileEditors,undefined);
 for(const value of ['',true,'false','2'])assert.throws(()=>startupOptions({database:fixture(),profileEditors:value}),/SKAZ_PROFILE_EDITORS/);
 const database=fixture(),entry=fileURLToPath(new URL('../server/index.mjs',import.meta.url));
 const result=spawnSync(process.execPath,[entry],{env:{...process.env,SKAZ_DB:database,SKAZ_AUTH_MODE:'shared',SKAZ_PROFILE_EDITORS:'invalid'},encoding:'utf8',timeout:5000});
 assert.equal(result.status,1);assert.equal(existsSync(database),false);
});

test('v14 write compatibility is explicit and requires the recovery HTML flag at startup',()=>{
 const options={database:fixture()};
 assert.equal(startupOptions(options).profileWriteFormat,undefined);
 assert.equal(startupOptions({...options,profileEditors:'0',profileWriteFormat:'15'}).profileWriteFormat,undefined);
 assert.equal(startupOptions({...options,profileEditors:'0',profileWriteFormat:'14'}).profileWriteFormat,14);
 assert.throws(()=>startupOptions({...options,profileWriteFormat:'14'}),/требует SKAZ_PROFILE_EDITORS=0/);
 for(const value of ['',14,'13','16'])assert.throws(()=>startupOptions({...options,profileWriteFormat:value}),/SKAZ_PROFILE_WRITE_FORMAT/);
 const entry=fileURLToPath(new URL('../server/index.mjs',import.meta.url));
 const result=spawnSync(process.execPath,[entry],{env:{...process.env,SKAZ_DB:options.database,SKAZ_AUTH_MODE:'shared',SKAZ_PROFILE_EDITORS:'1',SKAZ_PROFILE_WRITE_FORMAT:'14'},encoding:'utf8',timeout:5000});
 assert.equal(result.status,1);
 assert.equal(existsSync(options.database),false);
});
