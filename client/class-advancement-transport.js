// Authenticated dialog transport. No command is persisted outside RAM.
const SkazClassAdvancementTransport=(()=>{
 function create({scope,isCurrent,request=(...args)=>fetch(...args)}){
  const abort=new AbortController();let closed=false;
  function check(){if(closed||!isCurrent())throw Error('Герой, сеанс или права изменились. Открой повышение заново.');}
  async function call(path,body){
   check();const response=await request('/api/class-advancement/'+path,{method:body?'POST':'GET',...(body?{body:typeof body==='string'?body:JSON.stringify(body)}:{}),credentials:'same-origin',cache:'no-store',redirect:'error',signal:AbortSignal.any([abort.signal,AbortSignal.timeout(30000)]),headers:{'X-Skaz-View':scope.viewId,'X-Skaz-Client':'local-v1',...(scope.identity?{'X-Skaz-Identity':scope.identity}:{}),...(body?{'Content-Type':'application/json'}:{})}});
   check();let value;try{value=await response.json();}catch{throw Error('Ответ не удалось прочитать. Сохранение могло завершиться.');}
   check();
   if(!response.ok)throw Object.assign(Error(value.error||'Не удалось выполнить повышение.'),{notApplied:response.status>=400&&response.status<500});
   return value;
  }
  return {
   classes:()=>call('classes'),plan:classId=>call('plan?classId='+encodeURIComponent(classId)),preview:q=>call('preview',q),
   async send(body,kind){
    if(!['advance','bind'].includes(kind))throw Error('Неизвестная операция повышения.');
    const q=JSON.parse(body),value=await call(kind==='bind'?'bind':'apply',body),ledger=value?.advancement;
    const recorded=kind==='bind'?ledger?.binding?.mutationId===q.mutationId:ledger?.events?.some(e=>e.mutationId===q.mutationId&&e.level===q.fromLevel+1);
    if(value?.context?.characterId!==q.characterId||value?.affectedContext?.characterId!==q.characterId||!Number.isSafeInteger(value.revision)||value.revision<=q.expectedRevision||ledger?.classId!==q.classId||!recorded||!Number.isSafeInteger(value?.characterSheet?.level)||!Number.isSafeInteger(value?.state?.maxHp))throw Error('Сервер не подтвердил происхождение изменения. Повтори ту же команду.');
    return value;
   },
   destroy(){closed=true;abort.abort();}
  };
 }
 return {create};
})();
