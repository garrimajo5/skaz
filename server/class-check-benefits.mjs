import {validateAdvancementLedger} from './class-advancement.mjs';
// Conditional checks are projections, never edits of a manually entered total.
export function classCheckBenefits(raw){
 const ledger=validateAdvancementLedger(raw);
 if(!ledger||ledger.classId!=='fighter'||ledger.subclass?.id!=='fighter-champion'||ledger.baselineLevel>=7||ledger.level<7||!ledger.events.some(e=>e.level===7))return null;
 return {classId:'fighter',level:ledger.level,untrainedAbilities:['str','dex','con'],bonus:Math.ceil((2+Math.floor((ledger.level-1)/4))/2),origin:{featureId:'fighter-remarkable-athlete',name:'Выдающийся атлет',acquiredLevel:7,sourcePage:25}};
}
