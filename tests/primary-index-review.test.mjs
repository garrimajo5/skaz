import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reviewPrimaryIndex} from '../scripts/catalog-primary-index-review.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../catalog/'+p+'.json',import.meta.url),'utf8'));
const index=read('infernal-machine-public-index-2014'),scope=read('scope-register-2014');
const run=(a=index,b=scope)=>reviewPrimaryIndex(a,b);
test('complete index traversal gives56 cards, not56 newly published creatures or proven gaps',()=>{
 const d=run();assert.deepEqual(d.summary,{digitalRows:56,distinctDigitalNames:54,displayedOwnSourceRows:26,displayedReferenceRows:30,rowsWithoutObservedName:30,originalSourceBestiaryObservations:5,originalSourceBestiaryWithNameCandidate:5});
 const saved=read('infernal-machine-index-review-2014');const {inputSha256,...body}=saved;assert.deepEqual(d,body);
 assert.deepEqual(d.originalSourceBestiaryWithoutNameCandidate,[]);
 for(const r of d.records){assert.equal(r.accepted,false);assert.equal(r.canonicalId,null);assert.equal(r.fullRules,'unverified');assert.equal(r.automaticSourceReplacement,false);}
});
test('same names in different digital cards retain distinct versions; quotations are explicit candidates',()=>{
 const d=run();for(const name of ['Boggle','Redcap']){const rows=d.records.filter(r=>r.digitalName===name);assert.equal(rows.length,2);assert.equal(new Set(rows.map(r=>r.cardUrl)).size,2);assert.equal(new Set(rows.map(r=>r.displayedSource)).size,2);}
 const demo=d.records.find(r=>r.digitalName==='"The Demogorgon"');assert.equal(demo.observationCandidates.length,1);assert.equal(demo.observationCandidates[0].match,'explicit-name-candidate');assert.equal(demo.observationCandidates[0].observedName,'«The Demogorgon»');
 const eye=d.records.find(r=>r.digitalName==='Eye of Fear and Flame');assert.equal(eye.displayedSource,'Infernal Machine Rebuild');assert.deepEqual(eye.observationCandidates[0].originalSourceIds,['206']);
});
test('truncated, repeated, skipped, or reordered pages and cards fail before producing completeness claims',()=>{
 for(const change of [d=>d.pages.pop(),d=>d.pages[0].nextPage=3,d=>d.pages[2].nextPage=4,d=>d.pages.reverse(),d=>d.pages[1].rows[0].cardUrl=d.pages[0].rows[0].cardUrl,d=>d.pages[0].rows=[]]){const d=structuredClone(index);change(d);assert.throws(()=>run(d));}
});
test('counts, evidence boundary, identities, and alias targets cannot silently drift',()=>{
 for(const change of [d=>d.summary.digitalRows++,d=>d.summary.displayedSourceCounts['Infernal Machine Rebuild']++,d=>d.accepted=true,d=>d.historicalBookInventoryComplete=true,d=>d.approvedDenominator=56,d=>d.explicitNameCandidates[0].observationIds=['missing'],d=>d.explicitNameCandidates[0].cardUrl='https://example.com/monster',d=>d.pages[0].rows[0].cardUrl='https://example.com/monsters/1-test']){const d=structuredClone(index);change(d);assert.throws(()=>run(d));}
 const badScope=structuredClone(scope);badScope.records.push(badScope.records[0]);assert.throws(()=>run(index,badScope));
});
test('report keeps every observation ID, spelling and source and does not mix items into creature coverage',()=>{
 const d=run();for(const row of d.records)for(const c of row.observationCandidates){const old=scope.records.find(r=>r.id===c.observationId);assert.equal(old.section,'bestiary');assert.equal(c.observedName,old.names.en);assert.deepEqual(c.originalSourceIds,old.sourceIds);}
 assert.equal(d.summary.originalSourceBestiaryObservations,scope.records.filter(r=>r.section==='bestiary'&&r.sourceIds.includes('161')).length);
});
