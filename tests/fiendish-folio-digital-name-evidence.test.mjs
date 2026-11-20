import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=n=>JSON.parse(readFileSync(new URL('../catalog/'+n,import.meta.url),'utf8'));
const evidence=read('fiendish-folio-digital-name-evidence-2014.json'),inventory=read('fiendish-folio-inventory-2014.json'),scope=read('scope-register-2014.json');
test('digital names preserve three existing Contents links and historical observation values',()=>{
 assert.equal(evidence.records.length,3);assert.equal(new Set(evidence.records.map(r=>r.observationId)).size,3);
 for(const row of evidence.records){
  assert.equal(inventory.units.filter(u=>u.id===row.unitId).length,1);
  const old=scope.records.find(r=>r.id===row.observationId);
  assert.equal(row.observedName,old.names.en);assert.deepEqual(row.observedSourceIds,old.sourceIds);
  assert.equal(row.primarySourceId,inventory.sourceId);
  assert.equal(row.accepted,false);assert.equal(row.canonicalId,null);assert.equal(row.automaticSourceReplacement,false);
  assert.equal(row.evidence.fullStatBlockRead,false);assert.equal(row.evidence.cardAccess,'redirect-to-product-page');
  assert.equal(row.reusePermission,'not-established');assert.equal(row.exactTextVersion,'unverified');
 }
 assert.equal(evidence.complete,false);assert.equal(evidence.approvedDenominator,null);
});
test('same-name Dire Corby evidence does not replace its conflicting observed source',()=>{
 const corby=evidence.records.find(r=>r.observationId==='dndsu:bestiary:17362');
 assert.deepEqual(corby.observedSourceIds,['113']);assert.equal(corby.primarySourceId,'206');
 assert.equal(corby.relation,'same-name-different-observed-source');
 assert.equal(corby.primaryDigitalName,corby.observedName);assert.equal(corby.automaticSourceReplacement,false);
 const assassin=evidence.records.find(r=>r.observationId==='dndsu:bestiary:13620');
 assert.equal(assassin.observedName,'Assasin Bug');assert.equal(assassin.primaryDigitalName,'Assassin Bug');
 const ygorl=evidence.records.find(r=>r.observationId==='dndsu:bestiary:13729');
 assert.equal(ygorl.primaryDigitalName,'Ygorl, Lord of Entropy');
 assert.equal(inventory.units.find(u=>u.id===ygorl.unitId).name,'Ygorl');
});
