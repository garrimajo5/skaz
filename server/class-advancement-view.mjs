import {appendSubclassChoices,landCantripOptions,landTerrainOptions} from './class-divine-land.mjs';
import {rangerTerrainOptions,rangerEnemyTypeOptions} from './class-ranger-choices.mjs';
import {wizardAdvancedOptions} from './class-wizard-choices.mjs';
import {hunterChoiceAt,hunterChoices} from './class-hunter.mjs';
import {advancementSubclassOptions,subclassDescription} from './class-subclasses.mjs';
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
 if(!atMaximum)appendSubclassChoices(plan,{...current});
 const hunterOptions={};if(!atMaximum&&current.advancement?.subclass?.id==='ranger-hunter'){const group=hunterChoiceAt(level+1);if(group){plan.choices.push({id:group.choiceId,kind:'hunter-option',count:1,required:true});hunterOptions[group.choiceId]=group;}}
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
 const subclassOptions=atMaximum?[]:classId==='cleric'&&level===1?[subclassDescription('cleric-life')]:advancementSubclassOptions(classId,level+1),selectedSubclass=current.advancement?.version>=5?subclassDescription(current.advancement.subclass.id):null;
 const championStyles=selectedSubclass?.id==='fighter-champion'?fightingStyleOptions('fighter').map(o=>({...o,...fightingStyleDescription(o.id)})):[];
 if(selectedSubclass?.id==='fighter-champion'&&level===9)plan.choices.push({id:'fighter:10:champion-style',kind:'champion-style',count:1,required:true});
 if(selectedSubclass?.id==='fighter-champion'&&current.advancement.subclass.additionalStyle){const pair=current.advancement.subclass.additionalStyle;selectedSubclass.confirmedStyles=[{...pair.previous,...fightingStyleDescription(pair.previous.id),label:'Подтверждённый прежний стиль'},{...pair.added,...fightingStyleDescription(pair.added.id),label:'Дополнительный стиль на 10-м уровне'}];}
 if(selectedSubclass?.id==='ranger-hunter')selectedSubclass.selectedOptions=current.advancement.subclass.options.map(o=>({...o,...hunterChoices(level).flatMap(g=>g.options).find(v=>v.id===o.id)}));
 const wizardOptions={};for(const choice of plan.choices)if(['spell-mastery','signature-spells'].includes(choice.kind)){const signature=choice.kind==='signature-spells';if(current.advancement?.version===(signature?6:5)){const candidates=new Map(current.spellbook.map(o=>[o.catalogId,o]));for(const o of options['wizard:'+(level+1)+':spellbook-spells']||[])if(!candidates.has(o.spellId))candidates.set(o.spellId,{catalogId:o.spellId,status:'known',entry:lookup(o.spellId)});wizardOptions[choice.id]=wizardAdvancedOptions(signature?'signature':'mastery',[...candidates.values()]);}else choiceNotices[choice.id]='Прежний выбор подкласса не подтверждён историей. Нужна отдельная сверка; мастер не будет угадывать его.';}
 const rangerReady=classId==='ranger'&&(level===5?current.advancement?.version===5:current.advancement?.version===7);
 for(const choice of plan.choices)if(['favored-terrain','favored-enemy-and-language'].includes(choice.kind)&&!rangerReady)choiceNotices[choice.id]='Нужна подтверждённая история подкласса и прежних выборов. Старое прошлое не угадывается.';
 const rangerTerrains=rangerReady?rangerTerrainOptions():[],rangerEnemyTypes=rangerReady?rangerEnemyTypeOptions():[],selectedRangerChoices=current.advancement?.rangerChoices?structuredClone(current.advancement.rangerChoices):null;
 const selectedWizardChoices=(current.advancement?.wizardChoices||[]).map(o=>({...o,spellNames:o.spellIds.map(id=>lookup(id)?.name?.ru||id)}));
 const landCantrips=classId==='druid'&&level===1?landCantripOptions().filter(o=>!current.spellbook.some(s=>s.catalogId===o.id)):[],landTerrains=selectedSubclass?.id==='druid-land'?landTerrainOptions():[];if(selectedSubclass?.id==='druid-land'){selectedSubclass.selectedCantrip={...current.advancement.subclass.bonusCantrip,name:lookup(current.advancement.subclass.bonusCantrip.catalogId).name};selectedSubclass.selectedTerrain=current.advancement.subclass.terrain?{...current.advancement.subclass.terrain,...landTerrainOptions().find(o=>o.id===current.advancement.subclass.terrain.id)}:null;}
 const counters=current.characterSheet.counters;
 return {landCantrips,landTerrains,rangerTerrains,rangerEnemyTypes,selectedRangerChoices,wizardOptions,selectedWizardChoices,championStyles,hunterOptions,subclassOptions,selectedSubclass,atMaximum,revision:current.revision,characterId:current.context.characterId,classId,className:c.name.ru,fromLevel:level,abilities,hp:current.state.hp,maxHp:current.state.maxHp,hitDie:c.hitDie,plan,options,styleOptions,selectedStyles,metamagicOptions:metaOptions,selectedMetamagic,choiceNotices,invocationOptions,selectedInvocations,pactCantrips,ritualOptions:classId==='warlock'?initialRitualOptions():[],pactOptions:classId==='warlock'&&(!grantsPact||current.advancement?.version===4)?pactOptions():[],selectedPact,
 resourceSetup:atMaximum||current.advancement?[]:classResourceMaximums(classId,level,abilities).filter(r=>r.max!==null).map(r=>({...r,canCreate:!counters.some(c=>c.id===r.id||c.name.toLocaleLowerCase('ru')===r.name.toLocaleLowerCase('ru')),counters:counters.filter(c=>c.max===r.max)}))};
}
