import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {bundledCatalog} from '../server/bundled-catalog.mjs';
import {validateCatalog} from '../server/catalog.mjs';
import {validateMaterialProposal} from '../scripts/spell-materials-contract.mjs';
import {spellMaterialReferences} from '../server/spell-material-references.mjs';
const catalog=validateCatalog(bundledCatalog().bundle),candidate=JSON.parse(readFileSync(new URL('../catalog/review/spell-materials-second-circle-fifteen.proposal.json',import.meta.url),'utf8'));
test('fifteen second-level material candidates preserve isolation and provenance',()=>{
 assert.equal(validateMaterialProposal(candidate,catalog).reviewed,15);const entries=catalog.filter(e=>candidate.entries.some(r=>r.id===e.id));assert.equal(entries.length,15);assert.deepEqual(spellMaterialReferences(entries),[]);
});
test('priced dust, reusable divination tokens and persistent eye coins remain distinct',()=>{
 const row=name=>candidate.entries.find(e=>e.name.en===name).materials;
 assert.equal(row('Arcane Lock').consumption.kind,'consumed');assert.match(row('Arcane Lock').price.text,/25/);
 assert.equal(row('Augury').consumption.kind,'retained');assert.match(row('Augury').price.text,/25/);
 assert.match(row('Gentle Repose').description,/по одной.*каждом глазу/);assert.match(row('Gentle Repose').consumption.text,/оставаться.*всё время/);assert.match(row('Gentle Repose').note,/10 дней/);
 assert.equal(row('Darkvision').price.kind,'not-stated');assert.match(row('Darkvision').description,/или агат/);
 assert.match(row('Darkness').note,/Мех.*одной из альтернатив/);
});