// One calculation for the charge form, resource queue, server and transfer.
const SkazItemCharges = (() => {
 const technicalMaximum=10000;
 const validCount=value=>Number.isSafeInteger(value)&&value>=0&&value<=technicalMaximum;
 const maximum=entry=>(entry?.item||entry?.artifact)?.charges?.max;
 const validMaximum=value=>validCount(value)&&value>0;
 const operations=['set','unknown','spend','recover'];
 function validAmount(operation,amount){
  return operations.includes(operation)&&(operation==='unknown'?amount===null:validCount(amount)&&(operation==='set'||amount>0));
 }
 function balance(item,unit){
  const limit=maximum(item?.entry);
  if(!validMaximum(limit)||!Number.isSafeInteger(unit)||unit<0||unit>=item?.quantity)return null;
  return {value:item.chargeCounts?.[unit]??null,maximum:limit};
 }
 function project(current,operation,amount,{restore=false}={}){
  if(!current||!validMaximum(current.maximum)||current.value!==null&&!validCount(current.value))return {error:'balance'};
  if(!validAmount(operation,amount))return {error:'amount'};
  if(['spend','recover'].includes(operation)&&current.value===null)return {error:'unknown'};
  const next=operation==='unknown'?null:operation==='set'?amount:current.value+(operation==='spend'?-amount:amount);
  if(next!==null&&!validCount(next))return {error:'bounds'};
  if(operation==='recover'&&next>current.maximum&&!restore)return {error:'manual'};
  return {next,warning:next>current.maximum?{actual:next,maximum:current.maximum}:null};
 }
 const validNote=text=>typeof text==='string'&&text.length<=500&&text===text.trim();
 function validAgreement(row){
  return row&&typeof row==='object'&&!Array.isArray(row)&&Object.keys(row).length===4&&
   Number.isSafeInteger(row.unit)&&row.unit>=0&&row.unit<999&&validCount(row.actual)&&validMaximum(row.maximum)&&
   row.actual>row.maximum&&validNote(row.note);
 }
 function agreementFor(item,unit,value){
  const current=balance(item,unit);
  if(!current)return null;
  const row=item.chargeAgreements?.find(record=>record.unit===unit);
  const actual=value===undefined?current.value:value;
  return validAgreement(row)&&row.actual===actual&&row.maximum===current.maximum?row:null;
 }
 function adjust(item,unit,result,note){
  const previous=balance(item,unit),counts=item.chargeCounts?.slice()||Array(item.quantity).fill(null);
  counts[unit]=result.next;
  const agreements=(item.chargeAgreements||[]).filter(row=>row.unit!==unit);
  if(result.warning){
   const row=note===undefined&&previous.value===result.next?agreementFor(item,unit):null;
   if(typeof note==='string')agreements.push({unit,...result.warning,note});
   else if(row)agreements.push(row);
  }
  agreements.sort((a,b)=>a.unit-b.unit);
  return {counts,agreements};
 }
 return {technicalMaximum,validCount,maximum,validMaximum,validAmount,balance,project,validNote,validAgreement,agreementFor,adjust};
})();
if(typeof module!=='undefined')module.exports=SkazItemCharges;
