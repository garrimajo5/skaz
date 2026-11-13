import {classFeatureDetails} from './class-features.mjs';
import {readFileSync} from 'node:fs';
const data=JSON.parse(readFileSync(new URL('../catalog/srd51-class-progression.json',import.meta.url),'utf8'));
const classes=new Map(data.classes.map(c=>[c.slug,c]));
const integer=(n,min,max,label)=>{if(!Number.isSafeInteger(n)||n<min||n>max)throw new Error(label);return n;};
export function classProgression(slug,level){
 integer(level,1,20,'Уровень должен быть от 1 до 20');
 const c=classes.get(slug);if(!c)throw new Error('Класс пока не поддерживается: '+slug);
 return structuredClone({...c,levels:undefined,progression:c.levels[level-1]});
}
export function classFeatureReference(classId,level){
 classProgression(classId,level); // Validate both class and level before collecting help.
 const keys=classes.get(classId).levels.slice(0,level).flatMap(row=>row.featuresEn);
 const latest=new Map();
 for(const detail of classFeatureDetails(classId,keys))if(detail.id)latest.set(detail.id,detail);
 return [...latest.values()];
}
export function classList(){return data.classes.map(c=>({id:c.id,slug:c.slug,name:{...c.name}}));}

// Pure preview: no campaign writes, no guessing from a free-form class name.
// A future commit command must validate this result again against the current revision.
export function previewClassLevel({classId,fromLevel,toLevel,constitution,previousConstitution=constitution,hpMethod='fixed',hpRoll=null}){
 integer(fromLevel,1,19,'Текущий уровень должен быть от 1 до 19');
 if(toLevel!==fromLevel+1)throw new Error('Повышай уровень по одному, чтобы не пропустить выбор');
 integer(constitution,1,30,'Телосложение должно быть от 1 до 30');integer(previousConstitution,1,30,'Прежнее Телосложение должно быть от 1 до 30');
 const before=classProgression(classId,fromLevel),after=classProgression(classId,toLevel),a=before.progression,b=after.progression;
 if(!['fixed','roll'].includes(hpMethod))throw new Error('Выбери фиксированные хиты или бросок');
 if(hpMethod==='roll')integer(hpRoll,1,after.hitDie,'Бросок хитов вне диапазона кости класса');
 else if(hpRoll!==null)throw new Error('При фиксированных хитах бросок не нужен');
 const con=Math.floor((constitution-10)/2),oldCon=Math.floor((previousConstitution-10)/2);
 const hpBase=hpMethod==='roll'?hpRoll:after.hitDie/2+1;
 const hpFromLevel=Math.max(1,hpBase+con),hpRetroactive=(con-oldCon)*fromLevel;
 const choices=[];
 const add=(id,count,required=true)=>choices.push({id:classId+':'+toLevel+':'+id,kind:id,count,required});
 if(toLevel===after.subclassLevel)add('subclass',1);
 if(b.featuresEn.includes('Ability Score Improvement'))add('ability-score-improvement-or-feat',1);
 const cantrips=Math.max(0,(b.cantrips||0)-(a.cantrips||0));if(cantrips)add('cantrips',cantrips);
 let known=Math.max(0,(b.spellsKnown||0)-(a.spellsKnown||0));
 if(classId==='bard'&&b.featuresEn.includes('Magical Secrets')){add('magical-secrets',2);known-=2;}
 if(known)add('known-spells',known);
 if(['bard','ranger','sorcerer','warlock'].includes(classId)&&a.spellsKnown>0)add('replace-known-spell',1,false);
 if(classId==='wizard')add('spellbook-spells',2);
 if(b.featuresEn.includes('Expertise'))add('expertise',2);
 if(b.featuresEn.includes('Fighting Style'))add('fighting-style',1);
 if(b.featuresEn.includes('Metamagic'))add('metamagic',toLevel===3?2:1);
 if(classId==='warlock'){
  const invocations=b.invocationsKnown-a.invocationsKnown;if(invocations)add('invocations',invocations);
  if(toLevel>=3)add('replace-invocation',1,false);
  if(toLevel===3)add('pact-boon',1);
  if([11,13,15,17].includes(toLevel))add('mystic-arcanum',1);
 }
 if(classId==='ranger'){
  if([6,14].includes(toLevel))add('favored-enemy-and-language',1);
  if([6,10].includes(toLevel))add('favored-terrain',1);
 }
 if(classId==='wizard'&&toLevel===18)add('spell-mastery',2);
 if(classId==='wizard'&&toLevel===20)add('signature-spells',2);
 return {ruleset:'5e-2014',classId,fromLevel,toLevel,sourcePage:after.sourcePage,
  hitPoints:{method:hpMethod,base:hpBase,constitutionModifier:con,fromLevel:hpFromLevel,retroactive:hpRetroactive,maximumDelta:hpFromLevel+hpRetroactive},
  proficiency:{before:a.proficiency,after:b.proficiency},
  automaticTableValues:{before:a,after:b},
  choices,
  featureDetails:classFeatureDetails(classId,b.featuresEn),
  priorFeatureDetails:classFeatureReference(classId,fromLevel),
  requiresFeatureReview:b.featuresEn.filter(f=>f!=='Ability Score Improvement'),
  limitations:['Только один класс; без мультикласса и дополнительных правил.','Полные подклассы и описания всех классов ещё не подключены. Пояснение или табличное значение не означает применение умения.','Этот модуль строит предпросмотр и не изменяет игру, текущие хиты или ресурсы.']};
}

// Used only for resources already explicitly managed by class progression.
// Manual counters must not be silently adopted by a matching display name.
export function resizeManagedResource(resource,nextMaximum){
 integer(resource.max,0,9999,'Неверный прежний максимум');integer(resource.current,0,resource.max,'Неверный остаток');integer(nextMaximum,0,9999,'Неверный новый максимум');
 const spent=resource.max-resource.current;
 return {...resource,max:nextMaximum,current:Math.max(0,nextMaximum-spent)};
}
const spellLists=JSON.parse(readFileSync(new URL('../catalog/srd51-class-spells.json',import.meta.url),'utf8')).classes;
const allSpells=new Map(Object.values(spellLists).flat().map(s=>[s.spellId,s.level]));
const spellChoiceKinds=new Set(['cantrips','known-spells','replace-known-spell','spellbook-spells','magical-secrets','mystic-arcanum']);
export function spellChoiceOptions(classId,level,kind,{knownIds=[]}={}){
 const c=classProgression(classId,level),row=c.progression;
 if(!spellChoiceKinds.has(kind))throw new Error('Выбор заклинаний пока не поддерживается: '+kind);
 if(!Array.isArray(knownIds)||new Set(knownIds).size!==knownIds.length||knownIds.some(id=>!allSpells.has(id)))throw new Error('Неверный список известных заклинаний');
 const known=new Set(knownIds);
 const maximum=row.pactSlotLevel||row.spellSlots?.reduce((max,n,i)=>n?i+1:max,0)||0;
 const list=kind==='magical-secrets'?[...allSpells].map(([spellId,level])=>({spellId,level})):spellLists[classId]||[];
 return list.filter(s=>!known.has(s.spellId)&&(
  kind==='cantrips'?s.level===0:
  kind==='mystic-arcanum'?classId==='warlock'&&[11,13,15,17].includes(level)&&s.level===(level+1)/2:
  s.level>= (kind==='magical-secrets'?0:1)&&s.level<=maximum
 )).map(s=>({spellId:s.spellId,level:s.level}));
}
export function validateSpellChoice(plan,choiceId,selectedIds,{knownIds=[]}={}){
 // Recompute the permitted choice rather than trusting client-supplied counts.
 const authoritative=previewClassLevel({classId:plan.classId,fromLevel:plan.fromLevel,toLevel:plan.toLevel,constitution:10});
 const choice=authoritative.choices.find(c=>c.id===choiceId);
 if(!choice||!spellChoiceKinds.has(choice.kind))throw new Error('Неизвестный выбор заклинаний');
 if(!Array.isArray(selectedIds)||new Set(selectedIds).size!==selectedIds.length||selectedIds.length!==choice.count)throw new Error('Нужно выбрать '+choice.count+' разных заклинаний');
 const allowed=new Set(spellChoiceOptions(plan.classId,plan.toLevel,choice.kind,{knownIds}).map(s=>s.spellId));
 if(selectedIds.some(id=>!allowed.has(id)))throw new Error('Заклинание недоступно этому классу или уровню либо уже известно');
 return [...selectedIds];
}

export function classResourceMaximums(classId,level,abilities){
 const c=classProgression(classId,level),r=c.progression;
 for(const key of ['str','dex','con','int','wis','cha'])integer(abilities?.[key],1,30,'Нужны все шесть характеристик 1–30');
 const mod=key=>Math.floor((abilities[key]-10)/2),resources=[];
 const add=(key,name,max,recovery)=>resources.push({id:'class-'+classId+'-'+key,name,max,recovery});
 for(const [i,max] of (r.spellSlots||[]).entries())if(max)add('slot-'+(i+1),'Ячейки '+(i+1)+' круга',max,'long-rest');
 if(classId==='barbarian')add('rage','Ярость',r.rages,'long-rest');
 if(classId==='bard')add('inspiration','Вдохновение барда',Math.max(1,mod('cha')),level>=5?'short-rest':'long-rest');
 if(classId==='cleric'&&level>=2)add('channel','Божественный канал',level>=18?3:level>=6?2:1,'short-rest');
 if(classId==='druid'&&level>=2)add('wild-shape','Дикий облик',level===20?null:2,'short-rest');
 if(classId==='fighter'){
  add('second-wind','Второе дыхание',1,'short-rest');
  if(level>=2)add('action-surge','Всплеск действий',level>=17?2:1,'short-rest');
  if(level>=9)add('indomitable','Упорный',level>=17?3:level>=13?2:1,'long-rest');
 }
 if(classId==='monk'&&level>=2)add('ki','Ци',r.kiPoints,'short-rest-with-meditation');
 if(classId==='paladin'){
  add('divine-sense','Божественное чувство',Math.max(0,1+mod('cha')),'long-rest');
  add('lay-on-hands','Наложение рук',5*level,'long-rest');
  if(level>=3)add('channel','Божественный канал',1,'short-rest');
  if(level>=14)add('cleansing-touch','Очищающее касание',Math.max(1,mod('cha')),'long-rest');
 }
 if(classId==='rogue'&&level===20)add('stroke-of-luck','Удача',1,'short-rest');
 if(classId==='sorcerer'&&level>=2)add('sorcery','Единицы чародейства',r.sorceryPoints,'long-rest');
 if(classId==='warlock'){
  if(level===20)add('eldritch-master','Таинственный мастер',1,'long-rest');
  add('pact-slots','Ячейки магии договора '+r.pactSlotLevel+' круга',r.pactSlots,'short-rest');
  for(const [at,circle] of [[11,6],[13,7],[15,8],[17,9]])if(level>=at)add('arcanum-'+circle,'Таинственный арканум '+circle+' круга',1,'long-rest');
 }
 if(classId==='wizard')add('arcane-recovery','Магическое восстановление',1,'day');
 return resources;
}

export function applyAbilityScoreChoice(plan,abilities,increases){
 const p=previewClassLevel({classId:plan.classId,fromLevel:plan.fromLevel,toLevel:plan.toLevel,constitution:10});
 if(!p.choices.some(c=>c.kind==='ability-score-improvement-or-feat'))throw new Error('На этом уровне нет повышения характеристик');
 const keys=['str','dex','con','int','wis','cha'];
 if(!increases||typeof increases!=='object'||Array.isArray(increases)||Object.keys(increases).length!==6||Object.keys(increases).some(k=>!keys.includes(k)))throw new Error('Нужны шесть прибавок характеристик');
 const result={};let sum=0;
 for(const key of keys){
  integer(abilities?.[key],1,30,'Неверная характеристика');integer(increases[key],0,2,'Прибавка должна быть от 0 до 2');
  sum+=increases[key];result[key]=abilities[key]+increases[key];
  if(increases[key]>0&&result[key]>20)throw new Error('Обычное повышение не может поднять характеристику выше 20');
 }
 if(sum!==2)throw new Error('Распредели ровно два пункта');
 return result;
}

export function preparedSpellLimit(classId,level,abilityScore){
 const c=classProgression(classId,level);
 integer(abilityScore,1,30,'Неверная заклинательная характеристика');
 if(!['cleric','druid','paladin','wizard'].includes(classId)||!c.progression.spellSlots.some(n=>n>0))return null;
 return Math.max(1,Math.floor((abilityScore-10)/2)+(classId==='paladin'?Math.floor(level/2):level));
}
