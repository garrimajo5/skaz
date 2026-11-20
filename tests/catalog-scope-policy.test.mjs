import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applyScopePolicy} from '../scripts/catalog-scope-policy.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../catalog/'+p,import.meta.url),'utf8'));
const boundaries=read('dndsu-class-scope-boundaries.json'),bibliography=read('class-source-bibliography.json');
test('owner policy excludes experimental and third party sections without altering evidence',()=>{
 const original=structuredClone(boundaries),result=applyScopePolicy(boundaries,bibliography);
 assert.equal(result.records.length,12);assert.deepEqual(boundaries,original);
 assert.deepEqual(result.records.map(r=>r.observation),boundaries.pending);
 assert.equal(result.approvedDenominator,null);
 assert.ok(result.records.every(r=>!r.included&&r.reusePermission==='not-established'));
 assert.equal(result.records.filter(r=>r.disposition==='excluded-experimental').length,5);
 assert.equal(result.records.filter(r=>r.disposition==='excluded-third-party').length,5);
 assert.equal(result.records.filter(r=>r.disposition==='excluded-unofficial').length,1);
 assert.equal(result.records.filter(r=>r.disposition==='needs-official-source-evidence').length,1);
});
test('unknown, duplicate and mixed evidence never becomes an accepted source',()=>{
 const b=structuredClone(boundaries);b.pending[0].bibliographyEvidenceIds=['missing'];
 assert.throws(()=>applyScopePolicy(b,bibliography),/Unknown/);
 const duplicate=structuredClone(boundaries);duplicate.pending.push(duplicate.pending[0]);assert.throws(()=>applyScopePolicy(duplicate,bibliography),/Duplicate/);
 const unknown=structuredClone(bibliography);unknown.records[0].publicationKind='official';assert.throws(()=>applyScopePolicy(boundaries,unknown),/unsupported/);
 const mixed=structuredClone(boundaries);mixed.pending[0].bibliographyEvidenceIds.push('class-bibliography:hesperides');
 const result=applyScopePolicy(mixed,bibliography);assert.equal(result.records[0].disposition,'needs-mixed-source-review');assert.equal(result.records[0].included,false);
});
