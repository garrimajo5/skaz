import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {bundledCatalog} from '../server/bundled-catalog.mjs';
import {validateCatalog} from '../server/catalog.mjs';
import {validateMaterialProposal} from '../scripts/spell-materials-contract.mjs';
import {spellMaterialReferences} from '../server/spell-material-references.mjs';
const catalog=validateCatalog(bundledCatalog().bundle),read=name=>JSON.parse(readFileSync(new URL('../catalog/'+name,import.meta.url),'utf8'));
const candidate=read('review/spell-materials-low-level-twelve.proposal.json');
test('twelve remaining low-level candidates are valid and not active',()=>{
 assert.equal(validateMaterialProposal(candidate,catalog).reviewed,12);
 assert.deepEqual(spellMaterialReferences(catalog.filter(e=>candidate.entries.some(r=>r.id===e.id))),[]);
 const ink=candidate.entries.find(e=>e.name.en==='Illusory Script').materials;
 assert.equal(ink.price.kind,'stated');assert.match(ink.price.text,/не менее 10/);assert.equal(ink.consumption.kind,'consumed');
 assert.ok(candidate.entries.filter(e=>e.name.en!=='Illusory Script').every(e=>e.materials.price.kind==='not-stated'&&e.materials.consumption.kind==='retained'));
});
test('active and pending reviews cover every material spell through first level exactly once',()=>{
 const all=[...read('spell-materials.proposal.json').entries,...read('review/spell-materials-first-circle-ten.proposal.json').entries,...candidate.entries];
 assert.equal(new Set(all.map(e=>e.id)).size,all.length);
 const covered=new Set(all.map(e=>e.id));const low=catalog.filter(e=>e.kind==='spell'&&e.spell.level<=1&&e.spell.components.includes('M'));
 assert.ok(low.length>0);assert.deepEqual(low.filter(e=>!covered.has(e.id)).map(e=>e.name.en),[]);
 const row=name=>candidate.entries.find(e=>e.name.en===name).materials;
 assert.match(row('Dancing Lights').description,/фосфора.*wychwood.*или светлячок/);
 assert.match(row('Hideous Laughter').description,/пирожные и перо.*машут/);
 assert.match(row('Unseen Servant').description,/бечёвки и/);
 assert.match(row('Goodberry').note,/не исходный материальный компонент/);
});