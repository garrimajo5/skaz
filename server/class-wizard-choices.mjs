import {readFileSync} from 'node:fs';
import {isDeepStrictEqual} from 'node:util';
import {bundledCatalog} from './bundled-catalog.mjs';
import {validateCatalog} from './catalog.mjs';
const wizardIds=new Set(JSON.parse(readFileSync(new URL('../catalog/srd51-class-spells.json',import.meta.url),'utf8')).classes.wizard.map(s=>s.spellId));
const rules={mastery:{level:18,page:53,circles:[1,2]},signature:{level:20,page:54,circles:[3,3]}};
let sources;const spells=()=>sources??=new Map(validateCatalog(bundledCatalog().bundle).filter(e=>e.kind==='spell').map(e=>[e.id,e]));
function ruleFor(kind){if(!Object.hasOwn(rules,kind))throw new Error('Неизвестный выбор волшебника');return rules[kind];}
export function wizardAdvancedOptions(kind,spellbook){
 const rule=ruleFor(kind);
 if(!Array.isArray(spellbook)||spellbook.length>1000)throw new Error('Нужна личная книга волшебника');
 const seen=new Set(),options=[];
 for(const row of spellbook){
  if(!row||typeof row.catalogId!=='string'||seen.has(row.catalogId)||!['known','prepared'].includes(row.status))throw new Error('Повторная или неверная запись книги');seen.add(row.catalogId);
  const source=spells().get(row.catalogId);if(!source||!wizardIds.has(row.catalogId)||!rule.circles.includes(source.spell.level))continue;
  if(!isDeepStrictEqual(row.entry,source))throw new Error('Карточка выбранного круга не совпадает с проверенным источником 2014');
  options.push({id:row.catalogId,name:structuredClone(source.name),circle:source.spell.level});
 }
 return options;
}
// Pure validated choice, not a command and not permission for a free cast.
export function validateWizardAdvancedChoice({kind,classId,level,selected,spellbook}){
 const rule=ruleFor(kind);if(classId!=='wizard'||level!==rule.level)throw new Error('Выбор недоступен этому классу или уровню');
 if(!Array.isArray(selected)||selected.length!==2||new Set(selected).size!==2)throw new Error('Выбери два разных заклинания из личной книги');
 const options=wizardAdvancedOptions(kind,spellbook),picked=selected.map(id=>options.find(o=>o.id===id));
 if(picked.some(o=>!o)||picked.map(o=>o.circle).sort().join(',')!==rule.circles.join(','))throw new Error(kind==='mastery'?'Нужны одно заклинание первого круга и одно второго':'Нужны два заклинания третьего круга');
 return {classId:'wizard',ruleset:'5e-2014',kind,acquiredLevel:rule.level,sourcePage:rule.page,spellIds:[...selected].sort(),applied:false};
}

export function wizardChoiceOrigin(selection){
 if(selection.kind!=='mastery')throw new Error('Сохранение Фирменных заклинаний пока не подключено');
 const checked=validateWizardAdvancedChoice(selection);const {applied,...origin}=checked;return {...origin,choiceId:'wizard:'+checked.acquiredLevel+':spell-mastery'};
}
export function validateWizardMasteryOrigin(value){
 if(!value||!Array.isArray(value.spellIds))throw new Error('Нужно происхождение Мастерства заклинаний');
 const book=value.spellIds.map(catalogId=>({catalogId,status:'known',entry:spells().get(catalogId)}));
 const expected=wizardChoiceOrigin({kind:'mastery',classId:'wizard',level:18,selected:value.spellIds,spellbook:book});
 if(!isDeepStrictEqual(value,expected))throw new Error('Происхождение Мастерства не совпадает с проверенными правилами');return structuredClone(expected);
}
export function wizardSpellSource(id){const entry=spells().get(id);return entry?structuredClone(entry):null;}
