import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=n=>JSON.parse(readFileSync(new URL('../catalog/'+n,import.meta.url),'utf8'));
test('weight evidence accounts for each of186 existing equipment identities exactly once',()=>{
 const identity=read('equipment-identity-reconciliation.json');
 const files=['srd51-armor-parameters-2014.json','srd51-weapon-parameters-2014.json','srd51-gear-tool-weights-2014.json','gaming-set-weight-evidence-2014.json'];
 const rows=files.flatMap(f=>read(f).records);
 assert.equal(rows.length,186);assert.equal(new Set(rows.map(r=>r.candidateItemId)).size,186);
 assert.deepEqual(rows.map(r=>r.candidateItemId).sort(),identity.records.map(r=>r.proposedCanonicalId).sort());
 assert.equal(rows.filter(r=>r.weightLb!==null).length,163);
 assert.equal(rows.filter(r=>r.weightLb===null).length,23);
 assert.ok(rows.every(r=>r.weightLb===null||r.weightLb>0));
 assert.equal(rows.filter(r=>!r.candidateItemId.startsWith('srd51:')).length,2);
 // Contents capacity is distinct from own weight: the backpack is not its30lb capacity.
 assert.equal(rows.find(r=>r.candidateItemId==='srd51:2014:item:backpack').weightLb,5);
 assert.equal(rows.find(r=>r.candidateItemId==='srd51:2014:item:barrel').weightLb,70);
});
