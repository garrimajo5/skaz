import {validateInitialRituals} from './class-rituals.mjs';
import {validatePactOrigin} from './class-pacts.mjs';
import {readFileSync} from 'node:fs';
import {classProgression} from './class-progression.mjs';
const referenceData=JSON.parse(readFileSync(new URL('../catalog/srd51-class-features.json',import.meta.url),'utf8'));
const reference=referenceData.features.find(f=>f.id==='warlock-invocations').referenceOptions;
// SRD 5.1 pp.48–50. Levels always mean warlock levels, never total character level.
const requirements=[
 ['Agonizing Blast',2,null,true],['Armor of Shadows',2],['Ascendant Step',9],
 ['Beast Speech',2],['Beguiling Influence',2],['Bewitching Whispers',7],
 ['Book of Ancient Secrets',2,'tome'],['Chains of Carceri',15,'chain'],
 ['Devil’s Sight',2],['Dreadful Word',7],['Eldritch Sight',2],['Eldritch Spear',2,null,true],
 ['Eyes of the Rune Keeper',2],['Fiendish Vigor',2],['Gaze of Two Minds',2],
 ['Lifedrinker',12,'blade'],['Mask of Many Faces',2],['Master of Myriad Forms',15],
 ['Minions of Chaos',9],['Mire the Mind',5],['Misty Visions',2],['One with Shadows',5],
 ['Otherworldly Leap',9],['Repelling Blast',2,null,true],['Sculptor of Flesh',7],
 ['Sign of Ill Omen',5],['Thief of Five Fates',2],['Thirsting Blade',5,'blade'],
 ['Visions of Distant Realms',15],['Voice of the Chain Master',2,'chain'],
 ['Whispers of the Grave',9],['Witch Sight',15]
];
const options=requirements.map(([key,minLevel,pact=null,eldritchBlast=false])=>{
 const help=reference.find(r=>r.key===key);if(!help)throw new Error('Missing invocation reference: '+key);
 return {...help,source:referenceData.source,id:key.toLowerCase().replace(/[’']/g,'').replaceAll(' ','-'),minLevel,pact,eldritchBlast};
});
if(options.length!==reference.length)throw new Error('Invocation requirements need review');
// Pure eligibility only. The caller must supply verified persisted/same-operation facts.
// This does not grant an invocation, its spells, proficiency, item, or familiar.
export function invocationEligibility({warlockLevel,pact=null,hasEldritchBlast=false,knownInvocations=[]}){
 classProgression('warlock',warlockLevel);
 if(![null,'chain','blade','tome'].includes(pact)||pact!==null&&warlockLevel<3)throw new Error('Неверный дар договора');
 if(typeof hasEldritchBlast!=='boolean')throw new Error('Нужно подтверждение заговора Мистический заряд');
 if(!Array.isArray(knownInvocations)||new Set(knownInvocations).size!==knownInvocations.length||knownInvocations.some(id=>!options.some(o=>o.id===id)))throw new Error('Неизвестная история воззваний');
 return options.map(option=>{
  const reasons=[];
  if(warlockLevel<option.minLevel)reasons.push('warlock-level');
  if(option.pact&&option.pact!==pact)reasons.push('pact');
  if(option.eldritchBlast&&!hasEldritchBlast)reasons.push('eldritch-blast');
  if(knownInvocations.includes(option.id))reasons.push('already-known');
  return {...structuredClone(option),ruleset:'5e-2014',eligible:reasons.length===0,reasons};
 });
}

const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
export const ELDRITCH_BLAST_ID='srd51:2014:spell:eldritch-blast';
export function invocationDescription(id){const option=options.find(o=>o.id===id);if(!option)throw new Error('Неизвестное воззвание');return structuredClone(option);}

const selectedId=value=>typeof value==='string'?value:exact(value,['id','rituals'])&&value.id==='book-of-ancient-secrets'?value.id:null;
function origin(value){
 const id=selectedId(value);if(!id)throw new Error('Неверный выбор воззвания');
 const result={id,sourcePage:invocationDescription(id).sourcePage};
 if(id==='book-of-ancient-secrets')result.rituals=validateInitialRituals(value?.rituals);
 return result;
}
const originSelection=value=>value.id==='book-of-ancient-secrets'?{id:value.id,rituals:value.rituals}:value.id;
const validOrigin=value=>exact(value,['id','sourcePage',...(value?.id==='book-of-ancient-secrets'?['rituals']:[])]);
// All prerequisites use verified history and facts of this same atomic advancement.
export function buildInvocationEvent({fromLevel,toLevel,knownInvocations=[],selected=[],replacement=null,hasEldritchBlast=false,pact=null}){
 if(toLevel!==fromLevel+1)throw new Error('Воззвания выбираются по одному уровню');
 const before=classProgression('warlock',fromLevel).progression,after=classProgression('warlock',toLevel).progression;
 const rows=invocationEligibility({warlockLevel:toLevel,knownInvocations,hasEldritchBlast,pact});
 if(knownInvocations.length!==before.invocationsKnown)throw new Error('Прежние воззвания не подтверждены полной историей');
 const count=after.invocationsKnown-before.invocationsKnown;
 if(!Array.isArray(selected)||selected.length!==count||new Set(selected.map(selectedId)).size!==selected.length)throw new Error('Выбери '+count+' разных новых воззваний');
 if(replacement!==null&&(!exact(replacement,['remove','add'])||toLevel<3||!knownInvocations.includes(replacement.remove)||replacement.remove===selectedId(replacement.add)))throw new Error('Неверная замена воззвания');
 const added=[...selected,...(replacement?[replacement.add]:[])].map(selectedId);
 if(new Set(added).size!==added.length||added.some(id=>!rows.find(o=>o.id===id)?.eligible))throw new Error('Воззвание недоступно, уже изучено или не выполнены требования');
 const active=[...knownInvocations.filter(id=>id!==replacement?.remove),...added];
 const eligibility=invocationEligibility({warlockLevel:toLevel,hasEldritchBlast,pact});
 if(active.some(id=>!eligibility.find(o=>o.id===id)?.eligible))throw new Error('Для сохранённого воззвания больше не выполнены требования');
 return {level:toLevel,added:selected.map(origin),replacement:replacement?{remove:replacement.remove,add:origin(replacement.add)}:null,hasEldritchBlast};
}
export function validateInvocationHistory(records,{baselineLevel,level,pact=null}){
 if(baselineLevel!==1||!Number.isSafeInteger(level)||level<2||level>20||!Array.isArray(records)||records.length!==level-baselineLevel)throw new Error('Нужна полная история воззваний с первого уровня');
 const pactOrigin=validatePactOrigin(pact,level);let known=[];
 for(const [index,record] of records.entries()){
  if(!exact(record,['level','added','replacement','hasEldritchBlast'])||record.level!==index+2||!Array.isArray(record.added)||record.added.some(o=>!validOrigin(o))||record.replacement!==null&&(!exact(record.replacement,['remove','add'])||!validOrigin(record.replacement.add)))throw new Error('Неверное происхождение воззваний');
  const replacement=record.replacement?{remove:record.replacement.remove,add:originSelection(record.replacement.add)}:null;
  const expected=buildInvocationEvent({fromLevel:record.level-1,toLevel:record.level,knownInvocations:known,selected:record.added.map(originSelection),replacement,hasEldritchBlast:record.hasEldritchBlast,pact:record.level>=3?pactOrigin.id:null});
  if(expected.added.some((o,i)=>o.sourcePage!==record.added[i].sourcePage)||replacement&&expected.replacement.add.sourcePage!==record.replacement.add.sourcePage)throw new Error('Источник воззвания не соответствует SRD');
  known=known.filter(id=>id!==replacement?.remove).concat(record.added.map(o=>o.id),replacement?[selectedId(replacement.add)]:[]);
 }
 return known;
}
export function activeInvocationOrigins(records,context){
 validateInvocationHistory(records,context);const active=new Map();
 for(const record of records){if(record.replacement){active.delete(record.replacement.remove);active.set(record.replacement.add.id,record.replacement.add);}for(const item of record.added)active.set(item.id,item);}
 return structuredClone([...active.values()]);
}
