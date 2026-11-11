import test from 'node:test';
import assert from 'node:assert/strict';
import {parseIndex,jsonAssignment,compareNames,normalizeName} from '../scripts/audit-dndsu-names.mjs';

test('JSON is parsed as data, with quoted braces and escaped quotes',()=>{
 assert.deepEqual(jsonAssignment('window.LIST = {"x":"}\\\"{"}; throw new Error("must not execute")','LIST'),{x:'}"{'});
 assert.throws(()=>jsonAssignment('LIST = {"x":','LIST'),/Truncated/);
 assert.throws(()=>jsonAssignment('LIST = {x:1}','LIST'));
});
const item=(name='Камень,Stone,',url='/items/1-stone/')=>`<div data-search='${name}' data-id='1'><a href='${url}'></a></div><script>filterItems={"1":{"source":["101"]}};</script>`;
test('bilingual names preserve commas and tolerate published apostrophe defect',()=>{
 assert.equal(parseIndex(item("Камень,Stone, +1, +2,"),'items')[0].en,'Stone, +1, +2');
 assert.equal(parseIndex(item("Бол'бара,Bol'bara,"),'items')[0].en,"Bol'bara");
 assert.equal(parseIndex(item('Послушник,Acolyte,аколит,'),'items')[0].en,'Acolyte');
 assert.equal(parseIndex(item('Король V,King V,'),'items')[0].ru,'Король V');
});
test('malformed, empty, foreign and duplicate index data fail rather than report success',()=>{
 assert.throws(()=>parseIndex(item('Камень,Stone,','https://evil.test/x'),'items'));
 assert.throws(()=>parseIndex('<script>filterItems={"1":{"source":[]}};</script>','items'),/cardinality/);
 assert.throws(()=>parseIndex(item()+item(),'items'),/cardinality/);
 assert.throws(()=>parseIndex('window.LIST={"category":"spells","cards":[]}','spells'),/Empty/);
});
test('name matching never silently chooses ambiguous IDs and aliases are explicit',()=>{
 const rows=[{en:'Mage’s Hand',url:'https://dnd.su/spells/1-hand/'}];
 const entries=[{id:'a',name:{en:"Mage's Hand"}},{id:'b',name:{en:'Mages Hand'}}];
 assert.equal(normalizeName('  Mage’s—Hand '),'mages hand');
 assert.equal(compareNames(rows,entries)[0].status,'needs-review');
 const alias={url:rows[0].url,ids:['a'],reason:'Reviewed name correspondence'};
 assert.equal(compareNames(rows,entries,[alias])[0].status,'alias-candidate');
 assert.throws(()=>compareNames(rows,entries,[{...alias,ids:['missing']}]),/Invalid alias/);
 assert.throws(()=>compareNames(rows,entries,[alias,alias]),/Invalid alias/);
});
