import test from 'node:test';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {reproductionCases,committedProposalCases,verifyCommittedProposalReproduction} from '../scripts/verify-catalog-scope-reproduction.mjs';
test('reproduction covers every scope input including class proposals and choices',()=>{
 const cases=reproductionCases('evidence','classes','2026-11-17');assert.equal(cases.length,40);assert.equal(new Set(cases.map(c=>c[2])).size,40);
 assert.deepEqual(cases.find(c=>c[0]==='catalog-class-choice-metadata.mjs')[1],['classes']);
 assert.equal(cases.at(-1)[0],'catalog-class-residual-review.mjs');
 assert.ok(cases.every(c=>!c[0].includes('fetch')&&!c[0].includes('server')));
 assert.throws(()=>reproductionCases('evidence','classes','unknown'));
});


test('committed proposals reproduce all sixteen reports without modifying repository manifests',()=>{
 const cases=committedProposalCases();
 assert.equal(cases.length,16);
 const files=cases.map(row=>new URL('../catalog/'+row[2],import.meta.url));
 const before=files.map(file=>readFileSync(file,'utf8'));
 const results=verifyCommittedProposalReproduction();
 assert.deepEqual(results.map(row=>row.manifest),cases.map(row=>row[2]));
 assert.ok(results.every(row=>/^[a-f0-9]{64}$/.test(row.sha256)));
 assert.deepEqual(files.map(file=>readFileSync(file,'utf8')),before);
 const full=reproductionCases('evidence','classes','2026-11-17');
 assert.deepEqual(full.slice(-16),cases);
});
