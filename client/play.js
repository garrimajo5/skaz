const SkazPlay = (()=>{
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let key='',owner='',serial=0,searchSerial=0,status='idle',book=[],items=[],scrollPositions={},spellScope='combat';
 let castLevels={}, returnFocus=null;
 let bookState='pending', inventoryState='pending';
 const spellScopes=[
  ['combat','В бою'],['action','Действие'],['bonus','Бонусное'],
  ['reaction','Реакция'],['exploration','Вне боя'],['all','Все']
 ];
 const mode=()=>{try{return sessionStorage.getItem('skaz-play-mode-v1')==='play'?'play':'prepare';}catch{return 'prepare';}};
 function remember(page){if(page!=='play'){returnFocus=null;++serial;++searchSerial;if(status==='loading'||status==='retrying')status='idle';}try{sessionStorage.setItem('skaz-play-mode-v1',page==='play'?'play':'prepare');}catch{}}
 const active=()=>typeof page!=='undefined'&&page==='play';

 // Combat notes track this tab's current game. Hero data stays in the shared store.
 let battleKey='', battle={round:0,summons:[],selected:null};
 function battleState(){
  const context=SkazStorage.contextKey();
  const user=typeof SkazAccount==='undefined'?'local':SkazAccount.userId;
  const key='skaz-play-battle-v1:'+JSON.stringify([user,context]);
  if(key===battleKey)return battle;
  battleKey=key;
  battle={round:0,summons:[],selected:null};
  try{
   const saved=JSON.parse(sessionStorage.getItem(key)||'null');
   if(!saved||!Number.isInteger(saved.round)||saved.round<0||saved.round>9999||!Array.isArray(saved.summons)||saved.summons.length>12)return battle;
   const summons=saved.summons.filter(summon=>summon&&typeof summon.id==='string'&&typeof summon.name==='string'&&summon.name.trim()&&summon.name.length<=80&&
    Number.isInteger(summon.hp)&&summon.hp>=0&&summon.hp<=9999&&Number.isInteger(summon.maxHp)&&summon.maxHp>=1&&summon.maxHp<=9999);
   battle={round:saved.round,summons,selected:summons.some(s=>s.id===saved.selected)?saved.selected:null};
  }catch{}
  return battle;
 }
 function saveBattle(){
  try{sessionStorage.setItem(battleKey,JSON.stringify(battle));}catch{}
 }
 function activeSummon(){
  const current=battleState();
  return current.summons.find(s=>s.id===current.selected)||null;
 }
 function selectSummon(id,focusId='play-summons'){
  const current=battleState();
  if(id!==null&&!current.summons.some(s=>s.id===id))return;
  current.selected=id;
  saveBattle();
  closeModal();
  render();
  document.getElementById(focusId)?.focus({preventScroll:true});
 }
 function cycleSummon(focusId){
  const direction=focusId==='play-actor-next'?1:-1;
  const current=battleState();
  const members=[null,...current.summons.map(s=>s.id)];
  selectSummon(members[(members.indexOf(current.selected)+direction+members.length)%members.length],focusId);
 }
 function manageSummons(){
  const current=battleState(),captured=battleKey;
  const selected=activeSummon();
  const options=[{id:'',name:state.profile.name},...current.summons].map(s=>
   '<button type="button" data-play-select-summon="'+escape(s.id)+'" aria-pressed="'+((current.selected||'')===s.id)+'">'+escape(s.name)+'</button>').join('');
  const fields=selected?{name:selected.name,hp:selected.hp,max:selected.maxHp}:{name:'',hp:'',max:''};
  modal('<section id="play-summon-dialog"><h2>Призывы</h2><div class="play-summon-list" role="group" aria-label="Активный участник">'+options+'</div>'+
   '<form id="play-summon-form"><label>Имя<input name="name" maxlength="80" required value="'+escape(fields.name)+'"></label>'+
   '<label>Текущие хиты<input name="hp" type="number" min="0" max="9999" step="1" required value="'+fields.hp+'"></label>'+
   '<label>Максимум хитов<input name="maximum" type="number" min="1" max="9999" step="1" required value="'+fields.max+'"></label>'+
   '<div class="dialog-actions"><button type="submit" value="new" '+(current.summons.length>=12?'disabled':'')+'>Добавить призыв</button>'+
   (selected?'<button type="submit" class="primary" value="update">Сохранить изменения</button><button type="button" id="play-remove-summon">Убрать призыв</button>':'')+
   '</div></form></section>');
  const dialog=document.getElementById('play-summon-dialog');
  const valid=()=>{battleState();return active()&&captured===battleKey&&document.getElementById('play-summon-dialog')===dialog;};
  dialog.onclick=event=>{
   const button=event.target.closest('button');
   if(!button||!valid())return;
   if(button.dataset.playSelectSummon!==undefined)selectSummon(button.dataset.playSelectSummon||null);
   if(button.id==='play-remove-summon'&&selected&&battle.summons.includes(selected)){
    battle.summons=battle.summons.filter(s=>s!==selected);
    selectSummon(null);
   }
  };
  document.getElementById('play-summon-form').onsubmit=event=>{
   event.preventDefault();
   const fields=event.target.elements;
   const name=fields.name.value.trim(),hp=Number(fields.hp.value),maxHp=Number(fields.maximum.value);
   if(!name||!valid()||!fields.hp.value||!fields.maximum.value||
     !Number.isInteger(hp)||hp<0||hp>9999||!Number.isInteger(maxHp)||maxHp<1||maxHp>9999)return;
   if(event.submitter?.value==='update'&&selected&&battle.summons.includes(selected)){
    Object.assign(selected,{name,hp,maxHp});
    selectSummon(selected.id);
   }else if(battle.summons.length<12){
    const id=crypto.randomUUID();
    battle.summons.push({id,name,hp,maxHp});
    selectSummon(id);
   }
  };
 }
 function battleClick(button){
  if(button.id==='play-battle-toggle'||button.id==='play-next-round'){
   const current=battleState();
   if(button.id==='play-battle-toggle')current.round=current.round?0:1;
   else if(current.round>0&&current.round<9999)current.round++;
   else return true;
   saveBattle();
   SkazPlayPresentation.refreshBattleControls(current.round);
   return true;
  }
  if(button.id==='play-summons'||button.id==='play-edit-summon'){manageSummons();return true;}
  if(button.id==='play-actor-prev'||button.id==='play-actor-next'){cycleSummon(button.id);return true;}
  return false;
 }

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
 function view(reload=false){
  const next=SkazStorage.snapshotKey();if(reload||next!==key){key=next;const context=SkazStorage.contextKey();if(context!==owner){owner=context;scrollPositions={};castLevels={};}status='idle';book=[];items=[];++serial;}
  if(status==='idle'){
   status='loading';bookState=inventoryState='pending';book=[];items=[];
   const token=serial;queueMicrotask(()=>{if(token===serial&&active())load();});
  }
  renderChargeTracker();
  const stats=SkazStorage.stats(),sheet=SkazStorage.sheet?.();
  const actor=actorView(sheet,stats),currentBattle=battleState(),summon=activeSummon();
  return SkazPlayPresentation.screen({
   ...actor,
   initiative:stats.initiative,
   speed:stats.speed,
   checks:SkazCharacterSheet.abilityRow(stats,sheet),
   magicStats:SkazCharacterSheet.spellTiles(stats,sheet),
   content:summon?'':content(actor.level),
   battle:{round:currentBattle.round,summonCount:currentBattle.summons.length,summon},
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
 function changeCastLevel(id,level,control){
  const item=book.find(entry=>entry.catalogId===id);
  if(!item?.entry.spell||SkazStorage.sheet?.()||!availableLevels(item.entry.spell).includes(level))return false;
  castLevels[id]=level;
  const controls=control?.closest?.('.play-casting-controls');
  if(!controls){refresh();return true;}
  const draft=document.createElement('template');
  draft.innerHTML=castControls(item);
  if(!patchCastChoices(controls,draft.content)){refresh();return true;}
  replacePlayPart(controls,draft.content,'[data-play-cast]');
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
  if(!spells.length)return '<section class="panel play-empty" data-play-section="book"><button id="play-prepare-spells" data-play-prepare="spells">'+(SkazStorage.spellLearningMode?.()==='known'?'Добавить известные заклинания':'Подготовить заклинания')+' <span class="ui-inline-icon" data-ui-icon="arrow-right"></span></button></section>';
  const visible=spells.filter(x=>inSpellScope(x.entry.spell,spellScope));
  const groups=[['action','Действие'],['bonus','Бонусное действие'],['reaction','Реакция'],['long','Длительное сотворение'],['other','Прочее']];
  return '<section class="panel play-spells" data-play-section="book"><h3 class="visually-hidden">'+(SkazStorage.spellLearningMode?.()==='known'?'Заклинания и заговоры':'Подготовленные и заговоры')+'</h3><div class="play-spell-scopes" data-play-list="scopes" role="group" aria-label="Заклинания по ситуации">'+spellScopes.map(([id,label])=>'<button data-play-spell-scope="'+id+'" aria-pressed="'+(spellScope===id)+'">'+label+(id==='all'?' '+spells.length:'')+'</button>').join('')+(hasConsumables?'<button id="play-show-consumables">Расходники <span class="ui-inline-icon" data-ui-icon="arrow-down"></span></button>':'')+'</div><div class="play-list" tabindex="0" role="region" aria-label="Заклинания персонажа" data-play-list="spells">'+(visible.length?groups.map(([id,label])=>{const rows=visible.filter(x=>castingGroup(x.entry.spell)===id);if(!rows.length)return '';return '<h3 class="play-action-heading">'+label+'</h3>'+rows.map(x=>{const spell=x.entry.spell,on=spell?.concentration&&state.concentration===x.entry.name.ru,facts=typeof SkazSpellFacts!=='undefined'?SkazSpellFacts.summary(x.entry,level):null,summary=[spellSummary(spell),facts].filter(Boolean).join(' · ');return '<div class="play-spell-action" data-play-action-kind="'+id+'"><button class="play-row play-spell-row'+(on?' is-concentrating':'')+'" data-play-read="spell" data-id="'+escape(x.catalogId)+'"><span class="play-art">'+(typeof SkazArt!=='undefined'?SkazArt.markup(x.entry):'')+(on?'<span class="play-concentration-marker" data-ui-icon="focus" aria-hidden="true"></span>':'')+'<span class="play-spell-level" aria-label="'+(spell?.level===0?'Заговор':spell?.level===undefined?'Круг не указан':spell.level+' круг')+'">'+(spell?.level===0?'∅':spell?.level??'?')+'</span></span><span class="play-spell-copy"><small class="play-action-kind" aria-hidden="true">'+label+'</small><strong>'+escape(x.entry.name.ru)+'</strong><small title="'+escape(summary)+'">'+(on?'<span data-ui-icon="focus"></span> действует · ':'')+escape(summary)+'</small></span></button>'+castControls(x)+'</div>';}).join('');}).join(''):'<p class="small">В этой группе нет заклинаний.</p>')+'</div></section>';
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
  return `<div class="play-item"><button class="play-row" data-play-read="item" data-id="${id}">${art}<span class="play-item-copy"><strong>${name}</strong><span class="play-item-balance">${details}</span></span></button>${action}</div>`;
 }
 function content(level){
  if(status==='loading'&&bookState!=='ready'&&inventoryState!=='ready')return '<p role="status">Открываем подготовленные заклинания и инвентарь…</p>';
  if(status==='error')return '<div class="panel"><h2>Игровые списки недоступны</h2><p>Проверь соединение или заверши отправку очереди. Хиты и доступные ресурсы остаются в панели.</p><button id="play-retry">Повторить</button></div>';
  const spells=book.filter(x=>SkazStorage.spellLearningMode?.()==='known'||x.status==='prepared'||x.entry.spell?.level===0).sort((a,b)=>(a.entry.spell?.level??99)-(b.entry.spell?.level??99)||a.entry.name.ru.localeCompare(b.entry.name.ru,'ru'));
  const consumables=items.filter(x=>{const info=x.entry.item||x.entry.artifact;return info?.charges||['potion','scroll'].includes(info?.type);}).sort((a,b)=>a.entry.name.ru.localeCompare(b.entry.name.ru,'ru'));
  const latest=[...state.journal,...state.notes].sort((a,b)=>(b.at||0)-(a.at||0))[0];
  const recent=latest&&SkazPlayPresentation.note(latest,SkazCasting.readManualNote(latest));
  const inventoryUnavailable=inventoryState==='error'||(status==='retrying'&&inventoryState==='pending');
  const spellContent=bookState==='ready'?spellPanel(spells,consumables.length>0||inventoryUnavailable,level):listFeedback('book',bookState);
  const inventoryContent=inventoryState!=='ready'?listFeedback('items',inventoryState):consumables.length
   ?`<section class="panel play-consumables" data-play-section="items"><h2 id="play-consumables-title" tabindex="-1">Расходники и заряды</h2>
     <div class="play-list" tabindex="0" role="region" aria-label="Расходники и заряды" data-play-list="items">${consumables.map(consumableRow).join('')}</div>
     <p class="small">−1 списывает предмет. Эффект подтверждается отдельно.</p></section>`
   :'<section class="panel play-empty" data-play-section="items"><button id="play-prepare-inventory" data-play-prepare="inventory">Добавить расходники <span class="ui-inline-icon" data-ui-icon="arrow-right"></span></button></section>';
  const itemsFirst=!spells.length&&consumables.length>0;
  const recentContent=recent
   ?`<section class="panel play-last" data-play-recent><h2>Последняя запись</h2><strong>${escape(recent.title)}</strong><p>${escape(recent.text)}</p><button id="play-note"><span class="ui-inline-icon" data-ui-icon="add"></span> Личная заметка</button></section>`
   :'<section class="panel play-empty" data-play-recent><button id="play-note"><span class="ui-inline-icon" data-ui-icon="add"></span> Первая личная заметка</button></section>';
  return `${itemsFirst?'':spellContent}<div class="play-side">${inventoryContent}${itemsFirst?spellContent:''}${recentContent}</div>`;
 }
 function listFeedback(kind,state){
  const book=kind==='book';
  const pending=state==='pending';
  const retrying=status==='retrying';
  const section=' data-play-section="'+kind+'"';
  if(pending&&!retrying)return '<p'+section+' role="status">'+(book?'Открываем книгу заклинаний…':'Открываем расходники…')+'</p>';
  const title=book?'Книга заклинаний недоступна.':'Расходники недоступны.';
  const retry='Повторить загрузку '+(book?'книги заклинаний':'расходников');
  const anchor=book?'':' id="play-consumables-title" tabindex="-1"';
  return '<section class="notice play-list-notice"'+section+anchor+'><span role="status">'+
   (retrying?'Повторяем загрузку…':title)+'</span><button id="play-retry" aria-label="'+retry+'"'+
   (status==='ready'?'':' disabled')+'>Повторить</button></section>';
 }
 const renderedCharges=new WeakMap();
 function renderChargeTracker(){
  const root=document.getElementById('play-quick-item-charges');
  if(!root)return;
  const markup=chargeTrackerMarkup();
  if(renderedCharges.get(root)===markup)return;
  root.innerHTML=markup;
  renderedCharges.set(root,markup);
 }
 function chargeTrackerMarkup(){
  if(status==='error'||inventoryState!=='ready'||typeof SkazItemCharges==='undefined')return '';
  const charged=items.filter(item=>SkazItemCharges.maximum(item.entry));
  if(charged.length!==1||charged[0].quantity!==1)return '';
  const item=charged[0],balance=SkazItemCharges.balance(item,0);
  if(!balance)return '';
  const {value,maximum}=balance;
  const numeric=value===null?'Не указаны':escape(value)+' <small>/ '+escape(maximum)+'</small>';
  const marks=value!==null&&maximum<=12?'<div class="play-charge-marks" aria-hidden="true">'+Array.from({length:maximum},(_,i)=>'<span'+(i<value?' class="filled"':'')+'></span>').join('')+'</div>':'';
  return '<div class="play-charge-heading"><div><strong class="tracker-name">'+escape(item.entry.name.ru)+'</strong><small>Заряды</small></div><span class="tracker-balance play-charge-balance">'+numeric+'</span></div>'+marks;
 }

 // Resource commands change balances, casting controls and the recent note.
 // Keep the loaded rows and their hydrated artwork attached throughout the update.
 function updateResources(main,settled=false){
  if(owner!==SkazStorage.contextKey())return false;
  const screen=main.querySelector('.play-screen'),summon=activeSummon();
  if(summon)return screen?.dataset.playSummonId===summon.id;
  if(status==='idle'||(bookState!=='ready'&&inventoryState!=='ready'))return false;
  const root=document.getElementById('play-content');
  const lists=SkazStorage.playResourceLists({book:bookState==='ready',items:inventoryState==='ready'});
  if(!root||!screen||!lists)return false;

  key=SkazStorage.snapshotKey();
  if(bookState==='ready')book=lists.book;
  if(inventoryState==='ready')items=lists.items;
  const next=document.createElement('template');
  next.innerHTML=content(actorLevel(SkazStorage.sheet?.()));
  const fragment=next.content;
  const readRows=parent=>[...parent.querySelectorAll('[data-play-read]')];
  const currentRows=readRows(root),nextRows=readRows(fragment);
  if(currentRows.length!==nextRows.length||currentRows.some((row,index)=>
   row.dataset.playRead!==nextRows[index].dataset.playRead||row.dataset.id!==nextRows[index].dataset.id
  ))return false;

  for(const [index,row] of currentRows.entries()){
   const updated=nextRows[index];
   if(row.dataset.playRead==='spell'){
    const concentrating=updated.classList.contains('is-concentrating');
    if(row.classList.contains('is-concentrating')!==concentrating){
     row.classList.toggle('is-concentrating',concentrating);
     row.querySelector('.play-concentration-marker')?.remove();
     if(concentrating)row.querySelector('.play-spell-level').before(updated.querySelector('.play-concentration-marker'));
    }
    replacePlayPart(row,updated,'.play-spell-copy');
    replacePlayPart(row.parentElement,updated.parentElement,'.play-casting-controls');
   }else{
    replacePlayPart(row,updated,'.play-item-copy');
    replacePlayPart(row.parentElement,updated.parentElement,'.play-action-command');
   }
  }
  replacePlayPart(root,fragment,'[data-play-recent]');
  SkazPlayPresentation.refreshActor(screen,actorView());
  renderChargeTracker();
  const pendingList=bookState==='pending'?'book':inventoryState==='pending'?'items':null;
  // Wait for the write to settle before reading from its new snapshot.
  if(settled&&pendingList&&readKey!==key){
   if(lists.status==='ready')void load(null,true);
   else{
    if(pendingList==='book')bookState='error';
    else inventoryState='error';
    status='ready';
    refresh(pendingList);
   }
  }
  return true;
 }
 function patchCastChoices(current,incoming){
  const picker=current.querySelector('[data-play-cast-select]');
  const nextPicker=incoming.querySelector('[data-play-cast-select]');
  if(!picker||!nextPicker)return false;
  const choices=[...current.querySelectorAll('[data-play-cast-level]')];
  const nextChoices=[...incoming.querySelectorAll('[data-play-cast-level]')];
  const options=[...picker.options],nextOptions=[...nextPicker.options];
  if(choices.length!==nextChoices.length||options.length!==nextOptions.length||
     choices.some((choice,index)=>choice.dataset.level!==nextChoices[index].dataset.level)||
     options.some((option,index)=>option.value!==nextOptions[index].value))return false;
  choices.forEach((choice,index)=>SkazUI.patchButton(choice,nextChoices[index]));
  options.forEach((option,index)=>{
   const updated=nextOptions[index],label=updated.getAttribute('aria-label');
   if(option.getAttribute('aria-label')!==label)option.setAttribute('aria-label',label);
   if(option.defaultSelected!==updated.defaultSelected)option.defaultSelected=updated.defaultSelected;
  });
  if(picker.value!==nextPicker.value)picker.value=nextPicker.value;
  return true;
 }

 function replacePlayPart(current,updated,selector){
  const prior=current.querySelector(selector),next=updated.querySelector(selector);
  if(!prior||!next)return;
  // Compare the recent panel in the same decorated form as the mounted one.
  if(selector==='[data-play-recent]')SkazIcons.mount(next);
  if(prior.isEqualNode(next))return;
  if(prior.tagName==='BUTTON'&&next.tagName==='BUTTON'){SkazUI.patchButton(prior,next);return;}
  if(selector==='.play-casting-controls'){
   const command=prior.querySelector('[data-play-cast]'),nextCommand=next.querySelector('[data-play-cast]');
   if(command&&nextCommand){
    SkazUI.patchButton(command,nextCommand);
    if(patchCastChoices(prior,next))return;
    const choices=[...prior.children].filter(node=>node!==command);
    const nextChoices=[...next.children].filter(node=>node!==nextCommand);
    if(choices.length!==nextChoices.length||choices.some((choice,index)=>!choice.isEqualNode(nextChoices[index]))){
     for(const choice of choices)choice.remove();
     command.before(...nextChoices);
    }
    return;
   }
  }
  prior.replaceWith(next);
 }

 // A list response changes one section. Keep the already loaded peer and its artwork mounted.
 function patchPartialLoad(root,markup,changed){
  const side=root.querySelector('.play-side');
  if(!side)return false;
  const template=document.createElement('template');
  template.innerHTML=markup;
  const draft=template.content,draftSide=draft.querySelector('.play-side');
  const section=kind=>'[data-play-section="'+kind+'"]';
  const healthy=section(changed==='book'?'items':'book');
  const kept=root.querySelector(healthy),nextHealthy=draft.querySelector(healthy);
  const previous=root.querySelector(section(changed));
  const recent=side.querySelector('[data-play-recent]');
  if(!kept||!nextHealthy||!previous||!recent||!draftSide)return false;

  if(changed==='items'){
   const scopes=kept.querySelector('[data-play-list="scopes"]');
   const link=scopes?.querySelector('#play-show-consumables');
   const nextLink=nextHealthy.querySelector('#play-show-consumables');
   if(link&&!nextLink)link.remove();
   else if(!link&&nextLink)scopes?.append(nextLink);
  }
  previous.remove();
  const top=draft.firstElementChild;
  if(top!==draftSide){
   const actual=top===nextHealthy?kept:top;
   if(actual.nextElementSibling!==side)root.insertBefore(actual,side);
  }
  let anchor=recent;
  for(const part of [...draftSide.children].slice(0,-1).reverse()){
   const actual=part===nextHealthy?kept:part;
   if(actual.nextElementSibling!==anchor)side.insertBefore(actual,anchor);
   anchor=actual;
  }
  return true;
 }

 function changeSpellScope(button){
  spellScope=button.dataset.playSpellScope;
  scrollPositions.spells=0;
  const section=button.closest?.('.play-spells');
  const list=section?.querySelector('[data-play-list="spells"]');
  if(list){
   const draft=document.createElement('template');
   draft.innerHTML=content(actorLevel(SkazStorage.sheet?.()));
   const updated=draft.content.querySelector('[data-play-list="spells"]');
   if(updated){
    list.replaceChildren(...updated.childNodes);
    list.scrollTop=0;
    for(const choice of section.querySelectorAll('[data-play-spell-scope]')){
     choice.setAttribute('aria-pressed',String(choice.dataset.playSpellScope===spellScope));
    }
    button.focus?.({preventScroll:true});
    return;
   }
  }
  refresh();
  document.querySelector?.('[data-play-spell-scope="'+spellScope+'"]')?.focus();
 }

 function refresh(changed=null){
  if(!active()||activeSummon()||key!==SkazStorage.snapshotKey())return;
  renderChargeTracker();
  const root=document.getElementById('play-content');
  if(!root)return;
  const scopes=root.querySelector('[data-play-list="scopes"]');
  if(scopes && scopes.scrollWidth>scopes.clientWidth) {
   scrollPositions.scopes=scopes.scrollLeft;
  }
  captureFocus();
  const markup=content(actorLevel(SkazStorage.sheet?.()));
  if(!changed||!patchPartialLoad(root,markup,changed))root.innerHTML=markup;
  restoreFocus();
  document.querySelectorAll('[data-play-list]').forEach(list=>{
   const kind=list.dataset.playList;
   list[kind==='scopes'?'scrollLeft':'scrollTop']=scrollPositions[kind]||0;
  });
 }

 let readKey=null;
 async function load(retryButton=null,keepReady=false){
  if(retryButton&&(status==='loading'||status==='retrying'))return;
  const token=++serial,captured=key;
  readKey=captured;
  const partial=keepReady||(status==='ready'&&(bookState==='error'||inventoryState==='error'));
  const retrying=keepReady?status==='retrying':partial;
  const contentRoot=document.getElementById('play-content');
  const focusAnchor=(retryButton&&document.activeElement===retryButton||keepReady&&retrying&&document.activeElement===contentRoot)?contentRoot:null;
  const requests=[];
  if(!partial||bookState!=='ready'){bookState='pending';book=[];requests.push(['book',()=>SkazStorage.spellbookData()]);}
  if(!partial||inventoryState!=='ready'){inventoryState='pending';items=[];requests.push(['items',()=>SkazStorage.inventoryData()]);}
  status=retrying?'retrying':'loading';
  if(!keepReady)refresh(partial?requests[0][0]:null);
  if(focusAnchor&&document.activeElement===document.body)focusAnchor.focus({preventScroll:true});

  await Promise.all(requests.map(async ([kind,read])=>{
   let entries=null,invalidSnapshot=false;
   try{
    const data=await read();
    if(Array.isArray(data?.entries))entries=data.entries;
   }catch(error){invalidSnapshot=[401,403,404,409].includes(error?.status);}
   if(token!==serial||captured!==SkazStorage.snapshotKey()||status==='error')return;
   if(!active()){status='idle';return;}
   const hasReadyPeer=kind==='book'?inventoryState==='ready':bookState==='ready';
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
   refresh(hasReadyPeer&&!invalidSnapshot?kind:null);
   if(status!=='loading'&&status!=='retrying'&&(bookState==='error'||inventoryState==='error')&&
      focusAnchor&&document.activeElement===focusAnchor){
    document.getElementById('play-retry')?.focus({preventScroll:true});
   }
  }));
 }


 const searchViewport=globalThis.visualViewport;
 function updateSearchViewport(){
  if(!searchViewport)return;
  const dialog=document.getElementById('dialog');
  if(!dialog)return;
  const obscured=innerHeight-searchViewport.height;
  // Pinch zoom also shrinks the visual viewport, but should keep normal dialog behavior.
  const reduced=dialog.open&&dialog.querySelector('#play-search-panel')&&searchViewport.scale===1&&obscured>48;
  if(reduced){
   dialog.setAttribute('data-play-search-viewport',searchViewport.height<172?'compact':'');
   dialog.style.setProperty('--play-search-top',Math.ceil(searchViewport.offsetTop)+'px');
   dialog.style.setProperty('--play-search-height',Math.floor(searchViewport.height)+'px');
  }else if(dialog.hasAttribute('data-play-search-viewport')){
   dialog.removeAttribute('data-play-search-viewport');
   dialog.style.removeProperty('--play-search-top');
   dialog.style.removeProperty('--play-search-height');
  }
 }
 if(searchViewport){
  searchViewport.addEventListener('resize',updateSearchViewport);
  searchViewport.addEventListener('scroll',updateSearchViewport);
  globalThis.addEventListener('resize',updateSearchViewport);
  document.getElementById('dialog')?.addEventListener('close',updateSearchViewport);
 }
 function search(initial='',chooseSpell){
  const captured=SkazStorage.snapshotKey(),openedPage=page,instance=++searchSerial;
  const searchHint=chooseSpell?'Введи название заклинания.':'Введи название заклинания, предмета или правила.';
  let request=0,results=[],submittedQuery='';
  const valid=()=>instance===searchSerial&&page===openedPage&&captured===SkazStorage.snapshotKey();
  const draw=(value=initial,focusIndex=null)=>{
   if(!valid())return;
   modal(`<section id="play-search-panel"><h2>${chooseSpell?'Добавить заклинание':'Правила во время игры'}</h2><form id="play-search-form"><label for="play-search-query">Название RU / EN</label><input id="play-search-query" type="search" maxlength="200" value="${escape(value)}"><button type="submit">Найти</button></form><div class="play-search-feedback"><div id="play-search-status" role="status"></div><div id="play-search-results"></div></div></section>`);
   updateSearchViewport();
   const field=document.getElementById('play-search-query');
   if(chooseSpell)field.focus({preventScroll:true});
   const list=document.getElementById('play-search-results');
   const status=document.getElementById('play-search-status');
   const clearResults=message=>{
    results=[];
    list.innerHTML='';
    status.className='';
    status.textContent=message;
   };
   field.oninput=()=>{
    const query=field.value.trim();
    if(!submittedQuery||query===submittedQuery)return;
    ++request;
    clearResults(query?'Запрос изменён. Нажми «Найти».':searchHint);
   };
   const paintResults=(selectedIndex=null)=>{
    status.className='visually-hidden';
    status.textContent=`Показано результатов: ${results.length}.`;
    list.innerHTML=results.map((entry,index)=>`<button class="play-row" data-play-search-result="${index}">${escape(entry.name.ru)} · ${escape(entry.name.en)}</button>`).join('');
    const buttons=document.querySelectorAll('[data-play-search-result]');
    for(const button of buttons)button.onclick=()=>{
     const index=Number(button.dataset.playSearchResult);
     const entry=results[index];
     if(!entry||!valid()||field.value.trim()!==submittedQuery)return;
     const draft=field.value;
     ++request;
     if(chooseSpell){chooseSpell(entry);return;}
     SkazCatalog.readSnapshot(entry,()=>draw(draft,index),valid,'К поиску');
     updateSearchViewport();
    };
    if(selectedIndex!==null){
     const selected=buttons[selectedIndex];
     selected?.focus({preventScroll:true});
     selected?.scrollIntoView({block:'nearest'});
    }
   };
   if(results.length)paintResults(focusIndex);
   else status.textContent=searchHint;
   const form=document.getElementById('play-search-form');
   form.onsubmit=async event=>{
    event.preventDefault();
    const submitted=field.value.trim();
    if(!valid()||!submitted)return;
    // When only one row fits above the keyboard, close it before showing results.
    if(document.activeElement===field&&document.getElementById('dialog')?.getAttribute('data-play-search-viewport')==='compact'){
     form.querySelector('button[type=submit]')?.focus({preventScroll:true});
    }
    const token=++request;
    submittedQuery=submitted;
    clearResults('Ищем…');
    let found;
    try{
     const params=new URLSearchParams({q:submitted,limit:'8'});
     if(chooseSpell)params.set('kind','spell');
     const response=await fetch('/api/catalog?'+params,{cache:'no-store',signal:AbortSignal.timeout(10000)});
     if(!response.ok)throw Error();
     const data=await response.json();
     if(Array.isArray(data.entries))found=chooseSpell?data.entries.filter(entry=>entry.kind==='spell'):data.entries;
    }catch{
     found=undefined;
    }
    if(token!==request||!valid()||!document.getElementById('dialog')?.open||list!==document.getElementById('play-search-results'))return;
    if(field.value.trim()!==submitted){
     status.textContent='Запрос изменён. Нажми «Найти».';
     return;
    }
    if(!found){
     status.textContent='Поиск недоступен. Повтори запрос.';
     return;
    }
    results=found;
    if(results.length)paintResults();
    else status.textContent='Ничего не найдено. Измени название.';
   };
  };
  draw();
  if(initial)document.getElementById('play-search-form').requestSubmit();
 }
 document.addEventListener('submit',event=>{if(event.target.id==='header-search'){event.preventDefault();search(document.getElementById('header-search-query').value.trim());}});
 document.addEventListener('scroll',event=>{
  const list=event.target,kind=list.dataset?.playList;
  if(active()&&owner===SkazStorage.contextKey()&&['spells','items','scopes'].includes(kind)){
   scrollPositions[kind]=list[kind==='scopes'?'scrollLeft':'scrollTop'];
  }
 },true);
 document.addEventListener('change',event=>{
  const input=event.target,id=input.dataset?.playCastSelect;
  if(id&&active()&&key===SkazStorage.snapshotKey())changeCastLevel(id,Number(input.value),input);
 });
 document.addEventListener('click',async event=>{const b=event.target.closest('button');if(!b)return;if(b.dataset.playMode){closeModal();go(b.dataset.playMode==='play'?'play':'hero');return;}if(!active())return;if(battleClick(b))return;if(b.id==='play-edit'){go('hero');return;}if(b.id==='play-search'){search();return;}if(activeSummon())return;if(b.id==='play-checks'){SkazCharacterSheet.checks();return;}if(key!==SkazStorage.snapshotKey())return;if(spellScopes.some(([id])=>id===b.dataset.playSpellScope)){changeSpellScope(b);return;}if(b.id==='play-retry'){void load(b);return;}if(b.id==='play-show-consumables'){const target=document.getElementById('play-consumables-title');target?.focus();return;}if(['spells','inventory'].includes(b.dataset.playPrepare)){go(b.dataset.playPrepare);return;}
  if(b.dataset.playCastLevel){if(changeCastLevel(b.dataset.playCastLevel,Number(b.dataset.level),b))b.focus?.({preventScroll:true});return;}
  if(b.dataset.playCast){const item=book.find(x=>x.catalogId===b.dataset.playCast);if(item&&SkazStorage.canResource?.())openCast(item);return;}
  if(b.dataset.playRead){const item=(b.dataset.playRead==='spell'?book:items).find(x=>x.catalogId===b.dataset.id),captured=key;if(item)SkazCatalog.readSnapshot(item.entry,closeModal,()=>active()&&captured===SkazStorage.snapshotKey(),'К игре');}
  if(b.dataset.playCharges){const item=items.find(x=>x.catalogId===b.dataset.playCharges);if(item)SkazStorage.editCharges(item,{fromQuickAccess:true});return;}
  if(b.dataset.playSpend){const item=items.find(x=>x.catalogId===b.dataset.playSpend);if(!item)return;try{await SkazStorage.spendInventoryOne(item,key);toast('Списан один предмет. Эффект не применён автоматически.');}catch(error){toast(error.message);}}
 });
 return {actorIdentity,actorView,view,summonActive:()=>Boolean(activeSummon()),updateResources,mode,remember,castingGroup,inSpellScope,spellSummary,captureFocus,restoreFocus,findSpell:choose=>search('',choose)};
})();
