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

test('readiness rejects partial authentication schemas without repairing or changing them',()=>{
 for(const damaged of ['auth_sessions','auth_attempts','auth_credentials']){
  const {file}=fixture(),store=openStore(file);store.authentication();store.close();
  const db=new DatabaseSync(file);db.exec(`DROP TABLE ${damaged}`);db.close();const before=readFileSync(file);
  assert.throws(()=>accessReadiness(file),/Неполная схема входа/);assert.deepEqual(readFileSync(file),before);
 }
 const {file}=fixture(),store=openStore(file);store.authentication();store.close();
 const db=new DatabaseSync(file);db.exec('ALTER TABLE auth_sessions DROP COLUMN expires_at');db.close();const before=readFileSync(file);
 assert.throws(()=>accessReadiness(file),/Неполная схема входа/);assert.deepEqual(readFileSync(file),before);
});

test('malformed credentials cannot pass migration readiness and secrets stay out of its report',async()=>{
 const {file}=fixture(),store=openStore(file),context=store.read().context;
 store.access.apply({action:'bootstrap-owner',userId:'ready-owner',displayName:'Private',campaignId:context.campaignId,characterId:context.characterId});
 await store.authentication().setPassword('ready-owner','valid.login','synthetic readiness password');store.close();
 assert.equal(accessReadiness(file).enabledUsers[0].credentialsValid,true);
 const db=new DatabaseSync(file),original=db.prepare('SELECT * FROM auth_credentials').get();
 for(const [column,value]of [['login','BAD LOGIN'],['login','Uppercase'],['salt','private-invalid-salt'],['key_hex','abcd'],['version',''],['salt',Buffer.from(original.salt)]]){
  db.prepare(`UPDATE auth_credentials SET ${column}=?`).run(value);const before=readFileSync(file);
  const report=accessReadiness(file);assert.equal(report.dataReady,false);assert.equal(report.enabledUsers[0].hasCredentials,true);assert.equal(report.enabledUsers[0].credentialsValid,false);assert.ok(report.blockers.includes('user-with-invalid-credentials'));
  for(const secret of [original.login,original.salt,original.key_hex,original.version,'private-invalid-salt'])assert.ok(!JSON.stringify(report).includes(secret));
  assert.deepEqual(readFileSync(file),before);db.prepare(`UPDATE auth_credentials SET ${column}=?`).run(original[column]);
 }
 db.close();assert.equal(accessReadiness(file).dataReady,true);
});

test('multiple current sessions and unusable user IDs block readiness even with valid foreign keys',async()=>{
 const {file}=fixture(),store=openStore(file),context=store.read().context;
 store.access.apply({action:'bootstrap-owner',userId:'ready-owner',displayName:'Owner',campaignId:context.campaignId,characterId:context.characterId});
 await store.authentication().setPassword('ready-owner','owner','synthetic readiness password');store.close();
 const db=new DatabaseSync(file);db.prepare('INSERT INTO sessions VALUES (?,?,?)').run('extra-session',context.campaignId,'{}');db.close();
 let report=accessReadiness(file);assert.equal(report.foreignKeyViolations,0);assert.equal(report.campaigns[0].activeSessions,2);assert.ok(report.blockers.includes('campaign-with-multiple-active-sessions'));assert.equal(report.dataReady,false);
 const other=new DatabaseSync(file);other.prepare('DELETE FROM sessions WHERE id=?').run('extra-session');other.prepare('INSERT INTO access_users VALUES (?,?,1)').run('short','Private');other.close();
 report=accessReadiness(file);assert.ok(report.blockers.includes('invalid-user-identity'));assert.equal(report.dataReady,false);
});
