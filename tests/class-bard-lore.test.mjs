import test from 'node:test';import assert from 'node:assert/strict';
import {createLoreSkills,advanceLoreSkills,validateLoreSkills,loreSkillView,loreSkillOptions,loreSecretOptions} from '../server/class-bard-lore.mjs';
const selection={baselineSkills:['persuasion','perception','performance'],bonusSkills:['arcana','history','nature'],rulesConfirmed:true};
const initial=()=>createLoreSkills(selection,{skillIds:['arcana','history']});
test('Lore skills use standard abilities, proficiency thresholds, Expertise and rounded-down Jack of All Trades',()=>{
 const stats={abilities:{str:8,dex:14,con:14,int:12,wis:10,cha:18},armorClass:14,initiative:2,speed:30};
 for(const [level,bonus,arcana,persuasion,stealth]of [[3,2,5,6,3],[5,3,7,7,3],[9,4,9,8,4],[10,4,9,12,4],[13,5,11,14,4],[17,6,13,16,5],[20,6,13,16,5]]){let lore=initial();if(level>=6)lore=advanceLoreSkills(lore,6,{spellIds:loreSecretOptions().slice(0,2).map(o=>o.spellId)});if(level>=10)lore=advanceLoreSkills(lore,10,{skillIds:['persuasion','perception']});const view=loreSkillView({version:15,classId:'bard',baselineLevel:2,level,lore},stats),get=id=>view.skills.find(o=>o.id===id);assert.equal(view.proficiency,bonus);assert.equal(get('arcana').modifier,arcana);assert.equal(get('persuasion').modifier,persuasion);assert.equal(get('stealth').modifier,stealth);assert.equal(get('athletics').ability,'str');assert.equal(get('insight').ability,'wis');}
 assert.equal(loreSkillOptions().length,18);assert.equal(new Set(loreSkillOptions().map(o=>o.id)).size,18);
});
test('Lore rejects malformed baseline, duplicated proficiencies and forged source fields and returns independent values',()=>{
 for(const change of [s=>s.rulesConfirmed=false,s=>s.extra=true,s=>s.baselineSkills=['arcana','arcana','history'],s=>s.bonusSkills=['unknown','nature','history'],s=>s.bonusSkills=['arcana','history'],s=>s.baselineSkills='persuasion']){const bad=structuredClone(selection);change(bad);assert.throws(()=>createLoreSkills(bad,{skillIds:['arcana','history']}));}
 const original=initial();for(const change of [v=>v.bonus.sourcePage=14,v=>v.baseline.acquiredLevel=2,v=>v.expertise[0].skillIds=['arcana','arcana'],v=>v.expertise[0].skillIds=['stealth','history'],v=>v.extra=true]){const bad=structuredClone(original);change(bad);assert.throws(()=>validateLoreSkills(bad,{classId:'bard',baselineLevel:2,level:3}));}
 for(const context of [{classId:'rogue',baselineLevel:2,level:3},{classId:'bard',baselineLevel:3,level:3},{classId:'bard',baselineLevel:2,level:2},{classId:'bard',baselineLevel:2,level:21}])assert.throws(()=>validateLoreSkills(original,context));
 const copy=validateLoreSkills(original,{classId:'bard',baselineLevel:2,level:3});copy.bonus.skillIds[0]='changed';assert.equal(original.bonus.skillIds[0],'arcana');const options=loreSkillOptions();options[0].name='changed';assert.notEqual(loreSkillOptions()[0].name,'changed');
});
test('Lore magical secrets include cantrips and all class lists only through circle3, without mutating ordinary counts',()=>{
 const options=loreSecretOptions();assert.ok(options.some(o=>o.level===0));assert.ok(options.some(o=>o.spellId==='srd51:2014:spell:fireball'));assert.ok(options.every(o=>o.level<=3));const ids=options.slice(0,2).map(o=>o.spellId);assert.ok(loreSecretOptions({knownIds:ids}).every(o=>!ids.includes(o.spellId)));
 for(const spellIds of [[ids[0],ids[0]],['srd51:2014:spell:fire-shield',ids[0]],[],[ids[0]]])assert.throws(()=>advanceLoreSkills(initial(),6,{spellIds}));assert.throws(()=>advanceLoreSkills(initial(),6,{spellIds:ids},{knownIds:[ids[0]]}));assert.throws(()=>advanceLoreSkills(initial(),5,{spellIds:ids}));
});
