import {isDeepStrictEqual} from 'node:util';
export const WILD_SHAPE='class-druid-wild-shape';
export const wildShapeUnlimited=()=>({resourceId:WILD_SHAPE,counterId:WILD_SHAPE,acquiredLevel:20,sourcePage:21});
export function validateUnlimitedOrigin(ledger){if(ledger.version!==12||ledger.classId!=='druid'||ledger.subclass?.id!=='druid-land'||ledger.level!==20||!isDeepStrictEqual(ledger.unlimitedResources,[wildShapeUnlimited()])||!ledger.resources.some(r=>r.resourceId===WILD_SHAPE&&r.counterId===WILD_SHAPE&&r.origin==='level'&&r.managedFromLevel===2))throw Error('Неверное происхождение неограниченного Дикого облика');return ledger.unlimitedResources;}
export function validateUnlimitedSheet(ledger,sheet){validateUnlimitedOrigin(ledger);if(sheet.counters.some(c=>c.id===WILD_SHAPE||c.name.toLocaleLowerCase('ru')==='дикий облик'))throw Error('Неограниченный Дикий облик не должен иметь конечный счётчик');}
export function unlimitedResourceViews(ledger){return ledger?.version===12?validateUnlimitedOrigin(ledger).map(o=>({...o,name:'Дикий облик',unlimited:true})):[];}
