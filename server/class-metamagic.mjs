import {readFileSync} from 'node:fs';
import {classProgression,previewClassLevel} from './class-progression.mjs';
const data=JSON.parse(readFileSync(new URL('../catalog/srd51-metamagic.json',import.meta.url),'utf8'));
const knownCount=level=>level>=17?4:level>=10?3:level>=3?2:0;
export function metamagicOptions(classId,level,{knownOptions=[]}={}){
 classProgression(classId,level);
 if(!Array.isArray(knownOptions)||new Set(knownOptions).size!==knownOptions.length||knownOptions.some(id=>!data.options.some(o=>o.id===id)))throw new Error('Неверные прежние варианты Метамагии');
 if(classId!=='sorcerer'||![3,10,17].includes(level))return [];
 return data.options.filter(o=>!knownOptions.includes(o.id)).map(o=>({...o}));
}
export function validateMetamagicChoice(plan,choiceId,selected,{knownOptions=[]}={}){
 const actual=previewClassLevel({classId:plan.classId,fromLevel:plan.fromLevel,toLevel:plan.toLevel,constitution:10});
 const choice=actual.choices.find(c=>c.kind==='metamagic'&&c.id===choiceId);
 if(!choice)throw new Error('На этом уровне нет выбора Метамагии');
 const options=metamagicOptions(plan.classId,plan.toLevel,{knownOptions});
 if(knownOptions.length!==knownCount(plan.fromLevel))throw new Error('Нужно сначала подтвердить происхождение прежних вариантов Метамагии');
 if(!Array.isArray(selected)||selected.length!==choice.count||new Set(selected).size!==selected.length)throw new Error('Выбери '+choice.count+' разных вариантов Метамагии');
 return selected.map(id=>{const option=options.find(o=>o.id===id);if(!option)throw new Error('Вариант Метамагии недоступен или уже выбран');return {id,ruleset:'5e-2014',classId:'sorcerer',sourcePage:option.sourcePage,acquiredLevel:plan.toLevel,choiceId};});
}
export function metamagicDescription(id){const option=data.options.find(o=>o.id===id);if(!option)throw new Error('Неизвестная Метамагия');return {...option};}
