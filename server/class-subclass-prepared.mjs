import {isDeepStrictEqual} from 'node:util';
import {previewSubclassSpells} from './class-subclass-spells.mjs';
import {bundledCatalog} from './bundled-catalog.mjs';import {validateCatalog} from './catalog.mjs';
let sources;const spells=()=>sources??=new Map(validateCatalog(bundledCatalog().bundle).filter(e=>e.kind==='spell').map(e=>[e.id,e]));
export function subclassPreparedSource(id){return structuredClone(spells().get(id));}
export function subclassPreparedOrigins(classId,subclassId,level){
 if(classId!=='paladin'||subclassId!=='paladin-devotion')throw Error('Постоянная подготовка этого подкласса ещё не подключена');
 return previewSubclassSpells({classId,subclassId,level}).alwaysPrepared.map(origin=>({...origin,acquiredLevel:origin.threshold}));
}
export function validateSubclassPreparedOrigins(origins,{classId,subclass,level}){
 const expected=subclassPreparedOrigins(classId,subclass?.id,level);if(!isDeepStrictEqual(origins,expected))throw Error('Происхождение постоянно подготовленных заклинаний не соответствует таблице');return expected;
}
export function validateSubclassPreparedBook(origins,book,lookup){
 for(const origin of origins){const row=book?.find(o=>o.catalogId===origin.catalogId),expected=spells().get(origin.catalogId);if(!row||row.status!=='prepared'||!expected)throw Error('Отсутствует постоянно подготовленное заклинание класса');if(row.entry&&!isDeepStrictEqual(row.entry,expected)||lookup&&!isDeepStrictEqual(lookup(origin.catalogId),expected)||!row.entry&&!lookup)throw Error('Источник постоянно подготовленного заклинания изменён');}
}

export function alwaysPreparedOrigins(ledger){
 if(ledger?.version===8)return ledger.subclassSpells;
 if(ledger?.version===9)return ledger.wizardChoices[1].spellIds.map(catalogId=>({catalogId}));
 return [];
}
