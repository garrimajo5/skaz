// Advancement editor shared by the main application and disposable QA fixtures.
const SkazClassAdvancement=(()=>{
 const titles={'ability-score-improvement-or-feat':'Повышение характеристик','cantrips':'Новые заговоры','known-spells':'Новые заклинания','spellbook-spells':'Записи в книге','magical-secrets':'Магические тайны','mystic-arcanum':'Таинственный арканум'};
 // Display labels do not decide whether an optional choice is supported.
 const choiceNames={'subclass':'Подкласс','expertise':'Компетентность','fighting-style':'Боевой стиль','metamagic':'Метамагия','invocations':'Таинственные воззвания','pact-boon':'Предмет договора','favored-enemy-and-language':'Избранный враг и язык','favored-terrain':'Избранная местность','spell-mastery':'Мастерство заклинаний','signature-spells':'Фирменные заклинания'};
 const optionalNotices={'replace-known-spell':'При этом повышении правила разрешают заменить одно известное заклинание. Замена в мастере пока недоступна; продолжение сохранит прежние известные заклинания.','replace-invocation':'При этом повышении правила разрешают заменить одно воззвание. Замена в мастере пока недоступна; продолжение не меняет прежний выбор.'};
 const abilityNames={str:'Сила',dex:'Ловкость',con:'Телосложение',int:'Интеллект',wis:'Мудрость',cha:'Харизма'};
 function el(tag,text,parent){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(parent)parent.append(e);return e;}
 function renderFeatureHelp(parent,info,feature){
      const details=el('details',undefined,parent);
      el('summary',info?.name||feature,details);
      for(const paragraph of (info?.text||'Описание этого умения пока не подключено. Проверь правила отдельно.').split(/\n\s*\n/))el('p',paragraph,details);
      for(const option of info?.referenceOptions||[])renderFeatureHelp(details,{...option,source:option.source||info.source},option.key);
      if(info?.status==='unsupported')el('p','Правила этого умения пока не подключены полностью.',details);
      if(Number.isSafeInteger(info?.sourcePage)&&info.sourcePage>0){
       const link=el('a','Источник: SRD 5.1, стр. '+info.sourcePage,details);
       link.href='https://media.wizards.com/2023/downloads/dnd/SRD_CC_v5.1.pdf#page='+info.sourcePage;
       link.target='_blank';link.rel='noopener noreferrer';
       if(info.source?.attribution){const license=el('details',undefined,details);el('summary','Лицензия и авторство',license);el('p',info.source.attribution,license);}
      }
 }
 function renderChosenChanges(parent,data,command){
  for(const choice of data.plan.choices){
   const selected=command.choices[choice.id];if(selected===undefined)continue;
   if(choice.kind==='ability-score-improvement-or-feat'){
    for(const [key,name]of Object.entries(abilityNames)){const delta=selected.increases[key];if(delta>0)el('p',name+': '+data.abilities[key]+' → '+(data.abilities[key]+delta)+'.',parent);}
   }else if(choice.kind==='metamagic'){
    const names=selected.map(id=>data.metamagicOptions?.[choice.id]?.find(s=>s.id===id)?.name||id);
    el('p','Метамагия: '+names.join('; ')+'. Применение и расход очков учитывай вручную.',parent);
   }else if(choice.kind==='fighting-style'){
    const names=selected.map(id=>data.styleOptions?.[choice.id]?.find(s=>s.id===id)?.name||id);
    el('p','Боевой стиль: '+names.join('; ')+'. Боевые бонусы учитывай вручную.',parent);
   }else if(Array.isArray(selected)){
    const names=selected.map(id=>{const spell=data.options[choice.id]?.find(s=>s.spellId===id);return spell?spell.name.ru+' / '+spell.name.en:id;});
    if(names.length)el('p',(titles[choice.kind]||choiceNames[choice.kind]||choice.kind)+': '+names.join('; ')+'.',parent);
   }
  }
 }
 async function mount(root,{load,preview,send,onSaved=()=>{},newId=()=>crypto.randomUUID()}){
  let closed=false,pending=null,pendingKind='advance',candidate=null,running=false,epoch=0;
  const status=el('p','Загружаю героя…',root);status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const form=el('form',undefined,root);form.className='class-advancement';
  const summary=el('div',undefined,root),actions=el('div',undefined,root);actions.className='advancement-actions';
  const check=el('button','Проверить повышение',actions),apply=el('button','Подтвердить повышение',actions),retry=el('button','Повторить сохранение',actions),reconcile=el('button','Сверить состояние и начать заново',actions);
  apply.hidden=true;retry.hidden=true;reconcile.hidden=true;check.disabled=true;
  function lock(value){for(const field of form.querySelectorAll('input,select,button'))field.disabled=value;check.disabled=value;apply.disabled=value;retry.disabled=running;}
  function invalidate(){if(candidate&&!running&&!pending)status.textContent='Выбор изменён. Проверь итог ещё раз перед сохранением.';candidate=null;apply.hidden=true;summary.replaceChildren();}
  form.addEventListener('input',invalidate);form.addEventListener('change',invalidate);form.addEventListener('submit',e=>e.preventDefault());
  async function refresh(){
   const mark=++epoch;const data=await load();if(closed||mark!==epoch)return;
   form.replaceChildren();invalidate();
   el('h2',data.className+': '+data.fromLevel+' → '+(data.fromLevel+1),form);
   el('p','Повысятся максимальные хиты и выбранные данные. Текущие хиты не восстанавливаются. Ручные счётчики не присваиваются автоматически.',form);
   if(data.selectedMetamagic?.length){
    const section=el('section',undefined,form);el('h3','Сохранённая Метамагия',section);
    for(const option of data.selectedMetamagic)el('p',option.text,section);
    el('p','Применимость к заклинанию и расход очков чародейства учитываются вручную.',section);
   }
   if(data.selectedStyles?.length){
    const section=el('section',undefined,form);el('h3','Сохранённые боевые стили',section);
    for(const style of data.selectedStyles)el('p',style.name+' — '+style.text,section);
    el('p','Боевые бонусы учитываются вручную; мастер не меняет КД, атаки или урон.',section);
   }
   if(data.plan.priorFeatureDetails?.length){
    const reference=el('details',undefined,form);
    el('summary','Справка по умениям до уровня '+data.fromLevel,reference);
    el('p','Доступные пояснения по таблице выбранного класса. Прошлые выборы здесь не определяются; эффекты не включаются автоматически.',reference);
    for(const info of data.plan.priorFeatureDetails)renderFeatureHelp(reference,info,info.key);
   }
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
    if(!choice.required&&!titles[choice.kind]){if(optionalNotices[choice.kind])el('p',optionalNotices[choice.kind],form);continue;}
    const fs=el('fieldset',undefined,form);el('legend',(titles[choice.kind]||choiceNames[choice.kind]||choice.kind)+' — выбрать '+choice.count,fs);
    if(choice.kind==='ability-score-improvement-or-feat'){
     el('p','Распредели 2 пункта. Не выше 20. Выбор черты ещё не подключён.',fs);const fields={};
     for(const [key,name]of Object.entries(abilityNames)){const l=el('label',name+' ('+data.abilities[key]+')',fs),n=el('input',undefined,l);n.type='number';n.min='0';n.max=String(Math.max(0,Math.min(2,20-data.abilities[key])));n.value='0';n.setAttribute('aria-label',name+': прибавка');fields[key]=n;}
     controls.set(choice.id,()=>({increases:Object.fromEntries(Object.entries(fields).map(([k,n])=>[k,n.value===''?null:Number(n.value)]))}));
    }else if(choice.kind==='metamagic'&&data.metamagicOptions?.[choice.id]?.length){
     el('p','Выбери '+choice.count+' разных варианта. Сохраняется выбор, а применение к заклинанию и расход очков остаются ручными.',fs);
     const count=el('p','Выбрано 0 из '+choice.count,fs);count.setAttribute('aria-live','polite');const rows=[];
     for(const option of data.metamagicOptions[choice.id]){
      const label=el('label',undefined,fs),box=el('input',undefined,label);box.type='checkbox';box.value=option.id;el('span',option.name,label);rows.push(box);
      renderFeatureHelp(fs,{...option,source:data.plan.featureDetails?.find(f=>f.key==='Metamagic')?.source},option.id);
      box.addEventListener('change',()=>count.textContent='Выбрано '+rows.filter(r=>r.checked).length+' из '+choice.count);
     }
     controls.set(choice.id,()=>rows.filter(r=>r.checked).map(r=>r.value));
    }else if(choice.kind==='fighting-style'&&data.styleOptions?.[choice.id]?.length){
     el('p','Выбери один стиль. Его название и происхождение сохранятся. КД, атаки и урон не меняются автоматически — учитывай бонусы вручную.',fs);
     const label=el('label','Боевой стиль',fs),select=el('select',undefined,label);
     select.name=choice.id;const empty=el('option','Выбери стиль…',select);empty.value='';select.value='';
     for(const style of data.styleOptions[choice.id]){const option=el('option',style.name,select);option.value=style.id;}
     const help=el('p','Стиль ещё не выбран.',fs);help.setAttribute('aria-live','polite');
     select.addEventListener('change',()=>{help.textContent=data.styleOptions[choice.id].find(s=>s.id===select.value)?.text||'Стиль ещё не выбран.';});
     controls.set(choice.id,()=>select.value?[select.value]:[]);
    }else if(data.options[choice.id]){
     const searchLabel=el('label','Найти заклинание',fs),search=el('input',undefined,searchLabel);search.type='search';
     const count=el('p','Выбрано 0 из '+choice.count,fs);count.setAttribute('aria-live','polite');
     const list=el('div',undefined,fs);list.className='advancement-spells';const rows=[];
     for(const spell of data.options[choice.id]){const l=el('label',undefined,list),box=el('input',undefined,l);box.type='checkbox';box.value=spell.spellId;el('span',spell.name.ru+' / '+spell.name.en+' · '+(spell.level===0?'заговор':spell.level+' круг'),l);rows.push({l,box,search:(spell.name.ru+' '+spell.name.en).toLocaleLowerCase('ru')});}
     search.addEventListener('input',()=>{const q=search.value.trim().toLocaleLowerCase('ru');for(const r of rows)r.l.hidden=!r.box.checked&&!r.search.includes(q);});
     list.addEventListener('change',()=>{const n=rows.filter(r=>r.box.checked).length;count.textContent='Выбрано '+n+' из '+choice.count;});
     controls.set(choice.id,()=>rows.filter(r=>r.box.checked).map(r=>r.box.value));
    }else{blocked=true;el('p',data.choiceNotices?.[choice.id]||'Этот обязательный выбор пока не подключён. Повышение не будет сохранено.',fs);}
   }
   const reviews=[];
   if(data.plan.requiresFeatureReview.length){const fs=el('fieldset',undefined,form);el('legend','Новые умения: ручная проверка',fs);el('p','Эффекты этих умений ещё не применяются автоматически. Отметка подтверждает только проверку правил.',fs);for(const feature of data.plan.requiresFeatureReview){
      const info=data.plan.featureDetails?.find(item=>item.key===feature);
      renderFeatureHelp(fs,info,feature);
      const l=el('label',undefined,fs),box=el('input',undefined,l);box.type='checkbox';
      el('span','Проверил: '+(info?.name||feature),l);reviews.push({feature,box});
     }}
   status.textContent=blocked?'Есть неподдерживаемый обязательный выбор. Сохранение недоступно.':'Выбери изменения и проверь итог до сохранения.';check.disabled=blocked;
   check.onclick=async()=>{
    if(running||pending||blocked||closed)return;running=true;lock(true);invalidate();
    const command={expectedRevision:data.revision,characterId:data.characterId,classId:data.classId,fromLevel:data.fromLevel,hpMethod:method.value,hpRoll:method.value==='roll'&&roll.value!==''?Number(roll.value):null,choices:Object.fromEntries([...controls].map(([id,read])=>[id,read()])),reviewedFeatures:reviews.filter(r=>r.box.checked).map(r=>r.feature)};
    try{const result=await preview({...command,mutationId:newId()});if(closed)return;candidate=command;el('p','Максимум хитов: '+data.maxHp+' → '+(data.maxHp+result.hitPoints.maximumDelta)+'. Текущие: '+data.hp+'.',summary);el('p','Бонус мастерства: +'+result.proficiency.before+' → +'+result.proficiency.after+'.',summary);renderChosenChanges(summary,data,command);for(const resource of result.newResources)el('p','Новый ресурс: '+resource.name+' — '+resource.max+'.',summary);if(result.unmanagedResources.length)el('p','Существующие ручные ресурсы не изменятся. Их максимумы нужно сверить отдельно.',summary);apply.hidden=false;status.textContent='Итог проверен. Подтверди повышение.';}catch(e){if(!closed)status.textContent=e.message;}finally{running=false;if(!closed)lock(false);}
   };
  }
  async function save(){
   if(running||!pending||closed)return;running=true;lock(true);status.textContent=pendingKind==='bind'?'Подключаю ресурсы…':'Сохраняю повышение…';
   try{const result=await send(pending,pendingKind);if(closed)return;pending=null;candidate=null;apply.hidden=true;retry.hidden=true;summary.replaceChildren();if(pendingKind==='bind'){try{await refresh();if(!closed)status.textContent='Ресурсы подключены. Теперь выбери повышение уровня.';}catch(e){if(!closed){status.textContent='Ресурсы сохранены, но обновить героя не удалось. Сверь состояние перед повышением.';reconcile.hidden=false;}}}else{form.replaceChildren();check.hidden=true;status.textContent='Сохранено: уровень '+result.characterSheet.level+'. Максимум хитов '+result.state.maxHp+'.';try{await onSaved(result);}catch{if(!closed)status.textContent+=' Обнови экран героя, чтобы увидеть изменения.';}}}
   catch(e){if(closed)return;status.textContent=e.message+(e.notApplied?' Команда не применена. Сверь героя перед новым выбором.':' Для безопасного повтора используй ту же команду.');retry.hidden=e.notApplied===true;reconcile.hidden=e.notApplied!==true;apply.hidden=true;}
   finally{running=false;if(!closed){retry.disabled=false;if(pending)lock(true);}}
  }
  reconcile.onclick=async()=>{if(running||closed)return;running=true;pending=null;candidate=null;reconcile.hidden=true;retry.hidden=true;check.hidden=false;check.disabled=true;try{await refresh();}catch(e){if(!closed){status.textContent=e.message;reconcile.hidden=false;}}finally{running=false;}};
  apply.onclick=()=>{if(!candidate||pending||running||closed)return;pendingKind='advance';pending=JSON.stringify({...candidate,mutationId:newId()});return save();};retry.onclick=save;
  try{await refresh();}catch(e){if(!closed)status.textContent=e.message;}
  return {get pending(){return !!pending||running;},destroy(){closed=true;epoch++;pending=null;root.replaceChildren();}};
 }
 return {mount};
})();
