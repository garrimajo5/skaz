// Isolated advancement editor. Not mounted by the production shell yet.
const SkazClassAdvancement=(()=>{
 const titles={'ability-score-improvement-or-feat':'Повышение характеристик','cantrips':'Новые заговоры','known-spells':'Новые заклинания','spellbook-spells':'Записи в книге','magical-secrets':'Магические тайны','mystic-arcanum':'Таинственный арканум'};
 const abilityNames={str:'Сила',dex:'Ловкость',con:'Телосложение',int:'Интеллект',wis:'Мудрость',cha:'Харизма'};
 function el(tag,text,parent){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(parent)parent.append(e);return e;}
 async function mount(root,{load,preview,send,newId=()=>crypto.randomUUID()}){
  let closed=false,pending=null,pendingKind='advance',candidate=null,running=false,epoch=0;
  const status=el('p','Загружаю героя…',root);status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const form=el('form',undefined,root);form.className='class-advancement';
  const summary=el('div',undefined,root),actions=el('div',undefined,root);actions.className='advancement-actions';
  const check=el('button','Проверить повышение',actions),apply=el('button','Подтвердить повышение',actions),retry=el('button','Повторить сохранение',actions),reconcile=el('button','Сверить состояние и начать заново',actions);
  apply.hidden=true;retry.hidden=true;reconcile.hidden=true;check.disabled=true;
  function lock(value){for(const field of form.querySelectorAll('input,select,button'))field.disabled=value;check.disabled=value;apply.disabled=value;retry.disabled=running;}
  function invalidate(){candidate=null;apply.hidden=true;summary.replaceChildren();}
  form.addEventListener('input',invalidate);form.addEventListener('change',invalidate);form.addEventListener('submit',e=>e.preventDefault());
  async function refresh(){
   const mark=++epoch;const data=await load();if(closed||mark!==epoch)return;
   form.replaceChildren();invalidate();
   el('h2',data.className+': '+data.fromLevel+' → '+(data.fromLevel+1),form);
   el('p','Повысятся максимальные хиты и выбранные данные. Текущие хиты не восстанавливаются. Ручные счётчики не присваиваются автоматически.',form);
   if(data.resourceSetup?.length){
    const fs=el('fieldset',undefined,form);el('legend','Подключить ресурсы класса',fs);
    el('p','Выбери, какие ресурсы вести автоматически. Привязка сохраняет остаток ручного счётчика; новый счётчик создаётся полным. Это отдельное подтверждение до повышения.',fs);
    const selections=[];
    for(const resource of data.resourceSetup){
     const label=el('label',resource.name+' (максимум '+resource.max+')',fs),select=el('select',undefined,label);label.className='advancement-resource';
     for(const [value,text]of [['manual','Оставить ручным'],...(resource.canCreate?[['create','Создать новый счётчик']]:[]),...resource.counters.map(c=>[c.id,'Связать: '+c.name+' — '+c.current+'/'+c.max])]){const option=el('option',text,select);option.value=value;}
     selections.push({resource,select});
    }
    const bind=el('button','Подключить выбранные ресурсы',fs);bind.type='button';
    bind.onclick=()=>{if(running||pending||closed)return;const bindings=[],create=[];for(const {resource,select}of selections){if(select.value==='create')create.push(resource.id);else if(select.value!=='manual')bindings.push({resourceId:resource.id,counterId:select.value});}if(!bindings.length&&!create.length){status.textContent='Выбери хотя бы один ресурс для подключения.';return;}invalidate();pendingKind='bind';pending=JSON.stringify({mutationId:newId(),expectedRevision:data.revision,characterId:data.characterId,classId:data.classId,bindings,create});return save();};
   }
   const hpLabel=el('label','Хиты за уровень',form),method=el('select',undefined,hpLabel);method.name='hpMethod';
   for(const [value,label]of [['fixed','Среднее значение'],['roll','Мой бросок кости']]){const o=el('option',label,method);o.value=value;}
   const rollLabel=el('label','Результат броска',form),roll=el('input',undefined,rollLabel);roll.type='number';roll.min='1';roll.max=String(data.hitDie);roll.name='hpRoll';rollLabel.hidden=true;method.addEventListener('change',()=>rollLabel.hidden=method.value!=='roll');
   const controls=new Map();let blocked=false;
   for(const choice of data.plan.choices){
    if(!choice.required&&!titles[choice.kind])continue;
    const fs=el('fieldset',undefined,form);el('legend',(titles[choice.kind]||choice.kind)+' — выбрать '+choice.count,fs);
    if(choice.kind==='ability-score-improvement-or-feat'){
     el('p','Распредели 2 пункта. Не выше 20. Выбор черты ещё не подключён.',fs);const fields={};
     for(const [key,name]of Object.entries(abilityNames)){const l=el('label',name+' ('+data.abilities[key]+')',fs),n=el('input',undefined,l);n.type='number';n.min='0';n.max=String(Math.max(0,Math.min(2,20-data.abilities[key])));n.value='0';n.setAttribute('aria-label',name+': прибавка');fields[key]=n;}
     controls.set(choice.id,()=>({increases:Object.fromEntries(Object.entries(fields).map(([k,n])=>[k,n.value===''?null:Number(n.value)]))}));
    }else if(data.options[choice.id]){
     const searchLabel=el('label','Найти заклинание',fs),search=el('input',undefined,searchLabel);search.type='search';
     const count=el('p','Выбрано 0 из '+choice.count,fs);count.setAttribute('aria-live','polite');
     const list=el('div',undefined,fs);list.className='advancement-spells';const rows=[];
     for(const spell of data.options[choice.id]){const l=el('label',undefined,list),box=el('input',undefined,l);box.type='checkbox';box.value=spell.spellId;el('span',spell.name.ru+' / '+spell.name.en+' · '+(spell.level===0?'заговор':spell.level+' круг'),l);rows.push({l,box,search:(spell.name.ru+' '+spell.name.en).toLocaleLowerCase('ru')});}
     search.addEventListener('input',()=>{const q=search.value.trim().toLocaleLowerCase('ru');for(const r of rows)r.l.hidden=!r.box.checked&&!r.search.includes(q);});
     list.addEventListener('change',()=>{const n=rows.filter(r=>r.box.checked).length;count.textContent='Выбрано '+n+' из '+choice.count;});
     controls.set(choice.id,()=>rows.filter(r=>r.box.checked).map(r=>r.box.value));
    }else{blocked=true;el('p','Этот обязательный выбор пока не подключён. Повышение не будет сохранено.',fs);}
   }
   const reviews=[];
   if(data.plan.requiresFeatureReview.length){const fs=el('fieldset',undefined,form);el('legend','Новые умения: ручная проверка',fs);el('p','Эффекты этих умений ещё не применяются автоматически. Отметка подтверждает только проверку правил.',fs);for(const feature of data.plan.requiresFeatureReview){const l=el('label',undefined,fs),box=el('input',undefined,l);box.type='checkbox';el('span','Проверил: '+feature,l);reviews.push({feature,box});}}
   status.textContent=blocked?'Есть неподдерживаемый обязательный выбор. Сохранение недоступно.':'Выбери изменения и проверь итог до сохранения.';check.disabled=blocked;
   check.onclick=async()=>{
    if(running||pending||blocked||closed)return;running=true;lock(true);invalidate();
    const command={expectedRevision:data.revision,characterId:data.characterId,classId:data.classId,fromLevel:data.fromLevel,hpMethod:method.value,hpRoll:method.value==='roll'&&roll.value!==''?Number(roll.value):null,choices:Object.fromEntries([...controls].map(([id,read])=>[id,read()])),reviewedFeatures:reviews.filter(r=>r.box.checked).map(r=>r.feature)};
    try{const result=await preview({...command,mutationId:newId()});if(closed)return;candidate=command;el('p','Максимум хитов: '+data.maxHp+' → '+(data.maxHp+result.hitPoints.maximumDelta)+'. Текущие: '+data.hp+'.',summary);el('p','Бонус мастерства: +'+result.proficiency.before+' → +'+result.proficiency.after+'.',summary);for(const resource of result.newResources)el('p','Новый ресурс: '+resource.name+' — '+resource.max+'.',summary);if(result.unmanagedResources.length)el('p','Существующие ручные ресурсы не изменятся. Их максимумы нужно сверить отдельно.',summary);apply.hidden=false;status.textContent='Итог проверен. Подтверди повышение.';}catch(e){if(!closed)status.textContent=e.message;}finally{running=false;if(!closed)lock(false);}
   };
  }
  async function save(){
   if(running||!pending||closed)return;running=true;lock(true);status.textContent=pendingKind==='bind'?'Подключаю ресурсы…':'Сохраняю повышение…';
   try{const result=await send(pending,pendingKind);if(closed)return;pending=null;candidate=null;apply.hidden=true;retry.hidden=true;summary.replaceChildren();if(pendingKind==='bind'){try{await refresh();if(!closed)status.textContent='Ресурсы подключены. Теперь выбери повышение уровня.';}catch(e){if(!closed){status.textContent='Ресурсы сохранены, но обновить героя не удалось. Сверь состояние перед повышением.';reconcile.hidden=false;}}}else{form.replaceChildren();check.hidden=true;status.textContent='Сохранено: уровень '+result.characterSheet.level+'. Максимум хитов '+result.state.maxHp+'.';}}
   catch(e){if(closed)return;status.textContent=e.message+(e.notApplied?' Команда не применена. Сверь героя перед новым выбором.':' Для безопасного повтора используй ту же команду.');retry.hidden=e.notApplied===true;reconcile.hidden=e.notApplied!==true;apply.hidden=true;}
   finally{running=false;if(!closed){retry.disabled=false;if(pending)lock(true);}}
  }
  reconcile.onclick=async()=>{if(running||closed)return;running=true;pending=null;candidate=null;reconcile.hidden=true;retry.hidden=true;check.hidden=false;check.disabled=true;try{await refresh();}catch(e){if(!closed){status.textContent=e.message;reconcile.hidden=false;}}finally{running=false;}};
  apply.onclick=()=>{if(!candidate||pending||running||closed)return;pendingKind='advance';pending=JSON.stringify({...candidate,mutationId:newId()});return save();};retry.onclick=save;
  try{await refresh();}catch(e){if(!closed)status.textContent=e.message;}
  return {destroy(){closed=true;epoch++;pending=null;root.replaceChildren();}};
 }
 return {mount};
})();
