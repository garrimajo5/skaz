import {isDeepStrictEqual} from 'node:util';
import {validateWizardAdvancedChoice,wizardSpellSource} from './class-wizard-choices.mjs';
export function wizardSignatureOrigin(selected,spellbook){
 const {applied,...origin}=validateWizardAdvancedChoice({kind:'signature',classId:'wizard',level:20,selected,spellbook});return {...origin,choiceId:'wizard:20:signature-spells'};
}
export function validateWizardSignatureOrigin(value){
 if(!value||!Array.isArray(value.spellIds))throw Error('Нужен выбор Фирменных заклинаний');const expected=wizardSignatureOrigin(value.spellIds,value.spellIds.map(catalogId=>({catalogId,status:'prepared',entry:wizardSpellSource(catalogId)})));if(!isDeepStrictEqual(value,expected))throw Error('Неверное происхождение Фирменных заклинаний');return expected;
}
export function signatureCounterOrigins(signature){return validateWizardSignatureOrigin(signature).spellIds.map((catalogId,index)=>({catalogId,counterId:'class-wizard-signature-'+(index+1),acquiredLevel:20,sourcePage:54,recovery:'short-or-long-rest'}));}
export function signatureCounterName(catalogId){return ('Фирменное: '+wizardSpellSource(catalogId).name.ru).slice(0,80);}
export function validateSignatureCounters(origins,signature,counters){
 const expected=signatureCounterOrigins(signature);if(!isDeepStrictEqual(origins,expected))throw Error('Неверное происхождение счётчиков Фирменных заклинаний');
 if(counters)for(const origin of expected){const counter=counters.find(c=>c.id===origin.counterId);if(!counter||counter.max!==1||counter.name!==signatureCounterName(origin.catalogId)||!Number.isSafeInteger(counter.current)||counter.current<0||counter.current>1)throw Error('Счётчик Фирменного заклинания изменён или удалён');}return expected;
}
