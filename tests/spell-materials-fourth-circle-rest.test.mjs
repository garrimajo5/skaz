import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {bundledCatalog} from '../server/bundled-catalog.mjs';import {validateCatalog} from '../server/catalog.mjs';import {validateMaterialProposal} from '../scripts/spell-materials-contract.mjs';import {spellMaterialReferences} from '../server/spell-material-references.mjs';
const catalog=validateCatalog(bundledCatalog().bundle),active=JSON.parse(fs.readFileSync(new URL('../catalog/spell-materials.proposal.json',import.meta.url))),candidate=JSON.parse(fs.readFileSync(new URL('../catalog/review/spell-materials-fourth-circle-rest.proposal.json',import.meta.url)));
test('eleven pending reviews cover remaining fourth-level materials without runtime exposure',()=>{
 assert.equal(validateMaterialProposal(candidate,catalog).reviewed,11);assert.deepEqual(spellMaterialReferences(catalog.filter(e=>candidate.entries.some(r=>r.id===e.id))),[]);
 const ids=new Set([...active.entries,...candidate.entries].map(e=>e.id));assert.equal(ids.size,115);assert.deepEqual(catalog.filter(e=>e.kind==='spell'&&e.spell.level<=4&&e.spell.components.includes('M')&&!ids.has(e.id)).map(e=>e.id),[]);
});
test('chest and replica have separate reusable costs; preparation and alternatives remain explicit',()=>{
 const row=n=>candidate.entries.find(e=>e.name.en===n).materials;assert.match(row('Secret Chest').price.text,/5000.*50/);assert.equal(row('Secret Chest').consumption.kind,'retained');assert.match(row('Secret Chest').note,/безвозвратно теряется/);
 assert.match(row('Stone Shape').description,/вылепленная/);assert.match(row('Freedom of Movement').description,/повязанный/);
 assert.match(row('Fire Shield').description,/или светлячок/);assert.doesNotMatch(row('Wall of Fire').description,/светлячок/);assert.match(row('Private Sanctum').note,/альтернативы только одного/);
});
