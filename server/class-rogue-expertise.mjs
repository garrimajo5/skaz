import {isDeepStrictEqual} from 'node:util';
import {loreSkillOptions} from './class-bard-lore.mjs';
export const THIEVES_TOOLS='thieves-tools';
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const skillIds=new Set(loreSkillOptions().map(s=>s.id));
function distinct(ids,min,max,allowed){
 if(!Array.isArray(ids)||ids.length<min||ids.length>max||new Set(ids).size!==ids.length||ids.some(id=>!allowed.has(id)))throw Error('Нужны разные подтверждённые владения');
 return [...ids];
}
// Confirmation records what the player already had, never a fabricated acquisition.
export function createRogueExpertise(selected,{classId,fromLevel}={}){
 if(classId!=='rogue'||fromLevel!==5)throw Error('Этот выбор предназначен для повышения плута5→6');
 if(!exact(selected,['skillIds','thievesTools','previousExpertise','newExpertise','rulesConfirmed'])||selected.rulesConfirmed!==true||typeof selected.thievesTools!=='boolean')throw Error('Подтверди прежние владения и Компетентность');
 const skills=distinct(selected.skillIds,4,18,skillIds),allowed=new Set(skills);
 if(selected.thievesTools)allowed.add(THIEVES_TOOLS);
 const previous=distinct(selected.previousExpertise,2,2,allowed),fresh=distinct(selected.newExpertise,2,2,allowed);
 if(fresh.some(id=>previous.includes(id)))throw Error('Выбери два владения без прежней Компетентности');
 return {baseline:{skillIds:skills,thievesTools:selected.thievesTools,expertiseIds:previous,acquiredLevel:null,confirmedAt:6},expertise:{ids:fresh,acquiredLevel:6,choiceId:'rogue:6:expertise',sourcePage:39}};
}
export function validateRogueExpertise(value,{classId,level}={}){
 if(classId!=='rogue'||!Number.isSafeInteger(level)||level<6||level>20||!exact(value,['baseline','expertise']))throw Error('Неверная история Компетентности плута');
 const expected=createRogueExpertise({skillIds:value.baseline?.skillIds,thievesTools:value.baseline?.thievesTools,previousExpertise:value.baseline?.expertiseIds,newExpertise:value.expertise?.ids,rulesConfirmed:true},{classId,fromLevel:5});
 if(!isDeepStrictEqual(value,expected))throw Error('Изменено происхождение Компетентности');
 return structuredClone(expected);
}
export function rogueExpertiseOptions(selected){
 const skills=distinct(selected.skillIds,4,18,skillIds);
 if(typeof selected.thievesTools!=='boolean')throw Error('Укажи владение воровскими инструментами');
 const options=loreSkillOptions().filter(s=>skills.includes(s.id));
 if(selected.thievesTools)options.push({id:THIEVES_TOOLS,name:'Воровские инструменты',ability:null});
 const previous=distinct(selected.previousExpertise,2,2,new Set(options.map(s=>s.id)));
 return options.filter(s=>!previous.includes(s.id));
}

// Tools have no fixed governing ability; the caller must choose it for each check.
export function rogueSkillView(value,{classId,level,abilities}={}){
 const origin=validateRogueExpertise(value,{classId,level});
 for(const ability of ['str','dex','con','int','wis','cha'])if(!Number.isSafeInteger(abilities?.[ability])||abilities[ability]<1||abilities[ability]>30)throw Error('Нужны корректные характеристики');
 const proficiency=2+Math.floor((level-1)/4),known=new Set(origin.baseline.skillIds),expert=new Set([...origin.baseline.expertiseIds,...origin.expertise.ids]);
 const rank=id=>expert.has(id)?'expertise':known.has(id)?'proficient':'untrained';
 return {classId,level,proficiency,jackOfAllTrades:false,skills:loreSkillOptions().map(s=>({...s,rank:rank(s.id),minimumD20:level>=11&&rank(s.id)!=='untrained'?10:null,modifier:Math.floor((abilities[s.ability]-10)/2)+(rank(s.id)==='expertise'?2*proficiency:rank(s.id)==='proficient'?proficiency:0)})),tools:{id:THIEVES_TOOLS,ability:null,minimumD20:level>=11&&origin.baseline.thievesTools?10:null,rank:expert.has(THIEVES_TOOLS)?'expertise':origin.baseline.thievesTools?'proficient':'untrained',proficiencyBonus:expert.has(THIEVES_TOOLS)?2*proficiency:origin.baseline.thievesTools?proficiency:0}};
}

