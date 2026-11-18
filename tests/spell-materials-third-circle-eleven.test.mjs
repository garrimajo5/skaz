import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {bundledCatalog} from '../server/bundled-catalog.mjs';
import {validateCatalog} from '../server/catalog.mjs';
import {validateMaterialProposal} from '../scripts/spell-materials-contract.mjs';
import {spellMaterialReferences} from '../server/spell-material-references.mjs';
const catalog=validateCatalog(bundledCatalog().bundle),read=name=>JSON.parse(readFileSync(new URL('../catalog/'+name,import.meta.url),'utf8'));
const candidate=read('review/spell-materials-third-circle-eleven.proposal.json');
test('eleven third-level candidates stay isolated and preserve material state',()=>{
 assert.equal(validateMaterialProposal(candidate,catalog).reviewed,11);assert.deepEqual(spellMaterialReferences(catalog.filter(e=>candidate.entries.some(r=>r.id===e.id))),[]);
 assert.ok(candidate.entries.every(e=>e.materials.price.kind==='not-stated'&&e.materials.consumption.kind==='retained'));
 const row=name=>candidate.entries.find(e=>e.name.en===name).materials;
 assert.match(row('Speak with Dead').description,/Горящие/);assert.match(row('Speak with Dead').note,/не отменяет.*обычного горения/);
 assert.match(row('Sleet Storm').description,/пыли и.*воды/);assert.match(row('Water Breathing').description,/или/);
 assert.match(row('Wind Wall').description,/веер и перо/);
});
test('active and four pending batches cover current SRD material spells through level three without duplicates',()=>{
 const active=read('spell-materials.proposal.json').entries;
 const pending=['second-circle-fifteen','second-circle-sixteen','third-circle-twelve','third-circle-eleven'].flatMap(n=>read('review/spell-materials-'+n+'.proposal.json').entries);
 assert.equal(active.length,42);assert.equal(pending.length,54);const all=[...active,...pending],ids=new Set(all.map(e=>e.id));assert.equal(ids.size,96);
 assert.deepEqual(catalog.filter(e=>e.kind==='spell'&&e.spell.level<=3&&e.spell.components.includes('M')&&!ids.has(e.id)).map(e=>e.name.en),[]);
 assert.equal(spellMaterialReferences(catalog).length,42);
});