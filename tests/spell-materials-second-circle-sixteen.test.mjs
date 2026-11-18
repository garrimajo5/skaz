import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {bundledCatalog} from '../server/bundled-catalog.mjs';
import {validateCatalog} from '../server/catalog.mjs';
import {validateMaterialProposal} from '../scripts/spell-materials-contract.mjs';
import {spellMaterialReferences} from '../server/spell-material-references.mjs';
const catalog=validateCatalog(bundledCatalog().bundle),read=name=>JSON.parse(readFileSync(new URL('../catalog/'+name,import.meta.url),'utf8'));
const proposal=read('spell-materials.proposal.json');const candidate={...proposal,entries:proposal.entries.filter(e=>["Heat Metal","Hold Person","Invisibility","Levitate","Locate Animals or Plants","Locate Object","Magic Mouth","Moonbeam","Pass without Trace","Rope Trick","See Invisibility","Shatter","Spider Climb","Spike Growth","Suggestion","Web"].includes(e.name.en))};
test('sixteen remaining second-level candidates are valid and active',()=>{
 assert.equal(validateMaterialProposal(proposal,catalog).reviewed,104);const entries=catalog.filter(e=>candidate.entries.some(r=>r.id===e.id));assert.equal(entries.length,16);assert.equal(spellMaterialReferences(entries).length,16);assert.deepEqual(spellMaterialReferences(entries.map(e=>({...e,text:e.text+' Personal'}))),[]);
 const row=name=>candidate.entries.find(e=>e.name.en===name).materials;
 assert.equal(row('Magic Mouth').consumption.kind,'consumed');assert.match(row('Magic Mouth').price.text,/10/);
 assert.match(row('Spike Growth').description,/Семь.*или семь/);assert.match(row('Suggestion').description,/Язык змеи и либо.*либо/);
 assert.match(row('Rope Trick').note,/до 60 футов/);assert.match(row('Web').note,/эффектом/);
 assert.match(row('Invisibility').description,/заключённая в гуммиарабик/);
});
