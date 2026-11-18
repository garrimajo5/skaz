import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {bundledCatalog} from '../server/bundled-catalog.mjs';
import {validateCatalog} from '../server/catalog.mjs';
import {validateMaterialProposal} from '../scripts/spell-materials-contract.mjs';
import {spellMaterialReferences} from '../server/spell-material-references.mjs';
const catalog=validateCatalog(bundledCatalog().bundle),proposal=JSON.parse(readFileSync(new URL('../catalog/spell-materials.proposal.json',import.meta.url),'utf8')),candidate={...proposal,entries:proposal.entries.filter(e=>["Animate Dead","Clairvoyance","Fear","Fly","Gaseous Form","Glyph of Warding","Haste","Hypnotic Pattern","Lightning Bolt","Magic Circle","Major Image","Nondetection"].includes(e.name.en))};
test('twelve third-level candidates are available as checked references',()=>{
 assert.equal(validateMaterialProposal(proposal,catalog).reviewed,104);assert.equal(spellMaterialReferences(catalog.filter(e=>candidate.entries.some(r=>r.id===e.id))).length,12);
});
test('priced focuses and consumed materials preserve distinct amounts and usage',()=>{
 const row=name=>candidate.entries.find(e=>e.name.en===name).materials;
 assert.equal(row('Clairvoyance').consumption.kind,'retained');assert.match(row('Clairvoyance').price.text,/не менее 100/);
 for(const [name,amount] of [['Glyph of Warding',200],['Magic Circle',100],['Nondetection',25]]){assert.equal(row(name).consumption.kind,'consumed');assert.ok(row(name).price.text.includes(String(amount)));}
 assert.match(row('Glyph of Warding').price.text,/Алмазный порошок/);
 assert.doesNotMatch(row('Nondetection').price.text,/не менее/);assert.match(row('Nondetection').description,/посыпают цель/);
 assert.match(row('Lightning Bolt').note,/одного из трёх/);assert.match(row('Magic Circle').note,/либо оба металла/);
});