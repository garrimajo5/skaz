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
 if(!exact(value,['version','ruleset','classId','baselineLevel','level','binding','events','resources','spells',...(value?.version>=2?['styles']:[]),...(value?.version===3?['metamagic']:[])])||![1,2,3].includes(value.version)||value.ruleset!=='5e-2014')fail(422,'Неверное происхождение повышения');
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
 const before=previewClassLevel({classId:request.classId,fromLevel:sheet.level,toLevel:sheet.level+1,constitution:stats.abilities.con,hpMethod:request.hpMethod,hpRoll:request.hpRoll});
 if(request.reviewedFeatures.length!==before.requiresFeatureReview.length||before.requiresFeatureReview.some(f=>!request.reviewedFeatures.includes(f)))fail(422,'Сначала проверь все новые умения: их эффекты пока не применяются автоматически');
 const choices=new Map(before.choices.map(c=>[c.id,c]));
 for(const key of Object.keys(request.choices))if(!choices.has(key))fail(422,'Выбор не относится к этому уровню');
 for(const choice of choices.values()){
  if(!Object.hasOwn(request.choices,choice.id)){if(choice.required)fail(422,'Не завершён выбор: '+choice.kind);continue;}
  if(!spellKinds.has(choice.kind)&&choice.kind!=='ability-score-improvement-or-feat'&&choice.kind!=='fighting-style'&&choice.kind!=='metamagic')fail(422,'Этот выбор ещё не поддерживается: '+choice.kind);
 }
 let abilities=stats.abilities;
 for(const choice of choices.values())if(choice.kind==='ability-score-improvement-or-feat'){
  const selection=request.choices[choice.id];
  if(!exact(selection,['increases']))fail(422,'Черты пока не поддерживаются; выбери повышение характеристик');
  abilities=applyAbilityScoreChoice(before,abilities,selection.increases);
 }
 const plan=previewClassLevel({classId:request.classId,fromLevel:sheet.level,toLevel:sheet.level+1,constitution:abilities.con,previousConstitution:stats.abilities.con,hpMethod:request.hpMethod,hpRoll:request.hpRoll});
 const ledger=previous||{version:1,ruleset:'5e-2014',classId:request.classId,baselineLevel:sheet.level,level:sheet.level,binding:null,events:[],resources:[],spells:[]};
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
 if(ledger.spells.some(s=>!known.includes(s.catalogId)))fail(409,'Полученное при повышении заклинание удалено вручную; нужна сверка');
 const additions=[];
 for(const choice of choices.values())if(spellKinds.has(choice.kind)&&Object.hasOwn(request.choices,choice.id)){
  const selected=validateSpellChoice(plan,choice.id,request.choices[choice.id],{knownIds:[...known,...additions]});
  for(const catalogId of selected){additions.push(catalogId);ledger.spells.push({catalogId,acquiredLevel:plan.toLevel,choiceId:choice.id});}
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
  if(resource.max===null)fail(422,'Неограниченный ресурс требует отдельного интерфейса');
  if(origin){const index=counters.findIndex(c=>c.id===origin.counterId);counters[index]=resizeManagedResource(counters[index],resource.max);continue;}
  if(oldMaxima.has(resource.id))continue; // Baseline resources remain manual until explicitly reconciled.
  if(counters.some(c=>c.id===resource.id||c.name.toLocaleLowerCase('ru')===resource.name.toLocaleLowerCase('ru')))fail(409,'Новый ресурс совпадает с ручным: '+resource.name);
  counters.push({id:resource.id,name:resource.name,current:resource.max,max:resource.max});
  ledger.resources.push({resourceId:resource.id,counterId:resource.id,managedFromLevel:plan.toLevel,origin:'level'});newResources.push(resource);
 }
 const maxHp=state.maxHp+plan.hitPoints.maximumDelta;
 // Level advancement does not heal wounds, wake a dying hero, clear checks,
 // restore counters or alter temporary HP. A rest is a separate action.
 const nextState=validateState({...state,maxHp});
 const nextSheet=validateCharacterSheet({...sheet,level:plan.toLevel,counters});
 const nextStats=validateCharacterStats({...stats,abilities});
 ledger.level=plan.toLevel;ledger.events.push({mutationId:request.mutationId,level:plan.toLevel,requestHash:hash(request),sourcePage:plan.sourcePage,featuresReviewed:[...request.reviewedFeatures]});
 return {state:nextState,characterSheet:nextSheet,characterStats:nextStats,advancement:validateAdvancementLedger(ledger),addSpells:additions,
  summary:{fromLevel:plan.fromLevel,toLevel:plan.toLevel,hitPoints:plan.hitPoints,proficiency:plan.proficiency,newResources,featuresReviewed:[...request.reviewedFeatures],unmanagedResources:maxima.filter(r=>oldMaxima.has(r.id)&&!managed.has(r.id)).map(r=>r.id)}};
}
// Check transferred/current provenance against its actual hero, never just names.
export function validateAdvancementSnapshot(ledger,sheet,stats,spellbook){
 const value=validateAdvancementLedger(ledger);if(!value)return null;
 const s=validateCharacterSheet(sheet),a=validateCharacterStats(stats);
 if(s.level!==value.level)fail(422,'Уровень не соответствует истории повышения');
 const maxima=new Map(classResourceMaximums(value.classId,value.level,a.abilities).map(r=>[r.id,r]));
 for(const origin of value.resources){
  const counter=s.counters.find(c=>c.id===origin.counterId),resource=maxima.get(origin.resourceId);
  if(!counter||!resource||resource.max!==counter.max)fail(422,'Счётчик не соответствует происхождению');
 }
 const known=new Set((spellbook||[]).map(s=>s.catalogId));
 if(value.spells.some(s=>!known.has(s.catalogId)))fail(422,'В книге отсутствует полученное при повышении заклинание');
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
