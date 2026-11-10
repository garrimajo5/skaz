// One editor/session only. Never persist personal PNGs in shared browser storage.
const SkazPersonalArtCommand=(()=>{
 function create({send,newId=()=>crypto.randomUUID()}){
  let pending=null,running=false,closed=false;
  function ready(){
   if(closed)throw Error('Редактор закрыт.');
   if(running)throw Error('Дождись завершения сохранения.');
  }
  async function retry(){
   ready();
   if(!pending)throw Error('Нет команды для повтора.');
   running=true;
   try{
    const result=await send(pending.body);
    if(closed)throw Error('Редактор закрыт.');
    pending=null;return result;
   }finally{running=false;}
  }
  return {
   async submit(command){
    ready();
    const payload=JSON.stringify(command);
    if(pending&&pending.payload!==payload)throw Error('Сначала повтори предыдущую команду или сверь состояние с сервером.');
    if(!pending)pending={payload,body:JSON.stringify({...JSON.parse(payload),mutationId:newId()})};
    return retry();
   },
   // Retry the captured command even if the editor's draft has since changed.
   retry,
   // Call only after explicit reconciliation; errors alone never discard a command.
   reconciled(){if(closed)throw Error('Редактор закрыт.');if(running)throw Error('Сохранение ещё выполняется.');pending=null;},
   destroy(){closed=true;pending=null;}
  };
 }
 return {create};
})();
