import {bundledCatalog} from './bundled-catalog.mjs';
import {validateCatalog} from './catalog.mjs';
let cache;
export function initialRitualOptions(){
 cache??=validateCatalog(bundledCatalog().bundle).filter(e=>e.kind==='spell'&&e.spell.level===1&&e.spell.ritual===true).map(e=>({id:e.id,name:e.name}));
 return structuredClone(cache);
}
export function validateInitialRituals(ids){
 const allowed=new Set(initialRitualOptions().map(o=>o.id));
 if(!Array.isArray(ids)||ids.length!==2||new Set(ids).size!==2||ids.some(id=>!allowed.has(id)))throw new Error('Книга древних тайн требует два разных ритуала первого круга');
 return [...ids];
}
