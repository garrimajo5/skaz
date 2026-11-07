import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../client/character-sheet.js',import.meta.url),'utf8');
function controls(current,max,allowed=true){
 const context=vm.createContext({esc:value=>String(value).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;'),SkazStorage:{sheet:()=>({counters:[{id:'counter-test',name:'<Лёд>',current,max}]}),snapshotKey:()=> 'hero:revision',canResource:()=>allowed}});
 vm.runInContext(source,context);return vm.runInContext('SkazCharacterSheet.controls()',context);
}
test('small counters expose one command per dot without absolute positions or duplicate IDs',()=>{
 for(const max of [1,4,10])for(const current of [0,max]){
  const html=controls(current,max);assert.equal((html.match(/<button /g)||[]).length,max);
  assert.equal((html.match(/data-counter-delta="-1"/g)||[]).length,current);
  assert.equal((html.match(/data-counter-delta="1"/g)||[]).length,max-current);
  assert.equal((html.match(/data-sheet-context="hero:revision"/g)||[]).length,max);
  assert.doesNotMatch(html,/ disabled| id="|<Лёд>/);assert.match(html,/&lt;Лёд&gt;/);
 }
 assert.doesNotMatch(controls(0,0),/<button/);
 assert.equal((controls(2,4,false).match(/ disabled/g)||[]).length,4);
});
test('large counters retain bounded minus and plus, including read-only access',()=>{
 for(const max of [11,9999]){
  const zero=controls(0,max),full=controls(max,max);
  assert.equal((zero.match(/<button /g)||[]).length,2);
  assert.match(zero,/data-counter-delta="-1"[^>]*disabled/);
  assert.doesNotMatch(zero,/data-counter-delta="1"[^>]*disabled/);
  assert.match(full,/data-counter-delta="1"[^>]*disabled/);
  assert.doesNotMatch(full,/data-counter-delta="-1"[^>]*disabled/);
  assert.equal((controls(1,max,false).match(/ disabled/g)||[]).length,2);
 }
});
