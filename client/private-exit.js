// Pending private operations stay in RAM; leaving requires an explicit in-app choice.
const SkazPrivateExit=(()=>{
 const entries=new Set();let prompt=null,replaying=false;
 const active=()=>[...entries].filter(e=>e.root.isConnected&&e.pending());
 function finish(leave){
  const current=prompt;if(!current)return;prompt=null;
  current.dialog.close();current.dialog.remove();
  const valid=current.entries.some(e=>entries.has(e)&&e.root.isConnected);
  if(current.focus?.isConnected)current.focus.focus();
  if(leave&&valid){replaying=true;try{current.resume();}finally{replaying=false;}}
 }
 function ask(list,resume){
  if(prompt)return;
  const dialog=document.createElement('dialog');dialog.className='private-exit-dialog';
  dialog.setAttribute('role','alertdialog');dialog.setAttribute('aria-labelledby','private-exit-title');dialog.setAttribute('aria-describedby','private-exit-description');
  const title=document.createElement('h2');title.id='private-exit-title';title.textContent='Закрыть без подтверждения операции?';
  const description=document.createElement('p');description.id='private-exit-description';description.textContent='Ответ на личную операцию ещё не подтверждён. Она могла сохраниться на сервере. Закрытие удалит данные точного повтора из памяти. Остаться и повторить безопаснее.';
  const actions=document.createElement('div');actions.className='dialog-actions';
  const stay=document.createElement('button'),leave=document.createElement('button');stay.type=leave.type='button';stay.className='primary';stay.textContent='Остаться';leave.textContent='Закрыть без повтора';
  stay.onclick=()=>finish(false);leave.onclick=()=>finish(true);actions.append(stay,leave);dialog.append(title,description,actions);
  prompt={dialog,entries:list,resume,focus:document.activeElement};document.body.append(dialog);
  dialog.oncancel=event=>{event.preventDefault();finish(false);};dialog.onclose=()=>finish(false);dialog.showModal();stay.focus();
 }
 function register(root,pending){const item={root,pending};entries.add(item);return ()=>{entries.delete(item);if(prompt&&!prompt.entries.some(e=>entries.has(e)&&e.root.isConnected))finish(false);};}
 if(typeof document!=='undefined'){
  document.addEventListener('click',event=>{
   if(replaying||prompt?.dialog.contains(event.target))return;
   const list=active().filter(e=>!e.root.contains(event.target));if(!list.length)return;
   event.preventDefault();event.stopImmediatePropagation();
   const target=event.target.closest?.('button,a,input,summary,[role=button]')||event.target;
   ask(list,()=>{if(target.isConnected)target.click?.();});
  },true);
  document.addEventListener('cancel',event=>{
   if(replaying||event.target===prompt?.dialog)return;
   const list=active();if(!list.length)return;
   event.preventDefault();const target=event.target;ask(list,()=>{if(target.isConnected)target.close?.();});
  },true);
 }
 if(typeof window!=='undefined')window.addEventListener('beforeunload',event=>{if(active().length){event.preventDefault();event.returnValue='';}});
 return {register};
})();