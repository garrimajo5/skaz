import {randomUUID} from 'node:crypto';
import {previewClassLevel} from '../../server/class-progression.mjs';
import {fiendSpellOptions} from '../../server/class-fiend.mjs';
import {invocationEligibility,validateInvocationHistory,ELDRITCH_BLAST_ID} from '../../server/class-invocations.mjs';
import {pactCantripOptions} from '../../server/class-pacts.mjs';
import {templateStats} from '../../server/character-stats.mjs';
export const fiendFields=(s,extra)=>({mutationId:randomUUID(),expectedRevision:s.read().revision,characterId:s.read().context.characterId,...extra});
export function fiendCommand(s,{pact='blade',replace=null,expanded=true}={}){
 const v=s.read(),fromLevel=v.characterSheet.level,level=fromLevel+1,plan=previewClassLevel({classId:'warlock',fromLevel,toLevel:level,constitution:v.characterStats.abilities.con}),choices={};
 if(fromLevel===1)choices['warlock:2:confirm-fiend']={id:'warlock-fiend',rulesConfirmed:true};
 const known=v.advancement?.invocations?validateInvocationHistory(v.advancement.invocations,v.advancement):[],pactId=level===3?pact:v.advancement?.pact?.id??null;
 for(const c of plan.choices){if(!c.required)continue;
  if(c.kind==='invocations')choices[c.id]=invocationEligibility({warlockLevel:level,pact:pactId,hasEldritchBlast:v.spellbook.some(o=>o.catalogId===ELDRITCH_BLAST_ID),knownInvocations:known}).filter(o=>o.eligible&&o.id!=='book-of-ancient-secrets').slice(0,c.count).map(o=>o.id);
  else if(c.kind==='pact-boon')choices[c.id]={id:pact,cantrips:pact==='tome'?pactCantripOptions().slice(0,3).map(o=>o.spellId):[]};
  else if(c.kind==='ability-score-improvement-or-feat'){const key=Object.keys(v.characterStats.abilities).find(k=>v.characterStats.abilities[k]<=18);choices[c.id]={increases:Object.fromEntries(Object.keys(v.characterStats.abilities).map(k=>[k,k===key?2:0]))};}
  else {const options=fiendSpellOptions(level,c.kind,{knownIds:v.spellbook.map(o=>o.catalogId)});if(expanded)options.sort((a,b)=>Number(!!b.expandedSource)-Number(!!a.expandedSource));choices[c.id]=options.slice(0,c.count).map(o=>o.spellId);}
 }
 if(replace)choices['warlock:'+level+':replace-invocation']=replace;
 return fiendFields(s,{classId:'warlock',fromLevel,hpMethod:'fixed',hpRoll:null,choices,reviewedFeatures:plan.requiresFeatureReview});
}
export function prepareFiend(s,level=1,{pact='blade',installCatalog=true}={}){
 s.saveCharacterStats(fiendFields(s,{stats:structuredClone(templateStats)}));s.saveCharacterSheet(fiendFields(s,{sheet:{ruleset:'5e-2014',ancestry:'',className:'warlock',subclass:'',level:1,counters:[]}}));if(installCatalog)s.catalog.installBundled({version:s.catalog.previewBundled().version});while(s.read().characterSheet.level<level)s.advanceCharacter(fiendCommand(s,{pact}));
}
