const SkazCatalog = (() => {
  const names = { mechanic: 'Механики', spell: 'Заклинания', monster: 'Бестиарий', item: 'Предметы', artifact: 'Артефакты' };
  let query = '', kind = '', offset = 0, result = null, coverage = null, status = 'idle', serial = 0;
  const limit = 20;
  let detailSerial=0, currentEntry=null, trail=[];
  const relatedCache=new Map();
  const usageLabel = usage => ({ 'reference-only': 'Справочная ссылка · без текста', personal: 'Личный импорт', 'cc-by-4.0': 'Открытый материал · CC BY 4.0' }[usage] || 'Неизвестные условия');
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function view() {
    if (location.protocol === 'file:') return `<section class="panel"><h2>Каталог доступен с сервером</h2><p>Этот HTML-файл — автономная демонстрация. Открой локальное приложение, чтобы искать импортированные материалы.</p><button data-page="spells">8 демо-заклинаний →</button></section>`;
    if (status === 'idle') queueMicrotask(() => load());
    return `<section class="catalog" aria-label="Каталог D&D 2014">
      <div class="notice"><b>D&D 2014 · Каталог пополняется</b><p>${coverage ? `В базе: ${coverage.total}. Справочных ссылок: ${coverage.referenceOnly}, личных записей: ${coverage.personal}, CC BY 4.0: ${coverage.openlyLicensed || 0}.` : 'Полнота базы пока не подтверждена.'} Предметы и артефакты можно добавить в инвентарь из карточки.</p></div>
      <form id="catalog-search" class="catalog-search"><label>Название на русском или английском<input name="q" type="search" maxlength="200" placeholder="Например, Spellcasting" value="${escape(query)}"></label><label>Категория<select name="kind"><option value="">Все категории</option>${Object.entries(names).map(([key, name]) => `<option value="${key}" ${kind === key ? 'selected' : ''}>${name}</option>`).join('')}</select></label><button type="submit" class="primary">Найти</button></form>
      <div id="catalog-results" aria-live="polite" aria-busy="${status === 'loading'}">${results()}</div>
      <div class="catalog-footer"><p>Магия на листе пока использует отдельные демонстрационные данные.</p><button data-page="spells">8 демо-заклинаний →</button><button id="catalog-help">Как добавить материалы</button></div>
    </section>`;
  }
  function results() {
    if (status === 'loading' || status === 'idle') return '<p class="empty">Загружаем каталог…</p>';
    if (status === 'error') return '<div class="empty"><h2>Каталог недоступен</h2><p>Проверь, что локальный сервер запущен. Поиск сохранён — можно повторить запрос.</p><button id="catalog-retry">Повторить</button></div>';
    if (!result?.entries.length) return `<div class="empty"><h2>${query || kind ? 'Ничего не найдено' : 'Каталог пока пуст'}</h2><p>${query || kind ? 'Попробуй другое название или выбери все категории.' : 'Добавь справочные ссылки или личные материалы. Демо-заклинания доступны отдельно.'}</p>${query || kind ? '<button id="catalog-reset">Сбросить поиск</button>' : ''}</div>`;
    return `<p class="catalog-count">Найдено: ${result.total} · ${offset + 1}–${offset + result.entries.length}</p><div class="catalog-grid">${result.entries.map((entry, index) => `<article class="panel catalog-card"><div class="overline">${names[entry.kind]} · 2014</div><h2>${escape(entry.name.ru)}</h2><p>${escape(entry.name.en)}</p><span>${usageLabel(entry.source.usage)}</span><p class="catalog-source">${escape(entry.source.title)}</p><button data-catalog-entry="${index}">Подробнее →</button></article>`).join('')}</div><nav class="catalog-pages" aria-label="Страницы каталога"><button id="catalog-prev" ${offset === 0 ? 'disabled' : ''}>← Назад</button><button id="catalog-next" ${offset + limit >= result.total ? 'disabled' : ''}>Далее →</button></nav>`;
  }
  async function load() {
    const requestId = ++serial;
    status = 'loading'; refresh();
    const params = new URLSearchParams({ q: query, limit: String(limit), offset: String(offset) });
    if (kind) params.set('kind', kind);
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
      if (notice && coverage) notice.textContent = `В базе: ${coverage.total}. Справочных ссылок: ${coverage.referenceOnly}, личных записей: ${coverage.personal}, CC BY 4.0: ${coverage.openlyLicensed || 0}. Предметы и артефакты можно добавить в инвентарь из карточки.`;
    }
  }
  function details(index) {
    const entry = result?.entries[index];
    if (!entry) return;
    trail=[]; showDetails(entry);
  }
  function showDetails(entry, related) {
    const token=++detailSerial; currentEntry=entry;
    if(related)relatedCache.set(entry.id,related);
    // Restrict links again at the rendering boundary, even for previously imported data.
    let source = '';
    try { const url = new URL(entry.source.url); if (['http:', 'https:'].includes(url.protocol)) source = `<a href="${escape(url.href)}" target="_blank" rel="noopener noreferrer">Открыть источник ↗</a>`; } catch {}
    modal(`${trail.length?'<button id="catalog-detail-back">← К предыдущему материалу</button>':''}<div class="overline">${names[entry.kind]} · D&D 2014</div><h2 id="catalog-detail-title" tabindex="-1" autofocus>${escape(entry.name.ru)}</h2><p>${escape(entry.name.en)}</p>${["item", "artifact"].includes(entry.kind) ? '<button id="catalog-add-inventory" class="primary">В инвентарь →</button>' : ''}${entry.kind === "spell" ? '<button id="catalog-add-spell" class="primary">В мой список заклинаний →</button>' : ''}${entry.text ? `<div class="catalog-text">${escape(entry.text)}</div>` : '<p>Здесь сохранена справочная ссылка. Текст материала не импортирован.</p>'}${entry.links?.length?'<section class="catalog-related"><h3>Связанные материалы</h3><div id="catalog-related" aria-live="polite">Загружаем связи…</div></section>':''}<dl class="catalog-meta"><dt>Источник</dt><dd>${escape(entry.source.title)}</dd><dt>Версия</dt><dd>${escape(entry.source.version)}</dd><dt>Использование</dt><dd>${usageLabel(entry.source.usage)}</dd><dt>Условия, указанные при импорте</dt><dd>${escape(entry.source.terms)}</dd>${entry.source.attribution ? `<dt>Атрибуция</dt><dd>${escape(entry.source.attribution)}</dd><dt>Изменения</dt><dd>${escape(entry.source.changes)}</dd>` : ''}</dl>${source}`);
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
  document.addEventListener('submit', event => {
    if (event.target.id !== 'catalog-search') return;
    event.preventDefault();
    const data = new FormData(event.target); query = String(data.get('q')).trim(); kind = String(data.get('kind')); offset = 0; load();
  });
  document.addEventListener('click', event => {
    const button = event.target.closest('button'); if (!button) return;
    if (button.hasAttribute('data-catalog-entry')) details(Number(button.dataset.catalogEntry));
    if(button.dataset.catalogRelated)openRelated(button.dataset.catalogRelated);
    if(button.id==='catalog-related-retry'&&currentEntry)loadRelated(currentEntry,detailSerial);
    if(button.id==='catalog-detail-back'&&trail.length)showDetails(trail.pop());
    if (button.id === 'catalog-retry') load();
    if (button.id === 'catalog-prev' || button.id === 'catalog-next') { offset = Math.max(0, offset + (button.id === 'catalog-prev' ? -limit : limit)); load(); }
    if (button.id === 'catalog-reset') { query = ''; kind = ''; offset = 0; render(); load(); }
    if (button.id === 'catalog-help') modal('<div class="overline">ЛИЧНАЯ БИБЛИОТЕКА</div><h2>Добавление материалов</h2><p>Сейчас материалы добавляются из JSON-файла на компьютере, где запущен сервер. Формат и команды описаны в docs/catalog.md проекта.</p><p>Можно сохранить ссылку или импортировать собственный и разрешённый тебе текст. У каждой записи должны быть источник, версия и редакция 2014.</p><p>Загрузка файла прямо из интерфейса появится в следующем этапе работы с импортом.</p>');
  });
  return { view };
})();
