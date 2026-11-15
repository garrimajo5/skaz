// Advancement editor shared by the main application and disposable QA fixtures.
const SkazClassAdvancement=(()=>{
 const titles={'ability-score-improvement-or-feat':'Повышение характеристик','cantrips':'Новые заговоры','known-spells':'Новые заклинания','spellbook-spells':'Записи в книге','magical-secrets':'Магические тайны','mystic-arcanum':'Таинственный арканум'};
 // Display labels do not decide whether an optional choice is supported.
 const choiceNames={'replace-invocation':'Замена воззвания','lore-skills':'Навыки Коллегии знаний','lore-secrets':'Дополнительные магические тайны','confirm-fiend':'Прежний покровитель Исчадие','confirm-draconic':'Подтверждение драконьего наследия','confirm-subclass':'Подтверждение прежнего домена','land-terrain':'Местность Круга Земли','champion-style':'Дополнительный стиль Чемпиона','hunter-option':'Умение Охотника','subclass':'Подкласс','subclass-fighting-style':'Дополнительный боевой стиль','expertise':'Компетентность','fighting-style':'Боевой стиль','metamagic':'Метамагия','invocations':'Таинственные воззвания','pact-boon':'Предмет договора','favored-enemy-and-language':'Избранный враг и язык','favored-terrain':'Избранная местность','spell-mastery':'Мастерство заклинаний','signature-spells':'Фирменные заклинания'};
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
 function ritualPicker(parent,data){
  const root=el('div',undefined,parent);root.hidden=true;
  el('p','Книга древних тайн: выбери два разных ритуала первого круга. Они сохранятся отдельно, без права обычного сотворения и без расхода ячеек; применение ритуалов учитывается вручную.',root);
  const count=el('p','Выбрано 0 из 2',root);count.setAttribute('aria-live','polite');const boxes=[];
  for(const spell of data.ritualOptions||[]){const label=el('label',undefined,root),box=el('input',undefined,label);box.type='checkbox';box.value=spell.id;el('span',spell.name.ru+' / '+spell.name.en,label);boxes.push(box);box.addEventListener('change',()=>count.textContent='Выбрано '+boxes.filter(b=>b.checked).length+' из 2');}
  return {root,read:()=>boxes.filter(b=>b.checked).map(b=>b.value)};
 }
 function invocationName(data,choiceId,value){
  const id=typeof value==='string'?value:value.id;
  const name=data.invocationOptions?.[choiceId]?.find(o=>o.id===id)?.name||id;
  return name+(typeof value==='object'?' (ритуалы: '+value.rituals.map(id=>data.ritualOptions?.find(o=>o.id===id)?.name.ru||id).join('; ')+')':'');
 }
 function rangerEnemyName(data,selection){return selection.enemy.kind==='humanoids'?selection.enemy.races.join(' / '):data.rangerEnemyTypes?.find(o=>o.id===selection.enemy.id)?.name||selection.enemy.id;}
 function rangerEnemyText(data,selection){return rangerEnemyName(data,selection)+(selection.language.mode==='spoken'?'; язык: '+selection.language.name:'; подтверждено: враги не говорят');}
 function rangerEnemyControls(parent,prefix,data,title,excludedTypes=()=>[]){
  const fs=el('fieldset',undefined,parent);el('legend',title,fs);
  const typeLabel=el('label','Тип врага или две гуманоидные расы',fs),type=el('select',undefined,typeLabel);type.name=prefix+':enemy';
  for(const [value,name]of [['','Выбери врага:'],...data.rangerEnemyTypes.map(o=>[o.id,o.name]),['humanoids','Две гуманоидные расы']]){const option=el('option',name,type);option.value=value;}type.value='';
  const races=el('div',undefined,fs);races.hidden=true;const inputs=[];for(const index of [1,2]){const label=el('label','Раса '+index,races),input=el('input',undefined,label);input.type='text';input.maxLength=80;input.name=prefix+':race'+index;inputs.push(input);}type.addEventListener('change',()=>races.hidden=type.value!=='humanoids');
  const languageLabel=el('label','Язык, на котором говорят избранные враги',fs),language=el('select',undefined,languageLabel);language.name=prefix+':languageMode';for(const [value,name]of [['','Укажи язык или его отсутствие:'],['spoken','Выбрать один язык врагов'],['none','Эти враги не говорят']]){const option=el('option',name,language);option.value=value;}language.value='';
  const nameLabel=el('label','Название языка',fs),name=el('input',undefined,nameLabel);name.type='text';name.maxLength=80;name.name=prefix+':languageName';nameLabel.hidden=true;language.addEventListener('change',()=>nameLabel.hidden=language.value!=='spoken');
  const confirmLabel=el('label',undefined,fs),confirmed=el('input',undefined,confirmLabel);confirmed.type='checkbox';confirmed.name=prefix+':rulesConfirmed';el('span','Сверил выбор рас и языка с правилами своей игры. Приложение не определяет язык по типу врага.',confirmLabel);
  const read=()=>({enemy:type.value==='humanoids'?{kind:'humanoids',races:inputs.map(input=>input.value)}:{kind:'type',id:type.value},language:language.value==='spoken'?{mode:'spoken',name:name.value}:{mode:language.value},rulesConfirmed:confirmed.checked});
  read.update=()=>{const excluded=new Set(excludedTypes());for(const option of type.querySelectorAll('option')){option.disabled=excluded.has(option.value);if(option.disabled&&type.value===option.value)type.value='';}};read.update();return read;
 }
 function renderChosenChanges(parent,data,command){
  for(const choice of data.plan.choices){
   const selected=command.choices[choice.id];if(selected===undefined)continue;
   if(choice.kind==='confirm-fiend'){
el('p','Подтверждается прежний покровитель Исчадие. Расширенный список даёт варианты обычного выбора, а не все заклинания сразу. Умения и временные хиты учитываются вручную.',parent);
   }else if(choice.kind==='confirm-draconic'){el('p','Прежнее наследие подтверждается без повторного +1 за первый уровень. Новый уровень автоматически добавит +1 от Драконьей стойкости. КД, язык, сопротивление и остальные эффекты отмечаются вручную.',parent);el('p','Предок: '+(data.draconicAncestors.find(o=>o.id===selected.ancestorId)?.name||selected.ancestorId),parent);
   }else if(choice.kind==='confirm-subclass'){el('p','Подтверждается прежний Домен Жизни первого уровня. Он не выдаётся заново; постоянные заклинания будут сверены с книгой. Владения и эффекты лечения остаются ручными.',parent);
   }else if(choice.kind==='land-terrain'){el('p','Местность Круга Земли: '+(data.landTerrains.find(o=>o.id===selected.id)?.name||selected.id)+'. Используется только эта таблица заклинаний.',parent);
   }else if(choice.kind==='favored-terrain'){const name=id=>data.rangerTerrains?.find(o=>o.id===id)?.name||id;el('p',(selected.previousId?'Прежняя местность: '+name(selected.previousId)+'. ':'')+'Новая местность: '+name(selected.id)+'. Бонусы путешествия учитываются вручную.',parent);
   }else if(choice.kind==='favored-enemy-and-language'){if(selected.previous)el('p','Подтверждение прежнего врага: '+rangerEnemyText(data,selected.previous)+'. Это не повторная выдача.',parent);el('p','Новый избранный враг: '+rangerEnemyText(data,selected.current)+'. Преимущества проверок учитываются вручную.',parent);
   }else if(choice.kind==='signature-spells'){el('p','Фирменные заклинания: '+selected.spellIds.map(id=>data.wizardOptions?.[choice.id]?.find(o=>o.id===id)?.name.ru||id).join('; ')+'. Постоянно подготовлены вне предела. Каждое один раз без ячейки на третьем круге; расход и восстановление после короткого или продолжительного отдыха отмечай вручную в отдельных счётчиках. Выше третьего круга расходуется обычная ячейка.',parent);
   }else if(choice.kind==='spell-mastery'){el('p','Мастерство: '+selected.spellIds.map(id=>data.wizardOptions?.[choice.id]?.find(o=>o.id===id)?.name.ru||id).join('; ')+'. Подготовка обязательна; бесплатное сотворение и смена после восьми часов изучения учитываются вручную.',parent);
   }else if(choice.kind==='champion-style'){const name=id=>data.championStyles?.find(o=>o.id===id)?.name||id;el('p','Прежний стиль: '+name(selected.previousId)+'. Дополнительный стиль: '+name(selected.newId)+'. Старые бонусы не применяются повторно; боевые значения остаются ручными.',parent);
   }else if(choice.kind==='hunter-option'){el('p','Охотник: '+(data.hunterOptions?.[choice.id]?.options.find(o=>o.id===selected.id)?.name||selected.id)+'. Эффекты учитываются вручную.',parent);
   }else if(choice.kind==='subclass'){
    if(selected.cantripId){el('p','Дополнительный заговор Круга Земли: '+(data.landCantrips?.find(o=>o.id===selected.cantripId)?.name.ru||selected.cantripId)+'.',parent);el('p','Естественное восстановление: отдельный счётчик1/1. Во время короткого отдыха восстанови допустимые ячейки и отметь расход вручную; само применение восстанавливается после продолжительного отдыха.',parent);}
    if(selected.optionId)el('p','Умение Охотника: '+(data.subclassOptions?.find(o=>o.id===selected.id)?.additionalChoice?.options.find(o=>o.id===selected.optionId)?.name||selected.optionId)+'.',parent);
    el('p','Подкласс: '+(data.subclassOptions?.find(o=>o.id===selected.id)?.name||selected.id)+'. Выбор сохраняется. Автоматические изменения перечислены ниже; остальные эффекты учитываются вручную.',parent);
   }else if(choice.kind==='ability-score-improvement-or-feat'){
    for(const [key,name]of Object.entries(abilityNames)){const delta=selected.increases[key];if(delta>0)el('p',name+': '+data.abilities[key]+' → '+(data.abilities[key]+delta)+'.',parent);}
    }else if(choice.kind==='pact-boon'){
    el('p','Дар договора: '+(data.pactOptions?.find(o=>o.id===selected.id)?.name||selected.id)+'. Создание оружия, фамильяр и условия применения учитываются вручную.',parent);
    if(selected.id==='tome')el('p','Заговоры Гримуара: '+selected.cantrips.map(id=>data.pactCantrips?.find(o=>o.spellId===id)?.name?.ru||id).join('; ')+'.',parent);
    if(selected.id==='chain')el('p','Поиск фамильяра добавится в личную книгу без дубликата.',parent);
   }else if(choice.kind==='replace-invocation'){
    const from=data.selectedInvocations?.find(o=>o.id===selected.remove)?.name||selected.remove,to=invocationName(data,choice.id,selected.add);
    el('p','Замена воззвания: '+from+' → '+to+'. Прежний выбор останется в истории.',parent);
   }else if(choice.kind==='invocations'){
    const names=selected.map(value=>invocationName(data,choice.id,value));
    el('p','Воззвания: '+names.join('; ')+'. Эффекты и применение учитываются вручную.',parent);
   }else if(choice.kind==='lore-skills'){const names=ids=>ids.map(id=>data.loreSkills.find(o=>o.id===id)?.name||id).join('; ');el('p','Подтверждены прежние владения: '+names(selected.baselineSkills)+'. Новые навыки: '+names(selected.bonusSkills)+'.',parent);
   }else if(choice.kind==='expertise'&&data.classId==='rogue'){el('p','Прежние удвоения: '+selected.previousExpertise.map(id=>id==='thieves-tools'?'Воровские инструменты':data.rogueSkills.find(o=>o.id===id)?.name||id).join('; ')+'. Новые: '+selected.newExpertise.map(id=>id==='thieves-tools'?'Воровские инструменты':data.rogueSkills.find(o=>o.id===id)?.name||id).join('; '),parent);
   }else if(choice.kind==='expertise'){el('p','Компетентность: '+selected.skillIds.map(id=>data.loreSkills.find(o=>o.id===id)?.name||id).join('; ')+'.',parent);
   }else if(choice.kind==='lore-secrets'){el('p','Дополнительные тайны: '+selected.spellIds.map(id=>data.options[choice.id].find(o=>o.spellId===id)?.name.ru||id).join('; ')+'. Вне обычного числа известных заклинаний; не постоянно подготовлены.',parent);
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
  let closed=false,pending=null,pendingKind='advance',candidate=null,running=false,epoch=0,updateDependentChoices=()=>{};
  const status=el('p','Загружаю героя…',root);status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const form=el('form',undefined,root);form.className='class-advancement';
  const summary=el('div',undefined,root),actions=el('div',undefined,root);actions.className='advancement-actions';
  const check=el('button','Проверить повышение',actions),apply=el('button','Подтвердить повышение',actions),retry=el('button','Повторить сохранение',actions),reconcile=el('button','Сверить состояние и начать заново',actions);
  apply.hidden=true;retry.hidden=true;reconcile.hidden=true;check.disabled=true;
  const disabledBeforeLock=new Map();
  function lock(value){for(const field of form.querySelectorAll('input,select,button')){if(value){if(!disabledBeforeLock.has(field))disabledBeforeLock.set(field,field.disabled);field.disabled=true;}else if(disabledBeforeLock.has(field)){field.disabled=disabledBeforeLock.get(field);disabledBeforeLock.delete(field);}}check.disabled=value;apply.disabled=value;retry.disabled=running;}
  function invalidate(){if(candidate&&!running&&!pending)status.textContent='Выбор изменён. Проверь итог ещё раз перед сохранением.';candidate=null;apply.hidden=true;summary.replaceChildren();}
  form.addEventListener('input',invalidate);form.addEventListener('change',invalidate);form.addEventListener('change',()=>updateDependentChoices());form.addEventListener('submit',e=>e.preventDefault());
  async function refresh(){
   const mark=++epoch;const data=await load();if(closed||mark!==epoch)return;
   disabledBeforeLock.clear();updateDependentChoices=()=>{};form.replaceChildren();invalidate();
   el('h2',data.className+': '+data.fromLevel+(data.atMaximum?'':' → '+(data.fromLevel+1)),form);
   if(!data.atMaximum)el('p','Повысятся максимальные хиты и выбранные данные. Текущие хиты не восстанавливаются. Ручные счётчики не присваиваются автоматически.',form);
   if(data.selectedRangerChoices){const section=el('section',undefined,form);el('h3','Выборы следопыта',section);for(const terrain of data.selectedRangerChoices.terrains)el('p',(terrain.acquiredLevel===null?'Прежняя местность, подтверждена на6: ':'Местность с'+terrain.acquiredLevel+'уровня: ')+(data.rangerTerrains?.find(o=>o.id===terrain.id)?.name||terrain.id),section);for(const enemy of data.selectedRangerChoices.enemies)el('p',(enemy.acquiredLevel===null?'Прежний враг, подтверждён на6: ':'Враг с'+enemy.acquiredLevel+'уровня: ')+rangerEnemyText(data,enemy),section);}
   if(data.selectedSubclass?.selectedAncestor)el('p','Драконий предок: '+data.selectedSubclass.selectedAncestor.name+' · '+data.selectedSubclass.selectedAncestor.damageName+'. Новый уровень автоматически добавляет +1 к максимуму хитов; прочие эффекты ручные.',form);
   if(data.selectedSubclass?.selectedCantrip)el('p','Дополнительный заговор Круга Земли: '+data.selectedSubclass.selectedCantrip.name.ru,form);if(data.selectedSubclass?.selectedTerrain)el('p','Местность Круга Земли: '+data.selectedSubclass.selectedTerrain.name,form);
   if(data.rogueHistory){const names=ids=>ids.map(id=>id==='thieves-tools'?'Воровские инструменты':data.rogueSkills.find(o=>o.id===id)?.name||id).join('; '),help=el('details',undefined,form);el('summary','Сохранённая Компетентность плута',help);el('p','Прежние удвоения: '+names(data.rogueHistory.baseline.expertiseIds)+'. На шестом уровне: '+names(data.rogueHistory.expertise.ids)+'.',help);}
   if(data.loreHistory){const names=ids=>ids.map(id=>data.loreSkills.find(o=>o.id===id)?.name||id).join('; '),help=el('details',undefined,form);el('summary','Сохранённые навыки Коллегии знаний',help);el('p','Прежние владения, подтверждены на3 уровне: '+names(data.loreHistory.baseline.skillIds)+'.',help);el('p','Добавлены на3 уровне: '+names(data.loreHistory.bonus.skillIds)+'.',help);for(const record of data.loreHistory.expertise)el('p','Компетентность'+record.acquiredLevel+': '+names(record.skillIds)+'.',help);if(data.selectedLoreSecrets.length)el('p','Дополнительные тайны6: '+data.selectedLoreSecrets.map(o=>o.name).join('; ')+'. Вне обычного предела известных.',help);}
   for(const choice of data.selectedWizardChoices||[])if(choice.kind==='signature')el('p','Сохранённые Фирменные заклинания: '+choice.spellNames.join('; ')+'. Постоянно подготовлены; два отдельных счётчика1/1. Расход и восстановление после короткого или продолжительного отдыха отмечай вручную.',form);else el('p','Сохранённое Мастерство заклинаний: '+choice.spellNames.join('; ')+'. Для бесплатного сотворения они должны быть подготовлены. Бесплатное применение и смена после восьми часов изучения пока учитываются вручную.',form);
   if(data.classCheckBenefits)el('p',data.classCheckBenefits.origin.name+': в панели проверок отдельно рассчитан бонус +'+data.classCheckBenefits.bonus+' к СИЛ, ЛОВ и ТЕЛ без владения. Инициатива и прыжки на листе остаются ручными.',form);
   if(data.selectedSubclass){const section=el('section',undefined,form);el('h3','Подтверждённый подкласс: '+data.selectedSubclass.name,section);el('p',data.selectedSubclass.id==='sorcerer-draconic'?'При повышении автоматически добавляется +1 к максимуму хитов. КД и остальные эффекты учитываются вручную.':'Автоматические изменения показаны в итоге повышения и на листе. Остальные эффекты и условия применения проверяй по справке.',section);for(const option of data.selectedSubclass.confirmedStyles||[])el('p',option.label+': '+option.name+'. '+option.text,section);for(const option of data.selectedSubclass.selectedOptions||[])renderFeatureHelp(section,{...option,source:data.selectedSubclass.source},option.id);for(const feature of data.selectedSubclass.features.filter(f=>f.level<=data.fromLevel))renderFeatureHelp(section,{...feature,source:data.selectedSubclass.source},feature.key);}
   if(data.selectedPact)el('p','Сохранённый дар: '+(data.pactOptions?.find(o=>o.id===data.selectedPact.id)?.name||data.selectedPact.id)+'. Создание оружия, фамильяр и условия применения учитываются вручную.',form);
   if(data.selectedPact?.spellNames?.length)el('p','Заклинания дара вне обычного лимита: '+data.selectedPact.spellNames.join('; ')+'. Условия применения проверяй по описанию дара.',form);
   if(data.selectedInvocations?.length){
    const section=el('section',undefined,form);el('h3','Сохранённые воззвания',section);
    for(const option of data.selectedInvocations){renderFeatureHelp(section,option,option.key);if(option.ritualNames?.length)el('p','Выбранные ритуалы: '+option.ritualNames.join('; ')+'. Только ритуальное применение с книгой; обычное сотворение этим выбором не предоставляется.',section);}
    el('p','Выбор сохранён. Эффекты, навыки и применение заклинаний учитываются вручную.',section);
   }
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
   if(data.atMaximum){status.textContent='Достигнут максимальный уровень 20. Здесь можно прочитать сохранённые выборы и справку; изменения не выполняются.';check.hidden=true;return;}
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
   const controls=new Map(),fiendRows=[],wizardFields=[],invocationFields=[],secretFields=[],rangerUpdates=[];let blocked=false,lorePicker=null,loreExpert=null;
   function updateLoreSkills(){const known=lorePicker?lorePicker.known():[...(data.loreHistory?.baseline.skillIds||[]),...(data.loreHistory?.bonus.skillIds||[])],old=(data.loreHistory?.expertise||[]).flatMap(o=>o.skillIds);if(loreExpert)for(const row of loreExpert.rows){row.disabled=!known.includes(row.value)||old.includes(row.value);row.skillLabel.hidden=row.disabled;if(row.disabled)row.checked=false;}loreExpert?.update();}
   function skillPicker(parent,title,name,count,options=data.loreSkills){const group=el('fieldset',undefined,parent);el('legend',title,group);const counter=el('p','',group);counter.setAttribute('aria-live','polite');const list=el('div',undefined,group);list.className='advancement-spells';const rows=[];const read=()=>rows.filter(r=>r.checked).map(r=>r.value),update=()=>counter.textContent='Выбрано '+read().length+(count?' из '+count:'');for(const option of options){const label=el('label',undefined,list),box=el('input',undefined,label);box.skillLabel=label;box.type='checkbox';box.name=name;box.value=option.id;el('span',option.name,label);rows.push(box);box.addEventListener('change',update);}update();return {rows,read,update,group};}
   for(const choice of data.plan.choices){
    if(!choice.required&&choice.kind!=='confirm-fiend'&&!titles[choice.kind]&&!(choice.kind==='replace-invocation'&&data.invocationOptions?.[choice.id]&&data.selectedInvocations?.length)){if(optionalNotices[choice.kind])el('p',optionalNotices[choice.kind],form);continue;}
    const fs=el('fieldset',undefined,form);el('legend',(titles[choice.kind]||choiceNames[choice.kind]||choice.kind)+(choice.required?' — выбрать '+choice.count:' — необязательно'),fs);
    if(choice.kind==='expertise'&&data.classId==='rogue'){
     el('p','Сверь прежние владения и два старых удвоения с листом, затем выбери два новых. Старые владения не выдаются повторно.',fs);
     const baseline=skillPicker(fs,'Прежние навыки',choice.id+':baseline',null,data.rogueSkills),toolLabel=el('label',undefined,fs),tools=el('input',undefined,toolLabel);tools.type='checkbox';tools.name=choice.id+':tools';el('span','Владею воровскими инструментами',toolLabel);
     const options=[...data.rogueSkills,{id:'thieves-tools',name:'Воровские инструменты'}],old=skillPicker(fs,'Прежняя Компетентность',choice.id+':previous',2,options),fresh=skillPicker(fs,'Два новых удвоения',choice.id+':new',2,options),confirmLabel=el('label',undefined,fs),confirmed=el('input',undefined,confirmLabel);confirmed.type='checkbox';confirmed.name=choice.id+':confirmed';el('span','Прежние владения и два удвоения сверены',confirmLabel);
     function refresh(){const known=[...baseline.read(),...(tools.checked?['thieves-tools']:[])];for(const row of old.rows){row.disabled=!known.includes(row.value);row.skillLabel.hidden=row.disabled;if(row.disabled)row.checked=false;}for(const row of fresh.rows){row.disabled=!known.includes(row.value)||old.read().includes(row.value);row.skillLabel.hidden=row.disabled;if(row.disabled)row.checked=false;}old.update();fresh.update();}for(const row of [...baseline.rows,...old.rows,tools])row.addEventListener('change',refresh);refresh();controls.set(choice.id,()=>({skillIds:baseline.read(),thievesTools:tools.checked===true,previousExpertise:old.read(),newExpertise:fresh.read(),rulesConfirmed:confirmed.checked===true}));
    }else if(choice.kind==='lore-skills'){
     el('p','Сначала сверь ВСЕ прежние владения навыками по своему листу. Они сохраняются как подтверждённое прошлое, а не выдаются заново. Затем выбери три новых навыка. Другие подклассы и неизвестная прежняя Компетентность пока не поддержаны.',fs);
     const baseline=skillPicker(fs,'Прежние владения (не менее трёх)',choice.id+':baseline',null),bonus=skillPicker(fs,'Три новых навыка',choice.id+':bonus',3),label=el('label',undefined,fs),confirmed=el('input',undefined,label);confirmed.type='checkbox';confirmed.name=choice.id+':confirmed';el('span','Прежние владения сверены с моим листом; неизвестных прежних удвоений нет.',label);
     lorePicker={known:()=>[...baseline.read(),...bonus.read()]};for(const row of baseline.rows)row.addEventListener('change',()=>{for(const option of bonus.rows){option.disabled=baseline.read().includes(option.value);option.skillLabel.hidden=option.disabled;if(option.disabled)option.checked=false;}bonus.update();updateLoreSkills();});for(const row of bonus.rows)row.addEventListener('change',updateLoreSkills);updateLoreSkills();controls.set(choice.id,()=>({baselineSkills:baseline.read(),bonusSkills:bonus.read(),rulesConfirmed:confirmed.checked===true}));
    }else if(choice.kind==='expertise'&&data.loreSkills?.length&&(data.fromLevel===2||data.loreHistory)){
     el('p','Выбери два навыка, которыми владеешь. На третьем уровне можно выбрать новые навыки Коллегии знаний. Повторная Компетентность не складывается.',fs);loreExpert=skillPicker(fs,'Удвоение бонуса мастерства',choice.id,2);updateLoreSkills();controls.set(choice.id,()=>({skillIds:loreExpert.read()}));
    }else if(choice.kind==='confirm-fiend'){
     const row=el('label',undefined,fs),box=el('input',undefined,row);box.type='checkbox';box.name=choice.id;
     el('span','Подтверждаю: на первом уровне был выбран покровитель Исчадие. Подключить его расширенный список.',row);
     el('p','Без подтверждения покровитель остаётся ручным и доступны только обычные заклинания колдуна. Это сверка прошлого, а не смена покровителя.',fs);
     for(const feature of data.fiendReference.features.filter(f=>f.level===1))renderFeatureHelp(fs,{...feature,source:data.fiendReference.source},feature.key);
     box.addEventListener('change',()=>{for(const spell of fiendRows){spell.box.disabled=!box.checked;if(!box.checked)spell.box.checked=false;spell.update();}});
     controls.set(choice.id,()=>box.checked?{id:'warlock-fiend',rulesConfirmed:true}:undefined);
    }else if(choice.kind==='confirm-draconic'){
     const label=el('label','Драконий предок первого уровня',fs),select=el('select',undefined,label);select.name=choice.id;const blank=el('option','Выбери прежнего предка…',select);blank.value='';select.value='';
     for(const o of data.draconicAncestors){const option=el('option',o.name+' · '+o.damageName,select);option.value=o.id;}
     const boxes=[];for(const [suffix,text]of [['confirmed','На первом уровне было выбрано Наследие драконьей крови и указанный предок.'],['hpConfirmed','В текущем максимуме хитов уже учтён +1 от Драконьей стойкости первого уровня.']]){const row=el('label',undefined,fs),box=el('input',undefined,row);box.type='checkbox';box.name=choice.id+':'+suffix;el('span',text,row);boxes.push(box);}
     el('p','Если бонус первого уровня ещё не учтён, сначала исправь максимум хитов в листе. Мастер добавит только +1 за новый уровень.',fs);
     for(const feature of data.subclassOptions[0].features.filter(f=>f.level===1))renderFeatureHelp(fs,{...feature,source:data.subclassOptions[0].source},feature.key);
     controls.set(choice.id,()=>({id:'sorcerer-draconic',ancestorId:select.value,rulesConfirmed:boxes[0].checked===true,baselineHpConfirmed:boxes[1].checked===true}));
    }else if(choice.kind==='confirm-subclass'){const label=el('label','Прежний домен первого уровня',fs),select=el('select',undefined,label);select.name=choice.id;const blank=el('option','Подтверди домен…',select);blank.value='';select.value='';for(const o of data.subclassOptions){const option=el('option',o.name,select);option.value=o.id;}const row=el('label',undefined,fs),box=el('input',undefined,row);box.type='checkbox';box.name=choice.id+':confirmed';el('span','Подтверждаю, что на первом уровне был выбран Домен Жизни. Это сверка прежнего выбора, а не новая выдача.',row);for(const feature of data.subclassOptions[0].features.filter(f=>f.level===1))renderFeatureHelp(fs,{...feature,source:data.subclassOptions[0].source},feature.key);controls.set(choice.id,()=>({id:select.value,rulesConfirmed:box.checked===true}));
    }else if(choice.kind==='land-terrain'){const label=el('label','Местность посвящения',fs),select=el('select',undefined,label);select.name=choice.id;const blank=el('option','Выбери одну местность…',select);blank.value='';select.value='';for(const o of data.landTerrains){const option=el('option',o.name,select);option.value=o.id;}el('p','Будут добавляться только заклинания выбранной местности. Они постоянно подготовлены вне обычного предела.',fs);const info=data.selectedSubclass?.features.find(f=>f.key==='Circle Spells');if(info)renderFeatureHelp(fs,{...info,source:data.selectedSubclass.source},info.key);controls.set(choice.id,()=>({id:select.value}));
    }else if(choice.kind==='favored-terrain'&&data.rangerTerrains?.length){
     const selects={};for(const [key,title]of [...(data.fromLevel===5?[['previousId','Подтверди прежнюю местность']]:[]),['id','Новая местность']]){const label=el('label',title,fs),select=el('select',undefined,label);select.name=choice.id+':'+key;const blank=el('option','Выбери местность:',select);blank.value='';select.value='';for(const option of data.rangerTerrains){const row=el('option',option.name,select);row.value=option.id;}selects[key]=select;}rangerUpdates.push(()=>{const old=new Set([...(data.selectedRangerChoices?.terrains||[]).map(o=>o.id),selects.previousId?.value].filter(Boolean));for(const option of selects.id.querySelectorAll('option')){option.disabled=old.has(option.value);if(option.disabled&&selects.id.value===option.value)selects.id.value='';}});el('p','Прежний выбор не выдаётся повторно. Новая местность должна отличаться от всех прежних.',fs);controls.set(choice.id,()=>Object.fromEntries(Object.entries(selects).map(([key,select])=>[key,select.value])));
    }else if(choice.kind==='favored-enemy-and-language'&&data.rangerEnemyTypes?.length){const previous=data.fromLevel===5?rangerEnemyControls(fs,choice.id+':previous',data,'Подтверди прежнего врага и язык'):null,current=rangerEnemyControls(fs,choice.id+':current',data,'Новый враг и язык',()=>[...(data.selectedRangerChoices?.enemies||[]).map(o=>o.enemy),previous?.().enemy].filter(o=>o?.kind==='type').map(o=>o.id));rangerUpdates.push(current.update);controls.set(choice.id,()=>({...(previous?{previous:previous()}:{}),current:current()}));
    }else if(choice.kind==='subclass'&&data.subclassOptions?.length){
     const label=el('label','Подтверждённый подкласс',fs),select=el('select',undefined,label);select.name=choice.id;const blank=el('option','Выбери подкласс…',select);blank.value='';select.value='';
     for(const option of data.subclassOptions){const o=el('option',option.name,select);o.value=option.id;const help=el('details',undefined,fs);el('summary',option.name,help);for(const feature of option.features.filter(f=>f.level===data.fromLevel+1))renderFeatureHelp(help,{...feature,source:option.source},feature.key);}
     el('p','Будет сохранён явный выбор подкласса и заполненные ниже обязательные выборы. Остальные владения и боевые эффекты учитывай вручную. Другие варианты подкласса ещё не подключены.',fs);const additional=el('div',undefined,fs);additional.hidden=true;let extra=null;select.addEventListener('change',()=>{additional.replaceChildren();extra=null;const group=data.subclassOptions.find(o=>o.id===select.value)?.additionalChoice;additional.hidden=!group;if(group){const label=el('label',group.name,additional);extra=el('select',undefined,label);extra.name=choice.id+':option';const blank=el('option','Выбери умение…',extra);blank.value='';extra.value='';for(const o of group.options){const row=el('option',o.name,extra);row.value=o.id;el('p',o.name+' — '+o.text,additional);}}});const land=el('div',undefined,fs);land.hidden=true;const cantripLabel=el('label','Дополнительный заговор друида',land),cantrip=el('select',undefined,cantripLabel);cantrip.name=choice.id+':cantrip';const empty=el('option','Выбери заговор…',cantrip);empty.value='';cantrip.value='';for(const o of data.landCantrips||[]){const option=el('option',o.name.ru+' / '+o.name.en,cantrip);option.value=o.id;}select.addEventListener('change',()=>land.hidden=select.value!=='druid-land');controls.set(choice.id,()=>({id:select.value,...(extra?{optionId:extra.value}:{}),...(select.value==='druid-land'?{cantripId:cantrip.value}:{})}));
    }else if(choice.kind==='signature-spells'&&data.wizardOptions?.[choice.id]?.length){
     el('p','Выбери два разных заклинания третьего круга из книги или одновременно добавляемых записей. Недоступные варианты сначала добавь в записи книги выше. Они всегда подготовлены вне предела. Для бесплатного применения третьим кругом появятся два отдельных счётчика1/1; расход и восстановление после отдыха отмечаются вручную.',fs);const fields=[];for(const index of [1,2]){const label=el('label','Заклинание '+index,fs),select=el('select',undefined,label);select.name=choice.id+':'+index;const blank=el('option','Выбери заклинание…',select);blank.value='';select.value='';for(const option of data.wizardOptions[choice.id]){const row=el('option',option.name.ru+' / '+option.name.en,select);row.value=option.id;}fields.push(select);}wizardFields.push({fields,choice});controls.set(choice.id,()=>({spellIds:fields.map(f=>f.value)}));
    }else if(choice.kind==='spell-mastery'&&data.wizardOptions?.[choice.id]?.length){
     el('p','Выбери одно заклинание первого круга и одно второго из книги или одновременно выбранных новых записей. Недоступные варианты сначала добавь в записи книги выше. Бесплатное сотворение здесь не включается: подготовка и применение учитываются вручную.',fs);const fields=[];for(const circle of [1,2]){const label=el('label',circle+' круг',fs),select=el('select',undefined,label);select.name=choice.id+':'+circle;const blank=el('option','Выбери заклинание…',select);blank.value='';select.value='';for(const option of data.wizardOptions[choice.id].filter(o=>o.circle===circle)){const row=el('option',option.name.ru+' / '+option.name.en,select);row.value=option.id;}fields.push(select);}wizardFields.push({fields,choice});controls.set(choice.id,()=>({spellIds:fields.map(f=>f.value)}));
    }else if(choice.kind==='champion-style'&&data.championStyles?.length){
     el('p','Сначала явно подтверди уже известный стиль воина. Он не выдаётся заново. Затем выбери другой стиль; КД, атаки и урон остаются ручными.',fs);const selects={};for(const [key,title]of [['previousId','Прежний стиль'],['newId','Дополнительный стиль']]){const label=el('label',title,fs),select=el('select',undefined,label);select.name=choice.id+':'+key;const blank=el('option','Выбери стиль…',select);blank.value='';select.value='';for(const o of data.championStyles){const row=el('option',o.name,select);row.value=o.id;}selects[key]=select;}const updateStyle=()=>{for(const option of selects.newId.querySelectorAll('option'))option.disabled=Boolean(option.value&&option.value===selects.previousId.value);if(selects.newId.value&&selects.newId.value===selects.previousId.value)selects.newId.value='';};selects.previousId.addEventListener('change',updateStyle);updateStyle();for(const o of data.championStyles)el('p',o.name+' — '+o.text,fs);controls.set(choice.id,()=>({previousId:selects.previousId.value,newId:selects.newId.value}));
    }else if(choice.kind==='hunter-option'&&data.hunterOptions?.[choice.id]){
     const group=data.hunterOptions[choice.id],label=el('label',group.name,fs),select=el('select',undefined,label);select.name=choice.id;const blank=el('option','Выбери умение…',select);blank.value='';select.value='';for(const o of group.options){const row=el('option',o.name,select);row.value=o.id;el('p',o.name+' — '+o.text,fs);}el('p','Сохраняется выбранное умение. Его применение и эффекты учитываются вручную.',fs);controls.set(choice.id,()=>({id:select.value}));
    }else if(choice.kind==='ability-score-improvement-or-feat'){
     el('p','Распредели 2 пункта. Не выше 20. Выбор черты ещё не подключён.',fs);const fields={};
     for(const [key,name]of Object.entries(abilityNames)){const l=el('label',name+' ('+data.abilities[key]+')',fs),n=el('input',undefined,l);n.type='number';n.min='0';n.max=String(Math.max(0,Math.min(2,20-data.abilities[key])));n.value='0';n.setAttribute('aria-label',name+': прибавка');fields[key]=n;}
     controls.set(choice.id,()=>({increases:Object.fromEntries(Object.entries(fields).map(([k,n])=>[k,n.value===''?null:Number(n.value)]))}));
    }else if(choice.kind==='pact-boon'&&data.pactOptions?.length){
     const label=el('label','Дар договора',fs),select=el('select',undefined,label);select.name=choice.id;
     const blank=el('option','Выбери дар…',select);blank.value='';select.value='';
     for(const option of data.pactOptions){const o=el('option',option.name+(option.supported?'':' — пока недоступен'),select);o.value=option.id;o.disabled=!option.supported;el('p',option.name+' — '+option.text,fs);}
     const tome=el('div',undefined,fs);tome.hidden=true;el('p','Три заговора Гримуара, вне обычного числа известных',tome);const rows=[];
     const count=el('p','Выбрано 0 из 3',tome);count.setAttribute('aria-live','polite');
     for(const spell of data.pactCantrips||[]){const label=el('label',undefined,tome),box=el('input',undefined,label);box.type='checkbox';box.value=spell.spellId;el('span',spell.name.ru+' / '+spell.name.en,label);rows.push(box);box.addEventListener('change',()=>count.textContent='Выбрано '+rows.filter(r=>r.checked).length+' из 3');}
     select.addEventListener('change',()=>{tome.hidden=select.value!=='tome';});
     controls.set(choice.id,()=>({id:select.value,cantrips:select.value==='tome'?rows.filter(r=>r.checked).map(r=>r.value):[]}));
    }else if(choice.kind==='replace-invocation'&&data.invocationOptions?.[choice.id]){
     el('p','Необязательно: замени одно сохранённое воззвание. Оставь оба поля пустыми, чтобы сохранить прежний выбор. Эффекты меняются вручную. Требования проверяются вместе с выбранным даром договора и новыми заговорами.',fs);
     const selects={};for(const [key,title,options]of [['remove','Заменить воззвание',data.selectedInvocations],['add','Новое воззвание',data.invocationOptions[choice.id].filter(o=>o.eligible)]]){
      const label=el('label',title,fs),select=el('select',undefined,label);select.name=choice.id+':'+key;const blank=el('option','Не заменять',select);blank.value='';select.value='';
      for(const option of options){const o=el('option',option.name,select);o.value=option.id;}selects[key]=select;
     }
     const help=el('p','Замена не выбрана.',fs);selects.add.addEventListener('change',()=>help.textContent=data.invocationOptions[choice.id].find(o=>o.id===selects.add.value)?.text||'Замена не выбрана.');
     const rituals=ritualPicker(fs,data);selects.add.addEventListener('change',()=>rituals.root.hidden=selects.add.value!=='book-of-ancient-secrets');invocationFields.push({choice,select:selects.add,rituals,help});el('p','Новое воззвание для замены должно отличаться от выбранных новых воззваний этого повышения. Требования договора и Мистического заряда также сохраняются.',fs);
     controls.set(choice.id,()=>!selects.remove.value&&!selects.add.value?undefined:{remove:selects.remove.value,add:selects.add.value==='book-of-ancient-secrets'?{id:selects.add.value,rituals:rituals.read()}:selects.add.value});
    }else if(choice.kind==='invocations'&&data.invocationOptions?.[choice.id]?.length){
     el('p','Выбери '+choice.count+' разных воззвания. Сохраняется выбор; эффекты и применение остаются ручными. Требования договора и Мистического заряда проверяются по итоговому выбору этого повышения.',fs);
     const count=el('p','Выбрано 0 из '+choice.count,fs);count.setAttribute('aria-live','polite');const rows=[];
     const searchLabel=el('label','Найти воззвание',fs),search=el('input',undefined,searchLabel);search.type='search';
     const list=el('div',undefined,fs);list.className='advancement-spells';const searchRows=[];
     const reasonNames={'warlock-level':'нужен больший уровень колдуна','pact':'нужен подтверждённый дар договора','eldritch-blast':'нужен Мистический заряд в личной книге','already-known':'уже изучено','additional-choice':'нужен отдельный выбор ритуалов, пока не подключён'};
     for(const option of data.invocationOptions[choice.id]){
      const wrapper=el('div',undefined,list);let checkbox=null;
      if(option.eligible){const label=el('label',undefined,wrapper),box=el('input',undefined,label);checkbox=box;box.type='checkbox';box.value=option.id;el('span',option.name,label);rows.push(box);box.addEventListener('change',()=>count.textContent='Выбрано '+rows.filter(r=>r.checked).length+' из '+choice.count);}
      else el('p',option.name+' — '+option.reasons.map(r=>reasonNames[r]||r).join('; ')+'.',wrapper);
      renderFeatureHelp(wrapper,option,option.key);searchRows.push({wrapper,checkbox,text:(option.name+' '+option.text).toLocaleLowerCase('ru')});
     }
     search.addEventListener('input',()=>{const q=search.value.trim().toLocaleLowerCase('ru');for(const row of searchRows)row.wrapper.hidden=!row.checkbox?.checked&&!row.text.includes(q);});
     const rituals=ritualPicker(fs,data);
     for(const row of rows)row.addEventListener('change',()=>rituals.root.hidden=!rows.some(r=>r.checked&&r.value==='book-of-ancient-secrets'));invocationFields.push({choice,rows,rituals,count});
     controls.set(choice.id,()=>rows.filter(r=>r.checked).map(r=>r.value==='book-of-ancient-secrets'?{id:r.value,rituals:rituals.read()}:r.value));
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
     for(const spell of data.options[choice.id]){const l=el('label',undefined,list),box=el('input',undefined,l);box.type='checkbox';box.name=choice.id;box.value=spell.spellId;if(spell.expandedSource){box.disabled=data.selectedSubclass?.id!=='warlock-fiend';fiendRows.push({box,update:()=>count.textContent='Выбрано '+rows.filter(r=>r.box.checked).length+' из '+choice.count});}el('span',spell.name.ru+' / '+spell.name.en+' · '+(spell.level===0?'заговор':spell.level+' круг')+(spell.expandedSource?' · расширенный список Исчадия':''),l);rows.push({l,box,search:(spell.name.ru+' '+spell.name.en).toLocaleLowerCase('ru')});}
     search.addEventListener('input',()=>{const q=search.value.trim().toLocaleLowerCase('ru');for(const r of rows)r.l.hidden=!r.box.checked&&!r.search.includes(q);});
     list.addEventListener('change',()=>{const n=rows.filter(r=>r.box.checked).length;count.textContent='Выбрано '+n+' из '+choice.count;});
     if(['lore-secrets','magical-secrets'].includes(choice.kind)){secretFields.push({rows,count,choice});el('p','Заклинание или заговор, выбранные выше обычным способом, нельзя одновременно выбрать Магической тайной.',fs);}
     controls.set(choice.id,()=>choice.kind==='lore-secrets'?{spellIds:rows.filter(r=>r.box.checked).map(r=>r.box.value)}:rows.filter(r=>r.box.checked).map(r=>r.box.value));
    }else{blocked=true;el('p',data.choiceNotices?.[choice.id]||'Этот обязательный выбор пока не подключён. Повышение не будет сохранено.',fs);}
   }
   updateLoreSkills();
   updateDependentChoices=()=>{
    for(const update of rangerUpdates)update();
    const bookChoice=data.plan.choices.find(c=>c.kind==='spellbook-spells'),newIds=new Set(bookChoice?controls.get(bookChoice.id)?.()||[]:[]);
    for(const {fields,choice}of wizardFields)for(const field of fields){
     for(const option of field.querySelectorAll('option')){const source=data.wizardOptions[choice.id].find(o=>o.id===option.value);option.disabled=Boolean(source&&((source.requiresNewSpell&&!newIds.has(source.id))||(choice.kind==='signature-spells'&&fields.some(other=>other!==field&&other.value===source.id))));if(option.disabled&&field.value===option.value)field.value='';}
    }
     const ordinarySpellIds=new Set(data.plan.choices.filter(c=>['known-spells','cantrips'].includes(c.kind)).flatMap(c=>controls.get(c.id)?.()||[]));
     for(const item of secretFields){for(const {box}of item.rows){box.disabled=ordinarySpellIds.has(box.value);if(box.disabled)box.checked=false;}item.count.textContent='Выбрано '+item.rows.filter(r=>r.box.checked).length+' из '+item.choice.count;}
     const pactChoice=data.plan.choices.find(c=>c.kind==='pact-boon'),pact=pactChoice?controls.get(pactChoice.id)?.():data.selectedPact;
     const newCantrips=data.plan.choices.filter(c=>c.kind==='cantrips').flatMap(c=>controls.get(c.id)?.()||[]);
     const hasNewBlast=[...newCantrips,...(pact?.cantrips||[])].includes('srd51:2014:spell:eldritch-blast');
     const addedInvocations=new Set(data.plan.choices.filter(c=>c.kind==='invocations').flatMap(c=>controls.get(c.id)?.()||[]).map(o=>typeof o==='string'?o:o.id));
     for(const item of invocationFields){
      const sources=data.invocationOptions[item.choice.id];
      for(const field of item.select?item.select.querySelectorAll('option'):item.rows){
       const source=sources.find(o=>o.id===field.value);field.disabled=Boolean(source&&((source.requiresSelectedPact&&source.pact!==pact?.id)||(source.requiresNewBlast&&!hasNewBlast)||(item.select&&addedInvocations.has(source.id))));
       if(field.disabled){if(item.select&&item.select.value===field.value)item.select.value='';else if(!item.select)field.checked=false;}
      }
      if(item.select){item.rituals.root.hidden=item.select.value!=='book-of-ancient-secrets';item.help.textContent=sources.find(o=>o.id===item.select.value)?.text||'Замена не выбрана.';}
      else{item.rituals.root.hidden=!item.rows.some(r=>r.checked&&r.value==='book-of-ancient-secrets');item.count.textContent='Выбрано '+item.rows.filter(r=>r.checked).length+' из '+item.choice.count;}
     }
   };updateDependentChoices();
   const reviews=[];
   if(data.plan.requiresFeatureReview.length){const fs=el('fieldset',undefined,form);el('legend','Новые умения: ручная проверка',fs);el('p','Проверь условия применения новых умений. Автоматические изменения перечислены в итоге повышения; остальные эффекты учитывай вручную.',fs);for(const feature of data.plan.requiresFeatureReview){
      const info=data.plan.featureDetails?.find(item=>item.key===feature);
      renderFeatureHelp(fs,info,feature);
      const l=el('label',undefined,fs),box=el('input',undefined,l);box.type='checkbox';
      el('span','Проверил: '+(info?.name||feature),l);reviews.push({feature,box});
     }}
   status.textContent=blocked?'Есть неподдерживаемый обязательный выбор. Сохранение недоступно.':'Выбери изменения и проверь итог до сохранения.';check.disabled=blocked;
   check.onclick=async()=>{
    if(running||pending||blocked||closed)return;running=true;lock(true);invalidate();
    const command={expectedRevision:data.revision,characterId:data.characterId,classId:data.classId,fromLevel:data.fromLevel,hpMethod:method.value,hpRoll:method.value==='roll'&&roll.value!==''?Number(roll.value):null,choices:Object.fromEntries([...controls].map(([id,read])=>[id,read()]).filter(([,value])=>value!==undefined)),reviewedFeatures:reviews.filter(r=>r.box.checked).map(r=>r.feature)};
    try{const result=await preview({...command,mutationId:newId()});if(closed)return;candidate=command;el('p','Максимум хитов: '+data.maxHp+' → '+(data.maxHp+result.hitPoints.maximumDelta)+'. Текущие: '+data.hp+'.',summary);if(result.primalChampion)el('p','Первобытный чемпион: Сила '+result.primalChampion.before.str+' → '+result.primalChampion.after.str+', Телосложение '+result.primalChampion.before.con+' → '+result.primalChampion.after.con+'. Пределы24; прибавка хитов включает новое Телосложение за прежние уровни. КД, скорость и инициатива не меняются.',summary);if(result.hitPoints.draconicResilience)el('p','В прибавку уже включён +1 от Драконьей стойкости за новый уровень.',summary);el('p','Бонус мастерства: +'+result.proficiency.before+' → +'+result.proficiency.after+'.',summary);if(result.classSaveBenefits)el('p',result.classSaveBenefits.origin.name+': в спасбросках '+result.classSaveBenefits.saveProficiencies.map(k=>({str:'СИЛ',dex:'ЛОВ',con:'ТЕЛ',int:'ИНТ',wis:'МДР',cha:'ХАР'}[k])).join(', ')+' будет учтено владение без повторного бонуса.'+(result.classSaveBenefits.deathSaveProficiency?' В спасбросках от смерти также добавляется мастерство.':'')+' Ручные записи владений сохраняются.',summary);if(result.classCheckBenefits)el('p',result.classCheckBenefits.origin.name+': панель проверок покажет бонус +'+result.classCheckBenefits.bonus+' к проверкам СИЛ, ЛОВ и ТЕЛ без владения. Он не складывается с владением; спасброски и ручная инициатива не меняются.',summary);renderChosenChanges(summary,data,command);for(const spell of result.preparedSpells||[])el('p','Постоянная подготовка: '+spell.name.ru+'. Не входит в обычный предел подготовки; применение учитывается по правилам выбранного умения.',summary);for(const resource of result.newResources)el('p','Новый ресурс: '+resource.name+' — '+(resource.unlimited?'∞ — неограниченно, без конечного счётчика':resource.max)+'.',summary);if(result.unmanagedResources.length)el('p','Существующие ручные ресурсы не изменятся. Их максимумы нужно сверить отдельно.',summary);apply.hidden=false;status.textContent='Итог проверен. Подтверди повышение.';}catch(e){if(!closed)status.textContent=e.message;}finally{running=false;if(!closed)lock(false);}
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
