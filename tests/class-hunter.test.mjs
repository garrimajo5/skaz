import test from 'node:test';import assert from 'node:assert/strict';
import {hunterChoices,hunterChoiceAt,validateHunterSelection,validateHunterHistory} from '../server/class-hunter.mjs';
test('Hunter offers exactly one choice at 3, 7, 11 and 15 with separate source-bound options',()=>{
 const groups=hunterChoices(20);assert.deepEqual(groups.map(g=>[g.level,g.options.length]),[[3,3],[7,3],[11,2],[15,3]]);assert.equal(new Set(groups.flatMap(g=>g.options.map(o=>o.id))).size,11);
 const records=[];for(let level=1;level<=20;level++){const group=hunterChoiceAt(level);if(group){const selected=group.options[0].id;records.push(validateHunterSelection(level,selected));assert.throws(()=>validateHunterSelection(level,groups.find(g=>g.level!==level).options[0].id));}else assert.throws(()=>validateHunterSelection(level,'colossus-slayer'));assert.deepEqual(validateHunterHistory(records,level),records);}
});
test('Hunter origins reject missing, reordered, extra and forged choices and do not share mutable rule objects',()=>{
 const history=hunterChoices(20).map(g=>validateHunterSelection(g.level,g.options[0].id));
 for(const edit of [h=>h.pop(),h=>h.reverse(),h=>h.push(h[0]),h=>h[0].id='evasion',h=>h[1].sourcePage=1,h=>h[1].choiceId='fake',h=>h[1].extra=true]){const bad=structuredClone(history);edit(bad);assert.throws(()=>validateHunterHistory(bad,20));}
 const row=hunterChoices(3);row[0].options[0].text='corrupt';assert.notEqual(hunterChoices(3)[0].options[0].text,'corrupt');assert.throws(()=>hunterChoices(21));assert.throws(()=>hunterChoices('3'));
});
