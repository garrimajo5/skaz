import {isDeepStrictEqual} from 'node:util';
import {previewSubclassSpells} from './class-subclass-spells.mjs';
import {previewClassLevel,spellChoiceOptions} from './class-progression.mjs';
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k));
export function confirmFiend(value){
 if(!exact(value,['id','rulesConfirmed'])||value.id!=='warlock-fiend'||value.rulesConfirmed!==true)throw Error('Подтверди прежний выбор покровителя Исчадия первого уровня');
 return {id:'warlock-fiend',classId:'warlock',ruleset:'5e-2014',acquiredLevel:null,confirmedAt:2,rulesLevel:1,sourcePage:50,choiceId:'warlock:2:confirm-fiend'};
}
export function validateFiend(origin,{classId,baselineLevel,level}){
 if(classId!=='warlock'||baselineLevel!==1||level<2||!isDeepStrictEqual(origin,confirmFiend({id:origin?.id,rulesConfirmed:true})))throw Error('Неверное происхождение покровителя Исчадия');return structuredClone(origin);
}
export function fiendSpellOptions(level,kind,{knownIds=[]}={}){
 const base=spellChoiceOptions('warlock',level,kind,{knownIds}),seen=new Set([...knownIds,...base.map(o=>o.spellId)]);
 if(kind!=='known-spells')return base;
 for(const origin of previewSubclassSpells({classId:'warlock',subclassId:'warlock-fiend',level}).expandedChoices){
  if(seen.has(origin.catalogId))continue;
  base.push({spellId:origin.catalogId,level:origin.threshold,expandedSource:structuredClone(origin)});seen.add(origin.catalogId);
 }
 return base;
}
export function validateFiendSpellChoice(plan,choiceId,ids,{knownIds=[]}={}){
 const choice=previewClassLevel({classId:'warlock',fromLevel:plan.fromLevel,toLevel:plan.toLevel,constitution:10}).choices.find(c=>c.id===choiceId);
 if(!choice||choice.kind!=='known-spells'||!Array.isArray(ids)||ids.length!==choice.count||new Set(ids).size!==ids.length)throw Error('Нужно выбрать обычное количество разных заклинаний колдуна');
 const allowed=fiendSpellOptions(plan.toLevel,choice.kind,{knownIds});if(ids.some(id=>!allowed.some(o=>o.spellId===id)))throw Error('Заклинание Исчадия недоступно этому уровню или уже известно');return [...ids];
}
export function fiendSpellOrigin(catalogId,level,kind){return fiendSpellOptions(level,kind).find(o=>o.spellId===catalogId)?.expandedSource??null;}
export function validateFiendSpellOrigin(row){
 const expected=fiendSpellOrigin(row.catalogId,row.acquiredLevel,row.choiceId.endsWith(':known-spells')?'known-spells':row.choiceId.split(':').at(-1));
 if(!isDeepStrictEqual(row.expandedSource??null,expected))throw Error('Источник расширенного списка Исчадия не соответствует SRD');
}
import {subclassPreparedSource} from './class-subclass-prepared.mjs';
export const fiendResources=level=>[
 {counterId:'class-warlock-fiend-luck',name:'Удача Тёмного',acquiredLevel:6,sourcePage:50,recovery:'short-rest'},
 {counterId:'class-warlock-hurl-hell',name:'Бросок сквозь ад',acquiredLevel:14,sourcePage:51,recovery:'long-rest'}
].filter(o=>o.acquiredLevel<=level);
export function validateFiendResources(origins,level,counters){
 if(!isDeepStrictEqual(origins,fiendResources(level)))throw Error('Неверное происхождение ресурсов Исчадия');
 if(counters)for(const origin of origins){const c=counters.find(c=>c.id===origin.counterId);if(!c||c.name!==origin.name||c.max!==1||!Number.isSafeInteger(c.current)||c.current<0||c.current>1)throw Error('Ресурс Исчадия требует отдельный счётчик1/1');}
}
export function validateFiendBook(ledger,book,lookup){
 for(const row of ledger.spells.filter(o=>o.expandedSource)){
  const entry=book.find(o=>o.catalogId===row.catalogId)?.entry??lookup?.(row.catalogId);
  if(!entry||!isDeepStrictEqual(entry,subclassPreparedSource(row.catalogId)))throw Error('Карточка расширенного списка Исчадия не совпадает с проверенным источником');
 }
}
