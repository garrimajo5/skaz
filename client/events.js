const SkazEvents = (() => {
  const labels = { pending: 'Ждёт подтверждения', accepted: 'Записано', dismissed: 'Пропущено' };
  let key = '', context = '', serial = 0, status = 'idle', data = [], error = '', filter = 'pending', offset = 0;
  const limit = 10;
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function pendingCount() { return key === SkazStorage.snapshotKey() && status === 'ready' ? data.filter(p => p.status === 'pending').length : null; }
  function view() {
    const current = SkazStorage.snapshotKey();
    if (key !== current) { const nextContext = SkazStorage.contextKey(); if (context !== nextContext) { context = nextContext; offset = 0; filter = 'pending'; } key = current; ++serial; status = 'idle'; data = []; }
    if (status === 'idle') { status = 'loading'; queueMicrotask(load); }
    return `<section class="session-events" aria-label="Предложения событий"><div class="map-toolbar"><div><h2>События на проверку</h2><p>Из ручного фрагмента разговора — в подтверждённую запись.</p></div><button id="new-proposal" class="primary">Событие из текста</button></div><p class="notice">Пока это ручной ввод и проверка. Запись звука и автоматическое распознавание ещё не подключены.</p><label class="events-filter">Показать<select id="proposal-filter">${Object.entries(labels).map(([value,label])=>`<option value="${value}" ${filter===value?'selected':''}>${label}</option>`).join('')}</select></label><div id="proposal-results" aria-live="polite" aria-busy="${status==='loading'}">${results()}</div></section>`;
  }
  function results() {
    if(status==='loading') return '<p class="empty">Открываем события…</p>';
    if(status==='error') return `<div class="panel"><h3>События недоступны</h3><p>${escape(error)}</p><button id="proposals-retry">Повторить</button></div>`;
    const items = data.filter(p=>p.status===filter); offset = Math.min(offset, Math.max(0, Math.floor((items.length-1)/limit)*limit)); const slice = items.slice(offset,offset+limit);
    if(!slice.length) return `<div class="panel"><h3>${filter==='pending'?'Нет событий на проверку':'Здесь пока нет событий'}</h3><p>Предложения относятся к текущей сессии и выбранному персонажу.</p></div>`;
    return `<div class="personal-quest-grid">${slice.map(p=>`<article class="panel"><span class="tag">${labels[p.status]} · ${p.suggestion.kind==='journal'?'Сюжет':'Личное'}</span>${p.importedFrom?'<span class="tag">Перенесено из другой игры</span>':''}<h3>${escape((p.appliedEntry||p.suggestion).title)}</h3><p class="session-text">${escape((p.appliedEntry||p.suggestion).text)}</p><details><summary>Исходная фраза · ${Math.floor(p.source.offsetMs/60000)} мин.</summary><blockquote class="source session-text">${escape(p.source.text)}</blockquote><p>${escape(p.source.speaker||'Говорящий не указан')}</p></details>${p.status==='pending'?`<button class="primary" data-review-proposal="${escape(p.id)}">Проверить и решить</button>`:''}</article>`).join('')}</div><div class="map-pagination"><button id="proposals-prev" ${offset===0?'disabled':''}>Назад</button><span>${offset+1}–${Math.min(offset+limit,items.length)} из ${items.length}</span><button id="proposals-next" ${offset+limit>=items.length?'disabled':''}>Дальше</button></div>`;
  }
  function refresh() {
    if(key!==SkazStorage.snapshotKey())return;
    const region=document.getElementById('proposal-results');if(region){region.innerHTML=results();region.setAttribute('aria-busy',String(status==='loading'));}
    const badge=document.getElementById('pending-count');if(badge)badge.textContent=String(pendingCount() ?? '—');
  }
  async function load() {
    const n=++serial, requestedKey=SkazStorage.snapshotKey();status='loading';refresh();
    try {const result=await SkazStorage.proposalsData();if(n!==serial||requestedKey!==SkazStorage.snapshotKey())return;data=result.proposals;status='ready';}
    catch(e){if(n!==serial||requestedKey!==SkazStorage.snapshotKey())return;error=e.message||'Проверь соединение';status='error';}
    refresh();
  }
  document.addEventListener('change',event=>{if(event.target.id==='proposal-filter'){filter=event.target.value;offset=0;refresh();}});
  document.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.id==='new-proposal')return SkazStorage.newProposal();
    if(button.id==='proposals-retry')return load();
    if(key!==SkazStorage.snapshotKey())return;
    if(button.id==='proposals-prev'){offset=Math.max(0,offset-limit);refresh();}
    if(button.id==='proposals-next'){if(offset+limit<data.filter(p=>p.status===filter).length)offset+=limit;refresh();}
    if(button.dataset.reviewProposal){const item=data.find(p=>p.id===button.dataset.reviewProposal);if(item)SkazStorage.reviewProposal(item);}
  });
  return { view, pendingCount };
})();
