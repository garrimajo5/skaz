import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {reviewErrataUnits} from '../scripts/catalog-errata-unit-review.mjs';
const paths=['catalog/mm-errata-unit-inventory-2014.json','catalog/scope-register-2014.json'];
const raw=paths.map(p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/\r\n/g,'\n'));
const [inventory,scope]=raw.map(JSON.parse);
test('80 correction units do not imply80 creatures or a complete book',()=>{
 const r=reviewErrataUnits(inventory,scope);
 assert.deepEqual(r.summary,{correctionHeadings:80,namedStatBlockHeadings:75,namedVariantHeadings:1,nonIndividualUnits:4,individualUnitsWithOneCandidate:76,individualUnitsNeedingNameReview:0});
 for(const name of ['Gith','Half-Dragon','Lycanthropes','Swarm of X'])assert.deepEqual(r.records.find(x=>x.primaryName===name).observationCandidates,[]);
 assert.equal(r.records.find(x=>x.primaryName==='Vampire, Spellcaster').observationCandidates[0].observationId,'dndsu:bestiary:5634');
 assert.equal(r.records.find(x=>x.primaryName==='Acolyte').observationCandidates[0].observationId,'dndsu:bestiary:438');
 assert.ok(r.records.every(x=>!x.fullRulesVerified&&!x.automaticMerge&&x.canonicalId===null));
});
test('different-source and non-creature names cannot supply missing observations',()=>{
 const s=structuredClone(scope);s.records=s.records.filter(r=>r.id!=='dndsu:bestiary:438');
 s.records.push({id:'other:acolyte',section:'bestiary',sourceIds:['999'],names:{en:'Acolyte'}});
 const r=reviewErrataUnits(inventory,s);assert.equal(r.summary.individualUnitsNeedingNameReview,1);assert.deepEqual(r.records.find(x=>x.primaryName==='Acolyte').observationCandidates,[]);
});
test('duplicate candidates remain ambiguous instead of picking first',()=>{
 const s=structuredClone(scope),a=s.records.find(r=>r.id==='dndsu:bestiary:438');s.records.push({...a,id:'synthetic:second-acolyte'});
 const r=reviewErrataUnits(inventory,s);assert.equal(r.summary.individualUnitsNeedingNameReview,1);assert.equal(r.records.find(x=>x.primaryName==='Acolyte').observationCandidates.length,2);
});
test('orphan aliases, promotions and direct family aliases fail',()=>{
 for(const mutate of [i=>i.accepted=true,i=>i.completeBookInventory=true,i=>i.summary.correctionHeadings--,i=>i.explicitNameCandidates[0].primaryName='Unknown',i=>i.explicitNameCandidates[0].primaryName='Swarm of X',i=>i.explicitNameCandidates[0].observationId='dndsu:backgrounds:766']){
  const i=structuredClone(inventory);mutate(i);assert.throws(()=>reviewErrataUnits(i,scope));
 }
});
test('pinned report reproduces and selected parameter units retain same primary locations',()=>{
 const r=reviewErrataUnits(inventory,scope);r.inputSha256=Object.fromEntries(paths.map((p,i)=>[p,createHash('sha256').update(raw[i]).digest('hex')]));
 assert.deepEqual(r,JSON.parse(readFileSync(new URL('../catalog/mm-errata-unit-review-2014.json',import.meta.url),'utf8')));
 const selected=JSON.parse(readFileSync(new URL('../catalog/mm-selected-errata-parameters-2014.json',import.meta.url),'utf8'));
 for(const selectedUnit of selected.records){const unit=r.records.find(x=>x.primaryName===selectedUnit.primaryName);assert.equal(unit.bookPageLabel,String(selectedUnit.primaryLocator.bookPage));assert.equal(unit.pdfPage,selectedUnit.primaryLocator.pdfPage);assert.ok(unit.observationCandidates.some(c=>c.observationId===selectedUnit.observationId));}
});
