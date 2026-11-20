import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {reviewActionSpellReferences} from '../scripts/catalog-action-spell-review.mjs';
const raw=p=>readFileSync(new URL('../catalog/'+p+'.json',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const primary=JSON.parse(raw('skt-spellcasting-action-evidence-2014')),scope=JSON.parse(raw('scope-register-2014'));
test('132 local uses reference87 names without becoming learned, prepared or new base-spell rules',()=>{
 const before=structuredClone(primary),d=reviewActionSpellReferences(primary,scope);
 assert.deepEqual(d.summary,{actions:13,spellEntries:132,distinctSpellNames:87,entriesWithOneCandidate:132,unresolvedEntries:0});
 for(const row of d.records){for(const k of ['accepted','automaticLearn','automaticPrepare','automaticResourceCreation','baseSpellOverride'])assert.equal(row[k],false);assert.equal(row.canonicalSpellId,null);}
 const bolts=d.records.filter(r=>r.spellName==='fire bolt');assert.equal(bolts.length,2);assert.ok(bolts.every(r=>r.actionLocalOverride.damage.dice==='1d10'));
 bolts[0].actionLocalOverride.damage.dice='2d10';assert.deepEqual(primary,before);
});
test('only two explicitly identified apostrophe differences receive spelling candidates',()=>{
 const d=reviewActionSpellReferences(primary,scope);
 assert.deepEqual(d.records.filter(r=>r.candidates.some(c=>c.match==='explicit-apostrophe-spelling-candidate')).map(r=>r.candidates[0].observationId).sort(),['dndsu:spells:166','dndsu:spells:216']);
 const changed=structuredClone(primary);changed.actions[0].groups[0].spells[0].name='Unknown’s spell';
 const row=reviewActionSpellReferences(changed,scope).records[0];assert.deepEqual(row.candidates,[]);assert.equal(row.status,'no-name-candidate');
 const bad=structuredClone(scope);bad.records.find(r=>r.id==='dndsu:spells:166').names.en='Other sword';assert.throws(()=>reviewActionSpellReferences(primary,bad));
});
test('multiple spell versions stay ambiguous and other catalog sections are excluded',()=>{
 const s=structuredClone(scope),original=s.records.find(r=>r.section==='spells'&&r.names.en.toLowerCase()==='message');
 s.records.push({...structuredClone(original),id:'synthetic:spell:other-version',sourceIds:['synthetic']});
 s.records.push({...structuredClone(original),id:'synthetic:item:same-name',section:'items'});
 const row=reviewActionSpellReferences(primary,s).records.find(r=>r.spellName==='message');assert.equal(row.candidates.length,2);assert.equal(row.status,'multiple-versions-need-review');assert.ok(!row.candidates.some(c=>c.observationId.startsWith('synthetic:item')));
});
test('duplicate units, duplicate spells, unsupported frequency and acceptance are rejected',()=>{
 for(const mutate of [d=>d.actions.push(d.actions[0]),d=>d.actions[0].groups[0].spells.push(d.actions[0].groups[0].spells[0]),d=>d.actions[0].groups[0].frequency='shared pool',d=>d.accepted=true]){const d=structuredClone(primary);mutate(d);assert.throws(()=>reviewActionSpellReferences(d,scope));}
 const bad=structuredClone(scope);bad.records.push(bad.records[0]);assert.throws(()=>reviewActionSpellReferences(primary,bad));
});
test('saved report reproduces including normalized input hashes',()=>{
 const d=reviewActionSpellReferences(primary,scope);d.inputSha256=Object.fromEntries(['skt-spellcasting-action-evidence-2014','scope-register-2014'].map(p=>['catalog/'+p+'.json',createHash('sha256').update(raw(p)).digest('hex')]));assert.deepEqual(d,JSON.parse(raw('skt-action-spell-references-2014')));
});
