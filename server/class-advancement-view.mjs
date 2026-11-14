import {metamagicOptions,metamagicDescription} from './class-metamagic.mjs';
import {fightingStyleOptions,fightingStyleDescription} from './class-fighting-styles.mjs';
import {AppError} from './state.mjs';
import {classList,classProgression,previewClassLevel,spellChoiceOptions,classResourceMaximums} from './class-progression.mjs';
const spellKinds=new Set(['cantrips','known-spells','spellbook-spells','magical-secrets','mystic-arcanum']);
export function advancementClasses(current){
 return {classes:classList(),classId:current.advancement?.classId??null,level:current.characterSheet?.level??null,ready:!!current.characterSheet&&!!current.characterStats};
}
export function advancementView(current,classId,lookup){
 if(!current.characterSheet||!current.characterStats)throw new AppError(409,'Сначала сохрани свой класс, уровень и характеристики героя.');
 if(!classList().some(c=>c.slug===classId))throw new AppError(422,'Выбери подтверждённый класс 2014.');
 if(current.advancement&&current.advancement.classId!==classId)throw new AppError(409,'Класс уже связан с историей повышения.');
 const level=current.characterSheet.level;if(level>=20)throw new AppError(409,'Достигнут максимальный уровень 20.');
 const c=classProgression(classId,level),abilities=current.characterStats.abilities;
 const plan=previewClassLevel({classId,fromLevel:level,toLevel:level+1,constitution:abilities.con}),options={};
 for(const choice of plan.choices)if(spellKinds.has(choice.kind)){
  const candidates=spellChoiceOptions(classId,level+1,choice.kind,{knownIds:current.spellbook.map(s=>s.catalogId)});
  options[choice.id]=[];
  for(const o of candidates){try{const entry=lookup(o.spellId);if(entry?.kind==='spell')options[choice.id].push({...o,name:entry.name});}catch(error){if(error.status!==404)throw error;}}
  if(options[choice.id].length<choice.count)throw new AppError(409,'В доступном каталоге недостаточно заклинаний. Сначала установи проверенный каталог 2014.');
 }
 const styleOptions={};
 for(const choice of plan.choices)if(choice.kind==='fighting-style')styleOptions[choice.id]=fightingStyleOptions(classId,{knownStyles:(current.advancement?.styles||[]).map(s=>s.id)}).map(o=>({...o,...fightingStyleDescription(o.id)}));
 const selectedStyles=(current.advancement?.styles||[]).map(o=>({...o,...fightingStyleDescription(o.id)}));
 const metaOptions={},choiceNotices={},knownMeta=(current.advancement?.metamagic||[]).map(o=>o.id);
 for(const choice of plan.choices)if(choice.kind==='metamagic'){
  const required=level>=10?3:level>=3?2:0;
  if(knownMeta.length===required)metaOptions[choice.id]=metamagicOptions(classId,level+1,{knownOptions:knownMeta});
  else choiceNotices[choice.id]='Прежние варианты Метамагии не подтверждены историей. Автоматическое повышение пока недоступно: мастер не будет угадывать или повторять выбор.';
 }
 const selectedMetamagic=(current.advancement?.metamagic||[]).map(o=>({...o,...metamagicDescription(o.id)}));
 const counters=current.characterSheet.counters;
 return {revision:current.revision,characterId:current.context.characterId,classId,className:c.name.ru,fromLevel:level,abilities,hp:current.state.hp,maxHp:current.state.maxHp,hitDie:c.hitDie,plan,options,styleOptions,selectedStyles,metamagicOptions:metaOptions,selectedMetamagic,choiceNotices,
 resourceSetup:current.advancement?[]:classResourceMaximums(classId,level,abilities).filter(r=>r.max!==null).map(r=>({...r,canCreate:!counters.some(c=>c.id===r.id||c.name.toLocaleLowerCase('ru')===r.name.toLocaleLowerCase('ru')),counters:counters.filter(c=>c.max===r.max)}))};
}
