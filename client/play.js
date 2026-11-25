const SkazPlay = (()=>{
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let key='',owner='',serial=0,searchSerial=0,status='idle',book=[],items=[],quests=[],questStatus='idle',questSerial=0,scrollPositions={},spellScope='combat';
 let castLevels={}, returnFocus=null;
 let bookState='pending', inventoryState='pending';
 const spellScopes=[
  ['combat','В бою'],['action','Действие'],['bonus','Бонусное'],
  ['reaction','Реакция'],['exploration','Вне боя'],['all','Все']
 ];
 const mode=()=>{try{return sessionStorage.getItem('skaz-play-mode-v1')==='play'?'play':'prepare';}catch{return 'prepare';}};
 function remember(page){if(page!=='play'){returnFocus=null;++serial;++searchSerial;if(status==='loading'||status==='retrying')status='idle';}try{sessionStorage.setItem('skaz-play-mode-v1',page==='play'?'play':'prepare');}catch{}}
 const active=()=>typeof page!=='undefined'&&page==='play';
 function captureFocus(){
  const focused=document.activeElement;
  if(!focused?.closest('.play-screen'))return;
  const data=focused.dataset;
  let selector=focused.id?'#'+CSS.escape(focused.id):'';
  for(const name of ['playCast','playCastLevel','playCastSelect','playRead','playCharges','playSpend','playSpellScope']){
   if(!data[name])continue;
   const attribute=name.replace(/[A-Z]/g,c=>'-'+c.toLowerCase());
   selector='[data-'+attribute+'='+CSS.escape(data[name])+']';
   if(name==='playCastLevel')selector+='[data-level='+CSS.escape(data.level)+']';
   if(name==='playRead')selector+='[data-id='+CSS.escape(data.id)+']';
   break;
  }
  if(selector)returnFocus={selector,context:SkazStorage.contextKey()};
 }
 function restoreFocus(){
  if(!returnFocus||document.getElementById('dialog')?.open)return;
  if(returnFocus.context===SkazStorage.contextKey()&&(returnFocus.afterModal||document.activeElement===document.body)){
   let target=document.querySelector?.('.play-screen '+returnFocus.selector);
   if(!target&&(status==='loading'||status==='retrying'))return;
   if(target?.disabled){
    const row=target.closest('.play-spell-action,.play-item');
    target=row?.querySelector('[data-play-read]')||document.getElementById('play-content');
   }
   target?.focus({preventScroll:true});
  }
  returnFocus=null;
 }
 function actorLevel(sheet){return sheet?sheet.level:5;}
 function actorIdentity(sheet=SkazStorage.sheet?.()){
  return {heroName:state.profile.name,className:sheet?.className||'Бард',level:actorLevel(sheet),subclass:sheet?.subclass||''};
 }
 function actorView(sheet=SkazStorage.sheet?.(),stats=SkazStorage.stats()){
  return {
   ...actorIdentity(sheet),
   session:SkazPlayPresentation.sessionCaption(SkazStorage.currentSession?.(),SkazStorage.sessionTitle?.()||''),
   hp:state.hp,
   maxHp:state.maxHp,
   tempHp:state.tempHp,
   armorClass:stats.armorClass,
   concentration:state.concentration,
   conditions:typeof SkazConditions==='undefined'?[]:SkazConditions.names(state.conditions),
   gold:state.gold,
   historyAvailable:location.protocol!=='file:'&&SkazStorage.access?.()?.history!==false,
  };
 }
 function view(){
  const next=SkazStorage.snapshotKey();if(next!==key){key=next;const context=SkazStorage.contextKey();if(context!==owner){owner=context;scrollPositions={};castLevels={};}status='idle';book=[];items=[];quests=[];questStatus='idle';++questSerial;++serial;}
  if(status==='idle'){
   status='loading';bookState=inventoryState='pending';book=[];items=[];
   const token=serial;queueMicrotask(()=>{if(token===serial&&active())load();});
  }
  if(status==='ready'&&questStatus==='idle'){
   const captured=key;
   queueMicrotask(()=>{if(active()&&key===captured&&SkazStorage.snapshotKey()===captured)void loadQuests();});
  }
  renderChargeTracker();
  const stats=SkazStorage.stats(),sheet=SkazStorage.sheet?.();
  const actor=actorView(sheet,stats);
  return SkazPlayPresentation.screen({
   ...actor,
   initiative:stats.initiative,
   speed:stats.speed,
   checks:SkazCharacterSheet.abilityRow(stats,sheet),
   magicStats:SkazCharacterSheet.spellTiles(stats,sheet),
   content:content(actor.level),
  });
 }
 function castingGroup(spell){
  const time=String(spell?.castingTime||'').trim().toLowerCase();
  if(/^1\s+(?:бонусное действие|bonus action)(?:$|[,.;\s])/.test(time))return 'bonus';
  if(/^1\s+(?:реакция|reaction)(?:$|[,.;\s])/.test(time))return 'reaction';
  if(/^1\s+(?:действие|action)(?:$|[,.;\s])/.test(time))return 'action';
  if(/^\d+\s+(?:минут\S*|час\S*|minute\S*|hour\S*)(?:$|[,.;\s])/.test(time))return 'long';
  return 'other';
 }
 function inSpellScope(spell,scope){
  const group=castingGroup(spell);
  if(scope==='all')return true;
  if(scope==='combat')return group!=='long';
  if(scope==='exploration')return group==='long'||spell?.ritual===true||/\d+\s+(?:минут|minute|час|hour)/i.test(String(spell?.castingTime||''));
  return group===scope;
 }
 function spellSummary(spell){if(!spell)return 'Время и дистанция не указаны';const range=spell.range,parts=[];if(range)parts.push(range.type==='feet'?range.feet+' фт':({self:'На себя',touch:'Касание',sight:'Видимость',unlimited:'Без ограничения',special:'Особая дистанция'}[range.type]||''));if(spell.concentration)parts.push('Концентрация');if(spell.ritual)parts.push('Ритуал');if(!parts.length)parts.push(spell.castingTime||'Время не указано');return parts.filter(Boolean).join(' · ');}

 const castingSnapshot=()=>({state,characterSheet:SkazStorage.sheet?.()});
 function availableLevels(spell){return SkazCasting.choices(castingSnapshot(),spell.level).levels;}
 function selectedLevel(item){const levels=item.entry.spell?availableLevels(item.entry.spell):[];return levels.includes(castLevels[item.catalogId])?castLevels[item.catalogId]:levels[0];}
 function changeCastLevel(id,level){
  const item=book.find(entry=>entry.catalogId===id);
  if(!item?.entry.spell||SkazStorage.sheet?.()||!availableLevels(item.entry.spell).includes(level))return false;
  castLevels[id]=level;
  refresh();
  return true;
 }
 function castLevelControls(item,levels,circle){
  const id=escape(item.catalogId),name=escape('Круг ячейки для '+item.entry.name.ru);
  const label=level=>level+' круг · осталось '+state.slots[level];
  const buttons=levels.map(level=>'<button data-play-cast-level="'+id+'" data-level="'+level+'" aria-pressed="'+(level===circle)+'" aria-label="'+label(level)+'">'+level+'</button>').join('');
  const options=levels.map(level=>'<option value="'+level+'" aria-label="'+label(level)+'"'+(level===circle?' selected':'')+'>Кр.'+level+'</option>').join('');
  return '<div class="play-cast-levels" role="group" aria-label="'+name+'">'+buttons+'</div>'+
   '<span class="play-cast-picker"><select class="play-cast-select" data-play-cast-select="'+id+'" aria-label="'+name+'">'+options+'</select><span class="play-cast-chevron" data-ui-icon="chevron-down" aria-hidden="true"></span></span>';
 }
 function castControls(item){
  const spell=item.entry.spell,level=spell?.level,snapshot=castingSnapshot(),sheet=snapshot.characterSheet;
  const {levels,counters}=SkazCasting.choices(snapshot,level);
  const manual=level>0&&!levels.length&&!counters.length;
  const enabled=SkazStorage.canResource?.()&&Number.isInteger(level)&&(manual||state.hp>0&&(level===0||levels.length||counters.length));
  const label=!Number.isInteger(level)?'круг не указан':manual?'Записать вручную':state.hp===0?'0 HP':level===0?'Применить':'Сотворить';
  const warning=!manual&&spell?.concentration&&state.concentration?'Сменит концентрацию «'+state.concentration+'»':'';
  const circle=selectedLevel(item);
  const choices=!sheet&&level>0&&levels.length>1?castLevelControls(item,levels,circle):'';
  const agreement=manual&&SkazCasting.manualAgreement(snapshot,item.catalogId,level);
  const cost=manual?(agreement?'Согласовано с мастером':sheet?'нет доступного счётчика':'нет ячеек '+level+'+'):SkazPlayPresentation.castCost(enabled,level,!!sheet,circle);
  const visibleCost=choices?SkazPlayPresentation.castCost(enabled,level,!!sheet,circle,true):cost;
  return '<div class="play-casting-controls">'+choices+'<button class="play-cast play-action-command" data-play-cast="'+escape(item.catalogId)+'" '+(enabled?'':'disabled')+' aria-label="'+escape(label+': '+item.entry.name.ru+(cost?' · '+cost:'')+(warning?' · '+warning:''))+'">'+SkazPlayPresentation.commandCopy(label,visibleCost,warning?'Сменит конц.':'',level===0||(!manual&&!sheet))+'</button></div>';
 }
 function openManualCast(item,captured,snapshot){
  const {catalogId,entry}=item,level=entry.spell.level;
  const agreed=SkazCasting.manualAgreement(snapshot,catalogId,level);
  const shortage=snapshot.characterSheet?'У доступных счётчиков нет остатка. Обычно списывается 1 единица из выбранного счётчика.':'Доступно 0 ячеек для '+level+' круга и выше. Обычно нужна 1 ячейка.';
  const explanation=agreed
   ? '<p class="small">Согласовано с мастером для этого заклинания '+level+' круга.</p>'
   : '<p class="cast-warning">'+shortage+'</p>';
  modal('<h2>'+escape(entry.name.ru)+' · ручное сотворение</h2>'+explanation+
   '<form id="play-manual-cast-form"><p>Запись появится в истории и личных заметках. Ячейки, концентрация и эффекты остаются как есть.</p>'+
   '<label for="play-manual-cast-reason">Пояснение (необязательно)</label><textarea id="play-manual-cast-reason" maxlength="500">'+escape(agreed?.reason||'')+'</textarea>'+
   '<label class="manual-cast-agreement"><input id="play-manual-cast-agreed" type="checkbox" '+(agreed?'checked':'')+'> Согласовано с мастером (необязательно)</label>'+
   '<p id="play-manual-cast-error" class="red" role="alert" hidden></p>'+
   '<div class="dialog-actions"><button class="primary" type="submit">Записать без расхода</button></div></form>');
  const form=document.getElementById('play-manual-cast-form');
  let submitted=false;
  form.onsubmit=event=>{
   event.preventDefault();
   if(submitted)return;
   try{
    if(!active()||captured!==SkazStorage.snapshotKey())throw Error('Игра изменилась. Скопируй пояснение и открой сотворение заново');
    const reason=document.getElementById('play-manual-cast-reason').value.trim();
    const agreed=document.getElementById('play-manual-cast-agreed').checked;
    SkazStorage.castSpell(catalogId,{kind:'manual',level,id:crypto.randomUUID(),at:Date.now(),reason,agreed},captured);
    submitted=true;
    closeModal();
    returnFocus={selector:'[data-play-cast='+JSON.stringify(catalogId)+']',context:SkazStorage.contextKey(),afterModal:true};
    restoreFocus();
   }catch(error){
    const message=document.getElementById('play-manual-cast-error');
    message.textContent=error.message;
    message.hidden=false;
   }
  };
 }
 function openCast(item){
  const captured=SkazStorage.snapshotKey(),spell=item.entry.spell,snapshot=castingSnapshot(),manual=!!snapshot.characterSheet;
  if(!Number.isInteger(spell?.level)||!SkazStorage.canResource?.())return;
  const {levels,counters}=SkazCasting.choices(snapshot,spell.level);
  if(spell.level>0&&!levels.length&&!counters.length)return openManualCast(item,captured,snapshot);
  if(state.hp<=0)return;
  const changingFocus=spell.concentration&&state.concentration;
  const directCost=spell.level===0?null:{kind:'slot',level:selectedLevel(item)};
  if(!(manual&&spell.level>0)&&!changingFocus){try{SkazStorage.castSpell(item.catalogId,directCost,captured);}catch(error){toast(error.message);}return;}
  let counterId=counters[0]?.id,circle=manual?spell.level:selectedLevel(item),submitted=false;
  const warning=changingFocus?'<p class="cast-warning">Сменит концентрацию «'+escape(state.concentration)+'» и завершит её ожидающие проверки.</p>':'';
  const choices=spell.level>0&&manual?'<p>Укажи счётчик ячеек и круг вручную. Правила класса автоматически не проверяются.</p><fieldset><legend>Счётчик ячеек</legend>'+counters.map(c=>'<button type="button" data-cast-counter="'+escape(c.id)+'" aria-pressed="'+(c.id===counterId)+'">'+escape(c.name)+' · '+c.current+'/'+c.max+'</button>').join('')+'</fieldset><fieldset><legend>Круг выбранной ячейки</legend>'+Array.from({length:10-spell.level},(_,i)=>i+spell.level).map(n=>'<button type="button" data-cast-circle="'+n+'" aria-pressed="'+(n===circle)+'">'+n+'</button>').join('')+'</fieldset>':spell.level===0?'<p>Заговор — ячейка не требуется.</p>':'<p>Ячейка '+circle+' круга · осталось '+state.slots[circle]+'</p>';
  modal('<h2>'+escape(item.entry.name.ru)+'</h2>'+warning+'<form id="play-cast-form">'+choices+'<p class="small">Эффект, компоненты и действие подтверждаются за столом.</p><button class="primary" type="submit">'+(spell.level?'Сотворить':'Применить заговор')+'</button></form>');
  for(const button of document.querySelectorAll('[data-cast-counter]'))button.onclick=()=>{counterId=button.dataset.castCounter;for(const b of document.querySelectorAll('[data-cast-counter]'))b.setAttribute('aria-pressed',String(b===button));};
  for(const button of document.querySelectorAll('[data-cast-circle]'))button.onclick=()=>{circle=Number(button.dataset.castCircle);for(const b of document.querySelectorAll('[data-cast-circle]'))b.setAttribute('aria-pressed',String(b===button));};
  document.getElementById('play-cast-form').onsubmit=event=>{event.preventDefault();if(submitted)return;try{if(!active()||captured!==SkazStorage.snapshotKey())throw Error('Игра изменилась. Открой сотворение заново');const cost=spell.level===0?null:manual?{kind:'counter',counterId,level:circle}:{kind:'slot',level:circle};SkazStorage.castSpell(item.catalogId,cost,captured);submitted=true;closeModal();}catch(error){toast(error.message);}};
 }
 function spellPanel(spells,hasConsumables,level){
  if(!spells.length)return '<section class="panel play-empty"><button data-play-prepare="spells">'+(SkazStorage.spellLearningMode?.()==='known'?'Добавить известные заклинания':'Подготовить заклинания')+' <span class="ui-inline-icon" data-ui-icon="arrow-right"></span></button></section>';
  const visible=spells.filter(x=>inSpellScope(x.entry.spell,spellScope));
  const groups=[['action','Действие'],['bonus','Бонусное действие'],['reaction','Реакция'],['long','Длительное сотворение'],['other','Прочее']];
  return '<section class="panel play-spells"><h3 class="visually-hidden">'+(SkazStorage.spellLearningMode?.()==='known'?'Заклинания и заговоры':'Подготовленные и заговоры')+'</h3><div class="play-spell-scopes" role="group" aria-label="Заклинания по ситуации">'+spellScopes.map(([id,label])=>'<button data-play-spell-scope="'+id+'" aria-pressed="'+(spellScope===id)+'">'+label+(id==='all'?' '+spells.length:'')+'</button>').join('')+(hasConsumables?'<button id="play-show-consumables">Расходники <span class="ui-inline-icon" data-ui-icon="arrow-down"></span></button>':'')+'</div><div class="play-list" tabindex="0" role="region" aria-label="Заклинания персонажа" data-play-list="spells">'+(visible.length?groups.map(([id,label])=>{const rows=visible.filter(x=>castingGroup(x.entry.spell)===id);if(!rows.length)return '';return '<h3 class="play-action-heading">'+label+'</h3>'+rows.map(x=>{const spell=x.entry.spell,on=spell?.concentration&&state.concentration===x.entry.name.ru,facts=typeof SkazSpellFacts!=='undefined'?SkazSpellFacts.summary(x.entry,level):null,summary=[spellSummary(spell),facts].filter(Boolean).join(' · ');return '<div class="play-spell-action"><button class="play-row play-spell-row'+(on?' is-concentrating':'')+'" data-play-read="spell" data-id="'+escape(x.catalogId)+'"><span class="play-art">'+(typeof SkazArt!=='undefined'?SkazArt.markup(x.entry):'')+(on?'<span class="play-concentration-marker" data-ui-icon="focus" aria-hidden="true"></span>':'')+'<span class="play-spell-level" aria-label="'+(spell?.level===0?'Заговор':spell?.level===undefined?'Круг не указан':spell.level+' круг')+'">'+(spell?.level===0?'∅':spell?.level??'?')+'</span></span><span class="play-spell-copy"><small class="play-action-kind" aria-hidden="true">'+label+'</small><strong>'+escape(x.entry.name.ru)+'</strong><small title="'+escape(summary)+'">'+(on?'<span data-ui-icon="focus"></span> действует · ':'')+escape(summary)+'</small></span></button>'+castControls(x)+'</div>';}).join('');}).join(''):'<p class="small">В этой группе нет заклинаний.</p>')+'</div></section>';
 }

 function consumableRow(item){
  const {entry,catalogId,quantity,chargeCounts}=item;
  const charges=(entry.item||entry.artifact)?.charges;
  const balance='×'+quantity;
  const shown=charges?Array.from({length:Math.min(quantity,3)},(_,index)=>chargeCounts?.[index]):[];
  const more=quantity-shown.length;
  const single=charges&&quantity===1?SkazItemCharges.balance(item,0):null;
  const fullCounts=single?.value!=null?single.value+' из '+single.maximum:shown.map(value=>value??'не указаны').join(' / ');
  const compactCounts=single?.value!=null?single.value+'/'+single.maximum:shown.map(value=>value??'?').join(' / ');
  const full=charges?balance+' · заряды '+fullCounts+(more?' · ещё '+more:''):balance;
  const compact=charges?balance+' · '+compactCounts+(more?' +'+more:''):'';
  const details=charges?`<span class="play-balance-full">${full}</span><span class="play-balance-short" aria-hidden="true">${compact}</span>`:balance;
  const name=escape(entry.name.ru),id=escape(catalogId);
  const chargeAction=charges&&Array.from({length:quantity},(_,index)=>chargeCounts?.[index]).some(value=>value==null)?'Указать заряды':'Заряды';
  const action=charges
   ?`<button class="play-action-command" data-play-charges="${id}" aria-label="${chargeAction}: ${name}">${SkazPlayPresentation.commandCopy(chargeAction)}</button>`
   :`<button class="play-action-command" data-play-spend="${id}" aria-label="Списать один: ${name}" ${SkazStorage.editable()?'':'disabled'}>${SkazPlayPresentation.commandCopy('Списать','1 предмет','',true)}</button>`;
  const art=typeof SkazArt!=='undefined'?SkazArt.markup(entry):'';
  return `<div class="play-item"><button class="play-row" data-play-read="item" data-id="${id}">${art}<strong>${name}</strong><span class="play-item-balance">${details}</span></button>${action}</div>`;
 }
 function content(level){
  if(status==='loading'&&bookState!=='ready'&&inventoryState!=='ready')return '<p role="status">Открываем подготовленные заклинания и инвентарь…</p>';
  if(status==='error')return '<div class="panel"><h2>Игровые списки недоступны</h2><p>Проверь соединение или заверши отправку очереди. Хиты и доступные ресурсы остаются в панели.</p><button id="play-retry">Повторить</button></div>';
  const spells=book.filter(x=>SkazStorage.spellLearningMode?.()==='known'||x.status==='prepared'||x.entry.spell?.level===0).sort((a,b)=>(a.entry.spell?.level??99)-(b.entry.spell?.level??99)||a.entry.name.ru.localeCompare(b.entry.name.ru,'ru'));
  const consumables=items.filter(x=>{const info=x.entry.item||x.entry.artifact;return info?.charges||['potion','scroll'].includes(info?.type);}).sort((a,b)=>a.entry.name.ru.localeCompare(b.entry.name.ru,'ru'));
  const latest=[...state.journal,...state.notes].sort((a,b)=>(b.at||0)-(a.at||0))[0];
  const recent=latest&&SkazPlayPresentation.note(latest,SkazCasting.readManualNote(latest));
  const bookError=bookState==='error',inventoryError=inventoryState==='error';
  const notice=status==='retrying'?'<div class="notice play-list-notice" role="status">Повторяем загрузку…</div>'
   :bookError||inventoryError?'<div class="notice play-list-notice"><span>'+(bookError?'Книга заклинаний недоступна.':'Расходники недоступны.')+'</span>'+
     (status==='ready'?'<button id="play-retry" aria-label="Повторить загрузку '+(bookError?'книги заклинаний':'расходников')+'">Повторить</button>':'')+'</div>'
   :'';
  const spellContent=bookState==='ready'?spellPanel(spells,consumables.length>0,level)
   :bookState==='pending'&&status!=='retrying'?'<p role="status">Открываем книгу заклинаний…</p>':'';
  const inventoryContent=inventoryState==='pending'&&status!=='retrying'?'<p role="status">Открываем расходники…</p>'
   :inventoryState!=='ready'?'':consumables.length
   ?`<section class="panel play-consumables"><h2 id="play-consumables-title" tabindex="-1">Расходники и заряды</h2>
     <div class="play-list" tabindex="0" role="region" aria-label="Расходники и заряды" data-play-list="items">${consumables.map(consumableRow).join('')}</div>
     <p class="small">−1 списывает предмет. Эффект подтверждается отдельно.</p></section>`
   :'<section class="panel play-empty"><button data-play-prepare="inventory">Добавить расходники <span class="ui-inline-icon" data-ui-icon="arrow-right"></span></button></section>';
  const itemsFirst=!spells.length&&consumables.length>0;
  const recentContent=recent
   ?`<section class="panel play-last"><h2>Последняя запись</h2><strong>${escape(recent.title)}</strong><p>${escape(recent.text)}</p><button id="play-note"><span class="ui-inline-icon" data-ui-icon="add"></span> Личная заметка</button></section>`
   :'<section class="panel play-empty"><button id="play-note"><span class="ui-inline-icon" data-ui-icon="add"></span> Первая личная заметка</button></section>';
  return `${notice}${itemsFirst?'':spellContent}<div class="play-side">${inventoryContent}${itemsFirst?spellContent:''}${questPanel()}${recentContent}</div>`;
 }
 function questPanel(){
  if(questStatus==='idle'||questStatus==='loading')return '<section class="panel" id="play-quests-panel" role="status">Открываем задания…</section>';
  const activeQuests=quests.filter(q=>q.status==='active');
  if(!activeQuests.length)return '<section class="panel play-empty" id="play-quests-panel"><button data-play-prepare="quests">'+(questStatus==='error'?'Задания недоступны · открыть <span class="ui-inline-icon" data-ui-icon="arrow-right"></span>':'Выбрать задание <span class="ui-inline-icon" data-ui-icon="arrow-right"></span>')+'</button></section>';
  return '<section class="panel play-quests" id="play-quests-panel"><h2>Текущие задания</h2><div class="play-list" tabindex="0" role="region" aria-label="Текущие задания" data-play-list="quests">'+activeQuests.map(q=>'<button class="play-row" data-play-prepare="quests"><strong>'+escape(q.title)+'</strong><span>'+escape(q.steps.find(s=>!s.done)?.title||'Все этапы отмечены')+'</span></button>').join('')+'</div></section>';
 }
 function renderChargeTracker(){
  const root=document.getElementById('play-quick-item-charges');
  if(!root)return;
  root.innerHTML='';
  if(status==='error'||inventoryState!=='ready'||typeof SkazItemCharges==='undefined')return;
  const charged=items.filter(item=>SkazItemCharges.maximum(item.entry));
  if(charged.length!==1||charged[0].quantity!==1)return;
  const item=charged[0],balance=SkazItemCharges.balance(item,0);
  if(!balance)return;
  const {value,maximum}=balance;
  const numeric=value===null?'Не указаны':escape(value)+' <small>/ '+escape(maximum)+'</small>';
  const marks=value!==null&&maximum<=12?'<div class="play-charge-marks" aria-hidden="true">'+Array.from({length:maximum},(_,i)=>'<span'+(i<value?' class="filled"':'')+'></span>').join('')+'</div>':'';
  root.innerHTML='<div class="play-charge-heading"><div><strong class="tracker-name">'+escape(item.entry.name.ru)+'</strong><small>Заряды</small></div><span class="tracker-balance play-charge-balance">'+numeric+'</span></div>'+marks;
 }

 function refresh(){if(!active()||key!==SkazStorage.snapshotKey())return;renderChargeTracker();const root=document.getElementById('play-content');if(root){captureFocus();root.innerHTML=content(actorLevel(SkazStorage.sheet?.()));restoreFocus();document.querySelectorAll('[data-play-list]').forEach(list=>{list.scrollTop=scrollPositions[list.dataset.playList]||0;});}}

 async function loadQuests(){
  if(questStatus==='loading')return;
  const token=++questSerial,captured=key;
  questStatus='loading';
  let entries=null;
  try{
   const data=await SkazStorage.questsData();
   if(Array.isArray(data?.quests))entries=data.quests;
  }catch{}
  if(token!==questSerial||captured!==SkazStorage.snapshotKey())return;
  if(!active()){questStatus='idle';return;}
  quests=entries??[];
  questStatus=entries?'ready':'error';

  // Leave working actions and their keyboard focus in place when the sidebar data arrives.
  const panel=document.getElementById('play-quests-panel');
  if(panel){
   panel.outerHTML=questPanel();
   const list=document.querySelector?.('#play-quests-panel [data-play-list]');
   if(list)list.scrollTop=scrollPositions.quests||0;
  }
 }
 async function load(retryButton){
  if(retryButton&&(status==='loading'||status==='retrying'))return;
  const token=++serial,captured=key;
  const partial=status==='ready'&&(bookState==='error'||inventoryState==='error');
  const focusAnchor=retryButton&&document.activeElement===retryButton?document.getElementById('play-content'):null;
  const requests=[];
  if(!partial||bookState==='error'){bookState='pending';book=[];requests.push(['book',()=>SkazStorage.spellbookData()]);}
  if(!partial||inventoryState==='error'){inventoryState='pending';items=[];requests.push(['items',()=>SkazStorage.inventoryData()]);}
  status=partial?'retrying':'loading';
  if(questStatus==='idle'||questStatus==='error')void loadQuests();
  refresh();
  if(focusAnchor&&document.activeElement===document.body)focusAnchor.focus({preventScroll:true});

  await Promise.all(requests.map(async ([kind,read])=>{
   let entries=null,invalidSnapshot=false;
   try{
    const data=await read();
    if(Array.isArray(data?.entries))entries=data.entries;
   }catch(error){invalidSnapshot=[401,403,404,409].includes(error?.status);}
   if(token!==serial||captured!==SkazStorage.snapshotKey()||status==='error')return;
   if(!active()){status='idle';return;}
   if(invalidSnapshot){
    book=[];items=[];bookState=inventoryState='error';
   }else if(kind==='book'){
    book=entries??[];bookState=entries?'ready':'error';
   }else{
    items=entries??[];inventoryState=entries?'ready':'error';
   }
   if(bookState!=='pending'&&inventoryState!=='pending'){
    status=bookState==='error'&&inventoryState==='error'?'error':'ready';
   }
   refresh();
   if(status!=='loading'&&status!=='retrying'&&(bookState==='error'||inventoryState==='error')&&
      focusAnchor&&document.activeElement===focusAnchor){
    document.getElementById('play-retry')?.focus({preventScroll:true});
   }
  }));
 }
 function search(initial=''){
  const captured=SkazStorage.snapshotKey(),openedPage=page,instance=++searchSerial;let request=0,query=initial,results=[];
  const valid=()=>instance===searchSerial&&page===openedPage&&captured===SkazStorage.snapshotKey();
  const draw=()=>{if(!valid())return;modal(`<section id="play-search-panel"><h2>Правила во время игры</h2><form id="play-search-form"><label for="play-search-query">Название RU / EN</label><input id="play-search-query" type="search" maxlength="200" value="${escape(query)}"><button type="submit">Найти</button></form><div id="play-search-results">${results.map((e,i)=>`<button class="play-row" data-play-search-result="${i}">${escape(e.name.ru)} · ${escape(e.name.en)}</button>`).join('')||'<p>Введи название заклинания, предмета или правила.</p>'}</div></section>`);
   document.getElementById('play-search-form').onsubmit=async event=>{event.preventDefault();if(!valid())return;query=document.getElementById('play-search-query').value.trim();if(!query)return;const token=++request;document.getElementById('play-search-results').textContent='Ищем…';try{const response=await fetch('/api/catalog?'+new URLSearchParams({q:query,limit:'8'}),{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error();const data=await response.json();if(token!==request||!valid()||!document.getElementById('dialog')?.open||!document.getElementById('play-search-panel'))return;results=data.entries;draw();if(!results.length)document.getElementById('play-search-results').textContent='Ничего не найдено. Измени название.';}catch{if(token===request&&valid()&&document.getElementById('play-search-results'))document.getElementById('play-search-results').textContent='Поиск недоступен. Повтори запрос.';}};
   document.querySelectorAll('[data-play-search-result]').forEach(button=>button.onclick=()=>{const entry=results[Number(button.dataset.playSearchResult)];if(entry&&valid()){++request;SkazCatalog.readSnapshot(entry,draw,valid,'К поиску');}});
  };draw();if(initial)document.getElementById('play-search-form').requestSubmit();
 }
 document.addEventListener('submit',event=>{if(event.target.id==='header-search'){event.preventDefault();search(document.getElementById('header-search-query').value.trim());}});
 document.addEventListener('scroll',event=>{const list=event.target;if(active()&&owner===SkazStorage.contextKey()&&['spells','items','quests'].includes(list.dataset?.playList))scrollPositions[list.dataset.playList]=list.scrollTop;},true);
 document.addEventListener('change',event=>{
  const input=event.target,id=input.dataset?.playCastSelect;
  if(id&&active()&&key===SkazStorage.snapshotKey())changeCastLevel(id,Number(input.value));
 });
 document.addEventListener('click',async event=>{const b=event.target.closest('button');if(!b)return;if(b.dataset.playMode){closeModal();go(b.dataset.playMode==='play'?'play':'hero');return;}if(!active())return;if(b.id==='play-edit'){go('hero');return;}if(b.id==='play-search'){search();return;}if(b.id==='play-checks'){SkazCharacterSheet.checks();return;}if(key!==SkazStorage.snapshotKey())return;if(spellScopes.some(([id])=>id===b.dataset.playSpellScope)){spellScope=b.dataset.playSpellScope;scrollPositions.spells=0;refresh();document.querySelector?.('[data-play-spell-scope="'+spellScope+'"]')?.focus();return;}if(b.id==='play-retry'){void load(b);return;}if(b.id==='play-show-consumables'){const target=document.getElementById('play-consumables-title');target?.focus();return;}if(['spells','inventory','quests'].includes(b.dataset.playPrepare)){go(b.dataset.playPrepare);return;}
  if(b.dataset.playCastLevel){const id=b.dataset.playCastLevel,level=Number(b.dataset.level);if(changeCastLevel(id,level))Array.from(document.querySelectorAll('[data-play-cast-level]')).find(x=>x.dataset.playCastLevel===id&&Number(x.dataset.level)===level)?.focus();return;}
  if(b.dataset.playCast){const item=book.find(x=>x.catalogId===b.dataset.playCast);if(item&&SkazStorage.canResource?.())openCast(item);return;}
  if(b.dataset.playRead){const item=(b.dataset.playRead==='spell'?book:items).find(x=>x.catalogId===b.dataset.id),captured=key;if(item)SkazCatalog.readSnapshot(item.entry,closeModal,()=>active()&&captured===SkazStorage.snapshotKey(),'К игре');}
  if(b.dataset.playCharges){const item=items.find(x=>x.catalogId===b.dataset.playCharges);if(item)SkazStorage.editCharges(item);return;}
  if(b.dataset.playSpend){const item=items.find(x=>x.catalogId===b.dataset.playSpend);if(!item)return;try{await SkazStorage.spendInventoryOne(item,key);toast('Списан один предмет. Эффект не применён автоматически.');}catch(error){toast(error.message);}}
 });
 return {actorIdentity,actorView,view,mode,remember,castingGroup,inSpellScope,spellSummary,captureFocus,restoreFocus};
})();
