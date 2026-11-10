// Prepared component; the application shell must opt in explicitly.
const SkazGameArtTransferPanel=(()=>{
 function create(container,{transport,onImported=()=>{}}){
  if(typeof SkazPersonalArtSession!=='undefined')SkazPersonalArtSession.assertOpen();
  let closed=false,busy=false,url=null,ready=false;
  const root=document.createElement('fieldset');root.style.cssText='min-width:0;border:0;padding:0';
  const title=document.createElement('h2');title.textContent='Игра с личными изображениями';
  const note=document.createElement('p');note.textContent='Перенос создаёт новую кампанию и персонажа. Общий каталог не заменяется. Переносятся текущие личные изображения; история замен остаётся только в полной резервной копии. Файл содержит личные данные — храни его у себя.';
  const label=document.createElement('label');label.textContent='Выбрать пакет JSON (до 64 МиБ)';
  const input=document.createElement('input');input.type='file';input.accept='.json,application/json';label.append(input);
  const summary=document.createElement('p'),status=document.createElement('p');status.setAttribute('role','status');status.style.overflowWrap='anywhere';
  const exportButton=document.createElement('button'),importButton=document.createElement('button'),retry=document.createElement('button'),download=document.createElement('a');
  exportButton.textContent='Подготовить файл для скачивания';importButton.textContent='Создать новую игру из пакета';retry.textContent='Повторить тот же импорт';download.textContent='Скачать игру с изображениями';download.download='skaz-game-with-art-v1.json';download.hidden=true;
  for(const b of [exportButton,importButton,retry])b.type='button';
  function controls(){root.disabled=busy;input.disabled=transport.pending;importButton.disabled=!ready||transport.pending;retry.hidden=!transport.pending;retry.style.display=transport.pending?'':'none';exportButton.disabled=transport.pending;}
  function release(){if(url)URL.revokeObjectURL(url);url=null;download.removeAttribute('href');download.hidden=true;download.style.display='none';}
  async function run(fn){if(closed||busy)return;busy=true;release();status.textContent='Выполняется…';controls();try{await fn();}catch(error){if(!closed){status.textContent=error.message+(transport.pending?' Повтори тот же импорт: он мог уже сохраниться. Закрытие окна удалит данные повтора из памяти.':'');}}finally{busy=false;if(!closed){controls();status.scrollIntoView?.({block:'nearest'});}}}
  input.onchange=()=>run(async()=>{ready=false;summary.textContent='';const file=input.files?.[0];if(!file){status.textContent='Файл не выбран.';return;}const s=await transport.prepare(file);if(closed)return;ready=true;summary.textContent=`${s.name} · ${s.campaign}. Предметов: ${s.items}, заклинаний: ${s.spells}, личных изображений: ${s.images} (${(s.imageBytes/1024/1024).toFixed(2)} МиБ). Предварительный состав; сервер ещё проверит PNG, права и квоту. Текущая игра не заменяется.`;status.textContent='Проверь состав перед созданием новой игры.';});
  async function success(result){if(closed)return;ready=false;input.value='';summary.textContent='';status.textContent=result.replayed?'Предыдущий импорт подтверждён. Вторая игра не создана.':'Новая игра создана вместе с личными изображениями.';try{await onImported(result);}catch{if(!closed)status.textContent+=' Обнови экран игры, чтобы увидеть результат.';}}
  importButton.onclick=()=>run(async()=>success(await transport.importPrepared()));retry.onclick=()=>run(async()=>success(await transport.retry()));
  exportButton.onclick=()=>run(async()=>{const blob=await transport.exportPackage();if(closed)return;url=URL.createObjectURL(blob);download.href=url;download.hidden=false;download.style.display='';status.textContent='Файл готов. Нажми ссылку скачивания.';});
  root.append(title,note,exportButton,download,label,summary,importButton,retry,status);container.append(root);release();controls();
  let unregister;
  function destroy(){if(closed)return;closed=true;unregister?.();try{transport.destroy();}finally{release();input.value='';summary.textContent='';root.remove();}}
  if(typeof SkazPersonalArtSession!=='undefined')unregister=SkazPersonalArtSession.register(destroy);
  return {get pending(){return transport.pending;},destroy};
 }
 return {create};
})();
