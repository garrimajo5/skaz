import {randomUUID} from 'node:crypto';
import {previewClassLevel,spellChoiceOptions} from '../../server/class-progression.mjs';
function command(s){const v=s.read(),fromLevel=v.characterSheet.level;return {mutationId:randomUUID(),expectedRevision:v.revision,characterId:v.context.characterId,classId:'ranger',fromLevel,hpMethod:'fixed',hpRoll:null,choices:{},reviewedFeatures:previewClassLevel({classId:'ranger',fromLevel,toLevel:fromLevel+1,constitution:v.characterStats.abilities.con}).requiresFeatureReview};}
import {hunterChoiceAt} from '../../server/class-hunter.mjs';
export function rangerCommand(s){
 const current=s.read(),q=command(s),level=q.fromLevel+1,plan=previewClassLevel({classId:'ranger',fromLevel:q.fromLevel,toLevel:level,constitution:current.characterStats.abilities.con});
 const enemy=(id)=>({enemy:{kind:'type',id},language:{mode:'none'},rulesConfirmed:true});
 for(const c of plan.choices)if(c.required){
  if(c.kind==='subclass')q.choices[c.id]={id:'ranger-hunter',optionId:'colossus-slayer'};
  else if(c.kind==='fighting-style')q.choices[c.id]=['archery'];
  else if(c.kind==='favored-terrain')q.choices[c.id]=level===6?{previousId:'forest',id:'swamp'}:{id:'coast'};
  else if(c.kind==='favored-enemy-and-language')q.choices[c.id]=level===6?{previous:enemy('beasts'),current:{enemy:{kind:'humanoids',races:['Гноллы','Орки']},language:{mode:'spoken',name:'Орочий'},rulesConfirmed:true}}:{current:{enemy:{kind:'type',id:'dragons'},language:{mode:'spoken',name:'Драконий'},rulesConfirmed:true}};
  else if(c.kind==='ability-score-improvement-or-feat'){const ability=Object.keys(current.characterStats.abilities).find(k=>current.characterStats.abilities[k]<=18);q.choices[c.id]={increases:Object.fromEntries(Object.keys(current.characterStats.abilities).map(k=>[k,k===ability?2:0]))};}
  else q.choices[c.id]=spellChoiceOptions('ranger',level,c.kind,{knownIds:current.spellbook.map(row=>row.catalogId)}).slice(0,c.count).map(row=>row.spellId);
 }
 const hunter=level>3?hunterChoiceAt(level):null;if(hunter)q.choices[hunter.choiceId]={id:hunter.options[0].id};return q;
}
