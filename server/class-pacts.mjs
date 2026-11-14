import {readFileSync} from 'node:fs';
import {previewClassLevel} from './class-progression.mjs';
const lists=JSON.parse(readFileSync(new URL('../catalog/srd51-class-spells.json',import.meta.url),'utf8')).classes;
const cantrips=[...new Map(Object.values(lists).flat().filter(s=>s.level===0).map(s=>[s.spellId,s])).values()];
export const FIND_FAMILIAR_ID='srd51:2014:spell:find-familiar';
export function pactCantripOptions(){return cantrips.map(s=>({...s}));}
export function pactOptions(){return [
 {id:'blade',name:'Договор клинка',supported:true,sourcePage:47,text:'Выбор сохраняется. Создание и связывание оружия, его форма и боевые эффекты учитываются вручную; мастер не создаёт оружие в инвентаре.'},
 {id:'chain',name:'Договор цепи',supported:true,sourcePage:47,text:'Поиск фамильяра добавляется в личную книгу вне обычного числа известных заклинаний. Ритуальное применение, выбор формы и управление фамильяром остаются ручными.'},
 {id:'tome',name:'Договор гримуара',supported:true,sourcePage:48,text:'Выбери три разных заговора из любых классов. Они добавятся в личную книгу вне обычного числа известных заговоров и считаются заклинаниями колдуна. Для применения нужна Книга теней; её наличие и восстановление учитываются вручную.'}
];}
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
export function validatePactChoice(plan,selected){
 const actual=previewClassLevel({...plan,constitution:10});
 if(plan.classId!=='warlock'||!actual.choices.some(c=>c.kind==='pact-boon'))throw new Error('На этом уровне нет выбора дара договора');
 if(!exact(selected,['id','cantrips'])||!pactOptions().some(o=>o.id===selected.id)||!Array.isArray(selected.cantrips))throw new Error('Выбери дар договора и его дополнительные варианты');
 if(selected.id==='tome'){
  if(selected.cantrips.length!==3||new Set(selected.cantrips).size!==3||selected.cantrips.some(id=>!cantrips.some(o=>o.spellId===id)))throw new Error('Для Гримуара выбери три разных заговора из проверенных списков классов');
 }else if(selected.cantrips.length)throw new Error('Заговоры Гримуара не относятся к этому договору');
 return {id:selected.id,ruleset:'5e-2014',classId:'warlock',acquiredLevel:3,sourcePage:selected.id==='tome'?48:47,choiceId:'warlock:3:pact-boon',spells:selected.id==='tome'?[...selected.cantrips]:selected.id==='chain'?[FIND_FAMILIAR_ID]:[]};
}
export function validatePactOrigin(value,level){
 if(level<3){if(value!==null)throw new Error('Дар договора недоступен до третьего уровня');return null;}
 const expected=validatePactChoice({classId:'warlock',fromLevel:2,toLevel:3},{id:value?.id,cantrips:value?.id==='tome'?value.spells:[]});
 if(!exact(value,Object.keys(expected))||Object.entries(expected).some(([k,v])=>Array.isArray(v)?!Array.isArray(value[k])||value[k].length!==v.length||v.some((id,i)=>value[k][i]!==id):value[k]!==v))throw new Error('Неверное происхождение дара договора');
 return structuredClone(expected);
}
