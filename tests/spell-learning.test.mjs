import test from 'node:test';
import assert from 'node:assert/strict';
import {spellLearningMode,spellPresentation} from '../server/spell-learning.mjs';
test('2014 confirmed classes select their learning policy',()=>{
 for(const classId of ['bard','ranger','sorcerer','warlock'])assert.equal(spellLearningMode({classId}),'known');
 for(const classId of ['cleric','druid','paladin','artificer'])assert.equal(spellLearningMode({classId}),'prepared');
 assert.equal(spellLearningMode({classId:'wizard'}),'spellbook');
 for(const classId of ['fighter','Bard','Бард',undefined])assert.equal(spellLearningMode({classId}),null);
});
test('manual sheets require explicit policy, never infer from class text',()=>{
 assert.equal(spellLearningMode({manual:true,classId:'bard'}),null);
 for(const selectedMode of ['known','prepared','spellbook'])assert.equal(spellLearningMode({manual:true,selectedMode}),selectedMode);
 assert.equal(spellLearningMode({manual:true,selectedMode:'other'}),null);
});
test('legacy prepared marks of known casters remain stored but display known',()=>{
 for(const status of ['known','prepared'])assert.deepEqual(spellPresentation(status,'known'),{storedStatus:status,effectiveStatus:'known',label:'Известно',availableInPlay:true});
});
test('prepared and spellbook casters retain preparation behavior',()=>{
 for(const mode of [null,'prepared','spellbook']){
 assert.equal(spellPresentation('known',mode).availableInPlay,false);
 assert.equal(spellPresentation('prepared',mode).availableInPlay,true);
 assert.equal(spellPresentation('prepared',mode).label,'Подготовлено');
 }
 assert.throws(()=>spellPresentation('remove','known'));
 assert.throws(()=>spellPresentation('known','invented'));
});
