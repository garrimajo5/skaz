// Prepared composite editor. Transport is scoped by the caller; no shared cache.
const SkazPersonalArtEditor=(()=>{
 function create(container,{characterId,catalogId,transport,label}){
  if(typeof SkazPersonalArtSession!=='undefined')SkazPersonalArtSession.assertOpen();
  const binding=Object.freeze({characterId,catalogId});
  let closed=false,busy=false,ready=false,revision=0,imageUrl=null;
  const root=document.createElement('fieldset');root.style.cssText='min-width:0;border:0;padding:0';
  const current=document.createElement('div'),picture=document.createElement('img'),caption=document.createElement('p');
  picture.alt='Сохранённое личное изображение';picture.width=picture.height=96;picture.hidden=true;current.append(picture,caption);root.append(current);container.append(root);
  const commands=SkazPersonalArtCommand.create({send:body=>transport.change(body)});
  function release(){if(imageUrl)URL.revokeObjectURL(imageUrl);imageUrl=null;picture.removeAttribute('src');picture.hidden=true;}
  function check(){if(closed)throw Error('Редактор закрыт.');}
  async function snapshot(){
   const state=await transport.snapshot(binding);check();
   if(!Number.isSafeInteger(state.revision)||state.revision<0||typeof state.standard!=='boolean'||(!state.standard&&!(state.blob instanceof Blob)))throw Error('Не удалось проверить сохранённое изображение.');
   release();
   if(!state.standard){imageUrl=URL.createObjectURL(state.blob);picture.src=imageUrl;picture.hidden=false;}
   caption.textContent=`Сохранённая версия ${state.revision}: ${state.standard?'стандартное изображение':'личное изображение'}.`;
   return state;
  }
  async function exclusive(fn){
   check();if(busy)throw Error('Дождись завершения операции с изображением.');
   busy=true;root.disabled=true;
   try{return await fn();}
   catch(error){if(!closed){release();ready=false;preview.setStatus?.('');caption.textContent='Сохранённое изображение недоступно. Повтори команду или сверь состояние.';}throw error;}
   finally{busy=false;if(!closed)root.disabled=false;}
  }
  async function applied(result){
   check();if(!Number.isSafeInteger(result.revision)||result.revision<revision)throw Error('Неверная ревизия сохранения.');
   revision=result.revision;
   await snapshot();
   ready=true;
   preview.setStatus?.('Сохранённое изображение обновлено. Выбранный файл и кадр остаются черновиком до следующего сохранения.');
  }
  async function change(operation){
   if(!ready)throw Error('Сначала сверь состояние с сервером.');
   await applied(await commands.submit({...binding,...operation,expectedRevision:revision}));
  }
  const preview=SkazPersonalArtPreview.create(root,{label,onSave:input=>exclusive(async()=>{
   const png=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=()=>reject(Error('Не удалось прочитать файл.'));reader.readAsDataURL(new Blob([input.bytes],{type:'image/png'}));});
   check();await change({action:'set',png,crop:input.crop});
  }).then(()=>history.refresh?.())});
  const history=SkazPersonalArtHistory.create(root,{
   ...(transport.usage?{loadUsage:()=>exclusive(()=>transport.usage(binding))}:{}),
   ...(transport.cleanup?{onCleanup:()=>exclusive(async()=>{if(!ready)throw Error('Сначала сверь состояние с сервером.');await transport.cleanup(binding);await snapshot();})}:{}),
   load:async()=>{check();try{const entries=await transport.history(binding);check();return entries;}catch(error){if(!closed){release();ready=false;preview.setStatus?.('');caption.textContent='Не удалось проверить доступ к изображению.';}throw error;}},
   onReset:()=>exclusive(()=>change({action:'reset'})),
   onRestore:targetRevision=>exclusive(()=>change({action:'restore',targetRevision})),
   onRetry:()=>exclusive(async()=>applied(await commands.retry())),
   onReconcile:()=>exclusive(async()=>{const state=await snapshot();commands.reconciled();revision=state.revision;ready=true;preview.setStatus?.('Состояние сверено. Выбранный файл и кадр ещё не отправлены.');})
  });
  const initialized=exclusive(async()=>{try{const state=await snapshot();revision=state.revision;ready=true;}catch(error){if(!closed)caption.textContent=error.message;}}).then(()=>{if(ready&&!closed)return history.refresh?.();});
  let unregister;
  function destroy(){if(closed)return;closed=true;unregister?.();for(const dispose of [()=>commands.destroy(),()=>transport.destroy?.(),()=>preview.destroy(),()=>history.destroy(),release,()=>root.remove()])try{dispose();}catch{}}
  if(typeof SkazPersonalArtSession!=='undefined')unregister=SkazPersonalArtSession.register(destroy);
  return {initialized,destroy};
 }
 return {create};
})();
