import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {bundledCatalog} from '../server/bundled-catalog.mjs';
import {validateCatalog} from '../server/catalog.mjs';
import {validateMaterialProposal} from '../scripts/spell-materials-contract.mjs';
import {spellMaterialReferences} from '../server/spell-material-references.mjs';
const catalog=validateCatalog(bundledCatalog().bundle);
const proposal=JSON.parse(readFileSync(new URL('../catalog/spell-materials.proposal.json',import.meta.url),'utf8'));
const names=['Alarm','Aid','Bless','Light','Mending','Message','Minor Illusion','Resistance'];
test('eight accepted additions are active without inventing prices or changing catalog entries',()=>{
 assert.equal(validateMaterialProposal(proposal,catalog).reviewed,42);
 const entries=catalog.filter(e=>names.includes(e.name.en));assert.equal(entries.length,8);
 const before=structuredClone(entries),references=spellMaterialReferences(entries);assert.equal(references.length,8);assert.deepEqual(entries,before);
 for(const row of references){assert.equal(row.materials.price.kind,'not-stated');assert.equal(Object.hasOwn(row.materials.price,'text'),false);assert.equal(row.materials.consumption.kind,'retained');assert.equal(row.source.materialRulePage,102);}
 const changed=entries.map(e=>({...e,text:e.text+' Personal variation'}));assert.deepEqual(spellMaterialReferences(changed),[]);
});
test('component alternatives and quantities survive integration',()=>{
 const row=name=>proposal.entries.find(e=>e.name.en===name).materials;
 assert.match(row('Alarm').description,/колокольчик.*проволок/);
 assert.match(row('Light').description,/или/);
 assert.match(row('Mending').description,/[Дд]ва/);
 assert.match(row('Message').description,/[Кк]оротк/);
 assert.doesNotMatch(row('Message').description,/фут|30|0[,.]3/);
 assert.match(row('Resistance').description,/[Мм]иниатюр/);
 assert.doesNotMatch(row('Bless').description,/флакон/);
});