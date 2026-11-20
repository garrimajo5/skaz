import test from 'node:test';
import assert from 'node:assert/strict';
import {openStore} from '../server/store.mjs';
import {verifyManualProfileCompatibility} from '../scripts/verify-manual-profile-compatibility.mjs';

test('synthetic backup/restore preserves advisory data, receipts and transfer in compatible reader',async()=>{
 const result=await verifyManualProfileCompatibility(openStore);
 assert.equal(result.verified,true);assert.equal(result.releaseApproved,false);assert.equal(result.sourceModified,false);assert.equal(result.backupModified,false);
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
