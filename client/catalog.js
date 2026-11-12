const SkazCatalog = (() => {
  const names = { mechanic: 'Механики', spell: 'Заклинания', monster: 'Бестиарий', item: 'Предметы', artifact: 'Артефакты' };
  let query = '', searchScope='name', kind = '', offset = 0, result = null, coverage = null, status = 'idle', serial = 0;
  const limit = 20;
  let ownerKey='',homeMode=false,homeGroups=[],homeDirty=false;
  const owner=()=>JSON.stringify([typeof SkazAccount==='undefined'?'local':SkazAccount.userId||'local',SkazStorage.contextKey?.()||'local']);
  const snapshot=()=>owner()+':'+(SkazStorage.snapshotKey?.()||'');
  const recentKey=()=> 'skaz-catalog-recent-v1:'+owner();
  function recentIds(){try{const ids=JSON.parse(localStorage.getItem(recentKey())||'[]');return Array.isArray(ids)?[...new Set(ids.filter(id=>typeof id==='string'&&id.length>0&&id.length<=200))].slice(0,12):[];}catch{return [];}}
  function rememberEntry(entry){if(!entry.id||referenceReturn)return;homeDirty=true;try{localStorage.setItem(recentKey(),JSON.stringify([entry.id,...recentIds().filter(id=>id!==entry.id)].slice(0,12)));}catch{}}
  const isHome=()=>!query&&!kind&&!detailFilter&&!Object.values(extraFilters).some(Boolean)&&typeof SkazStorage.spellbookData==='function';

  let detailFilter='';
  let extraFilters={}, searchDraft=null;
  const schools={abjuration:'Ограждение',conjuration:'Вызов',divination:'Прорицание',enchantment:'Очарование',evocation:'Воплощение',illusion:'Иллюзия',necromancy:'Некромантия',transmutation:'Преобразование'};
  const monsterTypes={aberration:'Аберрация',beast:'Зверь',celestial:'Небожитель',construct:'Конструкт',dragon:'Дракон',elemental:'Элементаль',fey:'Фея',fiend:'Исчадие',giant:'Великан',humanoid:'Гуманоид',monstrosity:'Монстр',ooze:'Слизь',plant:'Растение',undead:'Нежить'};
  const monsterSizes={tiny:'Крошечный',small:'Маленький',medium:'Средний',large:'Большой',huge:'Огромный',gargantuan:'Громадный'};
  const itemTypes={armor:'Доспех',potion:'Зелье',ring:'Кольцо',rod:'Жезл',scroll:'Свиток',staff:'Посох',wand:'Волшебная палочка',weapon:'Оружие',wondrous:'Чудесный предмет'};
  const mechanicCategories={condition:'Состояния',spellcasting:'Накладывание заклинаний',combat:'Бой',rest:'Отдых',equipment:'Магические предметы',exploration:'Исследование и среда'};
  const extraKeys={spell:['school','ritual','concentration'],monster:['challengeMax','monsterType','size'],item:['itemType','attunement']};
  const filterKeys={spell:'level',monster:'challengeMin',item:'rarity',mechanic:'mechanicCategory'};
  const rarityLabels={common:'Обычный',uncommon:'Необычный',rare:'Редкий','very-rare':'Очень редкий',legendary:'Легендарный',varies:'Разная редкость'};
  function filterControl(category,value='',extra={}) {
    const key=filterKeys[category];if(!key)return '';
    const label={spell:'Уровень заклинания',monster:'Опасность от',item:'Редкость предмета',mechanic:'Раздел механик'}[category];
    const options=category==='spell'?Array.from({length:10},(_,i)=>[String(i),i===0?'Заговор':i+' уровень']):category==='monster'?['0','1/8','1/4','1/2',...Array.from({length:30},(_,i)=>String(i+1))].map(v=>[v,v]):category==='mechanic'?Object.entries(mechanicCategories):Object.entries(rarityLabels);
    const select=(name,label,choices,current)=>`<label>${label}<select name="${name}"><option value="">Все</option>${choices.map(([v,text])=>`<option value="${v}" ${current===v?'selected':''}>${text}</option>`).join('')}</select></label>`;
    const spells=category==='spell'?select('school','Школа',Object.entries(schools),extra.school)+select('ritual','Ритуальное накладывание',[['true','Есть'],['false','Нет']],extra.ritual)+select('concentration','Концентрация',[['true','Нужна'],['false','Не нужна']],extra.concentration):'';
    const monsters=category==='monster'?select('challengeMax','Опасность до',options,extra.challengeMax)+select('monsterType','Тип существа',Object.entries(monsterTypes),extra.monsterType)+select('size','Размер',Object.entries(monsterSizes),extra.size):'';
    const items=category==='item'?select('itemType','Тип предмета',Object.entries(itemTypes),extra.itemType)+select('attunement','Настройка',[['true','Требуется'],['false','Не требуется']],extra.attunement):'';
    return select(key,label,options,value)+spells+monsters+items+(category==='monster'?'<p>Для точного значения выбери одинаковые границы. Пустая — без ограничения. Сложность боя не рассчитывается.</p>':'<p>При выборе характеристики записи без неё не показываются.</p>');
  }

  let detailSerial=0, currentEntry=null, trail=[], returnToInventory=false, referenceReturn=null;
  const relatedCache=new Map();
  let bundleSerial=0, installing=false;
  const usageLabel = usage => ({ 'reference-only': 'Справочная ссылка · без текста', personal: 'Личный импорт', 'cc-by-4.0': 'Открытый материал · CC BY 4.0' }[usage] || 'Неизвестные условия');
  const scopeText=()=>coverage?.scopes?.srd51Spells?` Заклинания SRD 5.1: актуальных версий установлено ${coverage.scopes.srd51Spells.installed}${coverage.scopes.srd51Spells.upgradable?`, доступны обновления для ${Number(coverage.scopes.srd51Spells.upgradable)}`:''}, подготовлено ${coverage.scopes.srd51Spells.prepared} из ${coverage.scopes.srd51Spells.expected} описаний. Это охват SRD, не всех книг D&D.`:'';
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function creatureCoverage(){
    const types=coverage?.scopes?.srd51CreatureTypes;if(kind!=='monster'||!types)return '';
    return `<details class="notice"><summary>Охват выбранных типов SRD 5.1</summary><p>Только перечисленные типы существ открытого SRD 2014. Другие типы и книги сюда не входят.</p><ul>${[['fey','Феи'],['plant','Растения'],['construct','Конструкты'],['undead','Нежить'],['celestial','Небожители'],['giant','Великаны'],['aberration','Аберрации'],['fiend','Исчадия'],['dragon','Драконы']].filter(([key])=>types[key]).map(([key,label])=>`<li>${label}: актуальных версий установлено ${Number(types[key].installed)}, подготовлено ${Number(types[key].prepared)} из ${Number(types[key].expected)}.</li>`).join('')}</ul><button id="catalog-creature-inventory">Перечень существ →</button><p>Краткие изложения; действия и эффекты разрешаются вручную. Это не полный бестиарий D&D.</p></details>`;
  }
  function view() {
    if (location.protocol === 'file:') return `<section class="panel"><h2>Каталог доступен с сервером</h2><p>Этот HTML-файл — автономная демонстрация. Открой локальное приложение, чтобы искать импортированные материалы.</p><button data-page="spells">8 демо-заклинаний →</button></section>`;
    if(homeDirty&&isHome()){homeDirty=false;status='idle';}
    const nextOwner=snapshot();if(ownerKey!==nextOwner){ownerKey=nextOwner;result=null;homeGroups=[];status='idle';++serial;++detailSerial;relatedCache.clear();}
    if (status === 'idle'){status='loading';const scheduled=serial;queueMicrotask(() => {if(serial===scheduled)load();});}
    const draft=searchDraft||{q:query,scope:searchScope,kind,[filterKeys[kind]]:detailFilter,...extraFilters};
    return `<section class="catalog" aria-label="Каталог D&D 2014">
      <div id="catalog-creature-coverage">${creatureCoverage()}</div>
      <form id="catalog-search" class="catalog-search"><h1>Справочник</h1><label>Название или ключевые слова<input name="q" type="search" maxlength="200" placeholder="Например, Spellcasting" value="${escape(draft.q)}"></label><input type="hidden" name="kind" value="${escape(draft.kind)}"><details class="catalog-about"><summary>О каталоге 2014</summary><div class="notice"><b>Каталог пополняется</b><p>${coverage ? `В базе: ${coverage.total}. Справочных ссылок: ${coverage.referenceOnly}, личных записей: ${coverage.personal}, CC BY 4.0: ${coverage.openlyLicensed || 0}.` : 'Полнота базы пока не подтверждена.'} Предметы и артефакты можно добавить в инвентарь из карточки.${scopeText()}</p></div>
      <div class="catalog-tools" aria-label="Наполнение каталога"><button type="button" id="catalog-bundled">Проверенная подборка 2014</button><button type="button" id="catalog-help">Личный импорт</button><button type="button" id="catalog-inventory">Охват заклинаний SRD</button></div>
      </details><details class="catalog-filters"><summary>Фильтры</summary><label class="catalog-text-toggle"><input type="checkbox" name="scope" value="text" ${draft.scope==='text'?'checked':''}>И в описаниях</label><div id="catalog-specific" class="catalog-specific">${filterControl(draft.kind,draft[filterKeys[draft.kind]]||'',draft)}</div></details><div class="catalog-search-actions"><button type="submit" class="primary">Найти</button><button type="button" id="catalog-reset">Сбросить фильтры</button></div></form><div class="catalog-kinds" aria-label="Категория">${[['','Все'],...Object.entries(names)].map(([key,label])=>`<button data-catalog-kind="${key}" aria-pressed="${draft.kind===key}">${label}</button>`).join('')}</div>
      <div id="catalog-results" aria-live="polite" aria-busy="${status === 'loading'}">${results()}</div>
      <div class="catalog-footer"><p>В разделе магии доступны личный список из каталога и отдельные демонстрационные заклинания.</p><button data-page="spells">К моей магии →</button></div>
    </section>`;
  }

  const setupHint=()=> '<div class="empty"><h2>Справочник ещё не установлен</h2><p>Установи проверенную подборку D&amp;D 2014: заклинания, существа и предметы SRD 5.1 (CC BY 4.0). Точный состав и количество записей — в предпросмотре.</p><button id="catalog-install-empty" class="primary">Установить подборку</button></div>';
  async function offerSetup(id){
    if(location.protocol==='file:')return;
    const host=document.getElementById(id),key=snapshot();if(!host)return;
    try{
      const response=await fetch('/api/catalog/coverage',{cache:'no-store',signal:AbortSignal.timeout(10000)});
      if(!response.ok)return;const value=await response.json();
      if(document.getElementById(id)!==host||key!==snapshot())return;
      host.innerHTML=value.total===0?setupHint():'';
    }catch{/* A missing response must not be presented as an empty catalog. */}
  }
  function results() {
    if (status === 'loading' || status === 'idle') return '<p class="empty">Загружаем каталог…</p>';
    if (status === 'error') return '<div class="empty"><h2>Каталог недоступен</h2><p>Проверь, что локальный сервер запущен. Поиск сохранён — можно повторить запрос.</p><button id="catalog-retry">Повторить</button></div>';
    if(coverage?.total===0)return setupHint();
    if(homeMode)return homeResults();
    if (!result?.entries.length) return `<div class="empty"><h2>${query || kind ? 'Ничего не найдено' : 'Каталог пока пуст'}</h2><p>${query || kind ? 'Попробуй другие слова, поиск по описаниям или все категории.' : 'Добавь справочные ссылки или личные материалы. Демо-заклинания доступны отдельно.'}</p></div>`;
    const pages=bottom=>`<nav class="catalog-pages" aria-label="${bottom?'Страницы каталога внизу':'Страницы каталога'}"><button id="catalog-prev${bottom?'-bottom':''}" ${offset === 0 ? 'disabled' : ''}>← Назад</button><span>${Math.floor(offset/limit)+1} / ${Math.ceil(result.total/limit)}</span><button id="catalog-next${bottom?'-bottom':''}" ${offset + limit >= result.total ? 'disabled' : ''}>Далее →</button></nav>`;
    return `<p class="catalog-count" id="catalog-result-heading" tabindex="-1">Найдено: ${result.total} · ${offset + 1}–${offset + result.entries.length}</p><div class="catalog-grid">${result.entries.map((entry,index)=>row(entry,index)).join('')}</div>${result.total>limit?pages(true):''}`;
  }
  function row(entry,index){return SkazUI.entryRow({entry,name:entry.name,metadata:cardSummary(entry),description:entry.text,extra:searchExcerpt(entry),className:"catalog-card catalog-row",primary:{attribute:"data-catalog-entry",value:index},actions:`<button data-catalog-entry="${index}" aria-label="Открыть: ${escape(entry.name.ru)}">Читать</button>`});}
  function homeResults(){let index=0;return '<p class="catalog-count">Мои материалы и последние открытия этого персонажа. Для полного списка выбери категорию.</p>'+homeGroups.map(group=>'<section class="catalog-home-group"><h2>'+group.title+'</h2><div class="catalog-grid">'+(group.entries.length?group.entries.map(entry=>row(entry,index++)).join(''):'<p class="small">'+group.empty+'</p>')+'</div></section>').join('');}
  function searchExcerpt(entry) {
    if(searchScope!=='text'||!query||!entry.text)return '';
    const body=entry.text,match=body.toLocaleLowerCase('ru').indexOf(query.toLocaleLowerCase('ru'));
    if(match<0)return '';
    const start=Math.max(0,match-60),end=Math.min(body.length,match+query.length+100);
    return `<p class="catalog-excerpt">${start?'…':''}${escape(body.slice(start,match))}<mark>${escape(body.slice(match,match+query.length))}</mark>${escape(body.slice(match+query.length,end))}${end<body.length?'…':''}</p>`;
  }
  function cardSummary(entry) {
    const parts=[];
    if(entry.spell){const s=entry.spell;parts.push(s.level===0?'Заговор':`${s.level} ур`,String(s.castingTime||'').split(',')[0],s.range?.type==='feet'?s.range.feet+' фт':({self:'На себя',touch:'Касание',sight:'Видимость',unlimited:'Не ограничена',special:'Особая'}[s.range?.type]||''));if(s.ritual)parts.push('Ритуал');if(s.concentration)parts.push('Концентрация');}
    if(entry.monster){const m=entry.monster;parts.push(monsterTypes[m.type]||m.type,`Опасность ${m.challenge}`,`КД ${m.armorClass}`,`Хиты ${m.hitPoints}`);}
    const item=entry.item||entry.artifact;
    if(item){parts.push(itemTypes[item.type]||item.type);if(item.rarity)parts.push(rarityLabels[item.rarity]||item.rarity);parts.push(item.attunement?'Требует настройки':'Без настройки');}
    if(entry.mechanic)parts.push(mechanicCategories[entry.mechanic.category]||entry.mechanic.category);
    return parts.length?`<ul class="catalog-card-summary" aria-label="Краткие характеристики">${parts.filter(Boolean).map(value=>`<li>${escape(value)}</li>`).join('')}</ul>`:'';
  }
  async function load({focusResults=false}={}) {
    const requestId = ++serial, requestedOwner=snapshot();ownerKey=requestedOwner;homeMode=isHome();homeDirty=false;
    status = 'loading'; refresh();
    const params = new URLSearchParams({ q: query, limit: String(limit), offset: String(offset) });
    if (kind) params.set('kind', kind);
    if(searchScope==='text')params.set('scope','text');
    if(detailFilter && filterKeys[kind])params.set(filterKeys[kind],detailFilter);
    for(const key of extraKeys[kind]||[])if(extraFilters[key])params.set(key,extraFilters[key]);
    try {
      if(homeMode){
        const [book,covered,recent]=await Promise.all([SkazStorage.spellbookData(),fetch('/api/catalog/coverage',{cache:'no-store',signal:AbortSignal.timeout(10000)}).then(r=>{if(!r.ok)throw new Error('Coverage unavailable');return r.json();}),Promise.all(recentIds().map(async id=>{const r=await fetch('/api/catalog/entry?'+new URLSearchParams({id}),{cache:'no-store',signal:AbortSignal.timeout(10000)});if(r.status===404)return null;if(!r.ok)throw new Error('Recent unavailable');const value=await r.json();return value.entry;}))]);
        if(requestId!==serial||requestedOwner!==snapshot())return;
        homeGroups=[{title:'Недавно открытые',entries:recent.filter(Boolean),empty:'Здесь появятся открытые карточки.'},{title:book.entries.length>20?'Мои заклинания · первые 20':'Мои заклинания',entries:book.entries.map(item=>item.entry).sort((a,b)=>(a.spell?.level??99)-(b.spell?.level??99)||a.name.ru.localeCompare(b.name.ru,'ru')).slice(0,20),empty:'Книга пока пуста. Найди заклинание и добавь его из карточки.'}];
        result={entries:homeGroups.flatMap(group=>group.entries),total:homeGroups.reduce((sum,group)=>sum+group.entries.length,0)};coverage=covered;status='ready';refresh();return;
      }
      const values = await Promise.all(['/api/catalog?' + params, '/api/catalog/coverage'].map(async url => {
        const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw new Error('Catalog unavailable');
        return response.json();
      }));
      if (requestId !== serial||requestedOwner!==snapshot()) return;
      [result, coverage] = values;
      status = 'ready';
    } catch { if (requestId !== serial||requestedOwner!==snapshot()) return; status = 'error'; }
    refresh();
    if(focusResults && typeof page!=='undefined' && page==='library' && !document.getElementById('dialog')?.open){
      const heading=document.getElementById('catalog-result-heading');
      if(heading){heading.focus({preventScroll:true});heading.scrollIntoView({block:'start',behavior:'auto'});}
    }
  }
  function refresh() {
    if (typeof page !== 'undefined' && page === 'library') {
      const region = document.getElementById('catalog-results');
      if (region) { region.innerHTML = results(); region.setAttribute('aria-busy', String(status === 'loading')); }
      const notice = document.querySelector('.catalog .notice p');
      if (notice && coverage) notice.textContent = `В базе: ${coverage.total}. Справочных ссылок: ${coverage.referenceOnly}, личных записей: ${coverage.personal}, CC BY 4.0: ${coverage.openlyLicensed || 0}. Предметы и артефакты можно добавить в инвентарь из карточки.${scopeText()}`;
      const typeRegion=document.getElementById('catalog-creature-coverage');
      if(typeRegion){const open=typeRegion.querySelector?.('details')?.open;typeRegion.innerHTML=creatureCoverage();if(open&&typeRegion.querySelector?.('details'))typeRegion.querySelector('details').open=true;}
    }
  }
  function facts(entry) {
    const rows=[];
    const add=(label,value)=>rows.push(`<div><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>`);
    const school=schools;
    if(entry.mechanic)add('Раздел',mechanicCategories[entry.mechanic.category]||entry.mechanic.category);
    if(entry.spell){const x=entry.spell;add('Уровень',x.level===0?'Заговор':x.level);add('Школа',school[x.school]||x.school);add('Накладывание',x.castingTime);add('Дистанция',x.range.type==='feet'?x.range.feet+' футов':({self:'На себя',touch:'Касание',sight:'В пределах видимости',unlimited:'Не ограничена',special:'Особая'}[x.range.type]||x.range.type));add('Компоненты',x.components.join(', '));add('Длительность',x.duration);add('Концентрация',x.concentration?'Нужна':'Не нужна');add('Ритуал',x.ritual?'Да':'Нет');}
    if(entry.monster){const x=entry.monster;add('Размер',monsterSizes[x.size]||x.size);add('Тип',monsterTypes[x.type]||x.type);add('Класс доспеха',x.armorClass);add('Хиты (базовые)',x.hitPoints);add('Опасность',x.challenge);add('Опыт',x.xp);for(const [key,n] of Object.entries(x.speed))add({walk:'Скорость',climb:'Лазание',swim:'Плавание',fly:'Полёт',burrow:'Копание'}[key]||key,n+' футов');for(const [key,n] of Object.entries(x.abilities)){const mod=Math.floor((n-10)/2);add({str:'СИЛ',dex:'ЛОВ',con:'ТЕЛ',int:'ИНТ',wis:'МДР',cha:'ХАР'}[key]||key,`${n} (${mod>=0?'+':''}${mod})`);}}
    const x=entry.item||entry.artifact;
    if(x){add('Тип предмета',({...itemTypes,other:'Другой'})[x.type]||x.type);if(x.rarity)add('Редкость',rarityLabels[x.rarity]||x.rarity);add('Настройка',x.attunement?(x.attunementRequirement||'Требуется'):'Не требуется');if(x.healing)add('Лечение',`${x.healing.diceCount}d${x.healing.diceSides}${x.healing.bonus?' + '+x.healing.bonus:''}`);if(x.charges){add('Максимум зарядов',x.charges.max);add('Восстановление',x.charges.recharge);}}
    return rows.length?`<section class="catalog-facts"><h3>Характеристики</h3><dl>${rows.join('')}</dl><p>Справочные данные. Эффекты автоматически не применяются.</p></section>`:'';
  }
  function details(index) {
    if(ownerKey!==snapshot())return;
    const entry = result?.entries[index];
    if (!entry) return;
    trail=[]; returnToInventory=false; referenceReturn=null; showDetails(entry);
  }
  function showDetails(entry, related) {
    if(referenceReturn&&!referenceReturn.valid())return;
    const token=++detailSerial; currentEntry=entry;rememberEntry(entry);
    if(related)relatedCache.set(entry.id,related);
    // Restrict links again at the rendering boundary, even for previously imported data.
    let source = '';
    try { const url = new URL(entry.source.url); if (['http:', 'https:'].includes(url.protocol)) source = `<a href="${escape(url.href)}" target="_blank" rel="noopener noreferrer">Открыть источник ↗</a>`; } catch {}
    const readerNav=`<nav class="catalog-reader-nav" aria-label="Разделы карточки"><strong class="catalog-reader-name" title="${escape(entry.name.ru)}">${escape(entry.name.ru)}</strong><button data-catalog-section="catalog-detail-title">В начало</button><button data-catalog-section="catalog-body-title">Описание</button>${entry.links?.length?'<button data-catalog-section="catalog-links-title">Связи</button>':''}<button data-catalog-section="catalog-source-title">Источник</button></nav>`;
    modal(`${readerNav}${referenceReturn?`<button id="catalog-reference-back">← ${escape(referenceReturn.label||'К сохранённому предмету')}</button><p>${referenceReturn.label?'Просмотр материала не меняет лист и имущество.':'Актуальная справка из каталога. Сохранённая карточка и имущество не меняются.'}</p>`:''}${returnToInventory?`<button id="inventory-return">← К ${inventoryMode==='creature'?'перечню существ':'охвату заклинаний'}</button>`:''}${trail.length?'<button id="catalog-detail-back">← К предыдущему материалу</button>':''}<div class="overline">${names[entry.kind]} · D&D 2014</div><h2 id="catalog-detail-title" tabindex="-1" autofocus>${escape(entry.name.ru)}</h2>${typeof SkazArt!=='undefined'?SkazArt.markup(entry,'card'):''}<p>${escape(entry.name.en)}</p>${!referenceReturn&&["item", "artifact"].includes(entry.kind) ? '<button id="catalog-add-inventory" class="primary">В инвентарь →</button>' : ''}${!referenceReturn&&entry.kind === "spell" ? '<div class="catalog-spell-actions"><button id="catalog-known" disabled>Изучить</button><button id="catalog-prepared" class="primary" disabled>Подготовить</button><button id="catalog-add-spell">Изменить отметку…</button><p id="catalog-book-status" role="status">Проверяем книгу…</p></div>' : ''}${facts(entry)}<h3 id="catalog-body-title" tabindex="-1">Описание</h3>${entry.text ? `<div class="catalog-text">${escape(entry.text)}</div>` : '<p>Здесь сохранена справочная ссылка. Текст материала не импортирован.</p>'}${entry.links?.length?'<section class="catalog-related"><h3 id="catalog-links-title" tabindex="-1">Связанные материалы</h3><div id="catalog-related" aria-live="polite">Загружаем связи…</div></section>':''}<details class="catalog-source-details"><summary id="catalog-source-title" tabindex="-1">Источник и версия</summary><dl class="catalog-meta"><dt>Источник</dt><dd>${escape(entry.source.title)}</dd><dt>Версия</dt><dd>${escape(entry.source.version)}</dd><dt>Использование</dt><dd>${usageLabel(entry.source.usage)}</dd><dt>Условия, указанные при импорте</dt><dd>${escape(entry.source.terms)}</dd>${entry.source.attribution ? `<dt>Атрибуция</dt><dd>${escape(entry.source.attribution)}</dd><dt>Изменения</dt><dd>${escape(entry.source.changes)}</dd>` : ''}</dl>${source}</details>`);
    if(typeof SkazPersonalArtCards!=='undefined')SkazPersonalArtCards.mount(document.getElementById('dialog-content'),entry);
    if(entry.links?.length)loadRelated(entry,token);
    if(!referenceReturn&&entry.kind==='spell'&&SkazStorage.spellbookData){
      const key=SkazStorage.snapshotKey();
      SkazStorage.spellbookData().then(book=>{
        if(!detailVisible(token)||key!==SkazStorage.snapshotKey())return;
        const existing=book.entries.find(item=>item.catalogId===entry.id)?.status;
        document.getElementById('catalog-book-status').textContent=existing==='prepared'?'В книге · Подготовлено':existing==='known'?'В книге · Изучено':'Ещё не в книге';
        for(const [id,mark] of [['catalog-known','known'],['catalog-prepared','prepared']]){
          const button=document.getElementById(id);button.disabled=existing===mark||!SkazStorage.can('character');
          button.onclick=async()=>{button.disabled=true;try{await SkazStorage.setSpell(entry,mark,key);}catch(error){if(detailVisible(token)){document.getElementById('catalog-book-status').textContent=error.message;button.disabled=false;}}};
        }
      }).catch(()=>{if(detailVisible(token))document.getElementById('catalog-book-status').textContent='Книга недоступна. Повторно открой карточку после подключения.';});
    }
    if (!referenceReturn && entry.kind === 'spell') document.getElementById('catalog-add-spell').onclick = () => SkazStorage.editSpell(entry);
    if (!referenceReturn && ['item', 'artifact'].includes(entry.kind)) document.getElementById('catalog-add-inventory').onclick = () => SkazStorage.addInventory(entry);
  }
  const detailVisible = token => (!referenceReturn||referenceReturn.valid()) && token===detailSerial && document.getElementById('dialog')?.open && document.getElementById('catalog-detail-title');
  async function getEntry(id) {
    const response=await fetch('/api/catalog/entry?'+new URLSearchParams({id}),{cache:'no-store',signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw new Error('Материал недоступен');
    return response.json();
  }
  async function loadRelated(entry,token) {
    try {
      let related=relatedCache.get(entry.id);
      if(!related){const value=await getEntry(entry.id);related=value.related;relatedCache.set(entry.id,related);}
      if(!detailVisible(token))return;
      const region=document.getElementById('catalog-related');
      if(region)region.innerHTML=related.map(item=>`<button data-catalog-related="${escape(item.id)}">${escape(item.name.ru)} · ${escape(item.name.en)} →</button>`).join('');
    }catch{
      if(detailVisible(token)){const region=document.getElementById('catalog-related');if(region)region.innerHTML='<p>Не удалось открыть связи.</p><button id="catalog-related-retry">Повторить</button>';}
    }
  }
  async function openRelated(id) {
    if(!detailVisible(detailSerial)||!currentEntry?.links?.includes(id))return;
    const previous=currentEntry,token=++detailSerial;
    const region=document.getElementById('catalog-related');if(region)region.innerHTML='<p>Открываем материал…</p>';
    try{
      const value=await getEntry(id);if(!detailVisible(token))return;
      trail.push(previous);if(trail.length>20)trail.shift();showDetails(value.entry,value.related);
    }catch{if(detailVisible(token)&&region)region.innerHTML='<p>Материал недоступен. Проверь соединение.</p><button id="catalog-related-retry">Повторить</button>';}
  }
  async function openReference(id,onBack,valid) {
    if(typeof onBack!=='function'||typeof valid!=='function'||!valid())return;
    const token=++detailSerial;trail=[];returnToInventory=false;referenceReturn={onBack,valid};
    const visible=()=>token===detailSerial&&valid()&&document.getElementById('dialog')?.open&&document.getElementById('catalog-reference-loading');
    modal('<div id="catalog-reference-loading"><h2>Справка о предмете</h2><p>Открываем актуальный материал…</p><button id="catalog-reference-back">← К сохранённому предмету</button></div>');
    try{const value=await getEntry(id);if(visible())showDetails(value.entry,value.related);}
    catch{if(visible())modal('<div id="catalog-reference-loading"><h2>Материал недоступен</h2><p>Сохранённая карточка остаётся в инвентаре. Вернись к ней и попробуй открыть справку позже.</p><button id="catalog-reference-back">← К сохранённому предмету</button></div>');}
  }
  const bundleVisible = token => token===bundleSerial && document.getElementById('dialog')?.open && document.getElementById('bundled-catalog');
  async function previewBundled() {
    if(installing)return;
    if(SkazStorage.can && !SkazStorage.can('catalog'))return modal('<h2>Подборкой управляет администратор</h2><p>Материалы доступны для чтения и добавления в личный лист. Установка общей базы выполняется владельцем сервера.</p>');
    const token=++bundleSerial;
    modal('<div id="bundled-catalog"><h2>Проверенная подборка</h2><p role="status">Сверяем состав с твоим справочником…</p></div>');
    try{
      const response=await fetch('/api/catalog/bundled',{cache:'no-store',signal:AbortSignal.timeout(10000)}),value=await response.json();
      if(!response.ok)throw new Error(value.error||'Не удалось проверить подборку');
      if(!bundleVisible(token))return;
      modal(`<div id="bundled-catalog" class="catalog-review"><div class="catalog-review-body"><div class="overline">ПРОВЕРЕННЫЕ ИСТОЧНИКИ · D&D 2014</div><h2>Добавить в справочник</h2><p>Это ограниченная подборка, а не полная база D&D. Русские краткие изложения SRD 5.1 с атрибуцией CC BY 4.0 и справочные ссылки без копирования текста.</p><ul class="catalog-review-counts">${Object.entries(value.categories).map(([kind,count])=>`<li>${names[kind]||escape(kind)}: ${Number(count)}</li>`).join('')}</ul><p>Всего в подборке: ${Number(value.total)}. Добавится: ${Number(value.added)}. Обновится: ${Number(value.updated||0)}. Уже совпадает: ${Number(value.unchanged)}.</p>${value.updates?.length?`<section class="catalog-updates"><h3>Будут обновлены</h3><ul>${value.updates.map(item=>`<li><strong>${escape(item.name.ru)}</strong><p>${escape(item.reason)}</p><details><summary>Версии источника</summary><small>${escape(item.fromVersion)} → ${escape(item.toVersion)}</small></details></li>`).join('')}</ul></section>`:''}<p>Игра и ресурсы персонажей не меняются. Обновляются только известные прежние версии подборки. Личные правки защищены: конфликт остановит всю установку. Сохранённые карточки в личной книге и инвентаре остаются прежними.</p></div><div class="catalog-review-actions"><p>${Number(value.added)} новых · ${Number(value.updated||0)} обновления</p><button id="install-bundled" class="primary" ${value.added===0&&!value.updated?'disabled':''}>${value.added===0&&!value.updated?'Подборка уже установлена':value.updated?'Применить изменения':'Добавить подборку'}</button><p id="bundled-message" role="status"></p></div></div>`);
      document.getElementById('install-bundled').onclick=()=>installBundled(value.version,token);
    }catch(error){if(bundleVisible(token))modal(`<div id="bundled-catalog"><h2>Подборка недоступна</h2><p>${escape(error.message)}</p><button id="catalog-bundled">Проверить снова</button></div>`);}
  }
  async function installBundled(version,token) {
    if(installing||!bundleVisible(token))return;
    installing=true;const button=document.getElementById('install-bundled');button.disabled=true;
    document.getElementById('bundled-message').textContent='Добавляем материалы…';
    try{
      const response=await fetch('/api/catalog/bundled',{method:'POST',headers:{'Content-Type':'application/json','X-Skaz-Client':'local-v1'},body:JSON.stringify({version}),signal:AbortSignal.timeout(10000)}),value=await response.json();
      if(!response.ok)throw new Error(value.error||'Не удалось установить подборку');
      relatedCache.clear();
      for(const id of ['spell-catalog-setup','inventory-catalog-setup']){const host=document.getElementById(id);if(host)host.innerHTML='';}
      if(bundleVisible(token))modal(`<div id="bundled-catalog"><h2>Подборка установлена</h2><p>Добавлено: ${Number(value.added)}. Обновлено: ${Number(value.updated||0)}. Уже совпадало: ${Number(value.unchanged)}. Прогресс игры не изменён.</p><button id="bundled-done" class="primary">Готово</button></div>`);
      await load();
    }catch(error){if(bundleVisible(token)){button.disabled=false;document.getElementById('bundled-message').textContent=error.message+'. Повтор безопасен: совпавшие записи не дублируются.';}}
    finally{installing=false;}
  }
  let inventoryMode='spell',inventorySerial=0,inventoryData=null,inventoryQuery='',inventoryStatus='all',inventoryLevel='',inventoryOffset=0;
  const inventoryLabels={missing:'Не подготовлено',prepared:'Готово к установке',installed:'Установлено','update-available':'Доступно обновление',conflict:'ID занят личной версией'};
  const inventoryVisible=token=>token===inventorySerial && document.getElementById('dialog')?.open && document.getElementById('spell-inventory');
  async function openInventory(mode='spell'){
    const token=++inventorySerial;inventoryMode=mode;returnToInventory=false;referenceReturn=null;inventoryData=null;inventoryQuery='';inventoryStatus='all';inventoryLevel='';inventoryOffset=0;
    modal(`<div id="spell-inventory"><h2>${mode==='creature'?'Перечень существ SRD':'Охват заклинаний SRD 5.1'}</h2><p>Загружаем перечень…</p></div>`);
    try{const response=await fetch(mode==='creature'?'/api/catalog/creature-inventory':'/api/catalog/spell-inventory',{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error();const value=await response.json();if(!inventoryVisible(token))return;inventoryData=value;paintInventory();}
    catch{if(inventoryVisible(token))modal(`<div id="spell-inventory"><h2>Перечень недоступен</h2><button id="${mode==='creature'?'catalog-creature-inventory':'catalog-inventory'}">Повторить</button></div>`);}
  }
  function paintInventory(focusResults=false){
    const creature=inventoryMode==='creature',expected=creature?inventoryData.entries.length:319;
    const levelEntries=inventoryData.entries.filter(e=>inventoryLevel===''||(creature?e.monsterType===inventoryLevel:e.level===Number(inventoryLevel)));
    const ready=levelEntries.filter(e=>e.status!=='missing').length,installed=levelEntries.filter(e=>e.status==='installed').length;
    const matches=levelEntries.filter(e=>(inventoryStatus==='all'||e.status===inventoryStatus)&&`${e.nameEn} ${e.nameRu||''}`.toLocaleLowerCase('ru').includes(inventoryQuery.toLocaleLowerCase('ru')));
    inventoryOffset=Math.min(inventoryOffset,Math.floor(Math.max(0,matches.length-1)/20)*20);
    modal(`<div id="spell-inventory"><h2>${creature?'Перечень существ SRD':'Охват заклинаний SRD 5.1'}</h2><p>${creature?`Выбранные типы существ SRD 2014 — это не весь бестиарий. Подготовлено ${inventoryData.entries.filter(e=>e.status!=='missing').length} из ${expected}. Установленные версии учитываются отдельно.`:`319 названий из открытого SRD 2014. Подготовлено кратких изложений: ${inventoryData.entries.filter(e=>e.status!=='missing').length} из 319. Это охват открытого SRD, не всех книг D&D. Установка в твою базу учитывается отдельно.`}</p><form id="spell-inventory-search" class="personal-spell-search"><label>Название RU / EN<input name="q" type="search" maxlength="200" value="${escape(inventoryQuery)}"></label><label>${creature?'Тип существа':'Уровень'}<select name="level"><option value="">${creature?'Все выбранные типы':'Все уровни'}</option>${creature?['fey','plant','construct','undead','celestial','giant','aberration','fiend','dragon'].map(key=>`<option value="${key}" ${inventoryLevel===key?'selected':''}>${monsterTypes[key]}</option>`).join(''):Array.from({length:10},(_,n)=>`<option value="${n}" ${inventoryLevel===String(n)?'selected':''}>${n===0?'Заговор':n+' уровень'}</option>`).join('')}</select></label><label>Готовность<select name="status"><option value="all">Все</option>${Object.entries(inventoryLabels).map(([k,v])=>`<option value="${k}" ${inventoryStatus===k?'selected':''}>${v}</option>`).join('')}</select></label><button type="submit">Показать</button></form><p>${creature?'В выбранных типах':'В выбранном уровне'}: подготовлено ${ready} из ${levelEntries.length}, актуальных версий установлено ${installed}.</p><p id="inventory-result-count" tabindex="-1">Найдено: ${matches.length}</p><div class="map-pagination"><button id="inventory-prev" ${inventoryOffset===0?'disabled':''}>Назад</button><span>${matches.length?inventoryOffset+1:0}–${Math.min(inventoryOffset+20,matches.length)} из ${matches.length}</span><button id="inventory-next" ${inventoryOffset+20>=matches.length?'disabled':''}>Дальше</button></div><p id="inventory-open-message" role="status"></p><div class="inventory-index">${matches.slice(inventoryOffset,inventoryOffset+20).map(e=>`<article><h3>${escape(e.nameRu||e.nameEn)}</h3>${e.nameRu?`<p>${escape(e.nameEn)}</p>`:''}<p>${creature?escape(monsterTypes[e.monsterType]||e.monsterType):e.level===0?'Заговор':Number(e.level)+' уровень'} · ${inventoryLabels[e.status]}</p><a href="https://media.wizards.com/2023/downloads/dnd/SRD_CC_v5.1.pdf#page=${Number(e.page)}" target="_blank" rel="noopener noreferrer">Источник · стр. ${Number(e.page)}</a>${['installed','update-available'].includes(e.status)?`<button data-inventory-read="${escape(e.id)}">Открыть карточку →</button>`:''}</article>`).join('')||'<p>Совпадений нет.</p>'}</div></div>`);
    if(focusResults){const result=document.getElementById('inventory-result-count');result?.focus({preventScroll:true});result?.scrollIntoView({block:'start',behavior:'instant'});}
  }
  async function readInventoryEntry(id){
    if(!inventoryVisible(inventorySerial)||!inventoryData.entries.some(e=>e.id===id&&['installed','update-available'].includes(e.status)))return;
    const token=++inventorySerial,region=document.getElementById('inventory-open-message');if(region)region.textContent='Открываем карточку…';
    try{const value=await getEntry(id);if(!inventoryVisible(token))return;trail=[];returnToInventory=true;showDetails(value.entry,value.related);}
    catch{if(inventoryVisible(token)&&region)region.textContent='Не удалось открыть карточку. Нажми её кнопку, чтобы повторить.';}
  }
  document.addEventListener('submit', event => {
    if(event.target.id==='spell-inventory-search'){event.preventDefault();const fields=new FormData(event.target);inventoryQuery=String(fields.get('q')).trim();inventoryStatus=String(fields.get('status'));inventoryLevel=String(fields.get('level')||'');inventoryOffset=0;if(inventoryData)paintInventory(true);return;}
    if (event.target.id !== 'catalog-search') return;
    event.preventDefault();
    clearTimeout(searchTimer);
    const data = new FormData(event.target);
    const rank=value=>{const [n,d=1]=String(value).split('/').map(Number);return n/d;};
    if(data.get('kind')==='monster'&&data.get('challengeMin')&&data.get('challengeMax')&&rank(data.get('challengeMin'))>rank(data.get('challengeMax')))return toast('Опасность «от» должна быть не больше «до». Исправь границы.');
    searchDraft=null; query = String(data.get('q')).trim(); searchScope=data.get('scope')==='text'?'text':'name'; kind = String(data.get('kind')); detailFilter=filterKeys[kind]?String(data.get(filterKeys[kind])||''):''; extraFilters=Object.fromEntries((extraKeys[kind]||[]).map(key=>[key,String(data.get(key)||'')])); offset = 0; load();
  });
  let searchTimer;
  function rememberSearch(event){
    const field=event.target;
    if(field.form?.id!=='catalog-search'||!['q','scope','kind','level','school','ritual','concentration','challengeMin','challengeMax','monsterType','size','rarity','itemType','attunement','mechanicCategory'].includes(field.name))return;
    searchDraft={...(searchDraft||{q:query,scope:searchScope,kind,[filterKeys[kind]]:detailFilter,...extraFilters}),[field.name]:field.name==='scope'?(field.checked?'text':'name'):field.value};
    clearTimeout(searchTimer);
    if(field.name==='q')searchTimer=setTimeout(()=>{if(document.getElementById('catalog-search')!==field.form)return;field.form.requestSubmit();},200);
    if(field.name==='scope'&&event.type==='change')field.form.requestSubmit?.();
    if(field.name==='kind'){
      for(const key of ['level','school','ritual','concentration','challengeMin','challengeMax','monsterType','size','rarity','itemType','attunement','mechanicCategory'])delete searchDraft[key];
      const region=document.getElementById('catalog-specific');if(region)region.innerHTML=filterControl(field.value);
    }
  }
  document.addEventListener('input',rememberSearch);
  document.addEventListener('change',rememberSearch);
  document.addEventListener('click', event => {
    const button = event.target.closest('button'); if (!button) return;
    if(Object.hasOwn(button.dataset,'catalogKind')){clearTimeout(searchTimer);const next=button.dataset.catalogKind;if(next&&!Object.hasOwn(names,next))return;kind=next;query=(searchDraft?.q??query).trim();searchScope=searchDraft?.scope??searchScope;detailFilter='';extraFilters={};searchDraft=null;offset=0;render();load();return;}
    if (button.hasAttribute('data-catalog-entry')) details(Number(button.dataset.catalogEntry));
    if(button.dataset.catalogRelated)openRelated(button.dataset.catalogRelated);
    if(button.dataset.catalogSection && detailVisible(detailSerial)){
      const id=button.dataset.catalogSection;
      if(['catalog-detail-title','catalog-body-title','catalog-links-title','catalog-source-title'].includes(id)){
        const target=document.getElementById(id);
        if(target){if(id==='catalog-source-title')target.parentElement.open=true;target.focus({preventScroll:true});target.scrollIntoView({block:'start',behavior:'instant'});}
      }
    }
    if(button.id==='catalog-related-retry'&&currentEntry)loadRelated(currentEntry,detailSerial);
    if(button.id==='catalog-detail-back'&&trail.length&&detailVisible(detailSerial))showDetails(trail.pop());
    if(button.id==='catalog-reference-back'&&referenceReturn){const previous=referenceReturn;if(!previous.valid())return;++detailSerial;referenceReturn=null;trail=[];previous.onBack();}
    if (button.id === 'catalog-retry') load();
    if (['catalog-prev','catalog-next','catalog-prev-bottom','catalog-next-bottom'].includes(button.id)) {
      if(status!=='ready'||!result)return;
      const next=button.id.startsWith('catalog-next');
      if((next&&offset+limit>=result.total)||(!next&&offset===0))return;
      offset=Math.max(0,offset+(next?limit:-limit));load({focusResults:true});
    }
    if (button.id === 'catalog-reset') { clearTimeout(searchTimer); query = ''; searchScope='name'; kind = ''; detailFilter=''; extraFilters={}; searchDraft=null; offset = 0; render(); load(); }
    if(button.id==='catalog-inventory')openInventory();
    if(button.id==='catalog-creature-inventory')openInventory('creature');
    if(button.dataset.inventoryRead)readInventoryEntry(button.dataset.inventoryRead);
    if(button.id==='inventory-return'&&returnToInventory&&inventoryData){++detailSerial;returnToInventory=false;paintInventory();}
    if(inventoryData && inventoryVisible(inventorySerial) && ['inventory-prev','inventory-next'].includes(button.id)){inventoryOffset=Math.max(0,inventoryOffset+(button.id==='inventory-next'?20:-20));paintInventory(true);}
    if(button.id==='catalog-bundled'||button.id==='catalog-install-empty')previewBundled();
    if(button.id==='bundled-done')closeModal();
    if (button.id === 'catalog-help') SkazCatalogImport.open();
  });
  function readSnapshot(entry,onBack,valid,label){if(!entry||typeof onBack!=='function'||typeof valid!=='function'||!valid())return;trail=[];returnToInventory=false;referenceReturn={onBack,valid,label};showDetails(entry);}
  return { view, reload: load, openReference,readSnapshot,offerSetup };
})();
