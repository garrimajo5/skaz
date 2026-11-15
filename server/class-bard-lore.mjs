import {isDeepStrictEqual} from 'node:util';
import {spellChoiceOptions} from './class-progression.mjs';
import {validateCharacterStats} from './character-stats.mjs';
const rows=[['acrobatics','Акробатика','dex'],['animal-handling','Уход за животными','wis'],['arcana','Магия','int'],['athletics','Атлетика','str'],['deception','Обман','cha'],['history','История','int'],['insight','Проницательность','wis'],['intimidation','Запугивание','cha'],['investigation','Анализ','int'],['medicine','Медицина','wis'],['nature','Природа','int'],['perception','Внимательность','wis'],['performance','Выступление','cha'],['persuasion','Убеждение','cha'],['religion','Религия','int'],['sleight-of-hand','Ловкость рук','dex'],['stealth','Скрытность','dex'],['survival','Выживание','wis']];
export const loreSkillOptions=()=>rows.map(([id,name,ability])=>({id,name,ability}));
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
function skills(ids,min,max){if(!Array.isArray(ids)||ids.length<min||ids.length>max||new Set(ids).size!==ids.length||ids.some(id=>!rows.some(r=>r[0]===id)))throw Error('Выбери разные навыки из списка');return [...ids];}
function expertise(selected,level,known,old=[]){if(!exact(selected,['skillIds'])||![3,10].includes(level))throw Error('Компетентность барда выбирается на3 и10 уровнях');const ids=skills(selected.skillIds,2,2);if(ids.some(id=>!known.includes(id)||old.includes(id)))throw Error('Компетентность требует владения и двух новых навыков');return {skillIds:ids,acquiredLevel:level,sourcePage:13,choiceId:'bard:'+level+':expertise'};}
export function createLoreSkills(selected,chosenExpertise){
 if(!exact(selected,['baselineSkills','bonusSkills','rulesConfirmed'])||selected.rulesConfirmed!==true)throw Error('Подтверди прежние владения и выбери три новых навыка Коллегии знаний');
 const baseline=skills(selected.baselineSkills,3,15),bonus=skills(selected.bonusSkills,3,3);if(bonus.some(id=>baseline.includes(id)))throw Error('Дополнительное владение не должно повторять прежний навык');
 return {baseline:{skillIds:baseline,acquiredLevel:null,confirmedAt:3},bonus:{skillIds:bonus,acquiredLevel:3,sourcePage:13,choiceId:'bard:3:lore-skills'},expertise:[expertise(chosenExpertise,3,[...baseline,...bonus])],secrets:null};
}
export function loreSecretOptions({knownIds=[]}={}){return spellChoiceOptions('bard',6,'magical-secrets',{knownIds});}
export function advanceLoreSkills(value,level,selected,{knownIds=[]}={}){
 const next=structuredClone(value);
 if(level===10)next.expertise.push(expertise(selected,10,[...next.baseline.skillIds,...next.bonus.skillIds],next.expertise.flatMap(o=>o.skillIds)));
 else if(level===6){if(!exact(selected,['spellIds'])||!Array.isArray(selected.spellIds)||selected.spellIds.length!==2||new Set(selected.spellIds).size!==2||selected.spellIds.some(id=>!loreSecretOptions({knownIds}).some(o=>o.spellId===id)))throw Error('Выбери две новые Магические тайны: заговоры или заклинания не выше третьего круга');next.secrets={spellIds:[...selected.spellIds],acquiredLevel:6,sourcePage:13,choiceId:'bard:6:lore-secrets'};}
 else throw Error('На этом уровне нет дополнительного выбора Коллегии знаний');
 return next;
}
export function validateLoreSkills(value,{classId,baselineLevel,level}){
 if(classId!=='bard'||!Number.isSafeInteger(baselineLevel)||baselineLevel<1||baselineLevel>=3||!Number.isSafeInteger(level)||level<3||level>20||!exact(value,['baseline','bonus','expertise','secrets'])||!Array.isArray(value.expertise))throw Error('Нужна полная история выбора Коллегии знаний с третьего уровня');
 let expected=createLoreSkills({baselineSkills:value.baseline?.skillIds,bonusSkills:value.bonus?.skillIds,rulesConfirmed:true},{skillIds:value.expertise[0]?.skillIds});
 if(level>=6)expected=advanceLoreSkills(expected,6,{spellIds:value.secrets?.spellIds});
 if(level>=10)expected=advanceLoreSkills(expected,10,{skillIds:value.expertise[1]?.skillIds});
 if(!isDeepStrictEqual(value,expected))throw Error('Неверное происхождение навыков или Магических тайн Коллегии знаний');return structuredClone(expected);
}
export function loreSkillView(ledger,stats){
 if(ledger?.version!==15)return null;const lore=validateLoreSkills(ledger.lore,ledger),abilities=validateCharacterStats(stats).abilities,bonus=2+Math.floor((ledger.level-1)/4),proficient=new Set([...lore.baseline.skillIds,...lore.bonus.skillIds]),expert=new Set(lore.expertise.flatMap(o=>o.skillIds));
 return {classId:'bard',level:ledger.level,proficiency:bonus,skills:rows.map(([id,name,ability])=>{const rank=expert.has(id)?'expertise':proficient.has(id)?'proficient':'untrained';return {id,name,ability,rank,modifier:Math.floor((abilities[ability]-10)/2)+(rank==='expertise'?2*bonus:rank==='proficient'?bonus:Math.floor(bonus/2))};}),jackOfAllTrades:true};
}
