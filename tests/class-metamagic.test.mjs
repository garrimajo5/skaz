import test from 'node:test';
import assert from 'node:assert/strict';
import {metamagicOptions,validateMetamagicChoice} from '../server/class-metamagic.mjs';
const plan=fromLevel=>({classId:'sorcerer',fromLevel,toLevel:fromLevel+1});
test('metamagic requires exact unique counts and authoritative class levels',()=>{
 assert.equal(metamagicOptions('sorcerer',3).length,8);assert.deepEqual(metamagicOptions('wizard',3),[]);assert.deepEqual(metamagicOptions('sorcerer',4),[]);
 const good=['careful-spell','twinned-spell'];assert.equal(validateMetamagicChoice(plan(2),'sorcerer:3:metamagic',good).length,2);
 for(const selection of [[],['careful-spell'],['careful-spell','careful-spell'],['made-up','twinned-spell'],null])assert.throws(()=>validateMetamagicChoice(plan(2),'sorcerer:3:metamagic',selection));
 assert.throws(()=>validateMetamagicChoice({...plan(2),classId:'wizard'},'sorcerer:3:metamagic',good));
 assert.throws(()=>validateMetamagicChoice(plan(3),'sorcerer:3:metamagic',good));
});
test('later metamagic never guesses missing baseline choices or permits duplicate selections',()=>{
 const knownOptions=['careful-spell','twinned-spell'];assert.equal(metamagicOptions('sorcerer',10,{knownOptions}).length,6);
 assert.throws(()=>validateMetamagicChoice(plan(9),'sorcerer:10:metamagic',['subtle-spell']),/происхождение/);
 assert.throws(()=>validateMetamagicChoice(plan(9),'sorcerer:10:metamagic',['careful-spell'],{knownOptions}));
 const origin=validateMetamagicChoice(plan(9),'sorcerer:10:metamagic',['subtle-spell'],{knownOptions});assert.equal(origin[0].acquiredLevel,10);
 assert.equal(validateMetamagicChoice(plan(16),'sorcerer:17:metamagic',['distant-spell'],{knownOptions:[...knownOptions,'subtle-spell']})[0].sourcePage,44);
 const list=metamagicOptions('sorcerer',3);list[0].name='changed';assert.notEqual(metamagicOptions('sorcerer',3)[0].name,'changed');
});
