// One pure projection shared by Node and the browser. D&D 5e 2014 only.
const SkazHealth=(()=>{
 const integer=(n,max)=>Number.isSafeInteger(n)&&n>=0&&n<=max;
 function deathState(hp,value){const d=value===undefined?{successes:0,failures:0,status:hp>0?'alive':'dying'}:value;if(!d||Object.keys(d).sort().join(',')!=='failures,status,successes'||!integer(d.successes,2)||!integer(d.failures,3)||!['alive','dying','stable','dead'].includes(d.status)||hp>0&&(d.status!=='alive'||d.successes||d.failures)||hp===0&&d.status==='alive'||['alive','stable'].includes(d.status)&&(d.successes||d.failures)||d.status==='dying'&&d.failures===3)throw Error('Неверные спасброски от смерти');return {...d};}
 function project(hp,maxHp,tempHp,resource,amount,concentration=resource.concentrationBefore,checks=resource.checksBefore,mutationId,death=resource.deathBefore){
  if(!integer(hp,maxHp)||!integer(maxHp,999)||maxHp<1||!integer(tempHp,9999)||!integer(amount,10000)||(!amount&&resource.operation!=='temporary'))throw Error('Неверные значения здоровья');
  if(resource.temporaryBefore!==tempHp)throw Error('Временные хиты изменились. Нужна сверка');
  if(resource.concentrationBefore!==concentration)throw Error('Концентрация изменилась. Нужна сверка');
  const tracked=Object.hasOwn(resource,'checksBefore'),deathTracked=Object.hasOwn(resource,'deathBefore'),currentDeath=deathState(hp,death);
  if(deathTracked&&JSON.stringify(resource.deathBefore)!==JSON.stringify(currentDeath))throw Error('Спасброски от смерти изменились');
  if(tracked&&JSON.stringify(resource.checksBefore)!==JSON.stringify(checks||[]))throw Error('Вопросы концентрации изменились. Нужна сверка');
  const finish=(result,conc=concentration,nextChecks=checks,nextDeath=currentDeath)=>({...result,...(deathTracked?{deathSaves:result.hp>0?{successes:0,failures:0,status:'alive'}:nextDeath}:{}),...(conc!==undefined?{concentration:conc}:{}),...(tracked?{concentrationChecks:conc===null?[]:nextChecks||[]}:{})});
  const operation=resource.operation;
  if(operation.startsWith('death-')){
   if(!deathTracked||amount!==1||hp!==0||currentDeath.status==='dead'||currentDeath.status==='stable'&&operation!=='death-stabilize')throw Error('Спасбросок сейчас недоступен');
   if(operation==='death-20')return finish({hp:1,tempHp},null,[],{successes:0,failures:0,status:'alive'});
   let d={...currentDeath};if(operation==='death-success'){d.successes++;if(d.successes===3)d={successes:0,failures:0,status:'stable'};}
   else if(operation==='death-failure'||operation==='death-1'){d.failures=Math.min(3,d.failures+(operation==='death-1'?2:1));if(d.failures===3)d.status='dead';}
   else if(operation==='death-stabilize')d={successes:0,failures:0,status:'stable'};else throw Error('Неизвестный спасбросок');
   return finish({hp,tempHp},null,[],d);
  }
  if(deathTracked&&currentDeath.status==='dead'&&operation!=='restore')throw Error('Обычное лечение не воскрешает погибшего');
  if(operation==='pass'||operation==='fail'){
   if(!tracked||amount!==1||!concentration||checks?.[0]?.id!==resource.checkId||checks[0].spell!==concentration)throw Error('Проверка концентрации больше не актуальна');
   return finish({hp,tempHp},operation==='fail'?null:concentration,checks.slice(1));
  }
  if(operation==='damage'||operation==='critical-damage'){const absorbed=Math.min(tempHp,amount);const after=Math.max(0,hp-amount+absorbed);let d=currentDeath;if(deathTracked&&after===0){d=hp>0?{successes:0,failures:0,status:'dying'}:{...currentDeath,status:'dying'};if(hp===0){d.failures=Math.min(3,d.failures+(operation==='critical-damage'?2:1));if(d.failures===3||amount>=maxHp)d.status='dead';}else if(amount-absorbed-hp>=maxHp)d.status='dead';}
   let pending=checks||[];if(tracked&&after>0&&concentration){if(!/^[a-zA-Z0-9-]{8,80}$/.test(mutationId||'')||pending.length>=100)throw Error('Сначала ответь на проверки концентрации');pending=[...pending,{id:mutationId,spell:concentration,damage:amount,dc:Math.max(10,Math.floor(amount/2))}];}return finish({hp:after,tempHp:tempHp-absorbed},after===0?null:concentration,pending,d);}
  if(operation==='heal')return finish({hp:Math.min(maxHp,hp+amount),tempHp});
  if(operation==='temporary'){if(amount>9999)throw Error('Не более 9999 временных хитов');return finish({hp,tempHp:amount});}
  if(operation==='restore'&&integer(resource.hpAfter,maxHp)&&integer(resource.tempAfter,9999))return finish({hp:resource.hpAfter,tempHp:resource.tempAfter},resource.concentrationAfter,resource.checksAfter,deathTracked?deathState(resource.hpAfter,resource.deathAfter):currentDeath);
  throw Error('Неизвестная операция здоровья');
 }
 const overlaps=(a,b)=>['hp','health'].includes(a.kind)&&['hp','health'].includes(b.kind)||JSON.stringify(a)===JSON.stringify(b);
 return {project,overlaps,deathState};
})();
if(typeof module!=='undefined')module.exports=SkazHealth;
