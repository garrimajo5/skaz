import {readFileSync} from 'node:fs';
const reference=JSON.parse(readFileSync(new URL('../catalog/srd51-subclass-reference.json',import.meta.url),'utf8')).subclasses.find(s=>s.id==='ranger-hunter');
const definitions=[
 {level:3,key:'hunter-prey',options:[['colossus-slayer','Убийца колоссов','Раз в ход попадание атакой оружием наносит дополнительно 1к8 урона, если хиты цели ниже максимума.'],['giant-killer','Убийца великанов','Когда видимое Большое или более крупное существо в пределах 5 футов попадает или промахивается по тебе атакой, можно реакцией атаковать его сразу после этой атаки.'],['horde-breaker','Сокрушитель орд','Раз в каждый свой ход при атаке оружием можно атаковать тем же оружием другую цель в пределах 5 футов от первой и в пределах досягаемости оружия.']]},
 {level:7,key:'defensive-tactics',options:[['escape-the-horde','Уход от орды','Провоцированные атаки по тебе совершаются с помехой.'],['multiattack-defense','Защита от мультиатаки','После попадания существа по тебе получаешь +4 к КД против последующих атак этого существа до конца текущего хода.'],['steel-will','Стальная воля','Преимущество на спасброски от испуга.']]},
 {level:11,key:'multiattack',options:[['volley','Залп','Действием совершай дальнобойную атаку по любому числу существ в пределах 10 футов от видимой точки в пределах дальности оружия. Для каждой цели нужны отдельный боеприпас и отдельный бросок атаки.'],['whirlwind-attack','Вихревая атака','Действием совершай рукопашную атаку по любому числу существ в пределах 5 футов. Для каждой цели нужен отдельный бросок атаки.']]},
 {level:15,key:'superior-hunter-defense',options:[['evasion','Увёртливость','Если эффект позволяет спасброском Ловкости уменьшить урон вдвое, при успехе урона нет, при провале он вдвое меньше.'],['stand-against-the-tide','Отпор','Когда враждебное существо промахивается по тебе рукопашной атакой, можно реакцией заставить его повторить эту атаку по другому выбранному существу, кроме самого атакующего.'],['uncanny-dodge','Невероятное уклонение','Когда видимый атакующий попадает по тебе атакой, можно реакцией уменьшить урон этой атаки по тебе вдвое.']]}
];
const groups=definitions.map(g=>({...g,name:reference.features.find(f=>f.level===g.level).name,sourcePage:38,choiceId:'ranger:'+g.level+':'+g.key,options:g.options.map(([id,name,text])=>({id,name,text}))}));
export function hunterChoices(level){if(!Number.isSafeInteger(level)||level<1||level>20)throw new Error('Неверный уровень следопыта');return structuredClone(groups.filter(g=>g.level<=level));}
export function hunterChoiceAt(level){return hunterChoices(level).find(g=>g.level===level)||null;}
export function validateHunterSelection(level,id){
 const group=hunterChoiceAt(level);if(!group||!group.options.some(o=>o.id===id))throw new Error('Выбери ровно одно доступное умение Охотника для этого уровня');
 return {id,acquiredLevel:level,choiceId:group.choiceId,sourcePage:group.sourcePage};
}
export function validateHunterHistory(records,level){
 const required=hunterChoices(level);
 if(!Array.isArray(records)||records.length!==required.length)throw new Error('Неполная история обязательных выборов Охотника');
 for(const [index,group]of required.entries()){
  const value=records[index],expected=validateHunterSelection(group.level,value?.id);
  if(!value||Object.keys(value).length!==Object.keys(expected).length||Object.entries(expected).some(([k,v])=>value[k]!==v))throw new Error('Неверное происхождение умения Охотника');
 }
 return structuredClone(records);
}
