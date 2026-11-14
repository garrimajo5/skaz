import {previewClassLevel,classProgression} from './class-progression.mjs';

const rules={fighter:{level:1,page:24,styles:['archery','defense','dueling','great-weapon-fighting','protection','two-weapon-fighting']},paladin:{level:2,page:31,styles:['defense','dueling','great-weapon-fighting','protection']},ranger:{level:2,page:36,styles:['archery','defense','dueling','two-weapon-fighting']}};
// Pure rules only. Persistence and the production editor must opt in separately.
export function fightingStyleOptions(classId,{knownStyles=[]}={}){
 classProgression(classId,1);
 if(!Array.isArray(knownStyles)||knownStyles.some(x=>typeof x!=='string')||new Set(knownStyles).size!==knownStyles.length)throw new Error('Invalid previous fighting styles');
 const all=new Set(Object.values(rules).flatMap(r=>r.styles));
 if(knownStyles.some(x=>!all.has(x)))throw new Error('Unknown previous fighting style');
 const rule=rules[classId];if(!rule)return [];
 return rule.styles.filter(id=>!knownStyles.includes(id)).map(id=>({id,ruleset:'5e-2014',classId,sourcePage:rule.page,acquiredLevel:rule.level}));
}
export function validateFightingStyleChoice(plan,choiceId,selected,{knownStyles=[]}={}){
 const authoritative=previewClassLevel({classId:plan.classId,fromLevel:plan.fromLevel,toLevel:plan.toLevel,constitution:10});
 const choice=authoritative.choices.find(c=>c.kind==='fighting-style'&&c.id===choiceId);
 if(!choice)throw new Error('No fighting style choice at this class level');
 if(!Array.isArray(selected)||selected.length!==1)throw new Error('Choose exactly one fighting style');
 const option=fightingStyleOptions(plan.classId,{knownStyles}).find(o=>o.id===selected[0]);
 if(!option)throw new Error('Fighting style unavailable or already known');
 return {...option,choiceId:choice.id};
}
