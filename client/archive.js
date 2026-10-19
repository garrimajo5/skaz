const SkazArchive = (() => {
  let serial = 0, key = '', data = null, section = 'journal', query = '', status = 'all', offset = 0, back;
  const limit = 10;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const normalize = value => String(value).toLocaleLowerCase('ru').replaceAll('ё','е');
  const statusLabel = item => item.status === 'accepted' ? 'Записано' : item.status === 'dismissed' ? 'Пропущено' : data.session.archived ? 'Не разобрано до завершения' : 'Ждёт подтверждения';
  function results() {
    const events = section === 'events';
    const all = events ? data.proposals : data.session.data.journal;
    const items = all.filter(item => (!events || status === 'all' || item.status === status) && normalize(events ? [item.source.text,item.source.speaker,item.suggestion.title,item.suggestion.text,item.appliedEntry?.title,item.appliedEntry?.text].join(' ') : item.title+' '+item.text).includes(normalize(query)));
    offset = Math.min(offset, Math.max(0, Math.floor((items.length-1)/limit)*limit));
    if (!items.length) return '<p class="empty">По этим условиям записей нет.</p>';
    return items.slice(offset,offset+limit).map(item => {
      if (!events) return `<article class="panel"><small>${escape(item.time)}</small><h3>${escape(item.title)}</h3><p class="session-text">${escape(item.text)}</p></article>`;
      const entry = item.appliedEntry || item.suggestion;
      return `<article class="panel"><span class="tag">${statusLabel(item)}</span><span class="tag">${item.suggestion.kind==='journal'?'Журнал сессии':'Личная заметка'}</span>${item.importedFrom?'<span class="tag">Перенесено из другой игры</span>':''}<h3>${escape(entry.title)}</h3><p class="session-text">${escape(entry.text)}</p><details><summary>Исходная фраза · ${Math.floor(item.source.offsetMs/60000)} мин.</summary><blockquote class="source session-text">${escape(item.source.text)}</blockquote><p>${escape(item.source.speaker||'Говорящий не указан')}</p><p>Первоначальное предложение: ${escape(item.suggestion.title)}</p><p class="session-text">${escape(item.suggestion.text)}</p></details></article>`;
    }).join('')+`<div class="map-pagination"><button id="archive-prev" ${offset===0?'disabled':''}>Назад</button><span>${offset+1}–${Math.min(offset+limit,items.length)} из ${items.length}</span><button id="archive-next" ${offset+limit>=items.length?'disabled':''}>Дальше</button></div>`;
  }
  function refresh() {
    const region = document.getElementById('archive-results');
    if (!region || !data) return;
    if (key !== SkazStorage.snapshotKey()) { region.innerHTML='<p class="notice">Игра изменилась. Вернись к списку сессий и открой архив заново.</p>'; return; }
    region.innerHTML = results();
  }
  function draw() {
    modal(`<div class="overline">${data.session.archived?'АРХИВ':'ПРОСМОТР'} · ТОЛЬКО ЧТЕНИЕ</div><h2>${escape(data.session.name||'Сессия без названия')}</h2><p>${escape(data.session.playedOn||'Дата не указана')} · ${escape(data.characterName)}</p><p>Журнал общий для сессии. Исходные события показаны только для выбранного персонажа. Просмотр не меняет игру и не применяет события повторно.</p><div class="archive-controls"><label>Раздел<select id="archive-section"><option value="journal" ${section==='journal'?'selected':''}>Журнал (${data.session.data.journal.length})</option><option value="events" ${section==='events'?'selected':''}>Исходные события (${data.proposals.length})</option></select></label><label>Поиск<input type="search" id="archive-search" maxlength="200" value="${escape(query)}" placeholder="Текст, имя или зацепка"></label>${section==='events'?`<label>Решение<select id="archive-status"><option value="all">Все</option><option value="pending">Не разобрано</option><option value="accepted">Записано</option><option value="dismissed">Пропущено</option></select></label>`:''}</div><div id="archive-results" class="settings-actions" aria-live="polite">${results()}</div><button id="back-sessions">К списку сессий</button>`);
  }
  async function open(id, returnToSessions) {
    const n = ++serial; key = SkazStorage.snapshotKey(); const requestedKey = key;
    back = returnToSessions; data = null; section='journal';query='';status='all';offset=0;
    modal('<h2>Открываем сессию…</h2><div id="archive-loading" role="status">Загружаем журнал и источники.</div>');
    try {
      const result = await SkazStorage.sessionReviewData(id);
      if (n !== serial || requestedKey !== SkazStorage.snapshotKey() || !document.getElementById('archive-loading') || !document.getElementById('dialog')?.open) return;
      data = result; draw();
    } catch(error) {
      if (n !== serial || !document.getElementById('archive-loading') || !document.getElementById('dialog')?.open) return;
      modal(`<h2>Не удалось открыть сессию</h2><p>${escape(error.message)}</p><button id="back-sessions">К списку сессий</button>`);
    }
  }
  document.addEventListener('change',event=>{
    if(event.target.id==='archive-section'){section=event.target.value;offset=0;status='all';draw();}
    if(event.target.id==='archive-status'){status=event.target.value;offset=0;refresh();}
  });
  document.addEventListener('input',event=>{if(event.target.id==='archive-search'){query=event.target.value;offset=0;refresh();}});
  document.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.id==='back-sessions'){++serial;return back?.();}
    if(button.id==='archive-prev'){offset=Math.max(0,offset-limit);refresh();}
    if(button.id==='archive-next'){offset+=limit;refresh();}
  });
  return {open};
})();
