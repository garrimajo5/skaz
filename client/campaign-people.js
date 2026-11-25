const SkazCampaign = (function(){
  const sections = {overview:'Обзор',people:'Персонажи',journal:'Дневник',actions:'История действий'};
  const labels = {person:'Персонаж',quest:'Задание',place:'Место',session:'Сессия'};
  const changes = {
    create:'Карточка создана',edit:'Карточка исправлена','add-knowledge':'Сведение добавлено',
    'edit-knowledge':'Сведение исправлено','confirm-knowledge':'Предположение подтверждено',
    'add-encounter':'Встреча добавлена','edit-encounter':'Встреча исправлена',
    'choose-latest':'Изменено последнее наблюдение','set-links':'Связи обновлены',
    'remove-link-snapshot':'Источник убран из связей',
  };
  const el=id=>document.getElementById(id);
  const api=()=>SkazStorage.campaignApi;
  const canWrite=()=>SkazStorage.can('shared');
  /** @type {CampaignScreenState} */
  let view={section:'overview',query:'',selectedId:null,scope:null};
  let root=null, serial=0, version=null, writable=null, result=null, failure='', loading=false;
  let listScroll=0, listTrigger=null, returnFocus=false, subscriptions=null, editor=null;
  let history=null, historyWaiting=false;
  const button=(text,action,id='',extra='')=>
    `<button type="button" data-campaign-action="${action}" data-target="${esc(id)}" ${extra}>${esc(text)}</button>`;
  const note=(text,kind='')=>`<p ${kind?'role="'+kind+'"':''}>${esc(text)}</p>`;
  const field=(label,name,value='',max=1200,required=false)=>{
    const common=`id="campaign-field-${name}" name="${name}" maxlength="${max}" ${required?'required':''}`;
    return `<label for="campaign-field-${name}">${label}</label>`+
      (max===120?`<input ${common} value="${esc(value)}">`:`<textarea ${common} rows="3">${esc(value)}</textarea>`);
  };
  const selector=(label,name,rows,selected='',unknown='Неизвестно')=>
    `<label for="campaign-field-${name}">${label}</label><select id="campaign-field-${name}" name="${name}">
      <option value="">${esc(unknown)}</option>${rows.map(row=>`<option value="${esc(row.id)}" ${row.id===selected?'selected':''}>${esc(row.title)}</option>`).join('')}
    </select>`;
  function rootActive(){
    return root?.isConnected && api().scope()?.key===view.scope?.key;
  }
  function current(request){
    return rootActive() && request===serial;
  }
  function linkedRows(kind, refs){
    if(kind==='session')return refs.sessions;
    if(kind==='person')return refs.people;
    return kind==='quest'?refs.quests:refs.places;
  }
  function reference(kind,id,snapshot,refs,unknown){
    if(snapshot)return `<span>${esc(snapshot.text)} · Источник недоступен${snapshot.origin?' (из другой игры)':''}</span>`;
    if(!id)return `<span>${esc(unknown)}</span>`;
    const row=linkedRows(kind,refs).find(item=>item.id===id);
    return row?button(row.title,'reference',id,`data-link-kind="${kind}"`):'<span>Источник недоступен</span>';
  }
  function matchingPeople(people, refs){
    return people.map(person=>`<article class="panel campaign-panel">
      <h3>${esc(person.name)}</h3>${person.description?`<p class="session-text">${esc(person.description)}</p>`:''}
      <p>${esc(person.latestEncounter?.text || 'Последняя встреча неизвестна')}</p>
      ${person.latestEncounter?.sessionId?`<p>${esc(refs.sessions.find(row=>row.id===person.latestEncounter.sessionId)?.title || 'Сессия недоступна')}</p>`:''}
      ${button('Открыть карточку','person-open',person.id,`class="campaign-entry" aria-label="Открыть карточку ${esc(person.name)}"`)}
    </article>`).join('');
  }
  function records(person,refs){
    const sections=[['known','Известно'],['assumption','Предположения']];
    return sections.map(([kind,title])=>`<section class="panel campaign-panel">
      <h3>${title}</h3>
      ${person.knowledge.filter(item=>item.kind===kind).map(item=>`<div class="campaign-record">
        <p class="session-text">${esc(item.text)}</p>
        ${reference('session',item.sessionId,item.sessionSnapshot,refs,'Сессия неизвестна')}
        ${canWrite()?`<div class="campaign-controls">${button('Исправить сведение','edit-knowledge',item.id)}
          ${kind==='assumption'?button('Подтвердить как факт','confirm-knowledge',item.id):''}</div>`:''}
      </div>`).join('')||note('Записей пока нет.')}
    </section>`).join('');
  }
  function encounterRow(encounter,refs){
    return `${encounter.text?`<p class="session-text">${esc(encounter.text)}</p>`:''}
      <div class="campaign-controls">
        ${reference('place',encounter.placeId,encounter.placeSnapshot,refs,'Место неизвестно')}
        ${reference('session',encounter.sessionId,encounter.sessionSnapshot,refs,'Сессия неизвестна')}
      </div>`;
  }
  function snapshotText(row){
    if(!row)return 'Карточки ещё нет';
    return [row.name,row.description,row.relation].filter(Boolean).join(' · ');
  }
  function referenceText(kind,id,snapshot,refs){
    if(snapshot)return 'Недоступный источник · '+snapshot.text;
    if(!id)return kind==='place'?'Место неизвестно':kind==='session'?'Сессия неизвестна':'Источник неизвестен';
    return linkedRows(kind,refs).find(row=>row.id===id)?.title??'Источник недоступен';
  }
  function describeRecord(row,kind,refs){
    if(!row)return kind==='knowledge'?'Сведения ещё нет':'Встреча не выбрана';
    const type=kind==='knowledge'?(row.kind==='known'?'Известно':'Предположение'):'Встреча';
    const parts=[type,row.text,referenceText('session',row.sessionId,row.sessionSnapshot,refs)];
    if(kind==='encounters')parts.push(referenceText('place',row.placeId,row.placeSnapshot,refs));
    return parts.filter(Boolean).join(' · ');
  }
  function describeLinks(links,refs){
    return links.map(link=>labels[link.kind]+': '+referenceText(link.kind,link.id,link.snapshot,refs)).join(' · ')||'Связей нет';
  }
  function recordedDifference(entry,side,refs){
    const row=entry[side], other=entry[side==='before'?'after':'before'];
    if(!row||!other)return snapshotText(row);
    for(const field of ['knowledge','encounters']){
      if(JSON.stringify(row[field])===JSON.stringify(other[field]))continue;
      const different=row[field].find(item=>!other[field].some(prev=>JSON.stringify(item)===JSON.stringify(prev)));
      return describeRecord(different,field,refs);
    }
    if(row.latestEncounterId!==other.latestEncounterId)return describeRecord(row.encounters.find(item=>item.id===row.latestEncounterId),'encounters',refs);
    if(JSON.stringify(row.links)!==JSON.stringify(other.links))return describeLinks(row.links,refs);
    return snapshotText(row);
  }
  function cardHistory(refs){
    if(historyWaiting)return note('Загружаем историю…','status');
    if(!history)return '';
    if(history.failure)return `<p role="alert">${esc(history.failure)}</p>${button('Повторить','person-history')}`;
    if(!history.changes.length)return note('История карточки пуста.');
    return history.changes.map(entry=>`<details class="campaign-record"><summary>${esc(changes[entry.operation]||'Карточка изменена')}</summary>
      <p>${esc(new Date(entry.createdAt).toLocaleString('ru-RU'))}</p>
      <p>Было: ${esc(recordedDifference(entry,'before',refs))}</p><p>Стало: ${esc(recordedDifference(entry,'after',refs))}</p></details>`).join('')+
      (history.nextBeforePosition?button('Показать более ранние записи','person-history',String(history.nextBeforePosition)):'');
  }
  function card(person,refs){
    const latest=person.encounters.find(row=>row.id===person.latestEncounterId);
    return `<div class="campaign-toolbar"><h2 id="campaign-section-heading" tabindex="-1">${esc(person.name)}</h2>
        <div class="campaign-controls">${button('К списку персонажей','people-back')}${canWrite()?button('Изменить карточку','edit'):''}</div></div>
      ${person.description?`<p class="session-text">${esc(person.description)}</p>`:''}
      <p>${person.relation?'Отношения: '+esc(person.relation):'Отношение неизвестно'}</p>
      <div class="campaign-layout">${records(person,refs)}</div>
      ${canWrite()?button('Добавить сведение','add-knowledge'):''}
      <section class="panel campaign-panel"><h3>Последняя встреча</h3>
        ${latest?encounterRow(latest,refs):note('Последняя встреча неизвестна.')}
        <div class="campaign-controls">${canWrite()?button('Добавить встречу','add-encounter'):''}
          ${canWrite()&&latest?button('Исправить встречу','edit-encounter',latest.id)+button('Снять выбор последней встречи','choose-latest'):''}</div>
        ${person.encounters.filter(encounter=>encounter.id!==person.latestEncounterId).map(encounter=>`<div class="campaign-record">
          ${encounterRow(encounter,refs)}
          ${canWrite()?`<div class="campaign-controls">${button('Исправить встречу','edit-encounter',encounter.id)}
            ${encounter.id!==person.latestEncounterId?button('Отметить последней','choose-latest',encounter.id):''}</div>`:''}
        </div>`).join('')}
      </section>
      <section class="panel campaign-panel"><h3>Связи</h3>
        ${person.links.map((link,index)=>`<div class="campaign-controls">
          <span>${labels[link.kind]}</span>${reference(link.kind,link.id,link.snapshot,refs,'Источник неизвестен')}
          ${canWrite()&&link.snapshot?button('Убрать снимок','remove-link-snapshot',String(index)):''}
        </div>`).join('')||note('Связей пока нет.')}
        ${canWrite()?button('Изменить связи','set-links'):''}
      </section>
      <section class="panel campaign-panel"><h3>История карточки</h3>
        ${history||historyWaiting?cardHistory(refs):button('Показать историю','person-history')}
      </section>`;
  }
  function overview(data){
    const narrative=state.journal.findLast(entry=>['Событие сессии','Зацепка'].includes(entry.kind));
    const goals=SkazCampaignModel.currentGoals(data?.quests||[]);
    const lastArchive=data?.sessions.findLast(row=>row.archived);
    const known=data?.people.filter(person=>person.latestEncounter).slice(0,3)||[];
    return `<h2 id="campaign-section-heading" tabindex="-1">Обзор</h2>
      <div class="campaign-layout campaign-overview">
        <div class="campaign-stack">
          <section class="panel campaign-panel"><h3>Где остановились</h3>
            <p>${esc(SkazStorage.sessionTitle())}</p>${narrative?`<p>${esc(narrative.title)}</p>`:note('В текущей сессии пока нет сюжетного итога.')}
            ${button('Дневник','section','journal')}
          </section>
          <section class="panel campaign-panel"><h3>Следующие цели</h3>
            ${goals.map(goal=>`<div class="campaign-record">${button(goal.title,'reference',goal.id,'data-link-kind="quest"')}
              <p>${esc(goal.next??'Следующий шаг не указан')}</p></div>`).join('')||note('Нет активных заданий.')}
            <div class="campaign-controls"><button type="button" data-page="quests">Все задания</button><button type="button" data-page="map">Места</button></div>
          </section>
        </div>
        <div class="campaign-stack">
          <section class="panel campaign-panel"><h3>Прошлая сессия</h3>
            ${lastArchive?reference('session',lastArchive.id,null,data,'') : note('Архивных сессий пока нет.')}
          </section>
          <section class="panel campaign-panel"><h3>Известные встречи</h3>
            ${known.map(person=>button(person.name,'person-open',person.id)).join('')||note('Встреч пока нет.')}
            ${button('Персонажи','section','people')}
          </section>
        </div>
      </div>`;
  }
  function journalSection(data){
    return `<h2 id="campaign-section-heading" tabindex="-1">Дневник</h2>
      <section class="panel campaign-panel"><h3>Текущая сессия</h3>
        <p>${esc(SkazStorage.sessionTitle())}</p><button data-page="journal">Открыть текущий журнал</button></section>
      <section class="panel campaign-panel"><h3>Прошлые сессии</h3>
        ${data.sessions.filter(row=>row.archived).toReversed().map(row=>reference('session',row.id,null,data,'')).join('')||note('Архивных сессий пока нет.')}
      </section>`;
  }
  function actionsSection(){
    return `<h2 id="campaign-section-heading" tabindex="-1">История действий</h2><section class="panel campaign-panel">
      <p>Действия текущей сессии и их результаты доступны в общей истории сохранений.</p>
      ${SkazStorage.access()?.history===false?note('История недоступна с текущими правами.'):button('Открыть историю действий','history-screen')}
    </section>`;
  }
  function peopleSection(){
    return `<div class="campaign-toolbar"><h2 id="campaign-section-heading" tabindex="-1">Персонажи</h2>
        ${canWrite()?button('Добавить персонажа','create','', 'class="primary"'):''}</div>
      <form id="campaign-search" class="campaign-search">
        <label for="campaign-query">Найти по имени или сведениям
          <input id="campaign-query" name="q" type="search" maxlength="200" value="${esc(view.query)}"></label>
        <button type="submit">Найти</button>
      </form><div id="campaign-people-results" aria-live="polite"></div>`;
  }
  function drawResults(){
    const region=el('campaign-people-results');
    if(!region)return;
    region.setAttribute('aria-busy',String(loading));
    if(loading){region.innerHTML=note('Ищем персонажей…','status');return;}
    if(!result){region.innerHTML='';return;}
    region.innerHTML=result.people.length?`<div class="campaign-layout">${matchingPeople(result.people,result)}</div>`:
      view.query?`<section class="panel campaign-panel"><h3>Персонажи не найдены</h3>${button('Очистить поиск','search-clear')}</section>`:
      `<section class="panel campaign-panel"><h3>В кампании пока нет известных персонажей</h3>
        ${canWrite()?note('Добавь имя или прозвище первого знакомого.'):note('Добавлять персонажей могут мастер и владелец.')}</section>`;
  }
  function draw({renew=false}={}){
    if(!rootActive())return;
    const region=el('campaign-content'), alert=el('campaign-notice');
    if(!region||!alert)return;
    paintRecovery();
    alert.innerHTML=failure?`<div role="alert">${esc(failure)}</div>${button('Повторить','reload')}`:'';
    for(const nav of root.querySelectorAll('[data-campaign-action="section"]')){
      if(nav.closest('.campaign-sections'))nav.setAttribute('aria-current',nav.dataset.target===view.section?'page':'false');
    }
    if(view.section==='people'&&!view.selectedId){
      if(renew||!el('campaign-search'))region.innerHTML=peopleSection();
      drawResults();
    }else if(view.section==='actions')region.innerHTML=actionsSection();
    else if(loading&&!result)region.innerHTML=note('Загружаем кампанию…','status');
    else if(view.section==='people'&&result?.person)region.innerHTML=card(result.person,result);
    else if(view.section==='overview'&&result)region.innerHTML=overview(result);
    else if(view.section==='journal'&&result)region.innerHTML=journalSection(result);
    else region.innerHTML='';
  }
  async function references(scope, query='', {includeQuests=false,includePlaces=false}={}){
    const [people,sessions,quests,places]=await Promise.all([
      api().list(scope,query),api().sessions(scope),
      includeQuests?api().quests(scope):{quests:[]},includePlaces?api().places(scope):{places:[]},
    ]);
    return {
      people:people.people.map(row=>({...row,title:row.name})),
      sessions:sessions.sessions.map((row,index)=>({...row,title:row.name||'Сессия '+(index+1)})),
      quests:quests.quests,
      places:places.places,
    };
  }
  async function load({focus=false,holdResults=false,retry}={}){
    const scope=api().scope();
    if(!scope||!rootActive())return;
    const request=++serial;
    const panel=view.section, selected=view.selectedId, query=view.query;
    const last=holdResults?result:null;
    const focusAnchor=retry&&document.activeElement===retry?el('campaign-content'):null;
    loading=true;failure='';result=last;draw();
    if(focusAnchor&&document.activeElement===document.body)focusAnchor.focus({preventScroll:true});
    try{
      if(panel==='actions')result={};
      else if(panel==='journal'){
        const value=await api().sessions(scope);
        if(!current(request))return;
        result={sessions:value.sessions.map((row,index)=>({...row,title:row.name||'Сессия '+(index+1)}))};
      }else{
        const values=await Promise.all([references(scope,selected||panel==='overview'?'':query,
          {includeQuests:Boolean(selected)||panel==='overview',includePlaces:Boolean(selected)}),
          selected?api().person(scope,selected):null]);
        if(!current(request))return;
        result={...values[0],person:values[1]?.person};
      }
    }catch(error){
      if(!current(request))return;
      failure=[401,403,404].includes(error.status)?'Записи недоступны. Проверь доступ к кампании.':error.message;
      result=[401,403,404].includes(error.status)?null:last;
      if([401,403].includes(error.status)&&editor){
        editor=null;closeModal();
      }
    }
    if(!current(request))return;
    loading=false;draw();
    if(failure&&focusAnchor&&document.activeElement===focusAnchor){
      el('campaign-notice')?.querySelector('[data-campaign-action="reload"]')?.focus({preventScroll:true});
    }
    if(returnFocus&&view.section==='people'&&!view.selectedId){
      returnFocus=false;
      const opener=Array.from(root.querySelectorAll('[data-campaign-action="person-open"]'))
        .find(item=>item.dataset.target===listTrigger);
      window.scrollTo({top:listScroll,behavior:'instant'});
      (opener||el('campaign-query'))?.focus({preventScroll:true});
    }else if(focus)(el('campaign-section-heading')||el('campaign-title'))?.focus({preventScroll:true});
  }
  function titleMarkup(){
    return `<div class="campaign-title"><h1 id="campaign-title" tabindex="-1">Кампания</h1>
        ${button('Вернуться в игру','return-game')}</div>
      <nav class="campaign-sections" aria-label="Разделы кампании">
        ${Object.entries(sections).map(([id,label])=>button(label,'section',id)).join('')}
      </nav><p id="campaign-save-status" role="status" class="small" hidden></p>
      <div id="campaign-notice"></div><div id="campaign-pending" class="campaign-controls"></div><div id="campaign-content" class="campaign-stack" tabindex="-1"></div>
      <details class="campaign-transfer" ${api().needsTransferFile()?'open':''}><summary>Перенос кампании</summary>
        ${api().needsTransferFile()?'<p id="campaign-transfer-recover" role="status">Выбери тот же файл, чтобы повторить незавершённый импорт.</p>':''}
        <div class="campaign-controls">${button('Скачать пакет кампании','transfer-export')}
          ${SkazStorage.access()?.import===false?'':'<label class="file-label">Импортировать пакет<input id="campaign-transfer-file" type="file" accept=".json,application/json"></label>'}
        </div></details>`;
  }
  /**
   * @param {HTMLElement} main
   * @param {string | null} initialSection An explicit section requested by the outer navigation.
   */
  function mount(main, initialSection=null){
    const scope=api().scope();
    const existing=main.querySelector('#campaign-screen');
    const section=initialSection&&Object.hasOwn(sections,initialSection)?initialSection:null;
    const replaceScreen=!existing||view.scope?.key!==scope?.key;
    if(replaceScreen){
      ++serial; view={section:section||'overview',query:'',selectedId:null,scope}; version=null;writable=null;
      history=null;historyWaiting=false;listTrigger=null;listScroll=0;returnFocus=false;result=null;failure='';
      if(editor){editor=null;closeModal();}
      // Existing fragments are replaced only on entry or a context change.
      subscriptions?.abort();
      subscriptions=new AbortController();
      main.innerHTML=`<section class="play-screen workspace-prepare"><div class="play-layout">
        <div class="workspace-content"><section id="campaign-screen" class="campaign-screen">${titleMarkup()}</section></div>
        ${SkazPlayPresentation.resources(SkazPlay.actorView().historyAvailable)}
      </div></section>`;
      root=el('campaign-screen');
      const options={signal:subscriptions.signal};
      root.addEventListener('click',click,options);
      root.addEventListener('submit',search,options);
      root.addEventListener('change',changeFile,options);
    }
    if(!scope){
      el('campaign-content').innerHTML=note('Подключись к игре, чтобы открыть кампанию.','status');
      return;
    }
    if(section&&!replaceScreen){navigate(section);return;}
    if(writable!==canWrite()){
      writable=canWrite();draw({renew:true});
    }
    if(version!==scope.revision){
      version=scope.revision;
      void load({holdResults:Boolean(result),focus:Boolean(section)});
    }
  }
  function unmount(){
    ++serial;
    subscriptions?.abort();
    root=null;
  }
  function navigate(section,person=null){
    if(!Object.hasOwn(sections,section))return;
    view.section=section;view.selectedId=person;history=null;historyWaiting=false;result=null;failure='';
    draw({renew:true});
    void load({focus:true});
  }
  function search(event){
    if(event.target.id!=='campaign-search')return;
    event.preventDefault();
    view.query=el('campaign-query').value.trim();
    void load();
  }
  function openReference(kind,id,origin){
    const refs=result;
    if(!refs||!rootActive())return;
    const row=linkedRows(kind,refs).find(item=>item.id===id);
    if(!row)return;
    const opener=()=>{closeModal();if(origin.isConnected)origin.focus({preventScroll:true});};
    if(kind==='session'){void SkazArchive.open(id,opener,view.selectedId?'К персонажу':'К кампании');return;}
    if(kind==='person'){navigate('people',id);return;}
    const path=kind==='quest'?'quests':'map';
    const section=kind==='quest'?'К заданиям':'К местам';
    modal(`<h2>${esc(row.title)}</h2>${row.description?`<p class="session-text">${esc(row.description)}</p>`:''}
      ${kind==='quest'?`<ul>${row.steps.map(step=>`<li>${esc(step.title)} · ${step.done?'выполнен':'открыт'}</li>`).join('')}</ul>`:''}
      <div class="dialog-actions"><button id="campaign-reference-back">К кампании</button><button id="campaign-reference-page">${section}</button></div>`);
    el('campaign-reference-back').onclick=opener;
    el('campaign-reference-page').onclick=()=>{closeModal();go(path);};
  }
  async function loadHistory(before){
    const scope=api().scope(), request=serial, selected=view.selectedId;
    historyWaiting=true;draw();
    try{
      const data=await api().history(scope,selected,before);
      if(current(request)&&view.selectedId===selected){
        history={...data,changes:before?[...(history?.changes||[]),...data.changes]:data.changes};
      }
    }catch(error){if(current(request))history={failure:error.message};}
    if(current(request)){historyWaiting=false;draw();el('campaign-section-heading')?.focus({preventScroll:true});}
  }
  function click(event){
    const target=event.target.closest('[data-campaign-action]');
    if(!target||!rootActive())return;
    const action=target.dataset.campaignAction, id=target.dataset.target;
    switch(action){
      case 'section': return navigate(id);
      case 'return-game': return returnFromCampaign();
      case 'reload': return load({holdResults:true,retry:target});
      case 'recover-person': return recoverPerson(target);
      case 'people-back': returnFocus=true;return navigate('people');
      case 'person-open':
        listScroll=window.scrollY;listTrigger=id;
        return navigate('people',id);
      case 'search-clear':
        view.query='';el('campaign-query').value='';el('campaign-query').focus();
        return load();
      case 'history-screen': return api().historyScreen().catch(error=>toast(error.message));
      case 'person-history': return loadHistory(id?Number(id):undefined);
      case 'reference': return openReference(target.dataset.linkKind,id,target);
      case 'transfer-export':
        return api().savePackage(api().scope()).catch(error=>toast(error.message,undefined,{error:true}));
      default: if(canWrite())return openEditor(action,id,target);
    }
  }
  async function changeFile(event){
    if(event.target.id!=='campaign-transfer-file')return;
    const file=event.target.files?.[0], scope=api().scope();
    event.target.value='';
    if(!file||!scope)return;
    const opened=serial;
    if(file.size>SkazCampaignModel.maxTransferBytes)return toast('Пакет больше 8 МиБ.',undefined,{error:true});
    try{
      const value=JSON.parse(await file.text());
      if(!current(opened))return;
      const review=SkazCampaignModel.transferPreview(value);
      if(!review)throw new Error('Нужен пакет картотеки кампании v1 для D&D 2014.');
      modal(`<h2>Открыть пакет кампании</h2><p>${esc(review.name)} · ${esc(review.hero)}</p>
        <p>Карточек: ${review.people}. Архивных сессий: ${review.archives}.</p>
        <p>Будет создана отдельная кампания с выбранным героем, картотекой и связанными архивами.</p>
        <div class="dialog-actions"><button id="campaign-confirm-import" class="primary">Импортировать в новую кампанию</button></div>`);
      el('campaign-confirm-import').onclick=async event=>{
        if(!current(opened))return;
        const submit=event.currentTarget;
        submit.disabled=true;
        try{await api().importPackage(scope,value);el('campaign-transfer-recover')?.remove();}
        catch(error){toast(error.message,undefined,{error:true});}
        finally{if(submit.isConnected)submit.disabled=false;}
      };
    }catch(error){toast(error.message,undefined,{error:true});}
  }

  function paintRecovery(){
    const region=el('campaign-pending');
    if(!region)return;
    const recovery=api().pendingPerson(api().scope());
    region.innerHTML=recovery?button(recovery.conflicted?'Сверить черновик карточки':'Открыть запрос карточки','recover-person'):'';
  }
  async function recoverPerson(origin){
    const scope=api().scope(), recovery=api().pendingPerson(scope), request=serial;
    if(!recovery)return;
    origin.disabled=true;
    const {command}=recovery;
    try{
      const [refs,payload]=await Promise.all([references(scope,'',{includeQuests:true,includePlaces:true}),
        command.operation==='create'?null:api().person(scope,command.personId)]);
      if(!current(request))return;
      view.section='people';view.selectedId=payload?.person.id??null;
      result={...refs,person:payload?.person};history=null;failure='';loading=false;draw({renew:true});
      const id=command.operation==='remove-link-snapshot'?String(command.data.index):command.data.id??'';
      openEditor(command.operation,id,origin,recovery);
    }catch(error){
      if(current(request))toast(error.message,undefined,{error:true});
    }finally{if(origin.isConnected)origin.disabled=false;}
  }
  function recoveredFields(command) {
    const data=command.data;
    if(command.operation==='create')return {...data.details,relation:data.details.relation??'',knowledge:data.knowledge?.text??'',kind:data.knowledge?.kind??'known'};
    if(command.operation==='edit')return {...data,relation:data.relation??''};
    if(command.operation.includes('knowledge')||command.operation.includes('encounter'))return {
      text:data.text??'',kind:data.kind??'',session:data.sessionId??'',place:data.placeId??'',
      latest:data.makeLatest===true,clearSession:data.clearSnapshots?.includes('session')===true,
      clearPlace:data.clearSnapshots?.includes('place')===true,
    };
    return data;
  }
  function editorSpec(action,id){
    const person=result?.person, refs=result;
    const itemId=crypto.randomUUID();
    if(action==='create'||action==='edit'){
      const base=action==='create'?null:person;
      if(action==='edit'&&!base)return null;
      return {
        kind:'campaign-details',title:base?'Изменить карточку':'Добавить персонажа',
        markup:field('Имя или прозвище','name',base?.name??'',120,true)+
          (!base?'<p id="campaign-name-hint" role="status" class="small" hidden></p>':'')+
          field('Краткое описание','description',base?.description??'')+
          field('Отношения','relation',base?.relation??'')+
          (!base?field('Первое сведение','knowledge')+
            selector('Вид сведения','kind',[{id:'known',title:'Известно'},{id:'assumption',title:'Предположение'}],'known','Выбери вид'):''),
        target:base,entityId:base?.id??itemId,
        build(values){
          const details={name:values.name.trim(),description:values.description,relation:values.relation.trim()||null};
          if(!details.name)throw new Error('Введи имя или прозвище.');
          if(base)return {operation:'edit',data:details};
          const text=values.knowledge.trim();
          if(text&&!['known','assumption'].includes(values.kind))throw new Error('Выбери вид первого сведения.');
          return {operation:'create',data:{details,knowledge:text?{id:itemId,kind:values.kind,text,sessionId:null}:null}};
        },
      };
    }
    if(!person||!refs)return null;
    if(['add-knowledge','edit-knowledge','add-encounter','edit-encounter'].includes(action)){
      const isKnowledge=action.endsWith('knowledge'), editing=action.startsWith('edit');
      const row=(isKnowledge?person.knowledge:person.encounters).find(item=>item.id===id);
      if(editing&&!row)return null;
      const title=(editing?'Исправить ':'Добавить ')+(isKnowledge?'сведение':'встречу');
      const sessionDefault=editing?row.sessionId??'':isKnowledge?'':api().scope().context.sessionId;
      const caution=(snapshot,key)=>snapshot?`<p>${esc(snapshot.text)} · Источник недоступен</p>
        <label><input type="checkbox" name="${key}"> Убрать сохранённый источник</label>`:'';
      const kinds=[{id:'known',title:'Известно'},{id:'assumption',title:'Предположение'}];
      const markup=field(isKnowledge?'Что известно':'Уточнение встречи','text',row?.text||'',1200,isKnowledge)+
        (isKnowledge ? (editing ? `<p>${row.kind==='known'?'Известно':'Предположение'}</p>` :
          selector('Вид сведения','kind',kinds,'known','Выбери вид')) :
          selector('Место','place',refs.places,row?.placeId||'')+caution(row?.placeSnapshot,'clearPlace'))+
        selector('Сессия','session',refs.sessions,sessionDefault)+caution(row?.sessionSnapshot,'clearSession')+
        (!isKnowledge&&!editing?'<label><input type="checkbox" name="latest"> Выбрать последней известной встречей</label>':'');
      return {
        kind:isKnowledge?'campaign-knowledge':'campaign-encounter',title,markup,target:row||person,
        entityId:row?.id??person.id,personId:person.id,
        build(values){
          const data={id:row?.id??itemId,text:isKnowledge?values.text.trim():values.text,sessionId:values.session||null};
          if(isKnowledge&&!data.text)throw new Error('Введи сведение.');
          if(isKnowledge&&!editing){
            if(!['known','assumption'].includes(values.kind))throw new Error('Выбери вид сведения.');
            data.kind=values.kind;
          }
          if(!isKnowledge){
            data.placeId=values.place||null;
            if(!editing)data.makeLatest=values.latest===true;
          }
          const clear=[!data.sessionId&&values.clearSession?'session':null,!data.placeId&&values.clearPlace?'place':null].filter(Boolean);
          if(editing&&clear.length)data.clearSnapshots=clear;
          return {operation:action,data};
        },
      };
    }
    if(action==='set-links'){
      let links=person.links.filter(link=>link.id).map(({kind,id})=>({kind,id}));
      const kinds=Object.entries(labels).map(([id,title])=>({id,title}));
      const markup=`<div id="campaign-link-rows" class="campaign-stack"></div>
        ${selector('Тип связи','linkKind',kinds,'quest','Выбери тип')}
        <div id="campaign-target-choice"></div>
        <button type="button" id="campaign-add-link">Добавить связь</button>`;
      return {
        kind:'campaign-links',title:'Изменить связи',target:person,entityId:person.id,personId:person.id,markup,
        initialize(form){
          const selectedKind=()=>form.elements.linkKind.value;
          const drawTargets=()=>{
            const kind=selectedKind();
            const candidates=kind?linkedRows(kind,refs).filter(row=>kind!=='person'||row.id!==person.id):[];
            el('campaign-target-choice').innerHTML=selector('Запись «'+(labels[kind]||'—')+'»','linkTarget',candidates,'','Выбери запись');
          };
          const drawLinks=()=>{
            el('campaign-link-rows').innerHTML=links.map(({kind,id},index)=>{
              const title=linkedRows(kind,refs).find(row=>row.id===id)?.title??'Источник недоступен';
              return `<div class="campaign-controls"><span>${esc(labels[kind]+' · '+title)}</span>
                <button type="button" data-campaign-link-remove="${index}">Убрать</button></div>`;
            }).join('')||note('Рабочих связей пока нет.');
          };
          form.elements.linkKind.addEventListener('change',drawTargets);
          el('campaign-add-link').onclick=()=>{
            const kind=selectedKind(), id=form.elements.linkTarget.value;
            if(!kind||!id||links.some(row=>row.kind===kind&&row.id===id))return;
            if(links.length>=64)return setEditorMessage('Допустимо не более 64 связей.','alert');
            links.push({kind,id});drawLinks();editor?.draft?.save();
          };
          el('campaign-link-rows').onclick=event=>{
            const selected=event.target.closest('[data-campaign-link-remove]');
            if(!selected)return;
            links.splice(Number(selected.dataset.campaignLinkRemove),1);drawLinks();editor?.draft?.save();
          };
          drawTargets();drawLinks();
          return {
            read:()=>({links:[...links]}),
            restore:values=>{links=values.links;drawLinks();},
            valid:values=>Array.isArray(values?.links)&&values.links.length<=64&&values.links.every(
              row=>Object.hasOwn(labels,row.kind)&&typeof row.id==='string'&&row.id.length<=80),
          };
        },
        build:values=>({operation:action,data:{links:values.links}}),
      };
    }
    const confirmTitles={
      'confirm-knowledge':['Подтвердить как факт','Сведение перейдёт в раздел «Известно». Предыдущая запись останется в истории.'],
      'choose-latest':[id?'Выбрать последней встречей':'Снять выбор последней встречи',
        id?'Карточка будет показывать выбранную встречу первой.':'История встреч сохранится.'],
      'remove-link-snapshot':['Убрать снимок связи','Снимок останется в истории карточки.'],
    };
    if(!Object.hasOwn(confirmTitles,action))return null;
    const [title,description]=confirmTitles[action];
    return {
      kind:'campaign-choice',title,markup:note(description),personId:person.id,
      build:()=>({operation:action,data:action==='remove-link-snapshot'?{index:Number(id)}:{id:id||null}}),
    };
  }
  function validValues(values){
    return values&&Object.values(values).every(value=>typeof value==='boolean'||typeof value==='string'&&value.length<=1200);
  }
  function setEditorMessage(message,role){
    const node=el('campaign-editor-message');
    if(!node)return;
    node.setAttribute('role',role);
    node.textContent=message;
  }
  function showSaveStatus(message){
    const node=el('campaign-save-status');
    if(!node)return;
    node.hidden=false;node.textContent=message;
  }
  function refreshEditorControls(meta){
    meta.form.querySelector('fieldset').disabled=meta.busy||Boolean(meta.command);
    el('campaign-editor-submit').disabled=meta.busy||meta.conflicted||meta.blocked;
    el('campaign-editor-submit').textContent=meta.busy?'Сохраняем…':meta.command?'Повторить тот же запрос':'Сохранить';
    el('campaign-reconcile').hidden=!meta.conflicted;
    el('campaign-reconcile').disabled=meta.busy;
    meta.form.setAttribute('aria-busy',String(meta.busy));
  }
  function openEditor(action,id,origin,recovery=null){
    if(!rootActive()||!canWrite()&&!recovery)return;
    const spec=editorSpec(action,id),scope=api().scope();
    if(!spec||!scope)return;
    modal(`<h2 id="campaign-editor-title" tabindex="-1">${esc(spec.title)}</h2>
      <form id="${spec.kind}-form" class="campaign-form">
        <p id="${spec.kind}-draft-status" class="small" role="status"></p>
        <fieldset>${spec.markup}</fieldset><p id="campaign-editor-message" role="status"></p>
        <div id="campaign-compare"></div>
        <div class="dialog-actions"><button id="campaign-editor-submit" class="primary" type="submit">Сохранить</button>
          <button id="campaign-reconcile" type="button" hidden>Сверить с сервером</button>
          <button id="campaign-editor-cancel" type="button">Отменить</button></div>
      </form>`);
    const form=el(spec.kind+'-form');
    const defaults={read:()=>SkazCampaignModel.fields(form),restore:values=>SkazCampaignModel.restore(form,values),valid:validValues};
    const adapter=spec.initialize?.(form)??defaults;
    const initial=JSON.stringify(adapter.read());
    const draft=spec.entityId?api().draft(spec.kind,spec.target,spec.entityId,adapter.read,adapter.restore,adapter.valid):null;
    if(recovery)adapter.restore(recoveredFields(recovery.command));
    editor={form,spec,scope,origin,draft,read:adapter.read,valid:adapter.valid,initial,busy:false,blocked:false,reconciled:false,
      conflicted:recovery?.conflicted??false,command:recovery?.command??null};
    if(recovery){
      refreshEditorControls(editor);
      setEditorMessage(recovery.conflicted?'Сверь черновик с сервером.':'Запрос ждёт подтверждения. Можно точно повторить его.','status');
    }
    form.onsubmit=event=>{event.preventDefault();void submitEditor(editor);};
    el('campaign-editor-cancel').onclick=closeModal;
    el('campaign-reconcile').onclick=()=>void reconcileEditor(editor);
    if(action==='create')form.elements.name.addEventListener('change',()=>void suggestDuplicate(editor));
    (form.querySelector('input:not([type="checkbox"]), textarea, select')||el('campaign-editor-title'))?.focus({preventScroll:true});
  }
  async function suggestDuplicate(meta){
    if(!meta||!activeEditor(meta))return;
    const name=meta.form.elements.name.value.trim(), hint=el('campaign-name-hint');
    if(!hint)return;
    hint.hidden=true;
    if(!name)return;
    try{
      const {people}=await api().list(meta.scope,name);
      if(!activeEditor(meta)||meta.form.elements.name.value.trim()!==name)return;
      const similar=people.filter(row=>row.name.toLocaleLowerCase('ru')===name.toLocaleLowerCase('ru'));
      if(similar.length){
        hint.textContent='Такое имя уже есть в кампании. Сверь записи, если это один и тот же персонаж.';
        hint.hidden=false;
      }
    }catch{ /* Saving remains available if this optional check is unavailable. */ }
  }
  function activeEditor(meta){
    return editor===meta && meta.form.isConnected && rootActive() && api().scope()?.key===meta.scope.key;
  }
  async function submitEditor(meta){
    if(!meta||!activeEditor(meta)||meta.busy||meta.conflicted||meta.blocked)return;
    try{
      if(!meta.command){
        const change=meta.spec.build(meta.read());
        const personId=meta.spec.personId??meta.draft?.entityId??meta.spec.entityId;
        meta.command=SkazCampaignModel.command(meta.scope,personId,change,crypto.randomUUID());
        meta.draft?.save();
      }
      meta.busy=true;refreshEditorControls(meta);
      setEditorMessage('Сохраняем карточку…','status');
      const saved=await api().save(meta.command,meta.scope,meta.draft?.key);
      if(!activeEditor(meta))return;
      const focus=meta.origin;
      const own=meta.command;
      if(saved.affectedContext?.campaignId!==meta.scope.context.campaignId){
        throw new Error('Сервер подтвердил другую кампанию. Проверь историю.');
      }
      editor=null;closeModal();
      showSaveStatus('Карточка сохранена.');
      if(own.operation==='create'){navigate('people',own.personId);return;}
      // Refresh the card after applying the shared workspace revision.
      history=null;
      await load({holdResults:true});
      if(focus.isConnected)focus.focus({preventScroll:true});
      else el('campaign-section-heading')?.focus({preventScroll:true});
    }catch(error){
      if(editor!==meta||!meta.form.isConnected)return;
      if([401,403,404].includes(error.status)){
        editor=null;closeModal();result=null;
        render();
        toast('Доступ изменился. Черновик не отправлен.',undefined,{error:true,persistent:true});
        return;
      }
      if(!activeEditor(meta))return;
      if(error.status===409){
        meta.conflicted=true;
        setEditorMessage('Карточка или игра изменилась. Черновик сохранён. Сверь его с сервером.','alert');
      }else if([400,422].includes(error.status)){
        meta.command=null;
        setEditorMessage(error.message,'alert');
      }else {
        if(!meta.busy)meta.command=null;
        setEditorMessage(error.message,'alert');
      }
    }finally{
      if(activeEditor(meta)){meta.busy=false;refreshEditorControls(meta);}
    }
  }
  async function reconcileEditor(meta){
    if(!meta||!activeEditor(meta)||!meta.conflicted||meta.busy)return;
    meta.busy=true;refreshEditorControls(meta);
    try{
      if(!meta.reconciled){
        await api().reconcile(meta.command.mutationId,meta.scope);
        meta.reconciled=true;
      }
      if(!activeEditor(meta))return;
      const scope=api().scope(), old=meta.command;
      const [payload,refs]=await Promise.all([old.operation==='create'?null:api().person(scope,old.personId),
        references(scope,'',{includeQuests:true,includePlaces:true})]);
      if(!activeEditor(meta))return;
      const ref=payload?.person, comparison=el('campaign-compare'), fields=[];
      if(ref){
        fields.push(snapshotText(ref));
        if(old.operation.includes('knowledge'))fields.push(describeRecord(ref.knowledge.find(row=>row.id===old.data.id),'knowledge',refs));
        if(old.operation.includes('encounter'))fields.push(describeRecord(ref.encounters.find(row=>row.id===old.data.id),'encounters',refs));
        if(old.operation==='choose-latest')fields.push(describeRecord(ref.encounters.find(row=>row.id===ref.latestEncounterId),'encounters',refs));
        if(old.operation==='set-links'||old.operation==='remove-link-snapshot')fields.push(describeLinks(ref.links,refs));
      }
      meta.blocked=old.operation==='remove-link-snapshot';
      comparison.innerHTML=`<section class="panel"><h3>Актуальные данные сервера</h3>
        ${fields.length?fields.map(value=>note(value)).join(''):note('Игра обновилась. Черновик создания сохранён.')}
        <p>${meta.blocked?'Список мог изменить порядок. Закрой форму и выбери снимок заново.':'Сравни с полями формы. Чтобы применить свои значения к новой версии, нажми «Сохранить».'}</p></section>`;
      if(meta.draft&&meta.spec.entityId){
        const previous=meta.draft;
        const entityId=old.operation==='create'?old.personId:meta.spec.entityId;
        meta.draft=api().draft(meta.spec.kind,meta.spec.target,entityId,meta.read,()=>{},meta.valid);
        if(meta.draft.save()&&previous.key!==meta.draft.key)previous.discard();
      }
      meta.scope=scope;meta.command=null;meta.conflicted=false;meta.reconciled=false;
      setEditorMessage('Актуальная версия показана ниже. Поля черновика сохранены.','status');
    }catch(error){
      if(activeEditor(meta))setEditorMessage(error.message,'alert');
    }finally{
      if(activeEditor(meta)){meta.busy=false;refreshEditorControls(meta);}
    }
  }
  function allowClose(){
    if(!editor)return true;
    const meta=editor;
    if(meta.busy)return false;
    const dirty=JSON.stringify(meta.read())!==meta.initial;
    const message=meta.command?'Закрыть форму? Запрос останется в меню сохранения.':
      'Закрыть форму? Введённые поля останутся в черновике.';
    if((dirty||meta.command)&&!window.confirm(message))return false;
    if(dirty)meta.draft?.save();
    editor=null;
    queueMicrotask(()=>{paintRecovery();(meta.origin.isConnected?meta.origin:el('campaign-title'))?.focus({preventScroll:true});});
    return true;
  }

  return {mount,unmount,allowClose};
})();
