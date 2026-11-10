// One immutable user/character/catalog scope. No shared caches or public image URLs.
const SkazPersonalArtTransport=(()=>{
 function create({identity,characterId,catalogId,request=(...args)=>fetch(...args)}){
  if(![identity,characterId,catalogId].every(v=>typeof v==='string'&&v.length))throw Error('Нужна область личного изображения.');
  let closed=false;const controller=new AbortController(),binding={characterId,catalogId};
  const query=new URLSearchParams(binding).toString();
  function check(scope=binding){if(closed)throw Error('Редактор закрыт.');if(scope.characterId!==characterId||scope.catalogId!==catalogId)throw Error('Область изображения изменилась.');}
  async function call(route,options={}){
   check();const response=await request('/api/personal-art/'+route,{...options,cache:'no-store',credentials:'same-origin',redirect:'error',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)]),headers:{'X-Skaz-Identity':identity,'X-Skaz-Client':'local-v1',...(options.body?{'Content-Type':'application/json'}:{})}});check();return response;
  }
  async function json(response){
   const data=await response.json();check();
   if(!response.ok)throw Object.assign(Error(data.error||'Не удалось выполнить действие с изображением.'),{status:response.status});
   return data;
  }
  async function history(scope){
   check(scope);const {entries}=await json(await call('history?'+query));
   if(!Array.isArray(entries)||entries.length>1000||entries.some((e,i)=>!Number.isSafeInteger(e.revision)||e.revision<1||typeof e.standard!=='boolean'||i>0&&e.revision>=entries[i-1].revision))throw Error('Неверная история изображения.');
   return entries;
  }
  return {
   history,
   async usage(scope){
    check(scope);const data=await json(await call('usage?'+new URLSearchParams({characterId})));
    if(!['bytes','versions','bindings'].every(key=>Number.isSafeInteger(data[key])&&data[key]>=0&&Number.isSafeInteger(data.limits?.[key])&&data.limits[key]>0)||data.retentionDays!==30)throw Error('Не удалось проверить квоту изображений.');
    return data;
   },
   async cleanup(scope){check(scope);return json(await call('cleanup',{method:'POST',body:JSON.stringify(binding)}));},
   async change(body){
    const command=JSON.parse(body);check(command);
    return json(await call('change',{method:'POST',body}));
   },
   async snapshot(scope){
    const entries=await history(scope),current=entries[0]||{revision:0,standard:true};
    const response=await call('image?'+query);
    if(current.standard&&response.status===404){
     // A missing image can also mean access was revoked after the first read.
     const again=(await history(scope))[0]||{revision:0,standard:true};
     if(again.revision!==current.revision||!again.standard)throw Error('Изображение изменилось во время чтения. Повтори сверку.');
     return {...current,blob:null};
    }
    if(!response.ok){await json(response);throw Error('Изображение недоступно.');}
    const raw=response.headers.get('X-Skaz-Art-Revision');
    if(current.standard||raw!==String(current.revision)||response.headers.get('Content-Type')?.split(';')[0]!=='image/png')throw Error('Изображение изменилось во время чтения. Повтори сверку.');
    const blob=await response.blob();check();
    if(!blob.size||blob.size>4*1024*1024)throw Error('Неверный размер изображения.');
    return {...current,blob};
   },
   destroy(){closed=true;controller.abort();}
  };
 }
 return {create};
})();
