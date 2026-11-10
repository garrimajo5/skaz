// Opt-in bridge from real cards to the private editor. No files in shared caches.
const SkazPersonalArtCards=(()=>{
 const mounted=new Set();
 function scope(){return typeof SkazStorage==='undefined'?null:SkazStorage.personalArtScope?.();}
 function same(a,b){return !!a&&!!b&&a.identity===b.identity&&a.characterId===b.characterId&&a.viewId===b.viewId;}
 function sweep(){for(const item of mounted)if(!item.host.isConnected||!document.getElementById('dialog')?.open||!same(item.scope,scope()))item.destroy();}
 function mount(host,entry){
  const captured=scope();if(!host||!captured||!entry?.id)return null;
  SkazPersonalArtSession.assertOpen();
  const box=document.createElement('section'),button=document.createElement('button'),target=document.createElement('div');
  box.className='personal-art-card-controls';button.type='button';button.textContent='Моё изображение…';box.append(button,target);const art=host.querySelector?.('.skaz-art-card');if(art)art.insertAdjacentElement('afterend',box);else host.append(box);
  let editor=null,closed=false,unregister;
  const item={host:box,scope:captured,destroy(){if(closed)return;closed=true;mounted.delete(item);unregister?.();try{editor?.destroy();}finally{box.remove();}}};
  mounted.add(item);unregister=SkazPersonalArtSession.register(item.destroy);
  button.onclick=()=>{
   if(closed)return;
   if(!same(captured,scope())){item.destroy();return;}
   if(editor){editor.destroy();editor=null;button.textContent='Моё изображение…';return;}
   const transport=SkazPersonalArtTransport.create({...captured,catalogId:entry.id});
   try{editor=SkazPersonalArtEditor.create(target,{...captured,catalogId:entry.id,transport,label:`${entry.name?.ru||'Материал'} · только мой персонаж ${captured.name}`});button.textContent='Закрыть редактор изображения';}
   catch(error){transport.destroy();throw error;}
  };
  return item;
 }
 if(typeof MutationObserver==='function')new MutationObserver(sweep).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['open']});
 if(typeof document.addEventListener==='function')document.addEventListener('skaz-private-scope-change',sweep);
 return {mount,sweep};
})();