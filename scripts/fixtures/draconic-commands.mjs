import {randomUUID} from 'node:crypto';
import {previewClassLevel,spellChoiceOptions} from '../../server/class-progression.mjs';
import {metamagicOptions} from '../../server/class-metamagic.mjs';
import {templateStats} from '../../server/character-stats.mjs';
export const draconicFields=(s,extra)=>({mutationId:randomUUID(),expectedRevision:s.read().revision,characterId:s.read().context.characterId,...extra});
export function draconicCommand(s,ancestorId='red'){
 const v=s.read(),fromLevel=v.characterSheet.level,plan=previewClassLevel({classId:'sorcerer',fromLevel,toLevel:fromLevel+1,constitution:v.characterStats.abilities.con}),choices={};
 if(fromLevel===1)choices['sorcerer:2:confirm-draconic']={id:'sorcerer-draconic',ancestorId,rulesConfirmed:true,baselineHpConfirmed:true};
 for(const c of plan.choices){if(!c.required)continue;
  if(c.kind==='metamagic')choices[c.id]=metamagicOptions('sorcerer',fromLevel+1,{knownOptions:v.advancement?.metamagic?.map(o=>o.id)||[]}).slice(0,c.count).map(o=>o.id);
  else if(c.kind==='ability-score-improvement-or-feat'){const key=Object.keys(v.characterStats.abilities).find(k=>v.characterStats.abilities[k]<=18);choices[c.id]={increases:Object.fromEntries(Object.keys(v.characterStats.abilities).map(k=>[k,k===key?2:0]))};}
  else choices[c.id]=spellChoiceOptions('sorcerer',fromLevel+1,c.kind,{knownIds:v.spellbook.map(o=>o.catalogId)}).slice(0,c.count).map(o=>o.spellId);
 }
 return draconicFields(s,{classId:'sorcerer',fromLevel,hpMethod:'fixed',hpRoll:null,choices,reviewedFeatures:plan.requiresFeatureReview});
}
export function prepareDraconic(s,level=1,{installCatalog=true}={}){
 s.saveCharacterStats(draconicFields(s,{stats:structuredClone(templateStats)}));
 s.saveCharacterSheet(draconicFields(s,{sheet:{ruleset:'5e-2014',ancestry:'',className:'sorcerer',subclass:'',level:1,counters:[]}}));
 if(installCatalog)s.catalog.installBundled({version:s.catalog.previewBundled().version});
 while(s.read().characterSheet.level<level)s.advanceCharacter(draconicCommand(s));
}
