import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {bundledCatalog} from '../server/bundled-catalog.mjs';
import {validateCatalog} from '../server/catalog.mjs';
import {validateMaterialProposal} from '../scripts/spell-materials-contract.mjs';
import {spellMaterialReferences} from '../server/spell-material-references.mjs';
const catalog=validateCatalog(bundledCatalog().bundle),read=name=>JSON.parse(readFileSync(new URL('../catalog/'+name,import.meta.url),'utf8'));
const candidate=read('review/spell-materials-second-circle-sixteen.proposal.json');
test('sixteen remaining second-level candidates are valid and remain isolated',()=>{
 assert.equal(validateMaterialProposal(candidate,catalog).reviewed,16);const entries=catalog.filter(e=>candidate.entries.some(r=>r.id===e.id));assert.equal(entries.length,16);assert.deepEqual(spellMaterialReferences(entries),[]);
 const row=name=>candidate.entries.find(e=>e.name.en===name).materials;
 assert.equal(row('Magic Mouth').consumption.kind,'consumed');assert.match(row('Magic Mouth').price.text,/10/);
 assert.match(row('Spike Growth').description,/Семь.*или семь/);assert.match(row('Suggestion').description,/Язык змеи и либо.*либо/);
 assert.match(row('Rope Trick').note,/до 60 футов/);assert.match(row('Web').note,/эффектом/);
 assert.match(row('Invisibility').description,/заключённая в гуммиарабик/);
});
test('active plus reviewed candidates cover all current SRD material spells through level two once',()=>{
 const all=[...read('spell-materials.proposal.json').entries,...read('review/spell-materials-second-circle-fifteen.proposal.json').entries,...candidate.entries];
 assert.equal(all.length,73);assert.equal(new Set(all.map(e=>e.id)).size,73);
 const ids=new Set(all.map(e=>e.id));assert.deepEqual(catalog.filter(e=>e.kind==='spell'&&e.spell.level<=2&&e.spell.components.includes('M')&&!ids.has(e.id)).map(e=>e.name.en),[]);
});