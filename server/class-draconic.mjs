import {isDeepStrictEqual} from 'node:util';
import {readFileSync} from 'node:fs';
const data=JSON.parse(readFileSync(new URL('../catalog/srd51-subclass-reference.json',import.meta.url),'utf8'));
const dragons=data.subclasses.find(s=>s.id==='sorcerer-draconic').ancestorOptions;
export const draconicAncestors=()=>structuredClone(dragons);
export function confirmDraconic(value){
 const keys=['id','ancestorId','rulesConfirmed','baselineHpConfirmed'];
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k))||value.id!=='sorcerer-draconic'||value.rulesConfirmed!==true||value.baselineHpConfirmed!==true)throw Error('Подтверди прежнее наследие, предка и уже учтённый +1 к максимуму хитов первого уровня');
 const ancestor=draconicAncestors().find(o=>o.id===value.ancestorId);if(!ancestor)throw Error('Выбери одного драконьего предка SRD');
 return {id:'sorcerer-draconic',classId:'sorcerer',ruleset:'5e-2014',acquiredLevel:null,confirmedAt:2,rulesLevel:1,sourcePage:44,choiceId:'sorcerer:2:confirm-draconic',ancestor:{id:ancestor.id,damageType:ancestor.damageType,sourcePage:ancestor.sourcePage},baselineHpConfirmed:true,hpManagedFromLevel:2};
}
export function validateDraconic(origin,{classId,baselineLevel,level}){
 if(classId!=='sorcerer'||baselineLevel!==1||level<2||!isDeepStrictEqual(origin,confirmDraconic({id:origin?.id,ancestorId:origin?.ancestor?.id,rulesConfirmed:true,baselineHpConfirmed:origin?.baselineHpConfirmed})))throw Error('Неверное происхождение драконьего наследия');return structuredClone(origin);
}
