import test from 'node:test';
import assert from 'node:assert/strict';
import {createRogueExpertise,validateRogueExpertise,rogueExpertiseOptions,THIEVES_TOOLS} from '../server/class-rogue-expertise.mjs';
const selection=()=>({skillIds:['acrobatics','stealth','perception','investigation'],thievesTools:true,previousExpertise:['stealth',THIEVES_TOOLS],newExpertise:['acrobatics','perception'],rulesConfirmed:true});
const context={classId:'rogue',fromLevel:5};
test('rogue confirms old choices without inventing their acquisition and preserves them through20',()=>{
 const input=selection(),saved=createRogueExpertise(input,context);assert.equal(saved.baseline.acquiredLevel,null);assert.equal(saved.baseline.confirmedAt,6);
 for(let level=6;level<=20;level++)assert.deepEqual(validateRogueExpertise(saved,{classId:'rogue',level}),saved);
 input.skillIds.pop();assert.equal(saved.baseline.skillIds.length,4);const copy=validateRogueExpertise(saved,{classId:'rogue',level:6});copy.baseline.expertiseIds.pop();assert.equal(saved.baseline.expertiseIds.length,2);
});
test('all pairs are accepted exactly when proficient and not previously doubled',()=>{
 const base=selection(),ids=[...base.skillIds,THIEVES_TOOLS];
 for(const first of ids)for(const second of ids){const candidate={...base,newExpertise:[first,second]},valid=first!==second&&![first,second].some(id=>base.previousExpertise.includes(id));if(valid)assert.doesNotThrow(()=>createRogueExpertise(candidate,context));else assert.throws(()=>createRogueExpertise(candidate,context));}
 assert.deepEqual(rogueExpertiseOptions(base).map(s=>s.id),['acrobatics','investigation','perception']);
 const tools={...base,previousExpertise:['stealth','perception'],newExpertise:['acrobatics',THIEVES_TOOLS]};assert.doesNotThrow(()=>createRogueExpertise(tools,context));tools.thievesTools=false;assert.throws(()=>createRogueExpertise(tools,context));
});
test('malformed confirmation, unsupported context and forged history are rejected',()=>{
 for(const mutate of [s=>s.rulesConfirmed=false,s=>s.extra=true,s=>s.skillIds=['stealth'],s=>s.skillIds[0]='invalid',s=>s.previousExpertise=['stealth','stealth'],s=>s.previousExpertise=['arcana','stealth'],s=>s.thievesTools='true',s=>s.newExpertise=[]]){const input=selection();mutate(input);assert.throws(()=>createRogueExpertise(input,context));}
 for(const ctx of [{classId:'bard',fromLevel:5},{classId:'rogue',fromLevel:6},{}])assert.throws(()=>createRogueExpertise(selection(),ctx));
 for(const mutate of [s=>s.baseline.acquiredLevel=1,s=>s.baseline.confirmedAt=5,s=>s.expertise.acquiredLevel=7,s=>s.extra=true,s=>s.expertise.choiceId='bard:6:expertise']){const saved=createRogueExpertise(selection(),context);mutate(saved);assert.throws(()=>validateRogueExpertise(saved,{classId:'rogue',level:6}));}
});

import {rogueSkillView} from '../server/class-rogue-expertise.mjs';
test('rogue bonuses scale without bard half proficiency or a guessed tools ability',()=>{
 const saved=createRogueExpertise(selection(),context),abilities={str:8,dex:16,con:14,int:12,wis:10,cha:8};
 for(const [level,p]of [[6,3],[9,4],[13,5],[17,6],[20,6]]){const view=rogueSkillView(saved,{classId:'rogue',level,abilities}),get=id=>view.skills.find(s=>s.id===id);assert.equal(get('stealth').modifier,3+2*p);assert.equal(get('investigation').modifier,1+p);assert.equal(get('athletics').modifier,-1);assert.equal(view.tools.proficiencyBonus,2*p);assert.equal(view.tools.ability,null);assert.equal(view.jackOfAllTrades,false);}
 for(const dex of [null,3.5,0,31,'16'])assert.throws(()=>rogueSkillView(saved,{classId:'rogue',level:6,abilities:{...abilities,dex}}));
});
