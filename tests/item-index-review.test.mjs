import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reviewItemIndex} from '../scripts/catalog-item-index-review.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../catalog/'+p+'.json',import.meta.url),'utf8'));
const index=read('infernal-machine-item-index-2014'),scope=read('scope-register-2014');
test('25 cards preserve exact names, one spelling candidate and11 family variants without asserting25 new items',()=>{
 const d=reviewItemIndex(index,scope);const {inputSha256,...saved}=read('infernal-machine-item-review-2014');assert.deepEqual(d,saved);
 assert.deepEqual(d.summary,{digitalRows:25,exactNameRows:12,familyCandidateRows:11,explicitNameCandidateRows:1,rowsWithoutObservedName:1,originalSourceItemObservations:7,originalSourceItemWithCandidate:7});
 assert.equal(d.records.find(r=>!r.observationCandidates.length).digitalName,'Crown of the Forest');
 assert.equal(index.productEvidence.advertisedNewItemCount,8);assert.equal(index.productEvidence.namedItemInventoryVerified,false);
});
test('family candidates stay many-to-one relationships, not canonical aliases or automatic attunement rules',()=>{
 const d=reviewItemIndex(index,scope),gems=d.records.filter(r=>r.digitalName.startsWith('Spell Gem ('));
 assert.equal(gems.length,10);assert.equal(new Set(gems.map(r=>r.cardUrl)).size,10);
 for(const r of gems){assert.equal(r.observationCandidates[0].observationId,'dndsu:items:2373');assert.equal(r.observationCandidates[0].relation,'variant-of-observed-family-candidate');assert.equal(r.automaticMerge,false);assert.equal(r.automaticAttunementRule,false);}
 const ioun=d.records.find(r=>r.digitalName==='Ioun Stone of Vitality');assert.equal(ioun.observationCandidates[0].observationId,'dndsu:items:79');assert.deepEqual(ioun.observationCandidates[0].originalSourceIds,['101','161','153']);
});
test('invalid family links, metadata, page chains and acceptance changes are rejected',()=>{
 for(const change of [d=>d.pages.pop(),d=>d.pages[0].nextPage=null,d=>d.pages[1].nextPage=3,d=>d.digitalRowCount++,d=>d.accepted=true,d=>d.fullRulesVerified=true,d=>d.approvedDenominator=8,d=>d.familyCandidates[0].parentObservationId='missing',d=>d.familyCandidates[0].parentObservationId='dndsu:bestiary:8520',d=>d.explicitNameCandidates[0].observationId='missing',d=>d.pages[0].rows[0].cardUrl='https://example.com/magic-items/1-x',d=>d.pages[0].rows[0].attunementLabel='']){const v=structuredClone(index);change(v);assert.throws(()=>reviewItemIndex(v,scope));}
});
test('every candidate preserves original spelling and source IDs',()=>{
 for(const r of reviewItemIndex(index,scope).records){assert.equal(r.accepted,false);assert.equal(r.canonicalId,null);for(const c of r.observationCandidates){const old=scope.records.find(x=>x.id===c.observationId);assert.equal(c.observedName,old.names.en);assert.deepEqual(c.originalSourceIds,old.sourceIds);}}
});
