import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {bundledCatalog} from '../server/bundled-catalog.mjs';
import {validateCatalog} from '../server/catalog.mjs';
import {validateMaterialProposal} from '../scripts/spell-materials-contract.mjs';
import {spellMaterialReferences} from '../server/spell-material-references.mjs';
const catalog=validateCatalog(bundledCatalog().bundle);
const candidate=JSON.parse(readFileSync(new URL('../catalog/review/spell-materials-first-circle-ten.proposal.json',import.meta.url),'utf8'));
test('ten low-level material candidates remain outside active references',()=>{
 assert.equal(validateMaterialProposal(candidate,catalog).reviewed,10);
 const entries=catalog.filter(e=>candidate.entries.some(row=>row.id===e.id));assert.equal(entries.length,10);
 assert.deepEqual(spellMaterialReferences(entries),[]);
 assert.ok(candidate.entries.every(row=>row.materials.price.kind==='not-stated'&&!Object.hasOwn(row.materials.price,'text')));
});
test('water-mode choice, colored powder and weapon alternatives retain their meaning',()=>{
 const row=name=>candidate.entries.find(e=>e.name.en===name).materials;
 assert.match(row('Create or Destroy Water').description,/при создании.*при её уничтожении/);
 assert.match(row('Color Spray').description,/порошка или песка/);
 for(const color of ['красный','жёлтый','синий'])assert.ok(row('Color Spray').description.includes(color));
 assert.match(row('Shillelagh').description,/Омела, лист клевера и дубинка или боевой посох/);
 assert.match(row('Sleep').description,/песка, лепестки розы или сверчок/);
 assert.match(row('Comprehend Languages').description,/сажи и соли/);
});