import {validateAdvancementLedger} from './class-advancement.mjs';
const abilities=['str','dex','con','int','wis','cha'];
// A feature is derived only when the recorded advancement crossed its level.
export function classSaveBenefits(raw){
 const ledger=validateAdvancementLedger(raw);if(!ledger)return null;
 const feature=ledger.classId==='rogue'&&ledger.version===17?{level:15,id:'rogue-slippery-mind',name:'Изворотливый ум',abilities:['wis'],sourcePage:40}:ledger.classId==='monk'&&ledger.subclass?.id==='monk-open-hand'?{level:14,id:'monk-diamond-soul',name:'Алмазная душа',abilities,sourcePage:28}:null;
 if(!feature||ledger.baselineLevel>=feature.level||ledger.level<feature.level||!ledger.events.some(e=>e.level===feature.level))return null;
 return {classId:ledger.classId,level:ledger.level,saveProficiencies:[...feature.abilities],deathSaveProficiency:ledger.classId==='monk',origin:{featureId:feature.id,name:feature.name,acquiredLevel:feature.level,sourcePage:feature.sourcePage}};
}
