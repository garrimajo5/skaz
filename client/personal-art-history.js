// Prepared editor controls; caller supplies a scoped, authenticated transport.
const SkazPersonalArtHistory=(()=>{
 function create(container,{load,onReset,onRestore,onRetry,onReconcile,loadUsage,onCleanup}){
  let closed=false,busy=false;
  const root=document.createElement('section'),status=document.createElement('p'),list=document.createElement('div');
  status.setAttribute('role','status');
  const title=document.createElement('h2');title.textContent='История личного изображения';root.append(title);
  const note=document.createElement('p');note.textContent='Только для этого пользователя и персонажа. Предыдущие версии хранятся минимум 30 дней после замены.';root.append(note);
  const buttons=[];
  const usage=document.createElement('p');usage.setAttribute('role','status');if(loadUsage)root.append(usage);
  async function act(fn,scroll=true){
   if(busy||closed)return;busy=true;buttons.forEach(b=>b.disabled=true);
   try{await fn();if(!closed)status.textContent='Готово.';}
   catch(error){if(!closed)status.textContent=error.message||'Не удалось выполнить действие.';}
   finally{busy=false;if(!closed){buttons.forEach(b=>b.disabled=false);if(scroll)status.scrollIntoView({block:'nearest'});}}
  }
  function button(parent,text,fn){const b=document.createElement('button');b.type='button';b.textContent=text;b.style.cssText='min-height:44px;margin:4px;white-space:normal';b.addEventListener('click',()=>act(fn));buttons.push(b);parent.append(b);}
  async function refresh(){
   usage.textContent='';
   if(loadUsage){const value=await loadUsage();if(closed)return;usage.textContent=`Твои изображения и история всех персонажей: ${(value.bytes/1048576).toFixed(2)} из ${(value.limits.bytes/1048576).toFixed(0)} МиБ; версий ${value.versions}/${value.limits.versions}, привязок ${value.bindings}/${value.limits.bindings}. Очистка относится только к этой карточке и удаляет лишь версии, заменённые более 30 дней назад. Текущее изображение сохраняется.`;}
   const entries=await load();if(closed)return;
   while(list.firstChild){const child=list.firstChild;const index=buttons.indexOf(child);if(index>=0)buttons.splice(index,1);child.remove();}
   for(const entry of entries)button(list,`Восстановить версию ${entry.revision}${entry.standard?' (стандартное)':''}`,async()=>{await onRestore(entry.revision);await refresh();});
   if(!entries.length){const empty=document.createElement('p');empty.textContent='История пока пуста.';list.append(empty);}
  }
  button(root,'Повторить предыдущую команду',async()=>{await onRetry();await refresh();});
  button(root,'Вернуть стандартное изображение',async()=>{await onReset();await refresh();});
  button(root,'Обновить историю',refresh);
  if(onCleanup)button(root,'Очистить истёкшую историю этой карточки',async()=>{await onCleanup();await refresh();});
  button(root,'Сверить состояние и отказаться от ожидающего повтора',async()=>{await onReconcile();await refresh();});
  root.append(list,status);container.append(root);
  return {refresh:()=>act(refresh,false),destroy(){closed=true;root.remove();}};
 }
 return {create};
})();
