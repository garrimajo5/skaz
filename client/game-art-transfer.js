// Opt-in transfer controller. Personal PNGs and retry bodies live only in RAM.
const SkazGameArtTransfer=(()=>{
 const maxBytes=64*1024*1024;
 function preview(value){
  const game=value?.game,art=value?.personalArt;
  if(value?.app!=='skaz-game-with-art'||![1,2].includes(value.schemaVersion)||value.ruleset!=='5e-2014'||game?.app!=='skaz-active'||game.schemaVersion!==(value.schemaVersion===1?12:13)||game.ruleset!=='5e-2014'||art?.app!=='skaz-personal-art'||art.schemaVersion!==1||art.scope!=='personal-character'||art.ruleset!=='5e-2014')throw Error('Нужен пакет игры с изображениями СКАЗ v1 или v2 (D&D 2014).');
  if(typeof game.state?.profile?.name!=='string'||typeof game.state?.profile?.campaign!=='string'||!Array.isArray(game.inventory)||!Array.isArray(game.spellbook)||!Array.isArray(game.catalog?.entries)||!Array.isArray(art.entries)||art.entries.length>1000)throw Error('В пакете отсутствуют сведения об игре или изображениях.');
  if(value.schemaVersion===2&&!Object.hasOwn(game,'advancement'))throw Error('В пакете отсутствует история повышения.');
  const ids=new Set(game.catalog.entries.map(e=>e.id)),seen=new Set();let bytes=0;
  for(const e of art.entries){
   if(typeof e.catalogId!=='string'||!ids.has(e.catalogId)||seen.has(e.catalogId)||typeof e.sha256!=='string'||!/^[a-f0-9]{64}$/.test(e.sha256)||typeof e.png!=='string'||!e.png.length||e.png.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(e.png))throw Error('Неверная связь или описание личного изображения.');
   const size=e.png.length/4*3-(e.png.endsWith('==')?2:e.png.endsWith('=')?1:0);bytes+=size;
   if(size>4*1024*1024||bytes>32*1024*1024)throw Error('Превышен размер личных изображений.');seen.add(e.catalogId);
  }
  return {name:game.state.profile.name,campaign:game.state.profile.campaign,images:art.entries.length,imageBytes:bytes,items:game.inventory.length,spells:game.spellbook.length};
 }
 function create({identity,viewId,request=(...args)=>fetch(...args),newId=()=>crypto.randomUUID()}){
  if(![identity,viewId].every(v=>typeof v==='string'&&v.length))throw Error('Нужны пользователь и окно игры.');
  let closed=false,busy=false,prepared=null,pending=false;const abort=new AbortController();
  const check=()=>{if(closed)throw Error('Перенос закрыт.');};
  async function call(route,body){
   check();const response=await request(route,{method:body?'POST':'GET',...(body?{body}:{}),credentials:'same-origin',cache:'no-store',redirect:'error',signal:AbortSignal.any([abort.signal,AbortSignal.timeout(60000)]),headers:{'X-Skaz-Identity':identity,'X-Skaz-View':viewId,'X-Skaz-Client':'local-v1',...(body?{'Content-Type':'application/json'}:{})}});check();
   // Bound both declared and actual response size before parsing a package.
   if(Number(response.headers.get('Content-Length'))>maxBytes+4096){await response.body?.cancel();throw Error('Слишком большой ответ переноса.');}
   const reader=response.body?.getReader();if(!reader)throw Error('Пустой ответ переноса.');let size=0;const chunks=[];
   try{for(;;){const {done,value}=await reader.read();check();if(done)break;size+=value.byteLength;if(size>maxBytes+4096)throw Error('Слишком большой ответ переноса.');chunks.push(value);}}catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
   let data;try{data=JSON.parse(await new Blob(chunks).text());}catch{throw Error('Ответ сервера неполный или повреждён.');}check();if(!response.ok)throw Object.assign(Error(data.error||'Не удалось перенести игру.'),{status:response.status});return data;
  }
  const commands=SkazPersonalArtCommand.create({newId,send:async body=>state(await call('/api/import/game-with-art',body))});
  async function exclusive(fn){check();if(busy)throw Error('Дождись завершения переноса.');busy=true;try{return await fn();}finally{busy=false;}}
  function state(value){if(!Number.isSafeInteger(value?.revision)||value.revision<0||!['campaignId','characterId','sessionId'].every(key=>typeof value.context?.[key]==='string'&&value.context[key].length))throw Error('Не удалось проверить выбранную игру.');return value;}
  function applied(result){state(result);prepared=null;pending=false;return result;}
  return {
   get pending(){return pending;},
   prepare(file){return exclusive(async()=>{
    if(pending)throw Error('Сначала повтори предыдущий импорт. Его ответ мог потеряться после записи.');
    prepared=null;
    if(!file||!Number.isSafeInteger(file.size)||file.size<1||file.size>maxBytes)throw Error('Пакет должен быть JSON не больше 64 МиБ.');
    const text=await file.text();check();if(new Blob([text]).size>maxBytes)throw Error('Слишком большой пакет.');
    const value=JSON.parse(text),summary=preview(value),current=state(await call('/api/workspace'));check();
    prepared={file:value,expectedRevision:current.revision};return {...summary,targetCharacterId:current.context.characterId};
   });},
   importPrepared(){return exclusive(async()=>{if(!prepared)throw Error('Сначала выбери и проверь пакет.');if(pending)throw Error('Повтори предыдущий импорт.');pending=true;return applied(await commands.submit({...prepared,destination:'new-campaign'}));});},
   retry(){return exclusive(async()=>{if(!pending)throw Error('Нет импорта для повтора.');return applied(await commands.retry());});},
   exportPackage(){return exclusive(async()=>{
    if(pending)throw Error('Сначала повтори импорт, чтобы узнать его результат.');
    const before=state(await call('/api/workspace')),value=await call('/api/export/game-with-art');preview(value);
    const after=state(await call('/api/workspace'));
    if(before.revision!==after.revision||JSON.stringify(before.context)!==JSON.stringify(after.context)||value.game.source?.revision!==before.revision||JSON.stringify(value.game.source?.context)!==JSON.stringify(before.context))throw Error('Игра изменилась во время экспорта. Повтори скачивание.');
    return new Blob([JSON.stringify(value)],{type:'application/json'});
   });},
   destroy(){closed=true;prepared=null;pending=false;commands.destroy();abort.abort();}
  };
 }
 return {create,preview,maxBytes};
})();
