import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {openStore} from '../server/store.mjs';
import {accessReadiness} from '../scripts/access-readiness.mjs';
function fixture(){const dir=mkdtempSync(join(tmpdir(),'skaz-readiness-')),file=join(dir,'db.sqlite');return {dir,file};}
test('readiness never initializes authentication, assigns games or exposes personal records',()=>{
 const {file}=fixture(),store=openStore(file);const before=store.read(),campaigns=store.campaigns();store.close();const bytes=readFileSync(file);
 const report=accessReadiness(file);assert.equal(report.dataReady,false);assert.equal(report.changesAccess,false);assert.equal(report.integrity,true);assert.equal(report.authenticationInitialized,false);assert.equal(report.enabledUsers.length,0);assert.equal(report.campaigns[0].unassignedCharacters,1);assert.ok(report.blockers.includes('campaign-without-owner'));assert.ok(!JSON.stringify(report).includes(before.state.profile.name));assert.deepEqual(readFileSync(file),bytes);
 const reopened=openStore(file);assert.deepEqual(reopened.read(),before);assert.deepEqual(reopened.campaigns(),campaigns);reopened.close();
 const db=new DatabaseSync(file,{readOnly:true});assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name='auth_schema'").get().n,0);db.close();
});
test('data-only readiness reflects credentials, enabled owners and explicit usable hero grants',async()=>{
 const {file}=fixture(),store=openStore(file),context=store.read().context;
 store.access.apply({action:'bootstrap-owner',userId:'ready-owner',displayName:'PRIVATE_NAME',campaignId:context.campaignId,characterId:context.characterId});await store.authentication().setPassword('ready-owner','private-login','synthetic readiness password');store.close();
 let report=accessReadiness(file);assert.equal(report.dataReady,true);assert.deepEqual(report.blockers,[]);assert.equal(report.enabledUsers[0].hasCredentials,true);assert.equal(report.enabledUsers[0].usableCharacters,1);assert.equal(report.scope,'database-only');assert.equal(report.manualChecks.length,4);assert.ok(!JSON.stringify(report).includes('PRIVATE_NAME'));assert.ok(!JSON.stringify(report).includes('private-login'));
 const db=new DatabaseSync(file);db.prepare('DELETE FROM character_access').run();db.close();report=accessReadiness(file);assert.equal(report.dataReady,false);assert.ok(report.blockers.includes('unassigned-characters'));assert.ok(report.blockers.includes('user-without-usable-character'));
});
test('missing and future-schema databases fail closed without creating or migrating files',()=>{
 const {file}=fixture();assert.throws(()=>accessReadiness(file));assert.equal(existsSync(file),false);const store=openStore(file);store.close();const db=new DatabaseSync(file);db.exec('UPDATE access_schema SET version=99');db.close();const bytes=readFileSync(file);assert.throws(()=>accessReadiness(file));assert.deepEqual(readFileSync(file),bytes);
});
