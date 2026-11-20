import test from 'node:test';
import assert from 'node:assert/strict';
import * as packageModule from '../server/game-art-package.mjs';
import {openStore} from '../server/store.mjs';
import {verifyManualProfileCompatibility} from '../scripts/verify-manual-profile-compatibility.mjs';

test('synthetic backup/restore preserves advisory data, receipts and transfer in compatible reader',async()=>{
 const result=await verifyManualProfileCompatibility(openStore);
 assert.equal(result.artPackageVersion,4);assert.equal(result.pngBytesPreserved,true);assert.equal(result.freshWriteRestart,true);assert.equal(result.forwardReentry,true);assert.equal(result.verified,true);assert.equal(result.releaseApproved,false);assert.equal(result.sourceModified,false);assert.equal(result.backupModified,false);
});
test('compatibility gate rejects a reader that loses rule agreements',async()=>{
 await assert.rejects(verifyManualProfileCompatibility(file=>{
  const store=openStore(file),read=store.read;
  return {...store,read(){const state=read();if(state.characterStats)delete state.characterStats.ruleAcknowledgements;return state;}};
 }),/Restored read changed/);
});
test('compatibility gate rejects an old reader without touching existing campaigns',async()=>{
 await assert.rejects(verifyManualProfileCompatibility(()=>{throw Error('Unsupported persisted profile');}),/Unsupported persisted profile/);
});

test('compatibility gate rejects a reader whose transfer silently drops agreements',async()=>{
 await assert.rejects(verifyManualProfileCompatibility(file=>{
  const store=openStore(file),exportActive=store.exportActive;
  return {...store,exportActive(version){const result=exportActive(version);if(result.characterStats)delete result.characterStats.ruleAcknowledgements;return result;}};
 }),/Transfer changed after restore/);
});

test('compatibility gate rejects a candidate that accepts replay but drops fresh edits',async()=>{
 await assert.rejects(verifyManualProfileCompatibility(file=>{
  const store=openStore(file),saveCharacterStats=store.saveCharacterStats;
  return {...store,saveCharacterStats(input){if(input.stats?.armorClass===18)return {replayed:false};return saveCharacterStats(input);}};
 }),/Candidate could not save a fresh profile edit/);
});
test('compatibility gate rejects a candidate that loses fresh edits on restart',async()=>{
 let diskOpens=0;
 await assert.rejects(verifyManualProfileCompatibility(file=>{
  const reopened=file!==':memory:'&&++diskOpens>1;
  const store=openStore(file),read=store.read;
  return {...store,read(){const view=read();if(reopened&&view.characterStats?.armorClass===18)view.characterStats.armorClass=17;return view;}};
 }),/Candidate restart lost the fresh profile edit/);
});

test('compatibility gate rejects a fallback package reader that drops PNG bytes',async()=>{
 await assert.rejects(verifyManualProfileCompatibility(openStore,{...packageModule,validateGameArtPackage(value){const result=packageModule.validateGameArtPackage(value);result.art[0].bytes=Buffer.alloc(0);return result;}}),/Candidate package reader changed/);
});
test('compatibility gate rejects a fallback package writer that changes its wrapper',async()=>{
 await assert.rejects(verifyManualProfileCompatibility(openStore,{...packageModule,gameArtPackage(...args){const result=packageModule.gameArtPackage(...args);result.schemaVersion=3;return result;}}),/Candidate package writer changed/);
});
