// One editor/session only. Never persist personal PNGs in shared browser storage.
const SkazPersonalArtCommand=(()=>{
 function create({send,newId=()=>crypto.randomUUID()}){
  let pending=null,running=false,closed=false;
  return {
   async submit(command){
    if(closed)throw Error('Редактор закрыт.');
    if(running)throw Error('Дождись завершения сохранения.');
    const payload=JSON.stringify(command);
    if(pending&&pending.payload!==payload)throw Error('Сначала повтори предыдущую команду или сверь состояние с сервером.');
    if(!pending)pending={payload,body:JSON.stringify({...JSON.parse(payload),mutationId:newId()})};
    running=true;
    try{
     const result=await send(pending.body);
     if(closed)throw Error('Редактор закрыт.');
     pending=null;return result;
    }finally{running=false;}
   },
   // Call only after explicit reconciliation; errors alone never discard a command.
   reconciled(){if(running)throw Error('Сохранение ещё выполняется.');pending=null;},
   destroy(){closed=true;pending=null;}
  };
 }
 return {create};
})();
