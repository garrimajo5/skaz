// Server-gated integration. Commands and selections exist only in this dialog.
const SkazClassAdvancementShell=(()=>{
 const mounted=new Set(),scope=()=>SkazStorage.advancementScope?.();
 const same=(a,b)=>a&&b&&a.identity===b.identity&&a.viewId===b.viewId&&a.characterId===b.characterId&&a.sessionId===b.sessionId;
 function sweep(){for(const item of mounted)if(!item.root.isConnected||!document.getElementById('dialog')?.open||!same(item.scope,scope()))item.destroy();}
 async function open(){
  const captured=scope();if(!captured)return toast('Повышение сейчас недоступно. Сначала сохрани изменения героя.');
  modal('<h2>Повышение уровня · 2014</h2><div id="class-advancement-host"></div>');
  const root=document.getElementById('class-advancement-host');let closed=false,editor=null,loading=false,refreshOnClose=false,releaseSession;
  const status=document.createElement('p');status.setAttribute('role','status');root.append(status);
  const item={root,scope:captured,destroy(){if(closed)return;closed=true;transport.destroy();editor?.destroy();releaseExit();releaseSession?.();mounted.delete(item);root.replaceChildren();if(refreshOnClose&&same(captured,scope()))void SkazStorage.refreshAfterAdvancement();}};
  const releaseExit=SkazPrivateExit.register(root,()=>editor?.pending||loading);mounted.add(item);releaseSession=SkazPersonalArtSession.register(item.destroy);
  const transport=SkazClassAdvancementTransport.create({scope:captured,isCurrent:()=>!closed&&same(captured,scope())});
  try{
   const info=await transport.classes();if(closed)return;
   if(!info.ready){status.textContent='Сначала сохрани свой класс, уровень и характеристики на листе героя.';return;}
   status.textContent='Подтверди класс по правилам 2014. Подклассы, черты и мультикласс ещё не автоматизированы; обязательные неподдерживаемые выборы блокируют повышение.';
   const label=document.createElement('label');label.textContent=info.level>=20?'Класс для просмотра':'Класс для повышения';const select=document.createElement('select');label.append(select);root.append(label);
   const empty=document.createElement('option');empty.value='';empty.textContent='Выбери свой класс';select.append(empty);
   for(const c of info.classes){const o=document.createElement('option');o.value=c.slug;o.textContent=c.name.ru;select.append(o);}
   if(info.classId){select.value=info.classId;select.disabled=true;}
   const confirm=document.createElement('button');confirm.type='button';confirm.textContent=info.level>=20?'Показать умения':'Продолжить с этим классом';root.append(confirm);
   confirm.onclick=async()=>{
    if(loading||closed)return;if(!select.value){status.textContent='Выбери класс перед продолжением.';return;}
    loading=true;confirm.disabled=true;const classId=select.value;
    try{const first=await transport.plan(classId);if(closed)return;root.replaceChildren();let initial=first;
     editor=await SkazClassAdvancement.mount(root,{load:()=>{if(initial){const value=initial;initial=null;return Promise.resolve(value);}return transport.plan(classId);},preview:q=>transport.preview(q),send:(body,kind)=>{refreshOnClose=true;return transport.send(body,kind);},onSaved:async()=>{refreshOnClose=false;await SkazStorage.reloadAfterArtTransfer();}});
     if(closed)editor.destroy();
    }catch(e){if(!closed)status.textContent=e.message;}finally{loading=false;if(!closed)confirm.disabled=false;}
   };
  }catch(e){if(!closed)status.textContent=e.message;}
 }
 if(typeof MutationObserver!=='undefined')new MutationObserver(sweep).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['open']});
 document.addEventListener('click',e=>{if(e.target.closest?.('#advance-class'))void open();});
 return {open,sweep};
})();
