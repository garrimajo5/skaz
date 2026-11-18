import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {bundledCatalog} from '../server/bundled-catalog.mjs';
import {validateCatalog} from '../server/catalog.mjs';
import {validateMaterialProposal} from '../scripts/spell-materials-contract.mjs';
import {spellMaterialReferences} from '../server/spell-material-references.mjs';
const catalog=validateCatalog(bundledCatalog().bundle),candidate=JSON.parse(readFileSync(new URL('../catalog/review/spell-materials-fourth-circle-eight.proposal.json',import.meta.url),'utf8'));
test('eight fourth-level candidates stay outside active references',()=>{
 assert.equal(validateMaterialProposal(candidate,catalog).reviewed,8);assert.deepEqual(spellMaterialReferences(catalog.filter(e=>candidate.entries.some(r=>r.id===e.id))),[]);
});
test('shared offering price and per-creature quantities are explicit',()=>{
 const row=name=>candidate.entries.find(e=>e.name.en===name).materials;
 assert.equal(row('Divination').consumption.kind,'consumed');assert.match(row('Divination').price.text,/вместе — не менее 25/);
 assert.match(row('Conjure Woodland Beings').description,/По одной.*на каждое/);assert.equal(row('Conjure Woodland Beings').consumption.kind,'retained');
 assert.match(row('Confusion').description,/Три/);assert.match(row('Banishment').description,/неприятный цели/);
 assert.equal(row('Faithful Hound').price.kind,'not-stated');
});