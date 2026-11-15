import {isDeepStrictEqual} from 'node:util';
import {validateCharacterStats} from './character-stats.mjs';
import {previewClassLevel,classProgression} from './class-progression.mjs';
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
// SRD 5.1 p.9; pure planning only. Caller must bind this to a current revision,
// reconcile the rage counter and persist a new origin before enabling level20.
export function primalChampionOrigin(before){
 if(!exact(before,['str','con'])||Object.values(before).some(n=>!Number.isSafeInteger(n)||n<1||n>20))throw Error('Сначала нужна отдельная сверка Силы и Телосложения выше20 или неизвестных исходных значений');
 return {ruleset:'5e-2014',classId:'barbarian',featureId:'barbarian-primal-champion',acquiredLevel:20,sourcePage:9,before:{...before},after:{str:before.str+4,con:before.con+4},maximum:{str:24,con:24}};
}
export function validatePrimalChampionOrigin(value){
 const expected=primalChampionOrigin(value?.before);if(!isDeepStrictEqual(value,expected))throw Error('Происхождение Первобытного чемпиона не соответствует SRD2014');return structuredClone(expected);
}
export function planPrimalChampion({classId,fromLevel,toLevel,stats,hpMethod='fixed',hpRoll=null}){
 if(classId!=='barbarian'||fromLevel!==19||toLevel!==20)throw Error('Первобытный чемпион применяется только при повышении варвара19→20');
 const before=validateCharacterStats(stats),origin=primalChampionOrigin({str:before.abilities.str,con:before.abilities.con});
 const after={...before,abilities:{...before.abilities,...origin.after}},plan=previewClassLevel({classId,fromLevel,toLevel,constitution:after.abilities.con,previousConstitution:before.abilities.con,hpMethod,hpRoll});
 if(classProgression(classId,toLevel).progression.rages!==null)throw Error('Таблица ярости20 требует сверки');
 return {applied:false,origin,characterStats:after,hitPoints:plan.hitPoints,unlimitedRage:{resourceId:'class-barbarian-rage',sourcePage:8,acquiredLevel:20,unlimited:true},limitations:['Текущие и временные хиты не лечить при применении.','КД, инициатива и скорость оставлены без изменений: способ их расчёта не подтверждён.','Не удалять и не переименовывать ручной счётчик ярости без отдельного подтверждения его происхождения.','До атомарной интеграции, защиты переноса и интерфейса этот расчёт не изменяет игру.']};
}
