// One pure projection shared by Node and the browser. D&D 5e 2014 only.
const SkazHealth=(()=>{
 const integer=(n,max)=>Number.isSafeInteger(n)&&n>=0&&n<=max;
 function project(hp,maxHp,tempHp,resource,amount,concentration=resource.concentrationBefore){
  if(!integer(hp,maxHp)||!integer(maxHp,999)||maxHp<1||!integer(tempHp,9999)||!integer(amount,10000)||(!amount&&resource.operation!=='temporary'))throw Error('Неверные значения здоровья');
  if(resource.temporaryBefore!==tempHp)throw Error('Временные хиты изменились. Нужна сверка');
  if(resource.concentrationBefore!==concentration)throw Error('Концентрация изменилась. Нужна сверка');
  const finish=(result,conc=concentration)=>({...result,...(conc!==undefined?{concentration:conc}:{})});
  const operation=resource.operation;
  if(operation==='damage'){const absorbed=Math.min(tempHp,amount);const after=Math.max(0,hp-amount+absorbed);return finish({hp:after,tempHp:tempHp-absorbed},after===0?null:concentration);}
  if(operation==='heal')return finish({hp:Math.min(maxHp,hp+amount),tempHp});
  if(operation==='temporary'){if(amount>9999)throw Error('Не более 9999 временных хитов');return finish({hp,tempHp:amount});}
  if(operation==='restore'&&integer(resource.hpAfter,maxHp)&&integer(resource.tempAfter,9999))return finish({hp:resource.hpAfter,tempHp:resource.tempAfter},resource.concentrationAfter);
  throw Error('Неизвестная операция здоровья');
 }
 const overlaps=(a,b)=>['hp','health'].includes(a.kind)&&['hp','health'].includes(b.kind)||JSON.stringify(a)===JSON.stringify(b);
 return {project,overlaps};
})();
if(typeof module!=='undefined')module.exports=SkazHealth;
