import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSpellSourceCandidates} from '../scripts/spell-source-candidates.mjs';
import {bundledCatalog} from '../server/bundled-catalog.mjs';
const entry=(id,ru,extra={})=>({id,kind:'spell',ruleset:'5e-2014',name:{ru},...extra});

test('real shared Russian title preserves both IDs instead of last-write selection',()=>{
  const result=buildSpellSourceCandidates([{rowId:'example',name:'Маскировка'}],bundledCatalog().bundle.entries)[0];
  assert.deepEqual(result.candidateIds,['srd51:2014:spell:disguise-self','srd51:2014:spell:seeming']);
  assert.equal(result.status,'ambiguous-name-candidates');
  assert.equal(result.selectedId,null);assert.equal(result.identityVerified,false);assert.equal(result.fullRuleAcceptance,false);
});
test('case/edge whitespace do not become aliases or choose an ID',()=>{
  const x=buildSpellSourceCandidates([{rowId:'a',name:'  ИСКРА  '}],[entry('x','Искра')])[0];
  assert.deepEqual(x.candidateIds,['x']);assert.equal(x.status,'unique-name-candidate');assert.equal(x.selectedId,null);
});
test('a reversed slash, spelling and apostrophe are separate unresolved names',()=>{
  for(const name of ['B/A',"Fraz-Urb’luu",'Елка']){
    const result=buildSpellSourceCandidates([{rowId:'a',name}],[entry('x','A/B'),entry('y',"Fraz-Urb'luu"),entry('z','Ёлка')])[0];
    assert.equal(result.status,'unmatched');
  }
});
test('a row level is not an independently verified identity',()=>{
  const x=buildSpellSourceCandidates([{rowId:'a',name:'Shared',level:1}],[entry('a','Shared',{spell:{level:1}}),entry('b','Shared',{spell:{level:5}})])[0];
  assert.equal(x.status,'ambiguous-name-candidates');assert.equal(x.selectedId,null);
});
test('other editions and entity kinds do not provide candidates',()=>{
  const x=buildSpellSourceCandidates([{rowId:'a',name:'Shared'}],[entry('a','Shared',{ruleset:'5e-2024'}),entry('b','Shared',{kind:'item'})])[0];
  assert.equal(x.status,'unmatched');
});
test('duplicate IDs and missing names fail without making a guess',()=>{
  assert.throws(()=>buildSpellSourceCandidates([{rowId:'a',name:'X'},{rowId:'a',name:'Y'}],[]),/row ID/);
  assert.throws(()=>buildSpellSourceCandidates([],[entry('x','A'),entry('x','B')]),/spell ID/);
  assert.throws(()=>buildSpellSourceCandidates([{rowId:'a',name:''}],[]),/name/);
});
test('candidate order is deterministic and input objects are preserved',()=>{
  const rows=[{rowId:'a',name:'X',privateObserved:{value:41}}],entries=[entry('z','X'),entry('a','X')];
  const before=structuredClone({rows,entries});const result=buildSpellSourceCandidates(rows,entries);
  assert.deepEqual(result[0].candidateIds,['a','z']);assert.deepEqual({rows,entries},before);
  assert.equal('privateObserved' in result[0],false);assert.equal('name' in result[0],false);
});
