import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildEffectiveM0Review,inputPaths} from '../scripts/catalog-effective-m0-review.mjs';
import {buildM0ExitReview} from '../scripts/catalog-m0-exit-review.mjs';
const texts=inputPaths.map(p=>readFileSync(new URL('../'+p,import.meta.url),'utf8'));
test('combined review counts observations rather than adding overlapping diagnostics',()=>{
 const r=buildEffectiveM0Review(texts),s=r.summary;
 assert.equal(s.observedPages,4973);assert.equal(s.excludedObservationPages,87);assert.equal(s.publicationDecisionPages,46);assert.equal(s.eligiblePublicationObservationPages,4840);assert.equal(s.identityGroups,293);
 assert.equal(s.excludedObservationPages+s.publicationDecisionPages+s.eligiblePublicationObservationPages,s.observedPages);
 assert.equal(r.sourceDecisions.length,46);assert.equal(new Set(r.sourceDecisions.map(x=>x.observationId)).size,46);
 assert.equal(r.approvedDenominator,null);assert.equal(r.accepted,false);assert.equal(r.complete,false);
 assert.equal(r.overlayBasis.nameCorrections.length,13);assert.equal(r.overlayBasis.originalSnapshotChanged,false);assert.equal(r.scriptDiagnostics.length,5);
});
test('Tortle advances to version review without accepting or merging race identities',()=>{
 const r=buildEffectiveM0Review(texts),g=r.identityGroups.find(g=>g.comparisonKey==='tortle'&&g.section==='race');
 assert.equal(r.identityGroups.filter(g=>g.comparisonKey==='tortle').length,2);assert.ok(g);assert.equal(g.decision,'define-separate-source-version-units');assert.equal(g.accepted,false);assert.equal(g.canonicalId,null);assert.equal(g.automaticMerge,false);
 assert.ok(g.members.some(m=>m.id==='dndsu:race:184'&&m.routing==='ready-for-version-and-rights-review'));
 assert.equal(r.summary.identityGroupsByDecision['resolve-publication-first'],1);
 assert.ok(r.sourceDecisions.some(p=>p.observationId==='dndsu:race:169'));
});
test('historical default report remains byte-equivalent in data to its pinned baseline',()=>{
 const read=p=>JSON.parse(readFileSync(new URL('../catalog/'+p,import.meta.url),'utf8'));
 const baseline=read('m0-exit-review-2014.json');delete baseline.inputSha256;
 assert.deepEqual(buildM0ExitReview(read('scope-register-2014.json'),read('numeric-source-scope-policy-2014.json'),read('observed-name-review-2014.json'),read('background-adaptation-page-review-2014.json')),baseline);
});
test('stale corrections or invented named publication routing cannot enter combined review',()=>{
 for(const mutate of [a=>a[1].scopeSha256='0'.repeat(64),a=>a[5].records[0].disposition='eligible-publication-records-need-review',a=>a[5].records[1].observationId='dndsu:race:999',a=>a[5].complete=true]){const a=texts.map(JSON.parse);mutate(a);assert.throws(()=>buildEffectiveM0Review(a.map(JSON.stringify)));}
});
test('combined report reproduces with CRLF and preserves all input text',()=>{
 const original=[...texts],r=buildEffectiveM0Review(texts);assert.deepEqual(texts,original);assert.deepEqual(r,buildEffectiveM0Review(texts.map(s=>s.replace(/\r?\n/g,'\r\n'))));
 assert.deepEqual(r,JSON.parse(readFileSync(new URL('../catalog/effective-m0-review-2014.json',import.meta.url),'utf8')));
});
