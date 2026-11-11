// Pending private operations stay in RAM; warn before leaving their visible UI.
const SkazPrivateExit=(()=>{
 const entries=new Set();
 function active(){return [...entries].filter(e=>e.root.isConnected&&e.pending());}
 function permit(target){const list=active().filter(e=>!target||!e.root.contains(target));if(!list.length)return true;return confirm('Ответ на личную операцию ещё не подтверждён. Она могла сохраниться на сервере. Закрытие удалит данные точного повтора из памяти. Остаться и повторить безопаснее. Всё равно закрыть?');}
 function register(root,pending){const item={root,pending};entries.add(item);return ()=>entries.delete(item);}
 if(typeof document!=='undefined'){
  document.addEventListener('click',event=>{if(!permit(event.target)){event.preventDefault();event.stopImmediatePropagation();}},true);
  document.addEventListener('cancel',event=>{if(!permit(null))event.preventDefault();},true);
 }
 if(typeof window!=='undefined')window.addEventListener('beforeunload',event=>{if(active().length){event.preventDefault();event.returnValue='';}});
 return {register};
})();
