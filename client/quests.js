const SkazQuests = (() => {
  const labels = { active: 'В процессе', completed: 'Завершено', failed: 'Не выполнено' };
  let contextKey = '', focusStep = null;
  let key = '', serial = 0, status = 'idle', data = [], error = '', query = '', filter = 'all', offset = 0;
  const limit = 12;
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function view() {
    const current = SkazStorage.snapshotKey();
    if (key !== current) { const nextContext = SkazStorage.contextKey(); if (contextKey !== nextContext) { offset = 0; focusStep = null; } contextKey = nextContext; key = current; ++serial; status = 'idle'; data = []; }
    if (status === 'idle') { status = 'loading'; queueMicrotask(load); }
    return `<section aria-label="Задания кампании"><div class="map-toolbar"><div><h2>Задания кампании</h2><p>Зацепки, обещания и личные цели.</p></div><button id="create-personal-quest" class="primary">Новое задание</button></div><form id="personal-quest-search" class="map-search"><label>Найти задание<input name="q" type="search" maxlength="200" value="${escape(query)}" placeholder="Название, заметка или этап"></label><label>Статус<select name="status"><option value="all">Все задания</option>${Object.entries(labels).map(([value,label]) => `<option value="${value}" ${value === filter ? 'selected' : ''}>${label}</option>`).join('')}</select></label><button type="submit">Найти</button></form><div id="personal-quest-results" aria-live="polite" aria-busy="${status === 'loading'}">${results()}</div><p class="quest-help">${(SkazStorage.can?.('shared')??true)?'Отмечай этапы прямо здесь. Статус задания и награды меняются отдельно.':'Общие задания и отметки этапов меняет мастер или владелец.'}</p></section>`;
  }
  function filtered() {
    const q = query.toLocaleLowerCase('ru');
    return data.filter(item => (filter === 'all' || item.status === filter) && [item.title,item.description,...item.steps.map(s => s.title)].join(' ').toLocaleLowerCase('ru').includes(q));
  }
  function stepRow(quest,step) {
    return `<label class="quest-check"><input type="checkbox" data-personal-step="${escape(step.id)}" data-personal-quest="${escape(quest.id)}" ${step.done ? 'checked' : ''} ${(SkazStorage.can?.('shared')??SkazStorage.editable()) ? '' : 'disabled'}><span>${escape(step.title)}</span></label>`;
  }
  function results() {
    if (status === 'loading') return '<p class="empty">Открываем задания…</p>';
    if (status === 'error') return `<div class="panel"><h3>Задания недоступны</h3><p>${escape(error)}</p><button id="quests-retry">Повторить</button></div>`;
    const matches = filtered(), slice = matches.slice(offset,offset+limit);
    if (!slice.length) return `<div class="panel"><h3>${data.length ? 'Задания не найдены' : 'Первая нить приключения'}</h3><p>${data.length ? 'Попробуй другой запрос или статус.' : 'Добавь обещание, зацепку или личную цель. Здесь будут только твои записи.'}</p></div>`;
    return `<div class="personal-quest-grid">${slice.map(q => `<article class="panel personal-quest-card"><div class="quest-card-top"><span class="tag">${labels[q.status]}</span><span>${q.steps.filter(s => s.done).length}/${q.steps.length} этапов</span></div><h3>${escape(q.title)}</h3>${q.description ? `<p class="session-text">${escape(q.description)}</p>` : ''}<div class="personal-quest-steps">${q.steps.slice(0,3).map(step => stepRow(q,step)).join('')}${q.steps.length > 3 ? `<details><summary>Ещё ${q.steps.length-3} этапов</summary>${q.steps.slice(3).map(step => stepRow(q,step)).join('')}</details>` : ''}</div>${q.importedFrom ? '<p class="quest-origin">Перенесено из другой игры</p>' : ''}<button data-personal-edit="${escape(q.id)}">Изменить задание</button></article>`).join('')}</div><div class="map-pagination"><button id="quests-prev" ${offset === 0 ? 'disabled' : ''}>Назад</button><span>${offset+1}–${Math.min(offset+limit,matches.length)} из ${matches.length}</span><button id="quests-next" ${offset+limit >= matches.length ? 'disabled' : ''}>Дальше</button></div>`;
  }
  function refresh() {
    if (key !== SkazStorage.snapshotKey()) return;
    const region = document.getElementById('personal-quest-results');
    if (region) { region.innerHTML = results(); SkazStorage.decorate?.(region); region.setAttribute('aria-busy',String(status === 'loading')); }
  }
  async function load() {
    const requestId = ++serial, requestedKey = SkazStorage.snapshotKey(); status = 'loading'; refresh();
    try {
      const result = await SkazStorage.questsData();
      if (requestId !== serial || requestedKey !== SkazStorage.snapshotKey()) return;
      data = result.quests; status = 'ready'; offset = Math.min(offset, Math.floor(Math.max(0,filtered().length-1)/limit)*limit);
    } catch (e) { if (requestId !== serial || requestedKey !== SkazStorage.snapshotKey()) return; status = 'error'; error = e.message || 'Проверь соединение'; }
    refresh();
    if (focusStep) { const input = document.querySelector(`[data-personal-quest="${focusStep.quest}"][data-personal-step="${focusStep.step}"]`); const details = input?.closest?.('details'); if (details) details.open = true; input?.focus({ preventScroll: true }); focusStep = null; }
  }
  document.addEventListener('submit', event => {
    if (event.target.id !== 'personal-quest-search') return;
    event.preventDefault(); query = event.target.elements.q.value.trim(); filter = event.target.elements.status.value; offset = 0; refresh();
  });
  document.addEventListener('click', event => {
    const target = event.target.closest('button'); if (!target) return;
    if (target.id === 'create-personal-quest') return SkazStorage.editQuest();
    if (target.id === 'quests-retry') return load();
    if (key !== SkazStorage.snapshotKey()) return;
    if (target.id === 'quests-prev') { offset = Math.max(0,offset-limit); refresh(); }
    if (target.id === 'quests-next') { if (offset+limit < filtered().length) offset += limit; refresh(); }
    if (target.dataset.personalEdit) { const item = data.find(q => q.id === target.dataset.personalEdit); if (item) SkazStorage.editQuest(item); }
  });
  document.addEventListener('change', async event => {
    const input = event.target;
    if (!input.dataset.personalStep) return;
    const quest = data.find(q => q.id === input.dataset.personalQuest), step = quest?.steps.find(s => s.id === input.dataset.personalStep);
    if (!step) return;
    focusStep = { quest: quest.id, step: step.id };
    const done = input.checked; input.checked = step.done; input.disabled = true;
    try { await SkazStorage.setQuestStep(quest, step.id, done, key); }
    catch (e) { toast(e.message || 'Не удалось сохранить этап'); refresh(); }
  });
  return { view };
})();
