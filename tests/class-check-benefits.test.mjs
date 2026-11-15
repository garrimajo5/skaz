import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {openStore} from '../server/store.mjs';
import {classCheckBenefits} from '../server/class-check-benefits.mjs';
import {prepareChampion,championCommand,championFields} from '../scripts/fixtures/champion-commands.mjs';
import {prepareMonk} from '../scripts/fixtures/monk-commands.mjs';
test('Champion checks start at recorded level7, round upward, and preserve manual totals through20 and transfer',()=>{
 const s=openStore(':memory:',{classAdvancement:true});try{
 prepareChampion(s,6);assert.equal(s.read().classCheckBenefits,null);
 const manual=s.read().characterStats;const saves=s.read().characterSheet.saveProficiencies;
 for(let level=7;level<=20;level++){
  s.advanceCharacter(championCommand(s));const v=s.read(),b=v.classCheckBenefits;
  assert.equal(b.level,level);assert.equal(b.bonus,level>=13?3:2);assert.deepEqual(b.untrainedAbilities,['str','dex','con']);assert.equal(b.origin.acquiredLevel,7);
  assert.equal(v.characterStats.initiative,manual.initiative);assert.deepEqual(v.characterSheet.saveProficiencies,saves);
 }
 const before=s.read(),file=s.exportActive(14);const after=s.importActive({mutationId:randomUUID(),expectedRevision:before.revision,destination:'new-campaign',file});assert.deepEqual(after.classCheckBenefits,before.classCheckBenefits);
 }finally{s.close();}
});
test('Champion bonus never infers unrecorded past or grants another subclass the benefit',()=>{
 assert.equal(classCheckBenefits(null),null);const s=openStore(':memory:',{classAdvancement:true});try{
 prepareMonk(s,7);assert.equal(s.read().classCheckBenefits,null);
 const fake=structuredClone(s.read().advancement);fake.level=8;assert.throws(()=>classCheckBenefits(fake));
 }finally{s.close();}
 const high=openStore(':memory:',{classAdvancement:true});try{
 prepareChampion(high,2);high.saveCharacterSheet(championFields(high,{sheet:{...high.read().characterSheet,level:7,subclass:'Чемпион'}}));assert.equal(high.read().classCheckBenefits,null);
 }finally{high.close();}
});

import {createApp} from '../server/app.mjs';
test('HTTP preview exposes the conditional calculation before applying the level',async t=>{
 const s=openStore(':memory:',{classAdvancement:true});prepareChampion(s,6);const app=createApp(s,{classAdvancement:true});await new Promise(r=>app.listen(0,'127.0.0.1',r));t.after(async()=>{app.closeAllConnections();await new Promise(r=>app.close(r));s.close();});
 const origin='http://127.0.0.1:'+app.address().port;
 const response=await fetch(origin+'/api/class-advancement/preview',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Skaz-Client':'local-v1'},body:JSON.stringify(championCommand(s))});assert.equal(response.status,200);const preview=await response.json();assert.equal(preview.classCheckBenefits.bonus,2);assert.equal(preview.classCheckBenefits.origin.acquiredLevel,7);assert.equal(s.read().characterSheet.level,6);assert.equal(s.read().classCheckBenefits,null);
});

import {monkCommand} from '../scripts/fixtures/monk-commands.mjs';
import {prepareRogue,rogueCommand} from '../scripts/fixtures/rogue-commands.mjs';
for(const [name,prepare,command,level,abilities] of [['monk',prepareMonk,monkCommand,13,['str','dex','con','int','wis','cha']],['rogue',prepareRogue,rogueCommand,14,['wis']]])test(name+' HTTP preview announces save proficiency without applying or rewriting manual entries',async t=>{
 const s=openStore(':memory:',{classAdvancement:true});prepare(s,level);const before=s.read();const app=createApp(s,{classAdvancement:true});await new Promise(r=>app.listen(0,'127.0.0.1',r));t.after(async()=>{app.closeAllConnections();await new Promise(r=>app.close(r));s.close();});
 const origin='http://127.0.0.1:'+app.address().port;
 const response=await fetch(origin+'/api/class-advancement/preview',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Skaz-Client':'local-v1'},body:JSON.stringify(command(s))});assert.equal(response.status,200);const preview=await response.json();assert.deepEqual(preview.classSaveBenefits.saveProficiencies,abilities);assert.equal(preview.classSaveBenefits.deathSaveProficiency,name==='monk');assert.equal(s.read().revision,before.revision);assert.equal(s.read().classSaveBenefits,null);assert.deepEqual(s.read().characterSheet.saveProficiencies,before.characterSheet.saveProficiencies);
});
