const SkazMap = (() => {
  let contextKey = '';
  let key = '', serial = 0, status = 'idle', data = [], error = '', selected = null;
  let query = '', visited = 'all', offset = 0;
  const limit = 20;
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function view() {
    const current = SkazStorage.snapshotKey();
    if (current !== key) { const nextContext = SkazStorage.contextKey(); if (contextKey !== nextContext) { selected = null; offset = 0; } contextKey = nextContext; key = current; status = 'idle'; data = []; ++serial; }
    if (status === 'idle') { status = 'loading'; queueMicrotask(load); }
    return `<section id="campaign-map" aria-label="Места кампании"><div class="map-toolbar"><div><h2>Места кампании</h2><p>Твоя схема известных мест. Масштаб и расстояния условные.</p></div><button id="new-place" class="primary">Новое место</button></div><form id="map-search" class="map-search"><label>Найти место<input name="q" type="search" maxlength="200" value="${escape(query)}" placeholder="Название или заметка"></label><label>Посещение<select name="visited"><option value="all">Все места</option><option value="yes" ${visited === 'yes' ? 'selected' : ''}>Посещённые</option><option value="no" ${visited === 'no' ? 'selected' : ''}>Ещё не посещённые</option></select></label><button type="submit">Найти</button></form><div id="map-results" aria-live="polite" aria-busy="${status === 'loading'}">${results()}</div></section>`;
  }
  function filtered() { const q = query.toLocaleLowerCase('ru'); return data.filter(p => (visited === 'all' || p.visited === (visited === 'yes')) && (p.title + ' ' + p.description).toLocaleLowerCase('ru').includes(q)); }
  function results() {
    if (status === 'loading') return '<p class="empty">Открываем карту…</p>';
    if (status === 'error') return `<div class="panel"><h3>Карта недоступна</h3><p>${escape(error)}</p><button id="map-retry">Повторить</button></div>`;
    const matches = filtered(), slice = matches.slice(offset,offset+limit);
    if (!slice.length) return `<div class="panel"><h3>${data.length ? 'Места не найдены' : 'Начни свою карту'}</h3><p>${data.length ? 'Измени название или фильтр посещения.' : 'Добавь поселение, ориентир или опасное место и запиши, что о нём известно.'}</p></div>`;
    const chosen = slice.find(p => p.id === selected);
    return `<div class="personal-map-layout"><div><div class="personal-map" aria-label="Схема мест"><span class="map-north">СЕВЕР ↑</span><div class="map-points">${slice.map((p,i) => `<button class="personal-map-point ${p.id === selected ? 'selected' : ''} ${p.visited ? 'visited' : ''}" style="left:${p.x}%;top:${p.y}%" data-map-select="${escape(p.id)}" aria-label="${escape(p.title)}${p.visited ? ', посещено' : ''}" aria-pressed="${p.id === selected}">${offset+i+1}</button>`).join('')}</div></div><p>На схеме показаны места текущей страницы. Номера соответствуют списку.</p></div><div class="map-place-details">${chosen ? `<article class="panel"><h3 id="selected-place-title" tabindex="-1">${escape(chosen.title)}</h3><span class="tag">${chosen.visited ? 'Посещено' : 'Ещё не посещено'}</span><p class="session-text">${escape(chosen.description || 'Заметок пока нет.')}</p>${chosen.importedFrom ? '<p>Перенесено из другой игры. Происхождение сохранено.</p>' : ''}<button data-map-edit="${escape(chosen.id)}">Изменить место</button></article>` : '<div class="panel"><h3>Что здесь известно?</h3><p>Выбери отметку на схеме или место в списке.</p></div>'}</div></div><div class="map-place-list">${slice.map((p,i) => `<button class="map-list-place ${p.id === selected ? 'selected' : ''}" data-map-select="${escape(p.id)}" aria-pressed="${p.id === selected}"><span class="map-list-number">${offset+i+1}</span><span><strong>${escape(p.title)}</strong><small>${p.visited ? 'Посещено' : 'Ещё не посещено'}</small></span><span aria-hidden="true">→</span></button>`).join('')}</div><div class="map-pagination"><button id="map-prev" ${offset === 0 ? 'disabled' : ''}>Назад</button><span>${offset+1}–${Math.min(offset+limit,matches.length)} из ${matches.length}</span><button id="map-next" ${offset+limit >= matches.length ? 'disabled' : ''}>Дальше</button></div>`;
  }
  function refresh() {
    if (key !== SkazStorage.snapshotKey()) return;
    const region = document.getElementById('map-results');
    if (region) { region.innerHTML = results(); region.setAttribute('aria-busy',String(status === 'loading')); }
  }
  async function load() {
    const requestId = ++serial, requestedKey = SkazStorage.snapshotKey(); status = 'loading'; refresh();
    try {
      const result = await SkazStorage.placesData();
      if (requestId !== serial || requestedKey !== SkazStorage.snapshotKey()) return;
      data = result.places; status = 'ready'; offset = Math.min(offset, Math.floor(Math.max(0,filtered().length-1)/limit)*limit);
    } catch (e) { if (requestId !== serial || requestedKey !== SkazStorage.snapshotKey()) return; status = 'error'; error = e.message || 'Проверь соединение'; }
    refresh();
  }
  document.addEventListener('submit', event => {
    if (event.target.id !== 'map-search') return;
    event.preventDefault(); query = event.target.elements.q.value.trim(); visited = event.target.elements.visited.value; offset = 0; selected = null; refresh();
  });
  document.addEventListener('click', event => {
    const target = event.target.closest('button'); if (!target) return;
    if (target.id === 'new-place') return SkazStorage.editPlace();
    if (target.id === 'map-retry') return load();
    if (key !== SkazStorage.snapshotKey()) return;
    if (target.id === 'map-prev') { offset = Math.max(0,offset-limit); selected = null; refresh(); }
    if (target.id === 'map-next') { if (offset+limit < filtered().length) offset += limit; selected = null; refresh(); }
    if (target.dataset.mapSelect) { selected = target.dataset.mapSelect; refresh(); const title = document.getElementById('selected-place-title'); title?.focus({ preventScroll: true }); document.querySelector('.map-place-details')?.scrollIntoView({ block: 'nearest', behavior: 'instant' }); }
    if (target.dataset.mapEdit) { const place = data.find(p => p.id === target.dataset.mapEdit); if (place) SkazStorage.editPlace(place); }
  });
  return { view };
})();
