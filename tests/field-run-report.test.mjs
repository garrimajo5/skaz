import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateFieldRun} from '../scripts/verify-field-run.mjs';
const plan = JSON.parse(readFileSync(new URL('../docs/qa/field-acceptance-plan.json',import.meta.url)));
function run(id='ACTION-DAMAGE') {
 return {schemaVersion:1,planIssue:79,runId:'synthetic-format-test',executor:'fixture-author',commit:'a15d687',
 startedAt:'2026-11-17T10:00:00Z',endedAt:'2026-11-17T13:00:00Z',data:'synthetic',ownerAuthorization:null,
 device:{id:'xiaomi-pad6',kind:'physical',model:'synthetic-device-metadata',osVersion:'test',browser:'Chrome',browserVersion:'test',viewport:'820x1180',orientation:'portrait',displayMode:'browser'},
 results:[{caseId:id,status:'pass',actual:'Synthetic expected outcome',startedAt:'2026-11-17T10:00:00Z',endedAt:'2026-11-17T10:01:00Z',activeSeconds:30,taps:3,errors:[],theme:'polaris',evidence:[{kind:'observation',ref:'synthetic-test-only'}],observations:{}}]};
}
test('consistent synthetic report never certifies plan, physical execution or milestone',()=>{const x=validateFieldRun(plan,run());assert.equal(x.valid,true);assert.equal(x.planAccepted,false);assert.equal(x.milestoneAccepted,false);assert(x.unreportedCases.length>0);});
test('empty template cannot be presented as a completed run',()=>{const x=run();x.results=[];assert.throws(()=>validateFieldRun(plan,x),/empty template/);});
test('emulator cannot claim physical-device case or Safari browser',()=>{const x=run();x.device.kind='emulator';assert.throws(()=>validateFieldRun(plan,x),/Device type/);x.device.id='android-phone';x.results[0].caseId='FIELD-2H';assert.throws(()=>validateFieldRun(plan,x));});
test('two-hour field criterion excludes breaks and short observations',()=>{const x=run('FIELD-2H');assert.throws(()=>validateFieldRun(plan,x),/duration/);x.results[0].endedAt='2026-11-17T12:30:00Z';x.results[0].activeSeconds=7199;assert.throws(()=>validateFieldRun(plan,x),/duration/);x.results[0].activeSeconds=7200;assert.equal(validateFieldRun(plan,x).totals.pass,1);});
test('real owner session never substitutes synthetic test fixture',()=>{const x=run();x.data='owner-real-session';assert.throws(()=>validateFieldRun(plan,x),/Owner session/);x.ownerAuthorization='Explicit owner session';assert.throws(()=>validateFieldRun(plan,x),/Personal session/);});
test('ten operations need explicit observed count, not just outcome prose',()=>{const x=run('NET-10');assert.throws(()=>validateFieldRun(plan,x),/observation/);x.results[0].observations={baselineLoaded:true,mutationCount:10};assert.equal(validateFieldRun(plan,x).totals.pass,1);});
test('simulated API failure cannot certify physical Wi-Fi outage',()=>{const x=run('NET-30');x.results[0].observations={networkMethod:'api-503'};assert.throws(()=>validateFieldRun(plan,x),/observation/);x.results[0].observations.networkMethod='physical-wifi';x.results[0].observations.outageSeconds=30;assert.equal(validateFieldRun(plan,x).totals.pass,1);});
test('timezones, reversed intervals and active time beyond elapsed are rejected',()=>{for(const change of[x=>x.startedAt='2026-11-17T10:00:00',x=>x.results[0].endedAt='2026-11-17T09:59:00Z',x=>x.results[0].activeSeconds=61]){const x=run();change(x);assert.throws(()=>validateFieldRun(plan,x));}});
test('note over10seconds is fail, not pass',()=>{const x=run('ACTION-NOTE');assert.throws(()=>validateFieldRun(plan,x),/maximum duration/);x.results[0].status='fail';x.results[0].defect='Synthetic slow note';assert.equal(validateFieldRun(plan,x).totals.fail,1);});
test('duplicate cases, missing evidence and unresolved errors cannot pass',()=>{for(const change of[x=>x.results.push(structuredClone(x.results[0])),x=>x.results[0].evidence=[],x=>x.results[0].errors=['Unresolved problem']]){const x=run();change(x);assert.throws(()=>validateFieldRun(plan,x));}});
test('blocked and not-run preserve reasons and next action without inventing timing',()=>{const x=run();x.results=[{caseId:'FIELD-2H',status:'blocked',actual:'Device unavailable',nextAction:'Schedule with owner'}];assert.equal(validateFieldRun(plan,x).totals.blocked,1);delete x.results[0].nextAction;assert.throws(()=>validateFieldRun(plan,x),/next action/);});
test('owner decision preserves iPad after MVP without false passed evidence',()=>{assert.equal(plan.ownerDecision.ipadSafari,'post-MVP');assert.equal(plan.cases.find(x=>x.id==='FIELD-2H').minSeconds,7200);assert(plan.cases.filter(x=>x.id.startsWith('IPAD-')).every(x=>x.phase==='post-MVP'));});

test('a fast active time cannot hide a slow note wall time',()=>{const x=run('ACTION-NOTE');x.results[0].activeSeconds=5;assert.throws(()=>validateFieldRun(plan,x),/maximum duration/);});
test('Wi-Fi and undo subintervals must actually fit observed timing',()=>{const x=run('NET-30');x.results[0].observations={networkMethod:'physical-wifi',outageSeconds:300};assert.throws(()=>validateFieldRun(plan,x),/subinterval/);x.results[0].observations.outageSeconds=5;assert.throws(()=>validateFieldRun(plan,x),/observation/);const y=run('ACTION-UNDO');y.results[0].endedAt='2026-11-17T10:02:00Z';y.results[0].activeSeconds=10;y.results[0].observations={delaySinceTargetSeconds:120};assert.equal(validateFieldRun(plan,y).totals.pass,1);});

test('an extra operation cannot pass the exact ten-operation scenario',()=>{const x=run('NET-10');x.results[0].observations={baselineLoaded:true,mutationCount:11};assert.throws(()=>validateFieldRun(plan,x),/Exactly ten/);});
test('deferred Safari retains layout and icon comparison coverage',()=>{for(const id of ['IPAD-LAYOUT','IPAD-ICONS']){const c=plan.cases.find(x=>x.id===id);assert(c);assert.equal(c.phase,'post-MVP');assert.deepEqual(c.targets,['ipad']);}});
