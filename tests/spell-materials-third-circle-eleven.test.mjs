import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {bundledCatalog} from '../server/bundled-catalog.mjs';
import {validateCatalog} from '../server/catalog.mjs';
import {validateMaterialProposal} from '../scripts/spell-materials-contract.mjs';
import {spellMaterialReferences} from '../server/spell-material-references.mjs';
const catalog=validateCatalog(bundledCatalog().bundle),read=name=>JSON.parse(readFileSync(new URL('../catalog/'+name,import.meta.url),'utf8'));
const proposal=read('spell-materials.proposal.json');const candidate={...proposal,entries:proposal.entries.filter(e=>["Sending","Sleet Storm","Slow","Speak with Dead","Spirit Guardians","Stinking Cloud","Tiny Hut","Tongues","Water Breathing","Water Walk","Wind Wall"].includes(e.name.en))};
test('eleven third-level candidates are active and preserve material state',()=>{
 assert.equal(validateMaterialProposal(proposal,catalog).reviewed,104);assert.equal(spellMaterialReferences(catalog.filter(e=>candidate.entries.some(r=>r.id===e.id))).length,11);
 assert.ok(candidate.entries.every(e=>e.materials.price.kind==='not-stated'&&e.materials.consumption.kind==='retained'));
 const row=name=>candidate.entries.find(e=>e.name.en===name).materials;
 assert.match(row('Speak with Dead').description,/Горящие/);assert.match(row('Speak with Dead').note,/не отменяет.*обычного горения/);
 assert.match(row('Sleet Storm').description,/пыли и.*воды/);assert.match(row('Water Breathing').description,/или/);
 assert.match(row('Wind Wall').description,/веер и перо/);
});

test('active references cover current SRD material spells through level three without mutating personal variants',()=>{
 const ids=new Set(proposal.entries.map(e=>e.id));assert.equal(ids.size,104);
 const required=catalog.filter(e=>e.kind==='spell'&&e.spell.level<=3&&e.spell.components.includes('M'));
 assert.deepEqual(required.filter(e=>!ids.has(e.id)).map(e=>e.name.en),[]);
 assert.equal(spellMaterialReferences(required).length,required.length);
 assert.deepEqual(spellMaterialReferences(required.map(e=>({...e,text:e.text+' Personal'}))),[]);
});
