const SkazCatalog = (() => {
  const names = { mechanic: 'Механики', spell: 'Заклинания', monster: 'Бестиарий', item: 'Предметы', artifact: 'Артефакты' };
  let query = '', searchScope='name', kind = '', offset = 0, result = null, coverage = null, status = 'idle', serial = 0;
  const limit = 20;
  // References belong to the exact response object, never to a reusable catalog ID.
  const materialReferences=new WeakMap();
  const whelmSources=new WeakMap();
  const resultMarkup=new WeakMap();
  let holdingResults=false;
  function acceptCatalogReferences(value){
    for(const entry of value.entries||[value.entry].filter(Boolean)){
      const reference=value.materialReferences?.find(row=>row.catalogId===entry.id);
      materialReferences.set(entry,reference||null);
      if(value.whelmClarification?.catalogId===entry.id)whelmSources.set(entry,value.whelmClarification.url);
    }
    return value;
  }
  function whelmClarificationLink(entry){
    const url=whelmSources.get(entry);
    if(typeof url!=='string')return '';
    try{
      const source=new URL(url);
      if(source.protocol==='https:'&&!source.username&&!source.password)return `<a class="catalog-clarification-link" href="${escape(source.href)}" target="_blank" rel="noopener noreferrer">«Поглощение»: уточнение проверки Силы при извлечении существа или предмета <span class="ui-inline-icon" data-ui-icon="external"></span></a>`;
    }catch{}
    return '';
  }
  function materialInfo(entry){
    if(entry.kind!=='spell'||!entry.spell?.components?.includes('M'))return null;
    const loaded=materialReferences.has(entry),reference=materialReferences.get(entry),m=reference?.materials;
    return {reference,loaded,description:m?.description||(loaded?'Материальные условия этой версии ещё не проверены.':'Справка материалов для этой записи ещё не загружена.'),
      price:!loaded?'Справка не загружена.':m?.price?.kind==='stated'?m.price.text:m?.price?.kind==='not-stated'?'Цена в правиле не указана.':'Стоимость не уточнена.',
      consumption:m?.consumption?.kind&&m.consumption.kind!=='unknown'?m.consumption.text:'Расход не уточнён.',
      badge:!loaded?'Уточнить материалы':({retained:'Сохраняется',consumed:'Расходуется',partial:'Частичный расход',conditional:'Расход по условию'}[m?.consumption?.kind]||'Нужно уточнить'),
      note:m?.note||'Сверьтесь с описанием и источником. Отсутствие сведений не запрещает действие.'};
  }
  function materialDetails(entry){
    const m=materialInfo(entry);if(!m)return '';
    let link='';try{const url=new URL(m.reference?.source?.url);if(['https:','http:'].includes(url.protocol))link=`<a href="${escape(url.href)}" target="_blank" rel="noopener noreferrer">Источник материальных условий <span class="ui-inline-icon" data-ui-icon="external"></span></a>`;}catch{}
    return `<section class="catalog-material-details" id="catalog-material-details" aria-labelledby="catalog-material-title"><h3 id="catalog-material-title" tabindex="-1">Материальные условия</h3><p>${escape(m.description)}</p><dl class="catalog-meta"><dt>Стоимость</dt><dd>${escape(m.price)}</dd><dt>Расход · ${escape(m.badge)}</dt><dd>${escape(m.consumption)}</dd></dl><p>${escape(m.note)}</p>${link}${!m.loaded?`<button id="catalog-material-load">Уточнить материалы</button><p id="catalog-material-status" role="status"></p>`:""}<p class="small">Справка не проверяет наличие компонентов и не списывает предметы.</p></section>`;
  }
  let cardLayout='cards';
  const layoutControl=()=>`<div class="catalog-layout" role="group" aria-label="Вид справочника"><button data-catalog-layout="cards" aria-pressed="${cardLayout==='cards'}">Карточки</button><button data-catalog-layout="list" aria-pressed="${cardLayout==='list'}">Список</button></div>`;
  let ownerKey='',homeMode=false,homeGroups=[],homeDirty=false;
  let cardBook=null,cardBookState='idle',bookRequest=null;
  function readCardBook(){
    const key=snapshot();
    if(bookRequest?.key===key)return bookRequest.promise;
    let promise;try{promise=Promise.resolve(SkazStorage.spellbookData());}catch(error){promise=Promise.reject(error);}
    const pending={key,promise};
    bookRequest=pending;
    const clear=()=>{if(bookRequest===pending)bookRequest=null;};
    pending.promise.then(clear,clear);
    return pending.promise;
  }
  function bookMark(entry){
    if(entry.kind!=='spell'||cardBookState!=='ready')return '';
    const owned=cardBook?.get(entry.id);if(!owned)return '';
    if(owned.alwaysPrepared)return 'Постоянно подготовлено';
    if(!['known','prepared'].includes(owned.status))return '';
    const mode=SkazStorage.spellLearningMode?.();
    if(mode==='known')return 'Известно';
    return owned.status==='prepared'?'Подготовлено':mode==='spellbook'?'В книге':'Изучено';
  }
  async function loadCardBook(requestId,key,{refreshAfter=true}={}){
    try{const book=await readCardBook();if(requestId!==serial||key!==snapshot())return;
      cardBook=new Map(book.entries.map(item=>[item.catalogId,item]));cardBookState='ready';
    }catch{if(requestId!==serial||key!==snapshot())return;cardBook=null;cardBookState='error';}
    if(!refreshAfter)return;
    const update=()=>{
      if(requestId!==serial||key!==snapshot())return;
      const focused=document.activeElement?.dataset?.catalogEntry;
      const focusedId=document.activeElement?.id;
      const restoreId=['catalog-result-heading','catalog-prev','catalog-next','catalog-prev-bottom','catalog-next-bottom'].includes(focusedId)?focusedId:null;
      refresh();
      if(restoreId)document.getElementById(restoreId)?.focus({preventScroll:true});
      else if(focused!==undefined&&/^\d+$/.test(focused))document.querySelector('[data-catalog-entry="'+focused+'"]')?.focus({preventScroll:true});
    };
    // Keep the native dialog opener attached until it restores keyboard focus.
    const dialog=document.getElementById('dialog');
    if(dialog?.open)dialog.addEventListener('close',update,{once:true});else update();
  }
  const owner=()=>JSON.stringify([typeof SkazAccount==='undefined'?'local':SkazAccount.userId||'local',SkazStorage.contextKey?.()||'local']);
  const snapshot=()=>owner()+':'+(SkazStorage.snapshotKey?.()||'');
  const recentKey=()=> 'skaz-catalog-recent-v1:'+owner();
  function recentIds(){try{const ids=JSON.parse(localStorage.getItem(recentKey())||'[]');return Array.isArray(ids)?[...new Set(ids.filter(id=>typeof id==='string'&&id.length>0&&id.length<=200))].slice(0,12):[];}catch{return [];}}
  function rememberEntry(entry){if(!entry.id||referenceReturn)return;homeDirty=true;try{localStorage.setItem(recentKey(),JSON.stringify([entry.id,...recentIds().filter(id=>id!==entry.id)].slice(0,12)));}catch{}}
  const isHome=()=>!query&&!kind&&!detailFilter&&!Object.values(extraFilters).some(Boolean)&&typeof SkazStorage.spellbookData==='function';

  let detailFilter='';
  let extraFilters={}, searchDraft=null;
  const queryPending=()=>searchDraft!==null&&searchDraft.q.trim()!==query;
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
  function creatureCoverageRows(){
    const types=coverage?.scopes?.srd51CreatureTypes;if(kind!=='monster'||!types)return null;
    return [['fey','Феи'],['plant','Растения'],['construct','Конструкты'],['undead','Нежить'],['celestial','Небожители'],['giant','Великаны'],['aberration','Аберрации'],['fiend','Исчадия'],['dragon','Драконы']].filter(([key])=>types[key]).map(([key,label])=>`<li>${label}: актуальных версий установлено ${Number(types[key].installed)}, подготовлено ${Number(types[key].prepared)} из ${Number(types[key].expected)}.</li>`).join('');
  }
  function creatureCoverage(rows=creatureCoverageRows()){
    if(rows===null)return '';
    return `<details class="notice"><summary>Охват выбранных типов SRD 5.1</summary><p>Только перечисленные типы существ открытого SRD 2014. Другие типы и книги сюда не входят.</p><ul data-creature-coverage-rows>${rows}</ul><button id="catalog-creature-inventory">Перечень существ <span class="ui-inline-icon" data-ui-icon="arrow-right"></span></button><p>Краткие изложения; действия и эффекты разрешаются вручную. Это не полный бестиарий D&D.</p></details>`;
  }

  /** @param {{showTitle?: boolean}} [options] */
  function view({showTitle=true}={}) {
    if (location.protocol === 'file:') return `<section class="panel"><h2>Каталог доступен с сервером</h2><p>Этот HTML-файл — автономная демонстрация. Открой локальное приложение, чтобы искать импортированные материалы.</p><button data-page="spells">8 демо-заклинаний <span class="ui-inline-icon" data-ui-icon="arrow-right"></span></button></section>`;
    if(homeDirty&&isHome()){homeDirty=false;status='idle';}
    const nextOwner=snapshot();if(ownerKey!==nextOwner){ownerKey=nextOwner;result=null;homeGroups=[];cardBook=null;cardBookState='idle';bookRequest=null;status='idle';++serial;++detailSerial;relatedCache.clear();}
    if (status === 'idle'){status='loading';const scheduled=serial;queueMicrotask(() => {if(serial===scheduled)load();});}
    const draft=searchDraft||{q:query,scope:searchScope,kind,[filterKeys[kind]]:detailFilter,...extraFilters};
    return `<section class="catalog" aria-label="Каталог D&D 2014">
      <div id="catalog-creature-coverage">${creatureCoverage()}</div>
      <form id="catalog-search" class="catalog-search" role="search" aria-label="Поиск по справочнику">${showTitle?'<h1>Справочник</h1>':''}<label>Название или ключевые слова<input name="q" type="search" maxlength="200" placeholder="Например, Spellcasting" value="${escape(draft.q)}"></label><input type="hidden" name="kind" value="${escape(draft.kind)}"><details class="catalog-about"><summary>О каталоге 2014</summary><div class="notice"><b>Каталог пополняется</b><p>${coverage ? `В базе: ${coverage.total}. Справочных ссылок: ${coverage.referenceOnly}, личных записей: ${coverage.personal}, CC BY 4.0: ${coverage.openlyLicensed || 0}.` : 'Полнота базы пока не подтверждена.'} Предметы и артефакты можно добавить в инвентарь из карточки.${scopeText()}</p></div>
      <div class="catalog-tools" aria-label="Наполнение каталога"><button type="button" id="catalog-bundled">Проверенная подборка 2014</button><button type="button" id="catalog-help">Личный импорт</button><button type="button" id="catalog-inventory">Охват заклинаний SRD</button></div>
      </details><details class="catalog-filters"><summary>Фильтры</summary><label class="catalog-text-toggle"><input type="checkbox" name="scope" value="text" ${draft.scope==='text'?'checked':''}>И в описаниях</label><div id="catalog-specific" class="catalog-specific">${filterControl(draft.kind,draft[filterKeys[draft.kind]]||'',draft)}</div></details><div class="catalog-search-actions"><button type="submit" class="primary">Найти</button><button type="button" id="catalog-reset">Сбросить фильтры</button></div></form><div class="catalog-kinds" aria-label="Категория">${[['','Все'],...Object.entries(names)].map(([key,label])=>`<button data-catalog-kind="${key}" aria-pressed="${draft.kind===key}">${label}</button>`).join('')}</div>
      ${layoutControl()}<div id="catalog-results" role="region" aria-label="Результаты справочника" tabindex="-1" aria-live="polite" aria-busy="${status === 'loading'}">${results()}</div>
      <div class="catalog-footer"><p>В разделе «Персонаж → Магия» доступны личная книга и демонстрационные заклинания.</p><button data-page="spells">К моей книге <span class="ui-inline-icon" data-ui-icon="arrow-right"></span></button></div>
    </section>`;
  }

  function setupHint(){
    const access=SkazStorage.access?.();
    const instructions=access?.catalog===false
      ? '<p>На сервере подборку устанавливает администратор. После установки материалы появятся здесь.</p>'
      : '<p>Установи проверенную подборку D&amp;D 2014: заклинания, существа и предметы SRD 5.1 (CC BY 4.0). Точный состав и количество записей — в предпросмотре.</p><button id="catalog-install-empty" class="primary">Установить подборку</button>';
    return '<div class="empty"><h2>Справочник ещё не установлен</h2>'+instructions+'</div>';
  }
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
    if(queryPending())return '<p class="empty">Запрос изменён. Результаты обновятся после поиска.</p>';
    if (status === 'loading' || status === 'idle') return '<p class="empty">Загружаем каталог…</p>';
    if (status === 'error') return '<div class="empty"><h2>Каталог недоступен</h2><p>Проверь, что локальный сервер запущен. Поиск сохранён — можно повторить запрос.</p><button id="catalog-retry">Повторить</button></div>';
    if(coverage?.total===0)return setupHint();
    if(homeMode)return homeResults();
    if (!result?.entries.length) return `<div class="empty"><h2>${query || kind ? 'Ничего не найдено' : 'Каталог пока пуст'}</h2><p>${query || kind ? 'Попробуй другие слова, поиск по описаниям или все категории.' : 'Добавь справочные ссылки или личные материалы. Демо-заклинания доступны отдельно.'}</p></div>`;
    const bookNotice=cardBookState==='error'?'<p class="catalog-book-note" role="status">Личные отметки не загрузились. Справочник доступен; открой заклинание, чтобы проверить его в книге.</p>':'';
    const pages=bottom=>`<nav class="catalog-pages" aria-label="${bottom?'Страницы каталога внизу':'Страницы каталога'}"><button id="catalog-prev${bottom?'-bottom':''}" ${offset === 0 ? 'disabled' : ''}><span class="ui-inline-icon" data-ui-icon="arrow-left"></span> Назад</button><span>${Math.floor(offset/limit)+1} / ${Math.ceil(result.total/limit)}</span><button id="catalog-next${bottom?'-bottom':''}" ${offset + limit >= result.total ? 'disabled' : ''}>Далее <span class="ui-inline-icon" data-ui-icon="arrow-right"></span></button></nav>`;
    return `${bookNotice}<p class="catalog-count" id="catalog-result-heading" tabindex="-1">Найдено: ${result.total} · ${offset + 1}–${offset + result.entries.length}</p><div class="catalog-grid catalog-view-${cardLayout}">${result.entries.map((entry,index)=>row(entry,index)).join('')}</div>${result.total>limit?pages(true):''}`;
  }
  function tileData(entry){
    const facts=[],tags=[];let subtitle=names[entry.kind]||'Справочник',effect='',levelLabel=entry.kind==='spell'?'Круг не указан':'',componentNote='';
    const present=value=>value!==undefined&&value!==null&&value!=='';
    const add=(label,value)=>facts.push([label,present(value)?String(value):'Не указано']);
    if(entry.spell){const s=entry.spell;
      levelLabel=s.level===0?'Заговор':Number.isInteger(s.level)?s.level+' круг':'Круг не указан';
      subtitle=schools[s.school]||'Школа не указана';
      add('Накладывание',s.castingTime);
      add('Дистанция',s.range?.type==='feet'&&present(s.range.feet)?s.range.feet+' фт':({self:'На себя',touch:'Касание',sight:'Видимость',unlimited:'Не ограничена',special:'Особая'}[s.range?.type]));
      add('Длительность',s.duration);add('Компоненты',Array.isArray(s.components)?s.components.join(', '):null);
      if(Array.isArray(s.components)&&s.components.length){componentNote=s.components.map(code=>({V:'V — голос',S:'S — жесты',M:'M — материалы'}[code]||code)).join(' · ');if(s.components.includes('M'))componentNote+='.'+' Материалы, стоимость и расход — в описании или источнике.';}
      const material=materialInfo(entry);if(material){add('Материалы · стоимость',material.price);tags.push(material.badge);}
      if(s.concentration)tags.push('Концентрация');if(s.ritual)tags.push('Ритуал');
      effect=typeof SkazSpellFacts!=='undefined'?SkazSpellFacts.summary(entry)||'':'';
    }else if(entry.monster){const m=entry.monster;
      subtitle=[monsterSizes[m.size]||m.size,monsterTypes[m.type]||m.type].filter(present).join(' · ')||'Существо';
      add('Опасность',m.challenge);add('Класс доспеха',m.armorClass);add('Хиты (базовые)',m.hitPoints);
      const movement={walk:'Ходьба',fly:'Полёт',swim:'Плавание',climb:'Лазание',burrow:'Рытьё'};
      add('Скорость',Object.entries(movement).filter(([key])=>present(m.speed?.[key])).map(([key,label])=>label+' '+m.speed[key]+' фт').join(' · '));
    }else if(entry.item||entry.artifact){const i=entry.item||entry.artifact;
      subtitle=(entry.kind==='artifact'?'Артефакт · ':'')+(itemTypes[i.type]||i.type||'Предмет');
      if(entry.kind!=='artifact')add('Редкость',rarityLabels[i.rarity]||i.rarity);
      add('Настройка',i.attunement===true?'Требуется':i.attunement===false?'Не требуется':null);
      if(i.attunementRequirement)add('Кем настраивается',i.attunementRequirement);
      if(i.healing){const h=i.healing;add('Восстанавливает',h.diceCount+'к'+h.diceSides+(h.bonus?' + '+h.bonus:'')+' хитов');}
      if(i.charges){add('Максимум зарядов',i.charges.max);add('Восстановление',i.charges.recharge);}
    }
    if(!facts.length)tags.push('Характеристики не импортированы');
    return {subtitle,facts,tags,effect,levelLabel,componentNote};
  }
  function row(entry,index){
    if(cardLayout==='cards'&&['spell','monster','item','artifact'].includes(entry.kind)){
      const {subtitle,facts,tags,effect,levelLabel,componentNote}=tileData(entry),mark=bookMark(entry);
      return `<article class="catalog-tile"><button class="catalog-tile-open" data-catalog-entry="${index}" aria-label="Открыть: ${escape(entry.name.ru)}" aria-describedby="catalog-tile-type-${index} catalog-tile-tags-${index}${facts.length?` catalog-tile-facts-${index}`:''}${effect?` catalog-tile-effect-${index}`:''}${levelLabel?` catalog-tile-level-${index}`:''}${componentNote?` catalog-tile-components-${index}`:''}${mark?` catalog-tile-owned-${index}`:''}">${levelLabel?`<span class="catalog-tile-top"><span class="catalog-tile-level" id="catalog-tile-level-${index}">${escape(levelLabel)}</span>${mark?`<span class="catalog-tile-owned" id="catalog-tile-owned-${index}">${escape(mark)}</span>`:''}</span>`:''}<span class="catalog-tile-heading">${typeof SkazArt!=='undefined'?SkazArt.markup(entry,'thumbnail'):''}<span><strong>${escape(entry.name.ru)}</strong><small>${escape(entry.name.en||'')}</small><span class="catalog-tile-school" id="catalog-tile-type-${index}">${escape(subtitle)}</span></span></span>${facts.length?`<span class="catalog-tile-facts" id="catalog-tile-facts-${index}">${facts.map(([label,value])=>`<span class="catalog-tile-fact${label==="Материалы · стоимость"?" catalog-tile-fact-material":""}"><small>${escape(label)}</small><span>${escape(value)}</span></span>`).join('')}</span>`:''}${effect?`<span class="catalog-tile-effect" id="catalog-tile-effect-${index}">${escape(effect)}</span>`:''}<span class="catalog-tile-tags" id="catalog-tile-tags-${index}">${tags.map(tag=>`<span>${escape(tag)}</span>`).join('')}</span>${componentNote?`<span class="catalog-tile-components" id="catalog-tile-components-${index}">${escape(componentNote)}</span>`:''}${searchExcerpt(entry)}<span class="catalog-tile-read">Описание и правила <span class="ui-inline-icon" data-ui-icon="arrow-right"></span></span></button></article>`;
    }
    return SkazUI.entryRow({entry,name:entry.name,metadata:cardSummary(entry),description:entry.text,preview:searchExcerpt(entry),className:"catalog-card catalog-row",primary:{attribute:"data-catalog-entry",value:index},actions:`<button data-catalog-entry="${index}" aria-label="Открыть: ${escape(entry.name.ru)}">Читать</button>`});
  }
  function homeResults(){let index=0;return '<p class="catalog-count">Мои материалы и последние открытия этого персонажа. Для полного списка выбери категорию.</p>'+homeGroups.map(group=>'<section class="catalog-home-group"><h2>'+group.title+'</h2><div class="catalog-grid catalog-view-'+cardLayout+'">'+(group.entries.length?group.entries.map(entry=>row(entry,index++)).join(''):'<p class="small">'+group.empty+'</p>')+'</div></section>').join('');}
  function searchExcerpt(entry) {
    if(searchScope!=='text'||!query||!entry.text)return '';
    const body=entry.text,match=body.toLocaleLowerCase('ru').indexOf(query.toLocaleLowerCase('ru'));
    if(match<0)return '';
    const start=Math.max(0,match-60),end=Math.min(body.length,match+query.length+100);
    return `<span class="catalog-excerpt">${start?'…':''}${escape(body.slice(start,match))}<mark>${escape(body.slice(match,match+query.length))}</mark>${escape(body.slice(match+query.length,end))}${end<body.length?'…':''}</span>`;
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
  function updateResources(root){
    if(!root)return false;
    if(!SkazStorage.canResource?.()){ownerKey='';return false;}
    if(SkazStorage.can('catalog')){
      for(const button of root.querySelectorAll('#catalog-bundled,#catalog-help')){
        button.disabled=false;
        button.removeAttribute('aria-disabled');
        button.removeAttribute('title');
      }
    }
    if(ownerKey!==snapshot()){
      ++detailSerial;
      relatedCache.clear();
      void load({retainResults:true});
    }
    return true;
  }
  async function load({focusResults=false,retainResults=false}={}) {
    const requestId = ++serial, requestedOwner=snapshot();ownerKey=requestedOwner;homeMode=isHome();homeDirty=false;
    const retain=retainResults&&(status==='ready'||holdingResults);
    holdingResults=retain;
    cardBook=null;cardBookState='idle';
    status='loading';
    if(retain)document.getElementById('catalog-results')?.setAttribute('aria-busy','true');
    else refresh();
    const params = new URLSearchParams({ q: query, limit: String(limit), offset: String(offset), includeMaterials:'1' });
    if (kind) params.set('kind', kind);
    if(searchScope==='text')params.set('scope','text');
    if(detailFilter && filterKeys[kind])params.set(filterKeys[kind],detailFilter);
    for(const key of extraKeys[kind]||[])if(extraFilters[key])params.set(key,extraFilters[key]);
    try {
      if(homeMode){
        const [book,covered,recent]=await Promise.all([readCardBook(),fetch('/api/catalog/coverage',{cache:'no-store',signal:AbortSignal.timeout(10000)}).then(r=>{if(!r.ok)throw new Error('Coverage unavailable');return r.json();}),Promise.all(recentIds().map(async id=>{const r=await fetch('/api/catalog/entry?'+new URLSearchParams({id,includeMaterials:'1'}),{cache:'no-store',signal:AbortSignal.timeout(10000)});if(r.status===404)return null;if(!r.ok)throw new Error('Recent unavailable');const value=acceptCatalogReferences(await r.json());return value.entry;}))]);
        if(requestId!==serial||requestedOwner!==snapshot())return;
        cardBook=new Map(book.entries.map(item=>[item.catalogId,item]));cardBookState='ready';
        homeGroups=[{title:'Недавно открытые',entries:recent.filter(Boolean),empty:'Здесь появятся открытые карточки.'},{title:book.entries.length>20?'Мои заклинания · первые 20':'Мои заклинания',entries:book.entries.map(item=>item.entry).sort((a,b)=>(a.spell?.level??99)-(b.spell?.level??99)||a.name.ru.localeCompare(b.name.ru,'ru')).slice(0,20),empty:'Книга пока пуста. Найди заклинание и добавь его из карточки.'}];
        result={entries:homeGroups.flatMap(group=>group.entries),total:homeGroups.reduce((sum,group)=>sum+group.entries.length,0)};coverage=covered;status='ready';holdingResults=false;refresh();return;
      }
      const values = await Promise.all(['/api/catalog?' + params, '/api/catalog/coverage'].map(async url => {
        const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw new Error('Catalog unavailable');
        return acceptCatalogReferences(await response.json());
      }));
      if (requestId !== serial||requestedOwner!==snapshot()) return;
      [result, coverage] = values;acceptCatalogReferences(result);
      if(result.entries.some(entry=>entry.kind==='spell')&&typeof SkazStorage.spellbookData==='function'){
        cardBookState='loading';
        const book=loadCardBook(requestId,requestedOwner,{refreshAfter:!retain});
        if(retain)await book;
      }
      if(requestId!==serial||requestedOwner!==snapshot())return;
      status='ready';
    } catch { if (requestId !== serial||requestedOwner!==snapshot()) return; status = 'error'; }
    holdingResults=false;
    refresh();
    if(focusResults && typeof page!=='undefined' && page==='library' && !document.getElementById('dialog')?.open){
      const heading=document.getElementById('catalog-result-heading');
      if(heading){heading.focus({preventScroll:true});heading.scrollIntoView({block:'start',behavior:'auto'});}
    }
  }
  function refreshResults() {
    const region=document.getElementById('catalog-results');
    if(!region)return;
    const html=results();
    if(resultMarkup.get(region)!==html){region.innerHTML=html;resultMarkup.set(region,html);}
    region.setAttribute('aria-busy',String(status==='loading'));
  }
  function refresh() {
    if (typeof page !== 'undefined' && page === 'library') {
      refreshResults();
      const notice = document.querySelector('.catalog-about .notice p');
      if (notice && coverage) notice.textContent = `В базе: ${coverage.total}. Справочных ссылок: ${coverage.referenceOnly}, личных записей: ${coverage.personal}, CC BY 4.0: ${coverage.openlyLicensed || 0}. Предметы и артефакты можно добавить в инвентарь из карточки.${scopeText()}`;
      const typeRegion=document.getElementById('catalog-creature-coverage');
      if(typeRegion){
        const rows=creatureCoverageRows(),list=typeRegion.querySelector?.('[data-creature-coverage-rows]');
        if(list&&rows!==null){
          if(list.innerHTML!==rows)list.innerHTML=rows;
        }else{
          const markup=creatureCoverage(rows);
          if(typeRegion.innerHTML!==markup)typeRegion.innerHTML=markup;
        }
      }
    }
  }
  function facts(entry) {
    const rows=[];
    const add=(label,value,primary)=>rows.push(`<div${primary?' class="catalog-fact-primary"':''}><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>`);
    const school=schools;
    if(entry.mechanic)add('Раздел',mechanicCategories[entry.mechanic.category]||entry.mechanic.category);
    if(entry.spell){const x=entry.spell;add('Уровень',x.level===0?'Заговор':x.level);add('Школа',school[x.school]||x.school);add('Накладывание',x.castingTime,true);add('Дистанция',x.range.type==='feet'?x.range.feet+' футов':({self:'На себя',touch:'Касание',sight:'В пределах видимости',unlimited:'Не ограничена',special:'Особая'}[x.range.type]||x.range.type),true);add('Компоненты',x.components.join(', '));add('Длительность',x.duration);add('Концентрация',x.concentration?'Нужна':'Не нужна',true);add('Ритуал',x.ritual?'Да':'Нет');}
    if(entry.monster){const x=entry.monster;add('Размер',monsterSizes[x.size]||x.size);add('Тип',monsterTypes[x.type]||x.type);add('Класс доспеха',x.armorClass,true);add('Хиты (базовые)',x.hitPoints,true);add('Опасность',x.challenge,true);add('Опыт',x.xp);for(const [key,n] of Object.entries(x.speed))add({walk:'Скорость',climb:'Лазание',swim:'Плавание',fly:'Полёт',burrow:'Копание'}[key]||key,n+' футов');for(const [key,n] of Object.entries(x.abilities)){const mod=Math.floor((n-10)/2);add({str:'СИЛ',dex:'ЛОВ',con:'ТЕЛ',int:'ИНТ',wis:'МДР',cha:'ХАР'}[key]||key,`${n} (${mod>=0?'+':''}${mod})`);}}
    const x=entry.item||entry.artifact;
    if(x){add('Тип предмета',({...itemTypes,other:'Другой'})[x.type]||x.type);if(x.rarity)add('Редкость',rarityLabels[x.rarity]||x.rarity);add('Настройка',x.attunement?(x.attunementRequirement||'Требуется'):'Не требуется',true);if(x.healing)add('Лечение',`${x.healing.diceCount}d${x.healing.diceSides}${x.healing.bonus?' + '+x.healing.bonus:''}`,true);if(x.charges){add('Максимум зарядов',x.charges.max,true);add('Восстановление',x.charges.recharge);}}
    return rows.length?`<section class="catalog-facts"><h3>Характеристики</h3><dl>${rows.join('')}</dl><p>Справочные данные. Эффекты автоматически не применяются.</p></section>`:'';
  }
  function details(index) {
    if(status!=='ready'||queryPending()||ownerKey!==snapshot())return;
    const entry = result?.entries[index];
    if (!entry) return;
    trail=[]; returnToInventory=false; referenceReturn=null; showDetails(entry);
  }
  function showDetails(entry, related) {
    if(referenceReturn&&!referenceReturn.valid())return;
    const token=++detailSerial; currentEntry=entry;rememberEntry(entry);
    const knownCaster=SkazStorage.spellLearningMode?.()==='known';
    if(related)relatedCache.set(entry.id,related);
    // Restrict links again at the rendering boundary, even for previously imported data.
    let source = '';
    try { const url = new URL(entry.source.url); if (['http:', 'https:'].includes(url.protocol)) source = `<a href="${escape(url.href)}" target="_blank" rel="noopener noreferrer">Открыть источник <span class="ui-inline-icon" data-ui-icon="external"></span></a>`; } catch {}
    const readerNav=`<nav class="catalog-reader-nav" aria-label="Разделы карточки"><strong class="catalog-reader-name" title="${escape(entry.name.ru)}">${escape(entry.name.ru)}</strong><button data-catalog-section="catalog-detail-title">В начало</button><button data-catalog-section="catalog-body-title">Описание</button>${materialInfo(entry)?'<button data-catalog-section="catalog-material-title">Материалы</button>':''}${entry.links?.length?'<button data-catalog-section="catalog-links-title">Связи</button>':''}<button data-catalog-section="catalog-source-title">Источник</button></nav>`;
    const navigation=referenceReturn
     ? `<div class="catalog-reference-navigation">${readerNav}<button id="catalog-reference-back"><span class="ui-inline-icon" data-ui-icon="arrow-left"></span> ${escape(referenceReturn.label||'К сохранённому предмету')}</button></div><p class="catalog-reference-note">${referenceReturn.label?'Просмотр материала не меняет лист и имущество.':'Актуальная справка из каталога. Сохранённая карточка и имущество не меняются.'}</p>`
     : readerNav;
    modal(`${navigation}${returnToInventory?`<button id="inventory-return"><span class="ui-inline-icon" data-ui-icon="arrow-left"></span> К ${inventoryMode==='creature'?'перечню существ':'охвату заклинаний'}</button>`:''}${trail.length?'<button id="catalog-detail-back"><span class="ui-inline-icon" data-ui-icon="arrow-left"></span> К предыдущему материалу</button>':''}<div class="overline catalog-reader-edition">${names[entry.kind]} · D&D 2014</div><h2 id="catalog-detail-title" tabindex="-1" autofocus>${escape(entry.name.ru)}</h2>${typeof SkazArt!=='undefined'?SkazArt.markup(entry,'card'):''}<p class="catalog-reader-alias">${escape(entry.name.en)}</p>${!referenceReturn&&["item", "artifact"].includes(entry.kind) ? '<button id="catalog-add-inventory" class="primary">В инвентарь <span class="ui-inline-icon" data-ui-icon="arrow-right"></span></button>' : ''}${!referenceReturn&&entry.kind === "spell" ? '<div class="catalog-spell-actions"><button id="catalog-known" disabled>'+(knownCaster?'Добавить в известные':'Изучить')+'</button>'+(knownCaster?'':'<button id="catalog-prepared" class="primary" disabled>Подготовить</button>')+'<button id="catalog-add-spell">Изменить отметку…</button><p id="catalog-book-status" role="status">Проверяем книгу…</p></div>' : ''}${facts(entry)}${materialDetails(entry)}<h3 id="catalog-body-title" tabindex="-1">Описание</h3>${entry.text ? `<div class="catalog-text">${escape(entry.text)}</div>` : '<p>Здесь сохранена справочная ссылка. Текст материала не импортирован.</p>'}${whelmClarificationLink(entry)}${entry.links?.length?'<section class="catalog-related"><h3 id="catalog-links-title" tabindex="-1">Связанные материалы</h3><div id="catalog-related" aria-live="polite">Загружаем связи…</div></section>':''}<details class="catalog-source-details"><summary id="catalog-source-title" tabindex="-1">Источник и версия</summary><dl class="catalog-meta"><dt>Источник</dt><dd>${escape(entry.source.title)}</dd><dt>Версия</dt><dd>${escape(entry.source.version)}</dd><dt>Использование</dt><dd>${usageLabel(entry.source.usage)}</dd><dt>Условия, указанные при импорте</dt><dd>${escape(entry.source.terms)}</dd>${entry.source.attribution ? `<dt>Атрибуция</dt><dd>${escape(entry.source.attribution)}</dd><dt>Изменения</dt><dd>${escape(entry.source.changes)}</dd>` : ''}</dl>${source}</details>`);
    if(typeof SkazPersonalArtCards!=='undefined')SkazPersonalArtCards.mount(document.getElementById('dialog-content'),entry);
    if(entry.links?.length)loadRelated(entry,token);
    if(!referenceReturn&&entry.kind==='spell'&&SkazStorage.spellbookData){
      const key=SkazStorage.snapshotKey();
      readCardBook().then(book=>{
        if(!detailVisible(token)||key!==SkazStorage.snapshotKey())return;
        const owned=book.entries.find(item=>item.catalogId===entry.id),existing=owned?.status,alwaysPrepared=owned?.alwaysPrepared===true;
        document.getElementById('catalog-book-status').textContent=alwaysPrepared?'Постоянно подготовлено умением класса · вне обычного предела подготовки':knownCaster&&existing?'В книге · Известно':existing==='prepared'?'В книге · Подготовлено':existing==='known'?'В книге · Изучено':'Ещё не в книге';
        for(const [id,mark] of (knownCaster?[['catalog-known','known']]:[['catalog-known','known'],['catalog-prepared','prepared']])){
          const button=document.getElementById(id);button.disabled=alwaysPrepared||(knownCaster?!!existing:existing===mark)||!SkazStorage.can('character');
          button.onclick=async()=>{if(alwaysPrepared)return;button.disabled=true;try{await SkazStorage.setSpell(entry,mark,key);}catch(error){if(detailVisible(token)){document.getElementById('catalog-book-status').textContent=error.message;button.disabled=false;}}};
        }
      }).catch(()=>{if(detailVisible(token))document.getElementById('catalog-book-status').textContent='Книга недоступна. Повторно открой карточку после подключения.';});
    }
    if (!referenceReturn && entry.kind === 'spell') document.getElementById('catalog-add-spell').onclick = () => SkazStorage.editSpell(entry);
    if (!referenceReturn && ['item', 'artifact'].includes(entry.kind)) document.getElementById('catalog-add-inventory').onclick = () => SkazStorage.addInventory(entry);
  }
  const detailVisible = token => (!referenceReturn||referenceReturn.valid()) && token===detailSerial && document.getElementById('dialog')?.open && document.getElementById('catalog-detail-title');
  async function loadMaterialDetails(){
    const entry=currentEntry,token=detailSerial,key=snapshot();
    if(!entry||!detailVisible(token)||materialReferences.has(entry))return;
    const button=document.getElementById('catalog-material-load');if(button)button.disabled=true;
    const notice=document.getElementById('catalog-material-status');if(notice)notice.textContent='Загружаем справку…';
    try{
      const value=await getEntry(entry.id);
      if(!detailVisible(token)||key!==snapshot()||entry!==currentEntry)return;
      materialReferences.set(entry,JSON.stringify(entry)===JSON.stringify(value.entry)?materialReferences.get(value.entry)||null:null);
      const searchToken=serial;document.getElementById('dialog')?.addEventListener('close',()=>{
        if(key!==snapshot()||searchToken!==serial)return;
        const focused=document.activeElement?.dataset?.catalogEntry;refresh();
        if(focused!==undefined&&/^\d+$/.test(focused))document.querySelector('[data-catalog-entry="'+focused+'"]')?.focus({preventScroll:true});
      },{once:true});
      const region=document.getElementById('catalog-material-details');
      if(region){region.outerHTML=materialDetails(entry);document.getElementById('catalog-material-title')?.focus({preventScroll:true});}
    }catch{
      if(!detailVisible(token)||key!==snapshot()||entry!==currentEntry)return;
      if(button)button.disabled=false;if(notice)notice.textContent='Справка недоступна. Можно повторить; запись и действия остаются доступны.';
    }
  }
  async function getEntry(id) {
    const response=await fetch('/api/catalog/entry?'+new URLSearchParams({id,includeMaterials:'1'}),{cache:'no-store',signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw new Error('Материал недоступен');
    return acceptCatalogReferences(await response.json());
  }
  async function loadRelated(entry,token) {
    try {
      let related=relatedCache.get(entry.id);
      if(!related){const value=await getEntry(entry.id);related=value.related;relatedCache.set(entry.id,related);}
      if(!detailVisible(token))return;
      const region=document.getElementById('catalog-related');
      if(region)region.innerHTML=related.map(item=>`<button data-catalog-related="${escape(item.id)}">${escape(item.name.ru)} · ${escape(item.name.en)} <span class="ui-inline-icon" data-ui-icon="arrow-right"></span></button>`).join('');
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
    modal('<div id="catalog-reference-loading"><h2>Справка о предмете</h2><p>Открываем актуальный материал…</p><button id="catalog-reference-back"><span class="ui-inline-icon" data-ui-icon="arrow-left"></span> К сохранённому предмету</button></div>');
    try{const value=await getEntry(id);if(visible())showDetails(value.entry,value.related);}
    catch{if(visible())modal('<div id="catalog-reference-loading"><h2>Материал недоступен</h2><p>Сохранённая карточка остаётся в инвентаре. Вернись к ней и попробуй открыть справку позже.</p><button id="catalog-reference-back"><span class="ui-inline-icon" data-ui-icon="arrow-left"></span> К сохранённому предмету</button></div>');}
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
    modal(`<div id="spell-inventory"><h2>${creature?'Перечень существ SRD':'Охват заклинаний SRD 5.1'}</h2><p>${creature?`Выбранные типы существ SRD 2014 — это не весь бестиарий. Подготовлено ${inventoryData.entries.filter(e=>e.status!=='missing').length} из ${expected}. Установленные версии учитываются отдельно.`:`319 названий из открытого SRD 2014. Подготовлено кратких изложений: ${inventoryData.entries.filter(e=>e.status!=='missing').length} из 319. Это охват открытого SRD, не всех книг D&D. Установка в твою базу учитывается отдельно.`}</p><form id="spell-inventory-search" class="personal-spell-search"><label>Название RU / EN<input name="q" type="search" maxlength="200" value="${escape(inventoryQuery)}"></label><label>${creature?'Тип существа':'Уровень'}<select name="level"><option value="">${creature?'Все выбранные типы':'Все уровни'}</option>${creature?['fey','plant','construct','undead','celestial','giant','aberration','fiend','dragon'].map(key=>`<option value="${key}" ${inventoryLevel===key?'selected':''}>${monsterTypes[key]}</option>`).join(''):Array.from({length:10},(_,n)=>`<option value="${n}" ${inventoryLevel===String(n)?'selected':''}>${n===0?'Заговор':n+' уровень'}</option>`).join('')}</select></label><label>Готовность<select name="status"><option value="all">Все</option>${Object.entries(inventoryLabels).map(([k,v])=>`<option value="${k}" ${inventoryStatus===k?'selected':''}>${v}</option>`).join('')}</select></label><button type="submit">Показать</button></form><p>${creature?'В выбранных типах':'В выбранном уровне'}: подготовлено ${ready} из ${levelEntries.length}, актуальных версий установлено ${installed}.</p><p id="inventory-result-count" tabindex="-1">Найдено: ${matches.length}</p><div class="map-pagination"><button id="inventory-prev" ${inventoryOffset===0?'disabled':''}>Назад</button><span>${matches.length?inventoryOffset+1:0}–${Math.min(inventoryOffset+20,matches.length)} из ${matches.length}</span><button id="inventory-next" ${inventoryOffset+20>=matches.length?'disabled':''}>Дальше</button></div><p id="inventory-open-message" role="status"></p><div class="inventory-index">${matches.slice(inventoryOffset,inventoryOffset+20).map(e=>`<article><h3>${escape(e.nameRu||e.nameEn)}</h3>${e.nameRu?`<p>${escape(e.nameEn)}</p>`:''}<p>${creature?escape(monsterTypes[e.monsterType]||e.monsterType):e.level===0?'Заговор':Number(e.level)+' уровень'} · ${inventoryLabels[e.status]}</p><a href="https://media.wizards.com/2023/downloads/dnd/SRD_CC_v5.1.pdf#page=${Number(e.page)}" target="_blank" rel="noopener noreferrer">Источник · стр. ${Number(e.page)}</a>${['installed','update-available'].includes(e.status)?`<button data-inventory-read="${escape(e.id)}">Открыть карточку <span class="ui-inline-icon" data-ui-icon="arrow-right"></span></button>`:''}</article>`).join('')||'<p>Совпадений нет.</p>'}</div></div>`);
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
    const wasPending=queryPending();
    searchDraft={...(searchDraft||{q:query,scope:searchScope,kind,[filterKeys[kind]]:detailFilter,...extraFilters}),[field.name]:field.name==='scope'?(field.checked?'text':'name'):field.value};
    if(field.name==='q'){
      clearTimeout(searchTimer);
      const pending=queryPending();
      if(pending!==wasPending)refreshResults();
      if(pending)searchTimer=setTimeout(()=>{if(document.getElementById('catalog-search')!==field.form)return;field.form.requestSubmit();},200);
    }
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
    if(['cards','list'].includes(button.dataset.catalogLayout)){cardLayout=button.dataset.catalogLayout;refreshResults();document.querySelectorAll('[data-catalog-layout]').forEach(control=>control.setAttribute('aria-pressed',String(control.dataset.catalogLayout===cardLayout)));return;}
    if(Object.hasOwn(button.dataset,'catalogKind')){clearTimeout(searchTimer);const next=button.dataset.catalogKind;if(next&&!Object.hasOwn(names,next))return;kind=next;query=(searchDraft?.q??query).trim();searchScope=searchDraft?.scope??searchScope;detailFilter='';extraFilters={};searchDraft=null;offset=0;render();load();return;}
    if (button.hasAttribute('data-catalog-entry')) details(Number(button.dataset.catalogEntry));
    if(button.dataset.catalogRelated)openRelated(button.dataset.catalogRelated);
    if(button.dataset.catalogSection && detailVisible(detailSerial)){
      const id=button.dataset.catalogSection;
      if(['catalog-detail-title','catalog-body-title','catalog-material-title','catalog-links-title','catalog-source-title'].includes(id)){
        const target=document.getElementById(id);
        if(target){
          const content=document.getElementById('dialog-content');
          if(id==='catalog-detail-title'&&referenceReturn?.label){
            content.scrollTop=0;
            target.focus({preventScroll:true});
            return;
          }
          if(id==='catalog-source-title')target.parentElement.open=true;
          const toolbar=document.querySelector('#dialog .catalog-reference-navigation');
          const nav=document.querySelector('#dialog .catalog-reader-nav');
          // Measure the sticky element on each jump because the available space can change.
          const sticky=[toolbar,nav].find(element=>element&&getComputedStyle(element).position==='sticky');
          const padding=sticky?parseFloat(getComputedStyle(content).paddingTop)||0:0;
          const reserved=sticky?sticky.getBoundingClientRect().height+padding:0;
          target.style.scrollMarginTop=(reserved+16)+'px';
          target.focus({preventScroll:true});target.scrollIntoView({block:'start',behavior:'instant'});
        }
      }
    }
    if(button.id==='catalog-material-load'){void loadMaterialDetails();return;}
    if(button.id==='catalog-related-retry'&&currentEntry)loadRelated(currentEntry,detailSerial);
    if(button.id==='catalog-detail-back'&&trail.length&&detailVisible(detailSerial))showDetails(trail.pop());
    if(button.id==='catalog-reference-back'&&referenceReturn){const previous=referenceReturn;if(!previous.valid())return;++detailSerial;referenceReturn=null;trail=[];previous.onBack();}
    if (button.id === 'catalog-retry') {
      document.getElementById('catalog-results')?.focus({preventScroll:true});
      load();
    }
    if (['catalog-prev','catalog-next','catalog-prev-bottom','catalog-next-bottom'].includes(button.id)) {
      if(status!=='ready'||queryPending()||!result)return;
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
  return { view, updateResources, reload: load, openReference,readSnapshot,offerSetup };
})();
