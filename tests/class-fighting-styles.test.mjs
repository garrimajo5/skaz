import test from 'node:test';
import assert from 'node:assert/strict';
import {fightingStyleOptions,validateFightingStyleChoice} from '../server/class-fighting-styles.mjs';
const plan=(classId,fromLevel=1)=>({classId,fromLevel,toLevel:fromLevel+1});
test('2014 styles are class-specific and previous choices cannot be selected twice',()=>{
 assert.equal(fightingStyleOptions('fighter').length,6);
 assert.ok(!fightingStyleOptions('paladin').some(s=>s.id==='archery'));
 assert.ok(!fightingStyleOptions('ranger').some(s=>s.id==='protection'));
 assert.deepEqual(fightingStyleOptions('wizard'),[]);
 const list=fightingStyleOptions('fighter',{knownStyles:['defense']});assert.equal(list.length,5);
 list[0].id='corrupt';assert.equal(fightingStyleOptions('fighter')[0].id,'archery');
 assert.throws(()=>fightingStyleOptions('fighter',{knownStyles:['defense','defense']}));
 assert.throws(()=>fightingStyleOptions('fighter',{knownStyles:['made-up']}));
});
test('choice validation recomputes level and rejects forged options and repeated styles',()=>{
 const p=plan('paladin'),id='paladin:2:fighting-style';
 assert.deepEqual(validateFightingStyleChoice(p,id,['defense']),{id:'defense',ruleset:'5e-2014',classId:'paladin',sourcePage:31,acquiredLevel:2,choiceId:id});
 for(const selection of [[],['defense','dueling'],['archery'],'defense',null])assert.throws(()=>validateFightingStyleChoice(p,id,selection));
 assert.throws(()=>validateFightingStyleChoice(p,id,['defense'],{knownStyles:['defense']}));
 assert.throws(()=>validateFightingStyleChoice({...plan('paladin',2),choices:[{id,kind:'fighting-style'}]},id,['defense']));
 assert.throws(()=>validateFightingStyleChoice(p,'ranger:2:fighting-style',['defense']));
 assert.throws(()=>validateFightingStyleChoice(plan('fighter'),'fighter:2:fighting-style',['defense']));
 assert.equal(validateFightingStyleChoice(plan('ranger'),'ranger:2:fighting-style',['archery']).sourcePage,36);
});
