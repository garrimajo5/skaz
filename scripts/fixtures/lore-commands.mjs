import {randomUUID} from 'node:crypto';
import {previewClassLevel,spellChoiceOptions} from '../../server/class-progression.mjs';
import {templateStats} from '../../server/character-stats.mjs';
import {loreSecretOptions} from '../../server/class-bard-lore.mjs';
export const loreFields=(s,extra)=>({mutationId:randomUUID(),expectedRevision:s.read().revision,characterId:s.read().context.characterId,...extra});
export function loreCommand(s){const v=s.read(),fromLevel=v.characterSheet.level,level=fromLevel+1,plan=previewClassLevel({classId:'bard',fromLevel,toLevel:level,constitution:v.characterStats.abilities.con}),choices={},knownIds=v.spellbook.map(o=>o.catalogId);
 for(const c of plan.choices)if(c.required){
  if(c.kind==='subclass')choices[c.id]={id:'bard-lore'};
  else if(c.kind==='expertise')choices[c.id]={skillIds:level===3?['arcana','history']:['persuasion','perception']};
  else if(c.kind==='ability-score-improvement-or-feat'){const key=Object.keys(v.characterStats.abilities).find(k=>v.characterStats.abilities[k]<=18);choices[c.id]={increases:Object.fromEntries(Object.keys(v.characterStats.abilities).map(k=>[k,k===key?2:0]))};}
  else{const ids=spellChoiceOptions('bard',level,c.kind,{knownIds}).slice(0,c.count).map(o=>o.spellId);choices[c.id]=ids;knownIds.push(...ids);}
 }
 if(level===3)choices['bard:3:lore-skills']={baselineSkills:['persuasion','perception','performance'],bonusSkills:['arcana','history','nature'],rulesConfirmed:true};
 if(level===6)choices['bard:6:lore-secrets']={spellIds:loreSecretOptions({knownIds}).slice(0,2).map(o=>o.spellId)};
 return loreFields(s,{classId:'bard',fromLevel,hpMethod:'fixed',hpRoll:null,choices,reviewedFeatures:plan.requiresFeatureReview});
}
export function prepareLore(s,level=2,{installCatalog=true}={}){s.saveCharacterStats(loreFields(s,{stats:structuredClone(templateStats)}));s.saveCharacterSheet(loreFields(s,{sheet:{ruleset:'5e-2014',ancestry:'',className:'bard',subclass:'',level:Math.min(level,2),counters:[]}}));if(installCatalog)s.catalog.installBundled({version:s.catalog.previewBundled().version});while(s.read().characterSheet.level<level)s.advanceCharacter(loreCommand(s));}
