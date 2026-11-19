import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { buildEquipmentUnitProposals } from '../scripts/catalog-equipment-unit-proposals.mjs';
const paths = ['srd51-additional-equipment-discovery.json','srd51-equipment-pack-memberships.json','srd51-pack-component-identities.json','equipment-identity-reconciliation.json'];
const raw = paths.map(path => readFileSync(new URL('../catalog/'+path,import.meta.url),'utf8').replace(/\r\n/g,'\n'));
const inputs = () => raw.map(text => JSON.parse(text));
const build = () => buildEquipmentUnitProposals(...inputs());
const byName = (result,name) => result.records.find(row => row.nameEn === name);

test('heterogeneous units preserve observation coverage without an approved item denominator', () => {
  const result = build();
  assert.equal(result.records.length,82);
  assert.equal(new Set(result.records.map(row=>row.observationId)).size,82);
  assert.equal(result.complete,false);
  assert.equal(result.approvedDenominator,null);
  assert.ok(result.records.every(row=>row.fullRules==='unverified' && row.status==='proposed-unit-not-runtime-record'));
  assert.equal(byName(result,'Camel').unitKind,'mount-offer');
  assert.equal(byName(result,'Camel').bestiaryId,null);
  assert.equal(byName(result,'Donkey or mule').unitKind,'mount-offer');
  assert.equal(byName(result,'Galley').unitKind,'vehicle');
  assert.equal(byName(result,'Stabling (per day)').unitKind,'service');
  assert.equal(byName(result,'Stabling (per day)').pricedUnit,'day');
  assert.equal(byName(result,'Feed (per day)').unitKind,'supply-offer');
  assert.equal(byName(result,'Feed (per day)').pricedUnit,'day');
  assert.equal(byName(result,'Coach cab, within a city').pricedUnit,'not-specified-in-table');
  assert.equal(byName(result,'Inn stay, Modest').includedInLifestyleExpenses,true);
});

test('multipliers, absent prices, minimums and trade choices are not silently fixed purchases', () => {
  const result=build();
  assert.equal(byName(result,'Barding').fixedPurchasePrice,null);
  assert.deepEqual(byName(result,'Barding').pricing,{mode:'multiplier',factor:4,base:'equivalent-armor-for-humanoids'});
  assert.deepEqual(byName(result,'Wretched').pricing,{mode:'not-priced',sourceValue:'—'});
  assert.deepEqual(byName(result,'Aristocratic').pricing,{mode:'minimum',amount:10,currency:'gp'});
  const trade=byName(result,'Iron or Canvas');
  assert.equal(trade.alternativesAre,'one-of-not-a-bundle');
  assert.deepEqual(trade.alternatives.map(row=>row.unit),['lb','square-yard']);
  assert.ok(trade.alternatives.every(row=>row.proposedUnitId.startsWith('srd51:2014:trade-offer:')));
  assert.equal(result.records.flatMap(row=>row.alternatives||[]).length,23);
  assert.equal(byName(result,'Flour or Chicken').alternatives[1].bestiaryId,null);
});

test('source components resolve named membership without inventing retail equivalence', () => {
  const result=build();
  assert.equal(result.packMemberships.length,66);
  assert.equal(result.summary.componentIdentities,9);
  const ink=result.packMemberships.filter(row=>row.sourceName==='ink');
  assert.equal(ink.length,2);
  assert.ok(ink.every(row=>row.catalogCandidateId===null && row.componentCandidateId==='srd51:2014:pack-component:ink-bottle-capacity-unspecified' && row.unit==='bottle'));
  for (const name of ['small knife','book of lore','string']) {
    const member=result.packMemberships.find(row=>row.sourceName===name);
    assert.equal(member.catalogCandidateId,null);
    assert.ok(member.componentCandidateId.startsWith('srd51:2014:pack-component:'));
  }
  assert.equal(result.packMemberships.filter(row=>row.quantity===null).length,3);
  assert.equal(result.packMemberships.find(row=>row.sourceName==='vestments').quantityStatus,'unspecified');
  assert.equal(result.packMemberships.find(row=>row.sourceName==='ball bearings').unit,'bag of 1000');
  assert.ok(inputs()[2].records.every(row=>row.retailPrice===null && row.weight===null));
});

test('lost, duplicate or retargeted component evidence is rejected', () => {
  let args=inputs(); args[2].records.pop(); assert.throws(()=>buildEquipmentUnitProposals(...args),/Missing component/);
  args=inputs(); args[2].records.push(structuredClone(args[2].records[0])); assert.throws(()=>buildEquipmentUnitProposals(...args),/Duplicate/);
  args=inputs(); args[2].records[0].occurrences[0].quantity=50; assert.throws(()=>buildEquipmentUnitProposals(...args),/occurrence mismatch/);
  args=inputs(); args[2].records[0].occurrences[0].packObservationId='unknown'; assert.throws(()=>buildEquipmentUnitProposals(...args),/occurrence mismatch/);
  args=inputs(); args[2].records[0].occurrences.push(structuredClone(args[2].records[0].occurrences[0])); assert.throws(()=>buildEquipmentUnitProposals(...args),/duplicate/);
  args=inputs(); args[2].records[0].retailPrice=0; assert.throws(()=>buildEquipmentUnitProposals(...args),/component evidence/);
});

test('unknown item references, price drift and ID collisions are rejected', () => {
  let args=inputs(); args[1].records[0].contents[0].candidateCatalogId='srd51:2014:item:unknown'; assert.throws(()=>buildEquipmentUnitProposals(...args),/Unknown catalog/);
  args=inputs(); args[1].records[0].listedCostGp=999; assert.throws(()=>buildEquipmentUnitProposals(...args),/price mismatch/);
  args=inputs(); args[0].records.push(structuredClone(args[0].records[0])); assert.throws(()=>buildEquipmentUnitProposals(...args),/Duplicate/);
  args=inputs(); args[0].records.find(row=>row.recordType==='tack').recordType='unreviewed-category'; assert.throws(()=>buildEquipmentUnitProposals(...args),/Unsupported/);
  args=inputs(); args[3].records.push({proposedCanonicalId:'srd51:2014:item:bit-and-bridle'}); assert.throws(()=>buildEquipmentUnitProposals(...args),/overlapping/);
  args=inputs(); args[0].ruleset='5e-2024'; assert.throws(()=>buildEquipmentUnitProposals(...args),/ruleset/);
});

test('trade alternatives reject invalid units, duplicate alternatives and bundle semantics', () => {
  let args=inputs(); args[0].records.find(row=>row.alternatives).alternatives[0].unit='coin'; assert.throws(()=>buildEquipmentUnitProposals(...args),/trade unit/);
  args=inputs(); args[0].records.find(row=>row.alternatives).alternativesAre='bundle'; assert.throws(()=>buildEquipmentUnitProposals(...args),/trade alternatives/);
  args=inputs(); const row=args[0].records.find(row=>row.alternatives); row.alternatives.push(structuredClone(row.alternatives[0])); assert.throws(()=>buildEquipmentUnitProposals(...args),/overlapping/);
});

test('derivation is deterministic, preserves inputs and pins all four normalized input hashes', () => {
  const args=inputs(), before=structuredClone(args);
  const result=buildEquipmentUnitProposals(...args);
  assert.deepEqual(args,before);
  const saved=JSON.parse(readFileSync(new URL('../catalog/equipment-unit-proposals-2014.json',import.meta.url),'utf8'));
  const {inputSha256,...content}=saved;
  assert.deepEqual(result,content);
  assert.deepEqual(inputSha256,Object.fromEntries(paths.map((path,i)=>['catalog/'+path,createHash('sha256').update(raw[i]).digest('hex')])));
  result.records[0].pricing.amount=-1;
  assert.deepEqual(args,before);
});
test('skilled hireling minimum and source correction survive proposal generation without mutating observations', () => {
 const args=inputs();
 const result=buildEquipmentUnitProposals(...args);
 const row=byName(result,'Hireling, skilled');
 assert.deepEqual(row.pricing,{mode:'minimum',amount:2,currency:'gp'});
 assert.equal(row.pricedUnit,'day');
 assert.equal(row.pricingEvidence.sourcePage,74);
 assert.equal(row.pricingEvidence.previousMode,'fixed');
 row.pricingEvidence.locator='modified proposal';
 assert.notEqual(args[0].records.find(r=>r.nameEn==='Hireling, skilled').pricingEvidence.locator,'modified proposal');
});
