import {initialRitualOptions} from './class-rituals.mjs';
import {pactOptions,pactCantripOptions} from './class-pacts.mjs';
import {invocationEligibility,invocationDescription,activeInvocationOrigins,ELDRITCH_BLAST_ID} from './class-invocations.mjs';
import {metamagicOptions,metamagicDescription} from './class-metamagic.mjs';
import {fightingStyleOptions,fightingStyleDescription} from './class-fighting-styles.mjs';
import {AppError} from './state.mjs';
import {classList,classProgression,classFeatureReference,previewClassLevel,spellChoiceOptions,classResourceMaximums} from './class-progression.mjs';
const spellKinds=new Set(['cantrips','known-spells','spellbook-spells','magical-secrets','mystic-arcanum']);
export function advancementClasses(current){
 return {classes:classList(),classId:current.advancement?.classId??null,level:current.characterSheet?.level??null,ready:!!current.characterSheet&&!!current.characterStats};
}
export function advancementView(current,classId,lookup){
 if(!current.characterSheet||!current.characterStats)throw new AppError(409,'Сначала сохрани свой класс, уровень и характеристики героя.');
 if(!classList().some(c=>c.slug===classId))throw new AppError(422,'Выбери подтверждённый класс 2014.');
 if(current.advancement&&current.advancement.classId!==classId)throw new AppError(409,'Класс уже связан с историей повышения.');
 const level=current.characterSheet.level,atMaximum=level===20;
 const c=classProgression(classId,level),abilities=current.characterStats.abilities;
 const plan=atMaximum?{choices:[],requiresFeatureReview:[],featureDetails:[],priorFeatureDetails:classFeatureReference(classId,level)}:previewClassLevel({classId,fromLevel:level,toLevel:level+1,constitution:abilities.con}),options={};
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
 const grantsPact=plan.choices.some(c=>c.kind==='pact-boon'),mayLearnBlast=grantsPact||Object.values(options).some(rows=>rows.some(s=>s.spellId===ELDRITCH_BLAST_ID));
 const invocationOptions={},selectedInvocations=current.advancement?.version===4?activeInvocationOrigins(current.advancement.invocations,current.advancement).map(origin=>({...invocationDescription(origin.id),...origin,ritualNames:(origin.rituals||[]).map(id=>initialRitualOptions().find(o=>o.id===id)?.name.ru||id)})):[];
 for(const choice of plan.choices)if(choice.kind==='invocations'||choice.kind==='replace-invocation'){
  if(level===1||current.advancement?.version===4)invocationOptions[choice.id]=invocationEligibility({warlockLevel:level+1,hasEldritchBlast:current.spellbook.some(s=>s.catalogId===ELDRITCH_BLAST_ID),knownInvocations:selectedInvocations.map(o=>o.id),pact:current.advancement?.pact?.id??null});
  else choiceNotices[choice.id]='Прежние воззвания не подтверждены полной историей. Мастер не будет угадывать прошлый выбор.';
 }
 for(const rows of Object.values(invocationOptions))for(const row of rows){
  if(grantsPact&&row.reasons.includes('pact'))row.reasons=row.reasons.filter(r=>r!=='pact');
  if(mayLearnBlast&&row.reasons.includes('eldritch-blast'))row.reasons=row.reasons.filter(r=>r!=='eldritch-blast');
  row.eligible=row.reasons.length===0;
 }
 if(grantsPact&&current.advancement?.version!==4)choiceNotices['warlock:3:pact-boon']='Прежние воззвания не подтверждены историей. Сначала нужна отдельная сверка прежнего выбора.';
 const pactCantrips=[];
 if(grantsPact)for(const o of pactCantripOptions()){try{const entry=lookup(o.spellId);if(entry?.kind==='spell')pactCantrips.push({...o,name:entry.name});}catch(error){if(error.status!==404)throw error;}}
 const selectedPact=current.advancement?.pact?{...current.advancement.pact,spellNames:current.advancement.pact.spells.map(id=>{try{return lookup(id)?.name?.ru||id;}catch(error){if(error.status!==404)throw error;return id;}})}:null;
 const counters=current.characterSheet.counters;
 return {atMaximum,revision:current.revision,characterId:current.context.characterId,classId,className:c.name.ru,fromLevel:level,abilities,hp:current.state.hp,maxHp:current.state.maxHp,hitDie:c.hitDie,plan,options,styleOptions,selectedStyles,metamagicOptions:metaOptions,selectedMetamagic,choiceNotices,invocationOptions,selectedInvocations,pactCantrips,ritualOptions:classId==='warlock'?initialRitualOptions():[],pactOptions:classId==='warlock'&&(!grantsPact||current.advancement?.version===4)?pactOptions():[],selectedPact,
 resourceSetup:atMaximum||current.advancement?[]:classResourceMaximums(classId,level,abilities).filter(r=>r.max!==null).map(r=>({...r,canCreate:!counters.some(c=>c.id===r.id||c.name.toLocaleLowerCase('ru')===r.name.toLocaleLowerCase('ru')),counters:counters.filter(c=>c.max===r.max)}))};
}
