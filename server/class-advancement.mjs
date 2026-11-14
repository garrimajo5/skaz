import {WILD_SHAPE,wildShapeUnlimited,validateUnlimitedOrigin,validateUnlimitedSheet} from './class-unlimited.mjs';
import {appendSubclassChoices,lifeConfirmation,landTerrainOrigin,validateLandCantripBook,validateNaturalRecovery} from './class-divine-land.mjs';
import {wizardSignatureOrigin,validateWizardSignatureOrigin,signatureCounterOrigins,signatureCounterName,validateSignatureCounters} from './class-wizard-signature.mjs';
import {planSubclassSpellUpdates} from './class-subclass-spells.mjs';
import {alwaysPreparedOrigins,subclassPreparedSource,subclassPreparedOrigins,validateSubclassPreparedOrigins,validateSubclassPreparedBook} from './class-subclass-prepared.mjs';
import {advanceRangerHistory,validateRangerHistory} from './class-ranger-history.mjs';
import {wizardChoiceOrigin,validateWizardMasteryOrigin,validateWizardAdvancedChoice,wizardSpellSource} from './class-wizard-choices.mjs';
import {hunterChoiceAt,validateHunterSelection} from './class-hunter.mjs';
import {validateSubclassChoice,validateSubclassOrigin,subclassDescription,validateChampionStyles} from './class-subclasses.mjs';
import {validateInvocationSpellSources} from './class-invocation-sources.mjs';
import {validatePactChoice} from './class-pacts.mjs';
import {buildInvocationEvent,validateInvocationHistory,invocationDescription,ELDRITCH_BLAST_ID} from './class-invocations.mjs';
import {validateMetamagicChoice} from './class-metamagic.mjs';
import {validateFightingStyleChoice} from './class-fighting-styles.mjs';
import {createHash} from 'node:crypto';
import {AppError,validateState} from './state.mjs';
import {validateCharacterSheet} from './character-sheet.mjs';
import {validateCharacterStats} from './character-stats.mjs';
import {classProgression,previewClassLevel,classResourceMaximums,resizeManagedResource,applyAbilityScoreChoice,validateSpellChoice,spellChoiceOptions} from './class-progression.mjs';

const fail=(status,message)=>{throw new AppError(status,message);};
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k));
const id=value=>typeof value==='string'&&/^[a-zA-Z0-9-]{8,80}$/.test(value);
const checkedClass=(slug,level)=>{try{return classProgression(slug,level);}catch(error){fail(422,error.message);}};
const spellKinds=new Set(['cantrips','known-spells','spellbook-spells','magical-secrets','mystic-arcanum']);
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
const hash=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');

// This module builds a complete change set only. Its caller must re-read inside
// the existing store transaction, authorize the hero and persist all fields plus
// the receipt together. A client-supplied preview is never a write command.
export function validateAdvancementCommand(input){
 const keys=['mutationId','expectedRevision','characterId','classId','fromLevel','hpMethod','hpRoll','choices','reviewedFeatures'];
 if(!exact(input,keys)||!id(input.mutationId)||!id(input.characterId)||!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0)fail(422,'Неверные поля повышения уровня');
 if(!Number.isSafeInteger(input.fromLevel)||input.fromLevel<1||input.fromLevel>19)fail(422,'Повышай уровень по одному, с 1 до 20');
 if(!['fixed','roll'].includes(input.hpMethod)||(input.hpMethod==='fixed'?input.hpRoll!==null:!Number.isSafeInteger(input.hpRoll)))fail(422,'Нужен способ получения хитов и корректный бросок');
 checkedClass(input.classId,input.fromLevel);
 if(!input.choices||typeof input.choices!=='object'||Array.isArray(input.choices)||Object.keys(input.choices).length>20)fail(422,'Неверный список выборов');
 if(!Array.isArray(input.reviewedFeatures)||input.reviewedFeatures.length>30||input.reviewedFeatures.some(x=>typeof x!=='string'||x.length>120)||new Set(input.reviewedFeatures).size!==input.reviewedFeatures.length)fail(422,'Неверное подтверждение умений');
 return structuredClone(input);
}

export function validateAdvancementLedger(value){
 if(value===null)return null;
 if(!exact(value,['version','ruleset','classId','baselineLevel','level','binding','events','resources','spells',...(value?.version>=2?['styles']:[]),...(value?.version>=3?['metamagic']:[]),...(value?.version===4?['invocations','pact']:[]),...(value?.version>=5?['subclass']:[]),...([6,9].includes(value?.version)?['wizardChoices']:[]),...(value?.version===7?['rangerChoices']:[]),...([8,10,11,12].includes(value?.version)?['subclassSpells']:[]),...(value?.version===9?['signatureCounters']:[]),...(value?.version===12?['unlimitedResources']:[])])||![1,2,3,4,5,6,7,8,9,10,11,12].includes(value.version)||value.ruleset!=='5e-2014')fail(422,'Неверное происхождение повышения');
 checkedClass(value.classId,value.level);
 if(!Number.isSafeInteger(value.baselineLevel)||value.baselineLevel<1||value.baselineLevel>value.level||!Array.isArray(value.events)||value.events.length!==value.level-value.baselineLevel)fail(422,'Неполная последовательность уровней');
 if(value.binding!==null&&(!exact(value.binding,['mutationId','requestHash'])||!id(value.binding.mutationId)||!/^[a-f0-9]{64}$/.test(value.binding.requestHash)))fail(422,'Неверное подключение ресурсов');
 const seen=new Set(value.binding?[value.binding.mutationId]:[]);
 for(const [i,event] of value.events.entries()){
  if(!exact(event,['mutationId','level','requestHash','sourcePage','featuresReviewed'])||!id(event.mutationId)||seen.has(event.mutationId)||event.level!==value.baselineLevel+i+1||!/^[a-f0-9]{64}$/.test(event.requestHash)||event.sourcePage!==classProgression(value.classId,event.level).sourcePage||!Array.isArray(event.featuresReviewed)||new Set(event.featuresReviewed).size!==event.featuresReviewed.length)fail(422,'Неверная запись происхождения');
  const features=previewClassLevel({classId:value.classId,fromLevel:event.level-1,toLevel:event.level,constitution:10}).requiresFeatureReview;
  if(features.length!==event.featuresReviewed.length||features.some(f=>!event.featuresReviewed.includes(f)))fail(422,'Неполная запись проверки умений');
  seen.add(event.mutationId);
 }
 if(!Array.isArray(value.resources)||value.resources.length>20||!Array.isArray(value.spells)||value.spells.length>1000)fail(422,'Слишком много управляемых записей');
 const counterIds=new Set(),resourceIds=new Set();
 for(const r of value.resources){
  if(!exact(r,['resourceId','counterId','managedFromLevel','origin'])||typeof r.resourceId!=='string'||!r.resourceId.startsWith('class-'+value.classId+'-')||!id(r.counterId)||!['level','baseline-created','baseline-bound'].includes(r.origin)||(r.origin!=='baseline-bound'&&r.counterId!==r.resourceId)||counterIds.has(r.counterId)||resourceIds.has(r.resourceId)||!Number.isSafeInteger(r.managedFromLevel)||r.managedFromLevel<value.baselineLevel||r.managedFromLevel>value.level)fail(422,'Неверное происхождение счётчика');
  const baseline={str:10,dex:10,con:10,int:10,wis:10,cha:10};
  const acquired=classResourceMaximums(value.classId,r.managedFromLevel,baseline),prior=r.managedFromLevel>1?classResourceMaximums(value.classId,r.managedFromLevel-1,baseline):[];
  if(!acquired.some(x=>x.id===r.resourceId)||r.origin==='level'&&(r.managedFromLevel===value.baselineLevel||prior.some(x=>x.id===r.resourceId))||r.origin!=='level'&&(!value.binding||r.managedFromLevel!==value.baselineLevel))fail(422,'Ресурс не получен или не подключён на указанном уровне');
  counterIds.add(r.counterId);resourceIds.add(r.resourceId);
 }
 const spells=new Set(),choiceCounts=new Map();
 for(const s of value.spells){
  if(!exact(s,['catalogId','acquiredLevel','choiceId'])||typeof s.catalogId!=='string'||!/^[a-z0-9][a-z0-9:._-]{2,119}$/.test(s.catalogId)||spells.has(s.catalogId)||!Number.isSafeInteger(s.acquiredLevel)||s.acquiredLevel<=value.baselineLevel||s.acquiredLevel>value.level||typeof s.choiceId!=='string')fail(422,'Неверное происхождение заклинания');
  const p={classId:value.classId,fromLevel:s.acquiredLevel-1,toLevel:s.acquiredLevel};
  const choice=previewClassLevel({...p,constitution:10}).choices.find(c=>c.id===s.choiceId);
  if(!choice||!spellKinds.has(choice.kind))fail(422,'Неизвестный источник заклинания');
  if(!spellChoiceOptions(value.classId,s.acquiredLevel,choice.kind).some(x=>x.spellId===s.catalogId))fail(422,'Заклинание не соответствует источнику');
  const count=(choiceCounts.get(s.choiceId)||0)+1;if(count>choice.count)fail(422,'Слишком много заклинаний из одного выбора');choiceCounts.set(s.choiceId,count);
  spells.add(s.catalogId);
 }
 for(const event of value.events){
  const choices=previewClassLevel({classId:value.classId,fromLevel:event.level-1,toLevel:event.level,constitution:10}).choices;
  if(value.version<9&&choices.some(c=>c.kind==='signature-spells'))fail(422,'Фирменные заклинания требуют журнал9');
  if(value.version<7&&choices.some(c=>['favored-enemy-and-language','favored-terrain'].includes(c.kind)))fail(422,'Выбор следопыта требует журнал7');
  if(value.version<6&&choices.some(c=>c.kind==='spell-mastery'))fail(422,'История Мастерства заклинаний требует версию 6');
  if(value.version<5&&choices.some(c=>c.kind==='subclass'))fail(422,'История подкласса требует версию 5');
  if(value.version<4&&choices.some(c=>c.kind==='invocations'))fail(422,'История воззваний требует версию 4');
  if(value.version<3&&choices.some(c=>c.kind==='metamagic'))fail(422,'История Метамагии требует версию 3');
  if(value.version===1&&choices.some(c=>c.kind==='fighting-style'))fail(422,'История боевого стиля требует версию 2');
  for(const choice of choices)if(spellKinds.has(choice.kind)&&(choiceCounts.get(choice.id)||0)!==choice.count)fail(422,'В происхождении отсутствует часть выбранных заклинаний');
 }
 if(value.version>=2){
  if(!Array.isArray(value.styles)||(value.version===2&&value.styles.length<1)||value.styles.length>6)fail(422,'Неверный список источников боевых стилей');
  const known=[];const counts=new Map();
  for(const origin of value.styles){
   if(!exact(origin,['id','ruleset','classId','sourcePage','acquiredLevel','choiceId'])||origin.classId!==value.classId||origin.acquiredLevel<=value.baselineLevel||origin.acquiredLevel>value.level)fail(422,'Неверное происхождение боевого стиля');
   let checked;try{checked=validateFightingStyleChoice({classId:value.classId,fromLevel:origin.acquiredLevel-1,toLevel:origin.acquiredLevel},origin.choiceId,[origin.id],{knownStyles:known});}catch(error){fail(422,error.message);}
   if(hash(checked)!==hash(origin))fail(422,'Источник боевого стиля не совпадает с правилами');
   known.push(origin.id);counts.set(origin.choiceId,(counts.get(origin.choiceId)||0)+1);
  }
  for(const event of value.events)for(const choice of previewClassLevel({classId:value.classId,fromLevel:event.level-1,toLevel:event.level,constitution:10}).choices)if(choice.kind==='fighting-style'&&counts.get(choice.id)!==choice.count)fail(422,'В истории отсутствует выбранный боевой стиль');
 }
 if(value.version===3){
  if(!Array.isArray(value.metamagic)||value.metamagic.length<1||value.metamagic.length>4)fail(422,'Неверная история Метамагии');
  for(const origin of value.metamagic)if(!exact(origin,['id','ruleset','classId','sourcePage','acquiredLevel','choiceId'])||origin.classId!==value.classId||!Number.isSafeInteger(origin.acquiredLevel)||origin.acquiredLevel<=value.baselineLevel||origin.acquiredLevel>value.level)fail(422,'Неверное происхождение Метамагии');
  const known=[];let checkedCount=0;
  for(const event of value.events){
   const plan={classId:value.classId,fromLevel:event.level-1,toLevel:event.level};
   for(const choice of previewClassLevel({...plan,constitution:10}).choices)if(choice.kind==='metamagic'){
    const origins=value.metamagic.filter(o=>o.choiceId===choice.id);let checked;
    try{checked=validateMetamagicChoice(plan,choice.id,origins.map(o=>o.id),{knownOptions:known});}catch(error){fail(422,error.message);}
    for(const origin of origins)if(hash(origin)!==hash(checked.find(o=>o.id===origin.id)))fail(422,'Источник Метамагии не совпадает с правилами');
    known.push(...checked.map(o=>o.id));checkedCount+=checked.length;
   }
  }
  if(checkedCount!==value.metamagic.length)fail(422,'Метамагия не соответствует истории уровней');
 }
 if(value.version===4){
  if(value.classId!=='warlock'||value.styles.length||!Array.isArray(value.metamagic)||value.metamagic.length)fail(422,'Неверный класс истории воззваний');
  try{validateInvocationHistory(value.invocations,value);}catch(error){fail(422,error.message);}
 }
 if(value.version>=5){
  if(!Array.isArray(value.metamagic)||value.metamagic.length)fail(422,'Неверная история подкласса');
  try{validateSubclassOrigin(value.subclass,value);}catch(error){fail(422,error.message);}
 }
 if([6,9].includes(value.version)){
  if(value.classId!=='wizard'||value.level<18||value.baselineLevel>=18||!Array.isArray(value.wizardChoices)||value.wizardChoices.length!==(value.version===9?2:1))fail(422,'Неверная история Мастерства заклинаний');
  try{validateWizardMasteryOrigin(value.wizardChoices[0]);}catch(error){fail(422,error.message);}
 }
 if(value.version===7){
  if(value.classId!=='ranger'||value.level<6||value.baselineLevel>=6)fail(422,'Неверная история выборов следопыта');
  try{validateRangerHistory(value.rangerChoices,value.level);}catch(error){fail(422,error.message);}
 }
 if(value.version<8&&value.subclass?.id==='paladin-devotion')fail(422,'Клятва преданности требует журнал8');
 if(value.subclass?.id==='cleric-life'&&value.version!==10||value.subclass?.id==='druid-land'&&![11,12].includes(value.version))fail(422,'Происхождение домена/круга требует совместимый журнал');
 if(value.version===10&&value.subclass?.id!=='cleric-life'||[11,12].includes(value.version)&&value.subclass?.id!=='druid-land')fail(422,'Неверный вид истории домена/круга');
 if([8,10,11,12].includes(value.version)){try{validateSubclassPreparedOrigins(value.subclassSpells,value);}catch(error){fail(422,error.message);}}
 if(value.version===11&&value.level===20)fail(422,'Друид20 требует историю неограниченного ресурса');if(value.version===12){try{validateUnlimitedOrigin(value);}catch(error){fail(422,error.message);}}
 if(value.version===9){if(value.level!==20)fail(422,'Фирменные заклинания доступны на20уровне');try{validateWizardSignatureOrigin(value.wizardChoices[1]);validateSignatureCounters(value.signatureCounters,value.wizardChoices[1]);}catch(error){fail(422,error.message);}}
 return structuredClone(value);
}

export function buildAdvancementChange(current,input){
 try{return build(current,validateAdvancementCommand(input));}catch(error){if(error instanceof AppError)throw error;throw new AppError(422,error.message);}
}
function build(current,request){
 if(current.context?.characterId!==request.characterId)fail(409,'Активный персонаж изменился');
 if(current.revision!==request.expectedRevision)fail(409,'Герой изменился после предпросмотра');
 const sheet=validateCharacterSheet(current.characterSheet),stats=validateCharacterStats(current.characterStats),state=validateState(current.state);
 if(sheet.level!==request.fromLevel)fail(409,'Текущий уровень изменился');
 const previous=validateAdvancementLedger(current.advancement??null);
 if(previous&&(previous.classId!==request.classId||previous.level!==sheet.level))fail(409,'Происхождение не соответствует классу или уровню листа');
 if(previous?.version>=5&&sheet.subclass!==subclassDescription(previous.subclass.id).name)fail(409,'Подкласс листа изменён вручную; нужна сверка происхождения');
 if([8,10,11].includes(previous?.version))validateSubclassPreparedBook(previous.subclassSpells,current.spellbook);
 const before=previewClassLevel({classId:request.classId,fromLevel:sheet.level,toLevel:sheet.level+1,constitution:stats.abilities.con,hpMethod:request.hpMethod,hpRoll:request.hpRoll});
 if(request.reviewedFeatures.length!==before.requiresFeatureReview.length||before.requiresFeatureReview.some(f=>!request.reviewedFeatures.includes(f)))fail(422,'Сначала проверь все новые умения: их эффекты пока не применяются автоматически');
 appendSubclassChoices(before,current);
 const hunter=previous?.subclass?.id==='ranger-hunter'?hunterChoiceAt(sheet.level+1):null;
 if(hunter)before.choices.push({id:hunter.choiceId,kind:'hunter-option',count:1,required:true});
 const champion=previous?.subclass?.id==='fighter-champion'&&sheet.level+1===10;
 if(champion)before.choices.push({id:'fighter:10:champion-style',kind:'champion-style',count:1,required:true});
 const choices=new Map(before.choices.map(c=>[c.id,c]));
 for(const key of Object.keys(request.choices))if(!choices.has(key))fail(422,'Выбор не относится к этому уровню');
 for(const choice of choices.values()){
  if(!Object.hasOwn(request.choices,choice.id)){if(choice.required)fail(422,'Не завершён выбор: '+choice.kind);continue;}
  if(!spellKinds.has(choice.kind)&&choice.kind!=='ability-score-improvement-or-feat'&&choice.kind!=='fighting-style'&&choice.kind!=='metamagic'&&choice.kind!=='invocations'&&choice.kind!=='replace-invocation'&&choice.kind!=='pact-boon'&&choice.kind!=='subclass'&&choice.kind!=='hunter-option'&&choice.kind!=='champion-style'&&choice.kind!=='spell-mastery'&&choice.kind!=='favored-enemy-and-language'&&choice.kind!=='favored-terrain'&&choice.kind!=='signature-spells'&&choice.kind!=='confirm-subclass'&&choice.kind!=='land-terrain')fail(422,'Этот выбор ещё не поддерживается: '+choice.kind);
 }
 let abilities=stats.abilities;
 for(const choice of choices.values())if(choice.kind==='ability-score-improvement-or-feat'){
  const selection=request.choices[choice.id];
  if(!exact(selection,['increases']))fail(422,'Черты пока не поддерживаются; выбери повышение характеристик');
  abilities=applyAbilityScoreChoice(before,abilities,selection.increases);
 }
 const plan=appendSubclassChoices(previewClassLevel({classId:request.classId,fromLevel:sheet.level,toLevel:sheet.level+1,constitution:abilities.con,previousConstitution:stats.abilities.con,hpMethod:request.hpMethod,hpRoll:request.hpRoll}),current);
 const ledger=previous||{version:1,ruleset:'5e-2014',classId:request.classId,baselineLevel:sheet.level,level:sheet.level,binding:null,events:[],resources:[],spells:[]};
 for(const choice of choices.values())if(choice.kind==='subclass'){
  const origin=validateSubclassChoice(plan,request.choices[choice.id]),name=subclassDescription(origin.id).name;
  if(sheet.subclass.trim()&&sheet.subclass!==name)fail(409,'В листе уже указан другой подкласс; нужна явная сверка прежней записи');
  ledger.version=5;ledger.styles??=[];ledger.metamagic??=[];ledger.subclass=origin;
 }
 if(choices.has('cleric:2:confirm-subclass')){if(previous&&previous.level!==1)fail(422,'Нужна отдельная сверка прежнего домена');ledger.version=10;ledger.styles??=[];ledger.metamagic??=[];ledger.subclass=lifeConfirmation(request.choices['cleric:2:confirm-subclass']);const name=subclassDescription(ledger.subclass.id).name;if(sheet.subclass.trim()&&sheet.subclass!==name)fail(409,'В листе указан другой домен; нужна сверка');}
 if(choices.has('druid:3:land-terrain')){const selected=request.choices['druid:3:land-terrain'];if(!exact(selected,['id']))fail(422,'Выбери местность Круга Земли');ledger.subclass.terrain=landTerrainOrigin(selected.id);}
 if(request.classId==='ranger'&&[6,10,14].includes(plan.toLevel)){
  if((plan.toLevel===6?ledger.version!==5:ledger.version!==7))fail(422,'Сначала нужна подтверждённая история подкласса и прежних выборов следопыта');
  ledger.rangerChoices=advanceRangerHistory(plan.toLevel,{terrain:request.choices['ranger:'+plan.toLevel+':favored-terrain'],enemy:request.choices['ranger:'+plan.toLevel+':favored-enemy-and-language']},ledger.rangerChoices??null);ledger.version=7;
 }
 if(champion)ledger.subclass.additionalStyle=validateChampionStyles(request.choices['fighter:10:champion-style']);
 if(hunter){const selected=request.choices[hunter.choiceId];if(!exact(selected,['id']))fail(422,'Нужно выбрать умение Охотника');ledger.subclass.options.push(validateHunterSelection(plan.toLevel,selected.id));}
 for(const choice of choices.values())if(choice.kind==='fighting-style'){
  const origin=validateFightingStyleChoice(plan,choice.id,request.choices[choice.id],{knownStyles:(ledger.styles||[]).map(s=>s.id)});
  if(ledger.version===1){ledger.version=2;ledger.styles=[];}
  ledger.styles.push(origin);
 }
 for(const choice of choices.values())if(choice.kind==='metamagic'){
  const origins=validateMetamagicChoice(plan,choice.id,request.choices[choice.id],{knownOptions:(ledger.metamagic||[]).map(o=>o.id)});
  if(ledger.version<3){ledger.version=3;ledger.styles??=[];ledger.metamagic=[];}
  ledger.metamagic.push(...origins);
 }
 const known=(current.spellbook||[]).map(s=>s.catalogId);
 if(new Set(known).size!==known.length)fail(422,'Повторные заклинания в книге');
 if(ledger.spells.some(s=>!known.includes(s.catalogId))||(ledger.pact?.spells||[]).some(id=>!known.includes(id)))fail(409,'Полученное при повышении заклинание удалено вручную; нужна сверка');
 const additions=[];
 for(const choice of choices.values())if(spellKinds.has(choice.kind)&&Object.hasOwn(request.choices,choice.id)){
  const selected=validateSpellChoice(plan,choice.id,request.choices[choice.id],{knownIds:[...known,...additions]});
  for(const catalogId of selected){additions.push(catalogId);ledger.spells.push({catalogId,acquiredLevel:plan.toLevel,choiceId:choice.id});}
 }
 if(choices.has('wizard:18:spell-mastery')){
  if(ledger.version!==5)fail(422,'Сначала нужна подтверждённая история подкласса волшебника; прошлые выборы не угадываются');
  const selected=request.choices['wizard:18:spell-mastery'];if(!exact(selected,['spellIds']))fail(422,'Выбери два заклинания Мастерства');
  const book=[...(current.spellbook||[]),...additions.map(catalogId=>({catalogId,status:'known',entry:wizardSpellSource(catalogId)}))];
  ledger.wizardChoices=[wizardChoiceOrigin({kind:'mastery',classId:request.classId,level:plan.toLevel,selected:selected.spellIds,spellbook:book})];ledger.version=6;
 }
 if(choices.has('warlock:'+plan.toLevel+':pact-boon')){
  if(ledger.version!==4)fail(422,'Для дара договора нужна подтверждённая история воззваний');
  ledger.pact=validatePactChoice(plan,request.choices['warlock:'+plan.toLevel+':pact-boon']);
  for(const catalogId of ledger.pact.spells)if(!known.includes(catalogId)&&!additions.includes(catalogId))additions.push(catalogId);
 }
 if(request.classId==='warlock'&&(ledger.version===4||choices.has('warlock:'+plan.toLevel+':invocations')||Object.hasOwn(request.choices,'warlock:'+plan.toLevel+':replace-invocation'))){
  const knownInvocations=ledger.version===4?validateInvocationHistory(ledger.invocations,{...ledger,pact:plan.fromLevel<3?null:ledger.pact}):[];
  const record=buildInvocationEvent({fromLevel:plan.fromLevel,toLevel:plan.toLevel,knownInvocations,selected:request.choices['warlock:'+plan.toLevel+':invocations']||[],replacement:request.choices['warlock:'+plan.toLevel+':replace-invocation']??null,hasEldritchBlast:[...known,...additions].includes(ELDRITCH_BLAST_ID),pact:ledger.pact?.id??null});
  if(ledger.version<4){ledger.version=4;ledger.styles=[];ledger.metamagic=[];ledger.invocations=[];ledger.pact=null;}
  ledger.invocations.push(record);
 }
 // Existing manual counters are never adopted, even when their names match.
 const oldMaxima=new Map(classResourceMaximums(request.classId,plan.fromLevel,stats.abilities).map(r=>[r.id,r]));
 const maxima=classResourceMaximums(request.classId,plan.toLevel,abilities),counters=structuredClone(sheet.counters);
 const managed=new Map(ledger.resources.map(r=>[r.resourceId,r]));
 for(const origin of ledger.resources){
  const counter=counters.find(c=>c.id===origin.counterId),old=oldMaxima.get(origin.resourceId);
  if(!counter||!old||old.max!==counter.max)fail(409,'Управляемый счётчик изменён вручную; нужна сверка');
 }
 const newResources=[];
 for(const resource of maxima){
  const origin=managed.get(resource.id);
  if(resource.max===null){if(request.classId!=='druid'||plan.toLevel!==20||previous?.version!==11||resource.id!==WILD_SHAPE||origin?.counterId!==WILD_SHAPE)fail(422,'Неограниченный ресурс требует отдельного интерфейса');const index=counters.findIndex(c=>c.id===origin.counterId);counters.splice(index,1);ledger.unlimitedResources=[wildShapeUnlimited()];ledger.version=12;newResources.push({...resource,unlimited:true});continue;}
  if(origin){const index=counters.findIndex(c=>c.id===origin.counterId);counters[index]=resizeManagedResource(counters[index],resource.max);continue;}
  if(oldMaxima.has(resource.id))continue; // Baseline resources remain manual until explicitly reconciled.
  if(counters.some(c=>c.id===resource.id||c.name.toLocaleLowerCase('ru')===resource.name.toLocaleLowerCase('ru')))fail(409,'Новый ресурс совпадает с ручным: '+resource.name);
  counters.push({id:resource.id,name:resource.name,current:resource.max,max:resource.max});
  ledger.resources.push({resourceId:resource.id,counterId:resource.id,managedFromLevel:plan.toLevel,origin:'level'});newResources.push(resource);
 }
 if(ledger.subclass?.id==='druid-land'&&plan.toLevel===2){const catalogId=ledger.subclass.bonusCantrip.catalogId;if(current.spellbook.some(s=>s.catalogId===catalogId)||additions.includes(catalogId))fail(422,'Дополнительный заговор уже известен');additions.push(catalogId);const counter={id:ledger.subclass.naturalRecovery.counterId,name:'Естественное восстановление',current:1,max:1};if(counters.some(c=>c.id===counter.id||c.name.toLocaleLowerCase('ru')===counter.name.toLocaleLowerCase('ru')))fail(409,'Ручной счётчик совпадает с Естественным восстановлением');counters.push(counter);newResources.push({...counter,recovery:'long-rest'});}
 let signaturePrepared=null;
 if(choices.has('wizard:20:signature-spells')){
  if(ledger.version!==6)fail(422,'Нужна подтверждённая история Мастерства18 и подкласса');const selected=request.choices['wizard:20:signature-spells'];if(!exact(selected,['spellIds']))fail(422,'Выбери два Фирменных заклинания');
  const virtualBook=[...(current.spellbook||[]),...additions.map(catalogId=>({catalogId,status:'known',entry:wizardSpellSource(catalogId)}))],signature=wizardSignatureOrigin(selected.spellIds,virtualBook);ledger.wizardChoices.push(signature);ledger.signatureCounters=signatureCounterOrigins(signature);ledger.version=9;
  for(const origin of ledger.signatureCounters){const name=signatureCounterName(origin.catalogId);if(counters.some(c=>c.id===origin.counterId||c.name.toLocaleLowerCase('ru')===name.toLocaleLowerCase('ru')))fail(409,'Ручной счётчик совпадает с Фирменным: '+name);counters.push({id:origin.counterId,name,current:1,max:1});newResources.push({id:origin.counterId,name,max:1,recovery:'short-or-long-rest'});}
  signaturePrepared={additions:[],promotions:signature.spellIds.filter(id=>virtualBook.find(row=>row.catalogId===id).status!=='prepared').map(catalogId=>({catalogId})),alreadyPrepared:[]};
 }
 const maxHp=state.maxHp+plan.hitPoints.maximumDelta;
 // Level advancement does not heal wounds, wake a dying hero, clear checks,
 // restore counters or alter temporary HP. A rest is a separate action.
 const nextState=validateState({...state,maxHp});
 const nextSheet=validateCharacterSheet({...sheet,subclass:ledger.version>=5?subclassDescription(ledger.subclass.id).name:sheet.subclass,level:plan.toLevel,counters});
 const nextStats=validateCharacterStats({...stats,abilities});
 let preparedSpells=signaturePrepared;
 if(['paladin-devotion','cleric-life','druid-land'].includes(ledger.subclass?.id)){
  preparedSpells=planSubclassSpellUpdates({classId:request.classId,subclassId:ledger.subclass.id,level:plan.toLevel,tableId:ledger.subclass.terrain?.id??null},current.spellbook||[],subclassPreparedSource);
  ledger.version=ledger.subclass.id==='cleric-life'?10:ledger.subclass.id==='druid-land'?(plan.toLevel===20?12:11):8;ledger.subclassSpells=subclassPreparedOrigins(request.classId,ledger.subclass.id,plan.toLevel,{tableId:ledger.subclass.terrain?.id??null});
 }
 ledger.level=plan.toLevel;ledger.events.push({mutationId:request.mutationId,level:plan.toLevel,requestHash:hash(request),sourcePage:plan.sourcePage,featuresReviewed:[...request.reviewedFeatures]});
 return {state:nextState,characterSheet:nextSheet,characterStats:nextStats,advancement:validateAdvancementLedger(ledger),addSpells:additions,preparedSpells,
  summary:{preparedSpells:preparedSpells?[...preparedSpells.additions,...preparedSpells.promotions].map(o=>({catalogId:o.catalogId,name:subclassPreparedSource(o.catalogId).name,previous:preparedSpells.promotions.some(p=>p.catalogId===o.catalogId)})):[],fromLevel:plan.fromLevel,toLevel:plan.toLevel,hitPoints:plan.hitPoints,proficiency:plan.proficiency,newResources,featuresReviewed:[...request.reviewedFeatures],unmanagedResources:maxima.filter(r=>oldMaxima.has(r.id)&&!managed.has(r.id)).map(r=>r.id)}};
}
// Check transferred/current provenance against its actual hero, never just names.
export function validateAdvancementSnapshot(ledger,sheet,stats,spellbook,lookup){
 const value=validateAdvancementLedger(ledger);if(!value)return null;
 const s=validateCharacterSheet(sheet),a=validateCharacterStats(stats);
 if(value.version>=5&&s.subclass!==subclassDescription(value.subclass.id).name)fail(422,'Подкласс листа не соответствует подтверждённому происхождению');
 if(s.level!==value.level)fail(422,'Уровень не соответствует истории повышения');
 const maxima=new Map(classResourceMaximums(value.classId,value.level,a.abilities).map(r=>[r.id,r]));
 for(const origin of value.resources){
  const counter=s.counters.find(c=>c.id===origin.counterId),resource=maxima.get(origin.resourceId);
  if(resource?.max===null&&value.version===12&&origin.resourceId===WILD_SHAPE){try{validateUnlimitedSheet(value,s);}catch(error){fail(422,error.message);}continue;}
  if(!counter||!resource||resource.max!==counter.max)fail(422,'Счётчик не соответствует происхождению');
 }
 const known=new Set((spellbook||[]).map(s=>s.catalogId));
 if(value.spells.some(s=>!known.has(s.catalogId)))fail(422,'В книге отсутствует полученное при повышении заклинание');
 if([8,9,10,11,12].includes(value.version)){try{validateSubclassPreparedBook(alwaysPreparedOrigins(value),spellbook,lookup);}catch(error){fail(422,error.message);}}
 if([6,9].includes(value.version)){try{validateWizardAdvancedChoice({kind:'mastery',classId:'wizard',level:18,selected:value.wizardChoices[0].spellIds,spellbook:lookup?(spellbook||[]).map(s=>({...s,entry:lookup(s.catalogId)})):spellbook});}catch(error){fail(422,error.message);}}
 if(value.version===4){
  validateInvocationSpellSources(value,spellbook||[],lookup);
  const active=validateInvocationHistory(value.invocations,value);
  if((value.pact?.spells||[]).some(id=>!known.has(id)))fail(422,'В книге отсутствует заклинание дара договора');
  if(active.some(id=>invocationDescription(id).eldritchBlast)&&!known.has(ELDRITCH_BLAST_ID))fail(422,'Для воззвания в книге отсутствует Мистический заряд');
 }
 if([11,12].includes(value.version)){try{validateLandCantripBook(value.subclass,spellbook,lookup);validateNaturalRecovery(value.subclass.naturalRecovery,s.counters);}catch(error){fail(422,error.message);}}
 if(value.version===9){try{validateSignatureCounters(value.signatureCounters,value.wizardChoices[1],s.counters);}catch(error){fail(422,error.message);}}
 return value;
}

export function validateResourceBindingCommand(input){
 if(!exact(input,['mutationId','expectedRevision','characterId','classId','bindings','create'])||!id(input.mutationId)||!id(input.characterId)||!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0)fail(422,'Неверная команда подключения ресурсов');
 checkedClass(input.classId,1);
 if(!Array.isArray(input.bindings)||!Array.isArray(input.create)||input.bindings.length+input.create.length<1||input.bindings.length+input.create.length>20)fail(422,'Выбери от 1 до 20 ресурсов');
 const resources=new Set(),counters=new Set();
 for(const b of input.bindings){if(!exact(b,['resourceId','counterId'])||!id(b.resourceId)||!id(b.counterId)||resources.has(b.resourceId)||counters.has(b.counterId))fail(422,'Неверная или повторная привязка');resources.add(b.resourceId);counters.add(b.counterId);}
 for(const resourceId of input.create){if(!id(resourceId)||resources.has(resourceId))fail(422,'Повторный или неверный новый ресурс');resources.add(resourceId);}
 return structuredClone(input);
}

export function buildResourceBinding(current,input){
 try{
  const q=validateResourceBindingCommand(input);
  if(current.context?.characterId!==q.characterId||current.revision!==q.expectedRevision)fail(409,'Герой или его версия изменились');
  if(current.advancement)fail(409,'Класс уже подключён; нужна отдельная сверка происхождения');
  const sheet=validateCharacterSheet(current.characterSheet),stats=validateCharacterStats(current.characterStats),state=validateState(current.state);
  const maximums=new Map(classResourceMaximums(q.classId,sheet.level,stats.abilities).map(r=>[r.id,r]));
  const ledger={version:1,ruleset:'5e-2014',classId:q.classId,baselineLevel:sheet.level,level:sheet.level,binding:{mutationId:q.mutationId,requestHash:hash(q)},events:[],resources:[],spells:[]};
  const counters=structuredClone(sheet.counters);
  const resource=id=>{const r=maximums.get(id);if(!r||r.max===null)fail(422,'Ресурс недоступен на этом уровне или неограничен');return r;};
  for(const b of q.bindings){
   const r=resource(b.resourceId),counter=counters.find(c=>c.id===b.counterId);
   if(!counter||counter.max!==r.max)fail(409,'Максимум ручного счётчика не совпадает с правилами класса');
   ledger.resources.push({...b,managedFromLevel:sheet.level,origin:'baseline-bound'});
  }
  for(const resourceId of q.create){
   const r=resource(resourceId);
   if(counters.some(c=>c.id===r.id||c.name.toLocaleLowerCase('ru')===r.name.toLocaleLowerCase('ru')))fail(409,'Счётчик уже существует: выбери явную привязку');
   counters.push({id:r.id,name:r.name,current:r.max,max:r.max});ledger.resources.push({resourceId:r.id,counterId:r.id,managedFromLevel:sheet.level,origin:'baseline-created'});
  }
  const nextSheet=validateCharacterSheet({...sheet,counters});
  return {state,characterSheet:nextSheet,characterStats:stats,advancement:validateAdvancementSnapshot(ledger,nextSheet,stats,current.spellbook),addSpells:[]};
 }catch(error){if(error instanceof AppError)throw error;throw new AppError(422,error.message);}
}
