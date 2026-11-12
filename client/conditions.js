// Manual 2014 condition markers; this module does not apply mechanical effects.
const SkazConditions=(()=>{
 const labels=Object.freeze({blinded:'Ослеплён',charmed:'Очарован',deafened:'Оглох',frightened:'Испуган',grappled:'Схвачен',incapacitated:'Недееспособен',invisible:'Невидим',paralyzed:'Парализован',petrified:'Окаменел',poisoned:'Отравлен',prone:'Сбит с ног',restrained:'Опутан',stunned:'Ошеломлён',unconscious:'Без сознания'});
 function validate(value){
  if(value===undefined)return {active:[],exhaustion:0};
  if(!value||Array.isArray(value)||Object.keys(value).sort().join()!=='active,exhaustion'||!Array.isArray(value.active)||value.active.length>14||value.active.some(id=>typeof id!=='string'||!Object.hasOwn(labels,id))||new Set(value.active).size!==value.active.length||!Number.isInteger(value.exhaustion)||value.exhaustion<0||value.exhaustion>6)throw Error('Неверные отметки состояний');
  return {active:[...value.active].sort(),exhaustion:value.exhaustion};
 }
 function names(value){const v=validate(value);return [...v.active.map(id=>labels[id]),...(v.exhaustion?['Истощение '+v.exhaustion]:[])];}
 return {labels,validate,names};
})();
if(typeof module!=='undefined')module.exports=SkazConditions;
