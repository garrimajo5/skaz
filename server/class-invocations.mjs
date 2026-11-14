import {readFileSync} from 'node:fs';
import {classProgression} from './class-progression.mjs';
const reference=JSON.parse(readFileSync(new URL('../catalog/srd51-class-features.json',import.meta.url),'utf8')).features.find(f=>f.id==='warlock-invocations').referenceOptions;
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
 return {...help,id:key.toLowerCase().replace(/[’']/g,'').replaceAll(' ','-'),minLevel,pact,eldritchBlast};
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
  return {...option,ruleset:'5e-2014',eligible:reasons.length===0,reasons};
 });
}
