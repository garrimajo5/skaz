import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {bundledCatalog} from '../server/bundled-catalog.mjs';
import {validateCatalog} from '../server/catalog.mjs';
import {validateMaterialProposal} from '../scripts/spell-materials-contract.mjs';
import {spellMaterialReferences} from '../server/spell-material-references.mjs';
const candidate=JSON.parse(readFileSync(new URL('../catalog/review/spell-materials-common-four.proposal.json',import.meta.url),'utf8'));
const catalog=validateCatalog(bundledCatalog().bundle);
test('common-four content candidate is valid and remains separate from active references',()=>{
 assert.equal(validateMaterialProposal(candidate,catalog).reviewed,4);
 const entries=catalog.filter(e=>candidate.entries.some(row=>row.id===e.id));assert.equal(entries.length,4);
 assert.deepEqual(spellMaterialReferences(entries),[]);
 assert.ok(candidate.entries.every(row=>row.materials.price.kind==='not-stated'&&!Object.hasOwn(row.materials.price,'text')));
});