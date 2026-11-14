import {previewClassLevel,classProgression} from './class-progression.mjs';

const rules={fighter:{level:1,page:24,styles:['archery','defense','dueling','great-weapon-fighting','protection','two-weapon-fighting']},paladin:{level:2,page:31,styles:['defense','dueling','great-weapon-fighting','protection']},ranger:{level:2,page:36,styles:['archery','defense','dueling','two-weapon-fighting']}};
// Stable origin records are separate from translated presentation text.
const descriptions={
 archery:{name:'Стрельба',text:'Бонус +2 к броскам атаки дальнобойным оружием.'},
 defense:{name:'Оборона',text:'Пока ты носишь доспех, КД увеличивается на 1.'},
 dueling:{name:'Дуэлянт',text:'Когда держишь рукопашное оружие в одной руке и не держишь другого оружия, получаешь +2 к броскам урона этим оружием.'},
 'great-weapon-fighting':{name:'Сражение большим оружием',text:'При атаке рукопашным оружием, которое держишь двумя руками, можно один раз перебросить 1 или 2 на кости урона и использовать новый результат. Оружие должно иметь свойство «двуручное» или «универсальное».'},
 protection:{name:'Защита',text:'Когда видимое существо атакует другую цель в пределах 5 футов от тебя, можно реакцией дать помеху этой атаке. Для этого нужен щит.'},
 'two-weapon-fighting':{name:'Сражение двумя оружиями',text:'При сражении двумя оружиями можно добавить модификатор характеристики к урону второй атаки.'}
};
export function fightingStyleDescription(id){const value=Object.hasOwn(descriptions,id)?descriptions[id]:null;if(!value)throw new Error('Неизвестный боевой стиль');return {...value};}
export function fightingStyleOptions(classId,{knownStyles=[]}={}){
 classProgression(classId,1);
 if(!Array.isArray(knownStyles)||knownStyles.some(x=>typeof x!=='string')||new Set(knownStyles).size!==knownStyles.length)throw new Error('Неверный список прежних боевых стилей');
 const all=new Set(Object.values(rules).flatMap(r=>r.styles));
 if(knownStyles.some(x=>!all.has(x)))throw new Error('Неизвестный прежний боевой стиль');
 const rule=rules[classId];if(!rule)return [];
 return rule.styles.filter(id=>!knownStyles.includes(id)).map(id=>({id,ruleset:'5e-2014',classId,sourcePage:rule.page,acquiredLevel:rule.level}));
}
export function validateFightingStyleChoice(plan,choiceId,selected,{knownStyles=[]}={}){
 const authoritative=previewClassLevel({classId:plan.classId,fromLevel:plan.fromLevel,toLevel:plan.toLevel,constitution:10});
 const choice=authoritative.choices.find(c=>c.kind==='fighting-style'&&c.id===choiceId);
 if(!choice)throw new Error('На этом уровне класса нет выбора боевого стиля');
 if(!Array.isArray(selected)||selected.length!==1)throw new Error('Выбери ровно один боевой стиль');
 const option=fightingStyleOptions(plan.classId,{knownStyles}).find(o=>o.id===selected[0]);
 if(!option)throw new Error('Боевой стиль недоступен этому классу или уже выбран');
 return {...option,choiceId:choice.id};
}
