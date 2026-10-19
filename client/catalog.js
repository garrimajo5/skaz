const SkazCatalog = (() => {
  const names = { mechanic: 'Механики', spell: 'Заклинания', monster: 'Бестиарий', item: 'Предметы', artifact: 'Артефакты' };
  let query = '', kind = '', offset = 0, result = null, coverage = null, status = 'idle', serial = 0;
  const limit = 20;
  let detailFilter='';
  let extraFilters={}, searchDraft=null;
  const schools={abjuration:'Ограждение',conjuration:'Вызов',divination:'Прорицание',enchantment:'Очарование',evocation:'Воплощение',illusion:'Иллюзия',necromancy:'Некромантия',transmutation:'Преобразование'};
  const monsterTypes={aberration:'Аберрация',beast:'Зверь',celestial:'Небожитель',construct:'Конструкт',dragon:'Дракон',elemental:'Элементаль',fey:'Фея',fiend:'Исчадие',giant:'Великан',humanoid:'Гуманоид',monstrosity:'Монстр',ooze:'Слизь',plant:'Растение',undead:'Нежить'};
  const monsterSizes={tiny:'Крошечный',small:'Маленький',medium:'Средний',large:'Большой',huge:'Огромный',gargantuan:'Громадный'};
  const itemTypes={armor:'Доспех',potion:'Зелье',ring:'Кольцо',rod:'Жезл',scroll:'Свиток',staff:'Посох',wand:'Волшебная палочка',weapon:'Оружие',wondrous:'Чудесный предмет'};
  const mechanicCategories={condition:'Состояния',spellcasting:'Накладывание заклинаний',combat:'Бой',rest:'Отдых'};
  const extraKeys={spell:['school','ritual','concentration'],monster:['monsterType','size'],item:['itemType','attunement']};
  const filterKeys={spell:'level',monster:'challenge',item:'rarity',mechanic:'mechanicCategory'};
  const rarityLabels={common:'Обычный',uncommon:'Необычный',rare:'Редкий','very-rare':'Очень редкий',legendary:'Легендарный',varies:'Разная редкость'};
  function filterControl(category,value='',extra={}) {
    const key=filterKeys[category];if(!key)return '';
    const label={spell:'Уровень заклинания',monster:'Опасность существа',item:'Редкость предмета',mechanic:'Раздел механик'}[category];
    const options=category==='spell'?Array.from({length:10},(_,i)=>[String(i),i===0?'Заговор':i+' уровень']):category==='monster'?['0','1/8','1/4','1/2',...Array.from({length:30},(_,i)=>String(i+1))].map(v=>[v,v]):category==='mechanic'?Object.entries(mechanicCategories):Object.entries(rarityLabels);
    const select=(name,label,choices,current)=>`<label>${label}<select name="${name}"><option value="">Все</option>${choices.map(([v,text])=>`<option value="${v}" ${current===v?'selected':''}>${text}</option>`).join('')}</select></label>`;
    const spells=category==='spell'?select('school','Школа',Object.entries(schools),extra.school)+select('ritual','Ритуальное накладывание',[['true','Есть'],['false','Нет']],extra.ritual)+select('concentration','Концентрация',[['true','Нужна'],['false','Не нужна']],extra.concentration):'';
    const monsters=category==='monster'?select('monsterType','Тип существа',Object.entries(monsterTypes),extra.monsterType)+select('size','Размер',Object.entries(monsterSizes),extra.size):'';
    const items=category==='item'?select('itemType','Тип предмета',Object.entries(itemTypes),extra.itemType)+select('attunement','Настройка',[['true','Требуется'],['false','Не требуется']],extra.attunement):'';
    return select(key,label,options,value)+spells+monsters+items+'<p>При выборе характеристики записи без неё не показываются.</p>';
  }

  let detailSerial=0, currentEntry=null, trail=[], returnToInventory=false;
  const relatedCache=new Map();
  let bundleSerial=0, installing=false;
  const usageLabel = usage => ({ 'reference-only': 'Справочная ссылка · без текста', personal: 'Личный импорт', 'cc-by-4.0': 'Открытый материал · CC BY 4.0' }[usage] || 'Неизвестные условия');
  const scopeText=()=>coverage?.scopes?.srd51Spells?` Заклинания SRD 5.1: установлено ${coverage.scopes.srd51Spells.installed}, подготовлено ${coverage.scopes.srd51Spells.prepared} из ${coverage.scopes.srd51Spells.expected} описаний. Это охват SRD, не всех книг D&D.`:'';
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function view() {
    if (location.protocol === 'file:') return `<section class="panel"><h2>Каталог доступен с сервером</h2><p>Этот HTML-файл — автономная демонстрация. Открой локальное приложение, чтобы искать импортированные материалы.</p><button data-page="spells">8 демо-заклинаний →</button></section>`;
    if (status === 'idle') queueMicrotask(() => load());
    const draft=searchDraft||{q:query,kind,[filterKeys[kind]]:detailFilter,...extraFilters};
    return `<section class="catalog" aria-label="Каталог D&D 2014">
      <div class="notice"><b>D&D 2014 · Каталог пополняется</b><p>${coverage ? `В базе: ${coverage.total}. Справочных ссылок: ${coverage.referenceOnly}, личных записей: ${coverage.personal}, CC BY 4.0: ${coverage.openlyLicensed || 0}.` : 'Полнота базы пока не подтверждена.'} Предметы и артефакты можно добавить в инвентарь из карточки.${scopeText()}</p></div>
      <div class="catalog-tools" aria-label="Наполнение каталога"><button id="catalog-bundled">Проверенная подборка 2014</button><button id="catalog-help">Личный импорт</button><button id="catalog-inventory">Охват заклинаний SRD</button></div>
      <form id="catalog-search" class="catalog-search"><label>Название на русском или английском<input name="q" type="search" maxlength="200" placeholder="Например, Spellcasting" value="${escape(draft.q)}"></label><label>Категория<select name="kind"><option value="">Все категории</option>${Object.entries(names).map(([key, name]) => `<option value="${key}" ${draft.kind === key ? 'selected' : ''}>${name}</option>`).join('')}</select></label><div id="catalog-specific" class="catalog-specific">${filterControl(draft.kind,draft[filterKeys[draft.kind]]||'',draft)}</div><div class="catalog-search-actions"><button type="submit" class="primary">Найти</button><button type="button" id="catalog-reset">Сбросить фильтры</button></div></form>
      <div id="catalog-results" aria-live="polite" aria-busy="${status === 'loading'}">${results()}</div>
      <div class="catalog-footer"><p>В разделе магии доступны личный список из каталога и отдельные демонстрационные заклинания.</p><button data-page="spells">К моей магии →</button></div>
    </section>`;
  }
  function results() {
    if (status === 'loading' || status === 'idle') return '<p class="empty">Загружаем каталог…</p>';
    if (status === 'error') return '<div class="empty"><h2>Каталог недоступен</h2><p>Проверь, что локальный сервер запущен. Поиск сохранён — можно повторить запрос.</p><button id="catalog-retry">Повторить</button></div>';
    if (!result?.entries.length) return `<div class="empty"><h2>${query || kind ? 'Ничего не найдено' : 'Каталог пока пуст'}</h2><p>${query || kind ? 'Попробуй другое название или выбери все категории.' : 'Добавь справочные ссылки или личные материалы. Демо-заклинания доступны отдельно.'}</p></div>`;
    return `<p class="catalog-count">Найдено: ${result.total} · ${offset + 1}–${offset + result.entries.length}</p><nav class="catalog-pages" aria-label="Страницы каталога"><button id="catalog-prev" ${offset === 0 ? 'disabled' : ''}>← Назад</button><button id="catalog-next" ${offset + limit >= result.total ? 'disabled' : ''}>Далее →</button></nav><div class="catalog-grid">${result.entries.map((entry, index) => `<article class="panel catalog-card"><div class="overline">${names[entry.kind]} · 2014</div><h2>${escape(entry.name.ru)}</h2><p>${escape(entry.name.en)}</p><span>${usageLabel(entry.source.usage)}</span><p class="catalog-source">${escape(entry.source.title)}</p><button data-catalog-entry="${index}">Подробнее →</button></article>`).join('')}</div>`;
  }
  async function load() {
    const requestId = ++serial;
    status = 'loading'; refresh();
    const params = new URLSearchParams({ q: query, limit: String(limit), offset: String(offset) });
    if (kind) params.set('kind', kind);
    if(detailFilter && filterKeys[kind])params.set(filterKeys[kind],detailFilter);
    for(const key of extraKeys[kind]||[])if(extraFilters[key])params.set(key,extraFilters[key]);
    try {
      const values = await Promise.all(['/api/catalog?' + params, '/api/catalog/coverage'].map(async url => {
        const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw new Error('Catalog unavailable');
        return response.json();
      }));
      if (requestId !== serial) return;
      [result, coverage] = values;
      status = 'ready';
    } catch { if (requestId !== serial) return; status = 'error'; }
    refresh();
  }
  function refresh() {
    if (typeof page !== 'undefined' && page === 'library') {
      const region = document.getElementById('catalog-results');
      if (region) { region.innerHTML = results(); region.setAttribute('aria-busy', String(status === 'loading')); }
      const notice = document.querySelector('.catalog .notice p');
      if (notice && coverage) notice.textContent = `В базе: ${coverage.total}. Справочных ссылок: ${coverage.referenceOnly}, личных записей: ${coverage.personal}, CC BY 4.0: ${coverage.openlyLicensed || 0}. Предметы и артефакты можно добавить в инвентарь из карточки.${scopeText()}`;
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
    const entry = result?.entries[index];
    if (!entry) return;
    trail=[]; returnToInventory=false; showDetails(entry);
  }
  function showDetails(entry, related) {
    const token=++detailSerial; currentEntry=entry;
    if(related)relatedCache.set(entry.id,related);
    // Restrict links again at the rendering boundary, even for previously imported data.
    let source = '';
    try { const url = new URL(entry.source.url); if (['http:', 'https:'].includes(url.protocol)) source = `<a href="${escape(url.href)}" target="_blank" rel="noopener noreferrer">Открыть источник ↗</a>`; } catch {}
    modal(`${returnToInventory?'<button id="inventory-return">← К охвату заклинаний</button>':''}${trail.length?'<button id="catalog-detail-back">← К предыдущему материалу</button>':''}<div class="overline">${names[entry.kind]} · D&D 2014</div><h2 id="catalog-detail-title" tabindex="-1" autofocus>${escape(entry.name.ru)}</h2><p>${escape(entry.name.en)}</p>${["item", "artifact"].includes(entry.kind) ? '<button id="catalog-add-inventory" class="primary">В инвентарь →</button>' : ''}${entry.kind === "spell" ? '<button id="catalog-add-spell" class="primary">В мой список заклинаний →</button>' : ''}${facts(entry)}${entry.text ? `<div class="catalog-text">${escape(entry.text)}</div>` : '<p>Здесь сохранена справочная ссылка. Текст материала не импортирован.</p>'}${entry.links?.length?'<section class="catalog-related"><h3>Связанные материалы</h3><div id="catalog-related" aria-live="polite">Загружаем связи…</div></section>':''}<dl class="catalog-meta"><dt>Источник</dt><dd>${escape(entry.source.title)}</dd><dt>Версия</dt><dd>${escape(entry.source.version)}</dd><dt>Использование</dt><dd>${usageLabel(entry.source.usage)}</dd><dt>Условия, указанные при импорте</dt><dd>${escape(entry.source.terms)}</dd>${entry.source.attribution ? `<dt>Атрибуция</dt><dd>${escape(entry.source.attribution)}</dd><dt>Изменения</dt><dd>${escape(entry.source.changes)}</dd>` : ''}</dl>${source}`);
    if(entry.links?.length)loadRelated(entry,token);
    if (entry.kind === 'spell') document.getElementById('catalog-add-spell').onclick = () => SkazStorage.editSpell(entry);
    if (['item', 'artifact'].includes(entry.kind)) document.getElementById('catalog-add-inventory').onclick = () => SkazStorage.addInventory(entry);
  }
  const detailVisible = token => token===detailSerial && document.getElementById('dialog')?.open && document.getElementById('catalog-detail-title');
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
    if(!currentEntry?.links?.includes(id))return;
    const previous=currentEntry,token=++detailSerial;
    const region=document.getElementById('catalog-related');if(region)region.innerHTML='<p>Открываем материал…</p>';
    try{
      const value=await getEntry(id);if(!detailVisible(token))return;
      trail.push(previous);if(trail.length>20)trail.shift();showDetails(value.entry,value.related);
    }catch{if(detailVisible(token)&&region)region.innerHTML='<p>Материал недоступен. Проверь соединение.</p><button id="catalog-related-retry">Повторить</button>';}
  }
  const bundleVisible = token => token===bundleSerial && document.getElementById('dialog')?.open && document.getElementById('bundled-catalog');
  async function previewBundled() {
    if(installing)return;
    const token=++bundleSerial;
    modal('<div id="bundled-catalog"><h2>Проверенная подборка</h2><p role="status">Сверяем состав с твоим справочником…</p></div>');
    try{
      const response=await fetch('/api/catalog/bundled',{cache:'no-store',signal:AbortSignal.timeout(10000)}),value=await response.json();
      if(!response.ok)throw new Error(value.error||'Не удалось проверить подборку');
      if(!bundleVisible(token))return;
      modal(`<div id="bundled-catalog"><div class="overline">ПРОВЕРЕННЫЕ ИСТОЧНИКИ · D&D 2014</div><h2>Добавить в справочник</h2><p>Это ограниченная подборка, а не полная база D&D. Русские краткие изложения SRD 5.1 с атрибуцией CC BY 4.0 и справочные ссылки без копирования текста.</p><ul>${Object.entries(value.categories).map(([kind,count])=>`<li>${names[kind]||escape(kind)}: ${Number(count)}</li>`).join('')}</ul><p>Всего в подборке: ${Number(value.total)}. Добавится: ${Number(value.added)}. Уже совпадает: ${Number(value.unchanged)}.</p><p>Игра и ресурсы персонажей не меняются. Личные материалы сохраняются; конфликт занятого ID остановит всю установку.</p><button id="install-bundled" class="primary" ${value.added===0?'disabled':''}>${value.added===0?'Подборка уже установлена':'Добавить подборку'}</button><p id="bundled-message" role="status"></p></div>`);
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
      if(bundleVisible(token))modal(`<div id="bundled-catalog"><h2>Подборка установлена</h2><p>Добавлено: ${Number(value.added)}. Уже совпадало: ${Number(value.unchanged)}. Прогресс игры не изменён.</p><button id="bundled-done" class="primary">Вернуться к справочнику</button></div>`);
      await load();
    }catch(error){if(bundleVisible(token)){button.disabled=false;document.getElementById('bundled-message').textContent=error.message+'. Повтор безопасен: совпавшие записи не дублируются.';}}
    finally{installing=false;}
  }
  let inventorySerial=0,inventoryData=null,inventoryQuery='',inventoryStatus='all',inventoryLevel='',inventoryOffset=0;
  const inventoryLabels={missing:'Не подготовлено',prepared:'Готово к установке',installed:'Установлено',conflict:'ID занят личной версией'};
  const inventoryVisible=token=>token===inventorySerial && document.getElementById('dialog')?.open && document.getElementById('spell-inventory');
  async function openInventory(){
    const token=++inventorySerial;returnToInventory=false;inventoryData=null;inventoryQuery='';inventoryStatus='all';inventoryLevel='';inventoryOffset=0;
    modal('<div id="spell-inventory"><h2>Охват заклинаний SRD 5.1</h2><p>Загружаем перечень…</p></div>');
    try{const response=await fetch('/api/catalog/spell-inventory',{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error();const value=await response.json();if(!inventoryVisible(token))return;inventoryData=value;paintInventory();}
    catch{if(inventoryVisible(token))modal('<div id="spell-inventory"><h2>Перечень недоступен</h2><button id="catalog-inventory">Повторить</button></div>');}
  }
  function paintInventory(){
    const levelEntries=inventoryData.entries.filter(e=>inventoryLevel===''||e.level===Number(inventoryLevel));
    const ready=levelEntries.filter(e=>e.status!=='missing').length,installed=levelEntries.filter(e=>e.status==='installed').length;
    const matches=levelEntries.filter(e=>(inventoryStatus==='all'||e.status===inventoryStatus)&&`${e.nameEn} ${e.nameRu||''}`.toLocaleLowerCase('ru').includes(inventoryQuery.toLocaleLowerCase('ru')));
    inventoryOffset=Math.min(inventoryOffset,Math.floor(Math.max(0,matches.length-1)/20)*20);
    modal(`<div id="spell-inventory"><h2>Охват заклинаний SRD 5.1</h2><p>319 названий из открытого SRD 2014. Это перечень для проверки охвата, не 319 готовых карточек и не все книги D&D. Русские названия есть только у подготовленных материалов.</p><form id="spell-inventory-search" class="personal-spell-search"><label>Название RU / EN<input name="q" type="search" maxlength="200" value="${escape(inventoryQuery)}"></label><label>Уровень<select name="level"><option value="">Все уровни</option>${Array.from({length:10},(_,n)=>`<option value="${n}" ${inventoryLevel===String(n)?'selected':''}>${n===0?'Заговор':n+' уровень'}</option>`).join('')}</select></label><label>Готовность<select name="status"><option value="all">Все</option>${Object.entries(inventoryLabels).map(([k,v])=>`<option value="${k}" ${inventoryStatus===k?'selected':''}>${v}</option>`).join('')}</select></label><button type="submit">Показать</button></form><p>В выбранном уровне: подготовлено ${ready} из ${levelEntries.length}, установлено ${installed}.</p><p>Найдено: ${matches.length}</p><div class="map-pagination"><button id="inventory-prev" ${inventoryOffset===0?'disabled':''}>Назад</button><span>${matches.length?inventoryOffset+1:0}–${Math.min(inventoryOffset+20,matches.length)} из ${matches.length}</span><button id="inventory-next" ${inventoryOffset+20>=matches.length?'disabled':''}>Дальше</button></div><p id="inventory-open-message" role="status"></p><div class="inventory-index">${matches.slice(inventoryOffset,inventoryOffset+20).map(e=>`<article><h3>${escape(e.nameRu||e.nameEn)}</h3>${e.nameRu?`<p>${escape(e.nameEn)}</p>`:''}<p>${e.level===0?'Заговор':Number(e.level)+' уровень'} · ${inventoryLabels[e.status]}</p><a href="https://media.wizards.com/2023/downloads/dnd/SRD_CC_v5.1.pdf#page=${Number(e.page)}" target="_blank" rel="noopener noreferrer">Источник · стр. ${Number(e.page)}</a>${e.status==='installed'?`<button data-inventory-read="${escape(e.id)}">Открыть карточку →</button>`:''}</article>`).join('')||'<p>Совпадений нет.</p>'}</div></div>`);
  }
  async function readInventoryEntry(id){
    if(!inventoryVisible(inventorySerial)||!inventoryData.entries.some(e=>e.id===id&&e.status==='installed'))return;
    const token=++inventorySerial,region=document.getElementById('inventory-open-message');if(region)region.textContent='Открываем карточку…';
    try{const value=await getEntry(id);if(!inventoryVisible(token))return;trail=[];returnToInventory=true;showDetails(value.entry,value.related);}
    catch{if(inventoryVisible(token)&&region)region.textContent='Не удалось открыть карточку. Нажми её кнопку, чтобы повторить.';}
  }
  document.addEventListener('submit', event => {
    if(event.target.id==='spell-inventory-search'){event.preventDefault();const fields=new FormData(event.target);inventoryQuery=String(fields.get('q')).trim();inventoryStatus=String(fields.get('status'));inventoryLevel=String(fields.get('level')||'');inventoryOffset=0;if(inventoryData)paintInventory();return;}
    if (event.target.id !== 'catalog-search') return;
    event.preventDefault();
    searchDraft=null;
    const data = new FormData(event.target); query = String(data.get('q')).trim(); kind = String(data.get('kind')); detailFilter=filterKeys[kind]?String(data.get(filterKeys[kind])||''):''; extraFilters=Object.fromEntries((extraKeys[kind]||[]).map(key=>[key,String(data.get(key)||'')])); offset = 0; load();
  });
  function rememberSearch(event){
    const field=event.target;
    if(field.form?.id!=='catalog-search'||!['q','kind','level','school','ritual','concentration','challenge','monsterType','size','rarity','itemType','attunement','mechanicCategory'].includes(field.name))return;
    searchDraft={...(searchDraft||{q:query,kind,[filterKeys[kind]]:detailFilter,...extraFilters}),[field.name]:field.value};
    if(field.name==='kind'){
      for(const key of ['level','school','ritual','concentration','challenge','monsterType','size','rarity','itemType','attunement','mechanicCategory'])delete searchDraft[key];
      const region=document.getElementById('catalog-specific');if(region)region.innerHTML=filterControl(field.value);
    }
  }
  document.addEventListener('input',rememberSearch);
  document.addEventListener('change',rememberSearch);
  document.addEventListener('click', event => {
    const button = event.target.closest('button'); if (!button) return;
    if (button.hasAttribute('data-catalog-entry')) details(Number(button.dataset.catalogEntry));
    if(button.dataset.catalogRelated)openRelated(button.dataset.catalogRelated);
    if(button.id==='catalog-related-retry'&&currentEntry)loadRelated(currentEntry,detailSerial);
    if(button.id==='catalog-detail-back'&&trail.length)showDetails(trail.pop());
    if (button.id === 'catalog-retry') load();
    if (button.id === 'catalog-prev' || button.id === 'catalog-next') { offset = Math.max(0, offset + (button.id === 'catalog-prev' ? -limit : limit)); load(); }
    if (button.id === 'catalog-reset') { query = ''; kind = ''; detailFilter=''; extraFilters={}; searchDraft=null; offset = 0; render(); load(); }
    if(button.id==='catalog-inventory')openInventory();
    if(button.dataset.inventoryRead)readInventoryEntry(button.dataset.inventoryRead);
    if(button.id==='inventory-return'&&returnToInventory&&inventoryData){++detailSerial;returnToInventory=false;paintInventory();}
    if(inventoryData && inventoryVisible(inventorySerial) && ['inventory-prev','inventory-next'].includes(button.id)){inventoryOffset=Math.max(0,inventoryOffset+(button.id==='inventory-next'?20:-20));paintInventory();}
    if(button.id==='catalog-bundled')previewBundled();
    if(button.id==='bundled-done')closeModal();
    if (button.id === 'catalog-help') SkazCatalogImport.open();
  });
  return { view, reload: load };
})();
