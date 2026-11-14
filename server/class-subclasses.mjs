import {validateDraconic} from './class-draconic.mjs';
import {naturalRecoveryOrigin,landCantripOrigin,validateLandChoices,validateLifeConfirmation} from './class-divine-land.mjs';
import {fightingStyleOptions} from './class-fighting-styles.mjs';
import {hunterChoiceAt,validateHunterSelection,validateHunterHistory} from './class-hunter.mjs';
import {readFileSync} from 'node:fs';
import {classProgression,previewClassLevel} from './class-progression.mjs';
const data=JSON.parse(readFileSync(new URL('../catalog/srd51-subclass-reference.json',import.meta.url),'utf8'));
const supported=new Set(['barbarian-berserker','fighter-champion','rogue-thief','monk-open-hand','wizard-evocation','ranger-hunter','paladin-devotion','cleric-life','druid-land']);
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k));
export function subclassDescription(id){const s=data.subclasses.find(o=>o.id===id);if(!s)throw new Error('Неизвестный подкласс SRD');return {...structuredClone(s),source:structuredClone(data.source),...(id==='ranger-hunter'?{additionalChoice:hunterChoiceAt(3)}:{})};}
export function advancementSubclassOptions(classId,level){
 const c=classProgression(classId,level);
 return data.subclasses.filter(s=>s.classId===classId&&supported.has(s.id)&&c.subclassLevel===level).map(s=>subclassDescription(s.id));
}
export function validateSubclassChoice(plan,selected){
 const actual=previewClassLevel({...plan,constitution:10});
 if(!actual.choices.some(c=>c.kind==='subclass')||!exact(selected,['id',...(selected?.id==='ranger-hunter'?['optionId']:[]),...(selected?.id==='druid-land'?['cantripId']:[])]))throw new Error('Нужен явный выбор подкласса на предусмотренном уровне');
 const s=advancementSubclassOptions(plan.classId,plan.toLevel).find(o=>o.id===selected.id);
 if(!s)throw new Error('Подкласс или его обязательные дополнительные выборы пока не поддержаны');
 return {id:s.id,classId:s.classId,ruleset:'5e-2014',acquiredLevel:plan.toLevel,sourcePage:s.sourcePage,choiceId:plan.classId+':'+plan.toLevel+':subclass',...(s.id==='ranger-hunter'?{options:[validateHunterSelection(3,selected.optionId)]}:{}),...(s.id==='fighter-champion'?{additionalStyle:null}:{}),...(s.id==='druid-land'?{bonusCantrip:landCantripOrigin(selected.cantripId),terrain:null,naturalRecovery:naturalRecoveryOrigin()}:{})};
}
export function validateSubclassOrigin(origin,{classId,baselineLevel,level}){
 if(origin?.id==='sorcerer-draconic')return validateDraconic(origin,{classId,baselineLevel,level});
 if(origin?.id==='cleric-life')return validateLifeConfirmation(origin,{classId,baselineLevel,level});
 const start=classProgression(classId,level).subclassLevel;
 if(start<=baselineLevel||start>level)throw new Error('Подкласс должен быть явно получен в сохранённой истории; прошлый выбор не угадывается');
 const expected=validateSubclassChoice({classId,fromLevel:start-1,toLevel:start},{id:origin?.id,...(origin?.id==='ranger-hunter'?{optionId:origin.options?.[0]?.id}:{}),...(origin?.id==='druid-land'?{cantripId:origin.bonusCantrip?.catalogId}:{})});
 if(!exact(origin,Object.keys(expected))||Object.entries(expected).some(([k,v])=>!['options','additionalStyle','bonusCantrip','terrain','naturalRecovery'].includes(k)&&origin[k]!==v))throw new Error('Происхождение подкласса не соответствует правилам');
 if(origin.id==='fighter-champion'){if(level<10&&origin.additionalStyle!==null)throw new Error('Дополнительный стиль недоступен до 10-го уровня');expected.additionalStyle=level>=10?validateChampionStyleOrigin(origin.additionalStyle):null;}
 if(origin.id==='druid-land'){validateLandChoices(origin,level);expected.bonusCantrip=structuredClone(origin.bonusCantrip);expected.terrain=structuredClone(origin.terrain);}
 if(origin.id==='ranger-hunter')expected.options=validateHunterHistory(origin.options,level);
 return structuredClone(expected);
}

export function validateChampionStyles(selected){
 if(!exact(selected,['previousId','newId']))throw new Error('Подтверди прежний боевой стиль и выбери новый');
 const allowed=fightingStyleOptions('fighter').map(s=>s.id);
 if(!allowed.includes(selected.previousId)||!allowed.includes(selected.newId)||selected.previousId===selected.newId)throw new Error('Нужны два разных боевых стиля воина');
 return {previous:{id:selected.previousId,confirmedLevel:10,sourcePage:24},added:{id:selected.newId,acquiredLevel:10,sourcePage:25}};
}
export function validateChampionStyleOrigin(value){
 const expected=validateChampionStyles({previousId:value?.previous?.id,newId:value?.added?.id});
 if(!exact(value,['previous','added'])||!exact(value.previous,Object.keys(expected.previous))||!exact(value.added,Object.keys(expected.added))||Object.entries(expected.previous).some(([k,v])=>value.previous[k]!==v)||Object.entries(expected.added).some(([k,v])=>value.added[k]!==v))throw new Error('Неверное происхождение дополнительного боевого стиля');
 return expected;
}
