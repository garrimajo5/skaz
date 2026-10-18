// Transport is separate from the UI. A failed request never looks like a saved change.
const SkazStorage = (() => {
  const demo = location.protocol === 'file:';
  let tabId;
  try {
    tabId = sessionStorage.getItem('skaz-tab-id') || crypto.randomUUID();
    sessionStorage.setItem('skaz-tab-id', tabId);
  } catch { tabId = crypto.randomUUID(); }
  const pendingKey = 'skaz-pending-v1:' + tabId;
  let status = demo ? 'demo' : 'loading';
  let revision = 0;
  let activeContext = null;
  let sessionInfo = null;
  let pending = null;
  let message = '';
  let draftStored = true;
  const clean = value => { const copy = JSON.parse(JSON.stringify(value)); delete copy.theme; return copy; };
  const preference = () => { try { return localStorage.getItem('skaz-theme') || 'polar'; } catch { return 'polar'; } };
  function setTheme(theme) { try { localStorage.setItem('skaz-theme', theme); } catch {} }
  function rememberDraft() {
    try { pending ? localStorage.setItem(pendingKey, JSON.stringify(pending)) : localStorage.removeItem(pendingKey); draftStored = true; }
    catch { draftStored = false; message = 'Черновик остался только в этой вкладке. Скачай его перед закрытием.'; }
  }
  async function request(url, options = {}) {
    const response = await fetch(url, { cache: 'no-store', ...options, signal: AbortSignal.timeout(10000) });
    const payload = await response.json();
    if (!response.ok) { const error = new Error(payload.error || 'Сервер не ответил'); error.status = response.status; throw error; }
    return payload;
  }
  function paint() {
    const box = document.getElementById('sync-status');
    if (!box) return;
    const labels = {
      demo: 'Автономное демо · данные в этом браузере', loading: 'Открываем локальную базу…',
      ready: 'Сохранено на этом компьютере', saving: 'Сохраняем…',
      error: 'Нет связи с локальным сервером', pending: 'Изменение ещё не подтверждено сервером',
      conflict: 'Другая вкладка уже изменила данные',
    };
    box.dataset.status = status;
    box.innerHTML = `<span><span class="sync-dot"></span>${labels[status]}${message ? `<small>${esc(message)}</small>` : ''}</span><div>${['error','pending','conflict'].includes(status) ? `<button id="sync-retry">${pending ? 'Повторить сохранение' : 'Подключиться'}</button>` : ''}${pending ? '<button id="sync-draft">Скачать черновик</button><button id="sync-current">Загрузить актуальное</button>' : ''}<button id="session-settings">Сессии</button><button id="campaign-settings">Кампании</button><button id="data-settings" aria-label="Данные и настройки">Данные и настройки</button></div>`;
  }
  function apply(payload) {
    sessionInfo = payload.session || null;
    adoptContext(payload.context);
    revision = payload.revision;
    state = { ...payload.state, theme: state.theme };
    pending = null; message = ''; status = 'ready'; rememberDraft(); render();
  }
  async function load() {
    status = 'loading'; message = ''; paint();
    try {
      const payload = await request('/api/workspace');
      if (payload.schemaVersion !== 1 || !payload.state) throw new Error('Неподдерживаемая версия сервера');
      revision = payload.revision;
      sessionInfo = payload.session || null;
      adoptContext(payload.context);
      state = { ...payload.state, theme: state.theme };
      try { pending = JSON.parse(localStorage.getItem(pendingKey) || 'null'); } catch { pending = null; }
      status = pending ? 'pending' : 'ready';
      render();
    } catch { status = 'error'; message = 'Запусти приложение командой node scripts/dev.mjs и повтори подключение.'; paint(); }
  }
  async function sendPending() {
    status = 'saving'; message = ''; paint();
    try {
      const { operation, ...body } = pending;
      const url = operation === 'session' ? '/api/sessions' : operation === 'create' ? '/api/campaigns' : operation === 'select' ? '/api/context/select' : '/api/workspace';
      const payload = await request(url, { method: operation ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json', 'X-Skaz-Client': 'local-v1' }, body: JSON.stringify(body) });
      apply(payload);
      return payload;
    } catch (error) {
      status = error.status === 409 ? 'conflict' : 'pending';
      message = !draftStored ? 'Черновик только в памяти вкладки. Скачай его перед закрытием.' : error.status ? error.message : 'Черновик сохранён в браузере. Повторный запрос не применит изменение дважды.';
      if (!error.status) error.message = 'Нет связи с локальным сервером. Черновик можно отправить повторно.';
      paint();
      throw error;
    }
  }
  async function commit(next, label) {
    if (demo) {
      localStorage.setItem('skaz-v1', JSON.stringify(next));
      return;
    }
    if (status !== 'ready') throw new Error('Сначала заверши сохранение или восстанови соединение');
    pending = { mutationId: crypto.randomUUID(), expectedRevision: revision, label, state: clean(next) };
    rememberDraft();
    return sendPending();
  }
  function download(value, filename) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function downloadDraft(draft) {
    if (draft.operation) download({ app: 'skaz-command', command: draft, note: 'Копия команды для сохранности. Повтор выполняется кнопкой в исходной вкладке; это не файл импорта прогресса.' }, 'skaz-pending-command.json');
    else download({ app: 'skaz', schemaVersion: 1, state: draft.state }, 'skaz-unsaved-draft.json');
  }
  function exportState() { download({ app: 'skaz', schemaVersion: 1, exportedAt: new Date().toISOString(), state: clean(state) }, 'skaz-backup.json'); }
  function adoptContext(context) {
    if (activeContext && JSON.stringify(activeContext) !== JSON.stringify(context)) toast('Активная игра изменена');
    activeContext = context || null;
  }
  async function campaignCommand(operation, data) {
    if (demo || status !== 'ready') throw new Error('Сначала сохрани черновик или загрузи актуальные данные');
    pending = { mutationId: crypto.randomUUID(), expectedRevision: revision, ...data, operation };
    rememberDraft();
    closeModal();
    const payload = await sendPending();
    toast(operation === 'session' ? 'Активная сессия: ' + sessionTitle() : 'Активна кампания: ' + payload.state.profile.campaign);
    return payload;
  }
  async function campaigns() {
    if (demo || status !== 'ready') return toast('Кампании доступны после подключения и сохранения черновика');
    modal('<h2>Твои кампании</h2><p>Загружаем список…</p>');
    try {
      const data = await request('/api/campaigns');
      modal(`<div class="overline">D&D 2014 · ЛОКАЛЬНЫЕ ИГРЫ</div><h2>Твои кампании</h2><p>Активная игра общая для всех вкладок. Прогресс каждой кампании хранится отдельно.</p><div class="settings-actions">${data.campaigns.map((game, index) => `<div class="panel"><h3>${esc(game.name)}</h3><p>${esc(game.characters.map(c => c.name).join(', '))}</p><button data-game="${index}" ${game.id === activeContext?.campaignId ? 'disabled' : ''}>${game.id === activeContext?.campaignId ? 'Активна' : 'Открыть кампанию'}</button></div>`).join('')}<button id="new-campaign" class="primary">Создать из демо-шаблона</button></div>`);
      $$('[data-game]').forEach(button => button.onclick = async () => {
        const game = data.campaigns[Number(button.dataset.game)];
        if (game.characters.length !== 1 || game.sessions.length !== 1) return toast('Выбор нескольких персонажей и сессий пока не поддерживается');
        try { await campaignCommand('select', { context: { campaignId: game.id, characterId: game.characters[0].id, sessionId: game.sessions[0].id } }); }
        catch (error) { toast(error.message); }
      });
      $('#new-campaign').onclick = () => {
        modal('<div class="overline">ДЕМО-ШАБЛОН · БАРД 5 УРОВНЯ</div><h2>Новое приключение</h2><p>Новая игра начнётся с ресурсов демо-барда, восьми примеров заклинаний и демонстрационных сюжета, заданий и карты. Твои записи из текущей кампании не копируются.</p><form id="create-campaign-form"><label for="new-campaign-name">Название кампании</label><input id="new-campaign-name" maxlength="120" required><label for="new-hero-name">Имя персонажа</label><input id="new-hero-name" maxlength="80" required><div class="dialog-actions"><button type="submit" class="primary">Создать и открыть</button></div></form>');
        $('#create-campaign-form').onsubmit = async event => {
          event.preventDefault();
          const campaign = $('#new-campaign-name').value.trim(), name = $('#new-hero-name').value.trim();
          if (!campaign || !name) return toast('Заполни название и имя');
          const next = clean(structuredClone(initial)); next.profile = { name, campaign, tagline: '' };
          try { await campaignCommand('create', { state: next }); } catch (error) { toast(error.message); }
        };
      };
    } catch { modal('<h2>Не удалось загрузить кампании</h2><p>Проверь соединение и открой список снова.</p>'); }
  }
  function sessionTitle() { return sessionInfo?.name || (demo ? 'Демонстрационная сессия' : 'Сессия без названия'); }
  async function sessions() {
    if (demo || status !== 'ready' || !activeContext) return toast('Сессии доступны после подключения и сохранения черновика');
    const key = JSON.stringify(activeContext);
    modal('<h2>Сессии кампании</h2><p>Загружаем журнал…</p>');
    try {
      const { sessions: list } = await request('/api/campaigns/' + activeContext.campaignId + '/sessions');
      if (key !== JSON.stringify(activeContext)) return;
      modal(`<div class="overline">${esc(state.profile.campaign)}</div><h2>Сессии кампании</h2><div class="settings-actions">${list.slice().reverse().map((item, i) => `<section class="panel"><h3>${esc(item.name || 'Сессия без названия')}</h3><p>${esc(item.playedOn || 'Дата не указана')} · ${item.archived ? 'Архив' : 'Текущая'}</p><button data-session-view="${list.length - 1 - i}">Читать журнал</button></section>`).join('')}<button id="new-session" class="primary">Начать следующую сессию</button></div>`);
      $$('[data-session-view]').forEach(button => button.onclick = async () => {
        try {
          const item = await request('/api/sessions/' + list[Number(button.dataset.sessionView)].id);
          modal(`<div class="overline">${item.archived ? 'АРХИВ' : 'ПРОСМОТР'} · ТОЛЬКО ЧТЕНИЕ</div><h2>${esc(item.name || 'Сессия без названия')}</h2><p>${esc(item.playedOn || 'Дата не указана')}. Просмотр не меняет активную игру и ресурсы персонажа. Личные заметки персонажа сюда не входят.</p>${item.data.journal.map(entry => `<article class="panel"><small>${esc(entry.time)}</small><h3>${esc(entry.title)}</h3><p class="session-text">${esc(entry.text)}</p></article>`).join('') || '<p>В этой сессии нет сохранённых записей.</p>'}<button id="back-sessions">К списку сессий</button>`);
          $('#back-sessions').onclick = sessions;
        } catch { toast('Не удалось открыть журнал'); }
      });
      $('#new-session').onclick = () => {
        modal('<h2>Следующая сессия</h2><p>Текущий журнал станет архивом только для чтения. Ресурсы персонажа, карта, задания и личные заметки сохранятся. Это не отдых. Новый журнал будет пустым.</p><form id="new-session-form"><label for="session-name">Название</label><input id="session-name" maxlength="120" required><label for="session-date">Дата игры</label><input id="session-date" type="date" required><div class="dialog-actions"><button type="submit" class="primary">Завершить текущую и начать</button></div></form>');
        $('#new-session-form').onsubmit = async event => {
          event.preventDefault();
          const name = $('#session-name').value.trim(), playedOn = $('#session-date').value;
          if (!name || !playedOn) return toast('Укажи название и дату');
          try { await campaignCommand('session', { session: { name, playedOn } }); } catch (error) { toast(error.message); }
        };
      };
    } catch { modal('<h2>Сессии недоступны</h2><p>Проверь соединение и открой список снова.</p>'); }
  }
  function settings() {
    modal(`<div class="overline">СКАЗ · ЛОКАЛЬНАЯ ВЕРСИЯ 0.2</div><h2>Данные приключения</h2><p>${demo ? 'Этот HTML-файл работает в демонстрационном режиме. Для сохранения в базе открой локальное приложение.' : 'Прогресс хранится в SQLite на этом компьютере. Тема выбирается отдельно для каждого браузера.'}</p><div class="settings-actions"><button id="export-state">Скачать прогресс</button><label class="file-label">Восстановить из файла<input id="import-state" type="file" accept=".json,application/json"></label><button id="import-old">Перенести данные раннего прототипа</button>${!demo ? '<button id="change-history">История сохранений</button><button id="saved-drafts">Несохранённые черновики</button>' : ''}</div><p>Каждая кампания использует шаблон барда 5 уровня. В магии доступны 8 демонстрационных заклинаний. Распознавание речи пока демонстрационное.</p><button class="text-button" id="reset-workspace">Начать демо заново</button>`);
    $('#export-state').onclick = exportState;
    if ($('#saved-drafts')) $('#saved-drafts').onclick = () => {
      const drafts = [];
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key.startsWith('skaz-pending-v1:')) {
            try { const value = JSON.parse(localStorage.getItem(key)); if (value?.state || value?.operation) drafts.push(value); } catch {}
          }
        }
      } catch { toast('Хранилище браузера недоступно'); return; }
      modal(`<h2>Несохранённые черновики</h2><p>Здесь остаются черновики закрытых вкладок. Прогресс можно скачать и восстановить импортом. Копии команд создания и переключения — только для сохранности; повтор доступен в исходной вкладке.</p>${drafts.map((draft, i) => `<div class="list-row"><strong>${esc(draft.label || (draft.operation === 'session' ? 'Начало сессии' : draft.operation === 'select' ? 'Переключение кампании' : 'Создание кампании'))}</strong><button data-draft-index="${i}">Скачать</button></div>`).join('') || '<p>Несохранённых черновиков нет.</p>'}`);
      $$('[data-draft-index]').forEach(button => button.onclick = () => downloadDraft(drafts[Number(button.dataset.draftIndex)]));
    };
    $('#import-state').onchange = async event => {
      const file = event.target.files[0]; if (!file) return;
      try {
        if (file.size > 512 * 1024) throw new Error('Максимальный размер файла — 512 КБ');
        previewImport(JSON.parse(await file.text()));
      } catch (error) { toast(error.message || 'Не удалось прочитать файл'); }
    };
    $('#import-old').onclick = () => {
      try {
        const previous = JSON.parse(localStorage.getItem('skaz-v1') || 'null');
        if (!previous) return toast('В этом браузере нет сохранения раннего прототипа');
        previewImport({ app: 'skaz', schemaVersion: 1, state: clean({ ...initial, ...previous }) });
      } catch { toast('Не удалось прочитать старое сохранение'); }
    };
    if ($('#change-history')) $('#change-history').onclick = async () => {
      try {
        const { changes } = await request('/api/history');
        modal(`<div class="overline">ПОСЛЕДНИЕ 50 СОХРАНЕНИЙ</div><h2>История изменений</h2>${changes.map(item => `<div class="list-row"><div><strong>${esc(item.label)}</strong><small>${esc(new Date(item.createdAt).toLocaleString('ru-RU'))} · версия ${item.revision}</small></div></div>`).join('') || '<p>Изменений ещё нет.</p>'}`);
      } catch { toast('Не удалось загрузить историю'); }
    };
    $('#reset-workspace').onclick = () => {
      modal('<h2>Начать демо заново?</h2><p>Текущий прогресс будет заменён исходным примером. Сначала можно скачать копию. Сброс сохраняется в истории.</p><div class="dialog-actions"><button id="backup-first">Скачать копию</button><button id="confirm-reset" class="primary">Сбросить</button></div>');
      $('#backup-first').onclick = exportState;
      $('#confirm-reset').onclick = () => { closeModal(); change('Демонстрация начата заново', () => { state = { ...structuredClone(initial), theme: state.theme }; }); };
    };
  }
  function previewImport(data) {
    if (data?.app !== 'skaz' || data.schemaVersion !== 1 || !data.state?.profile || typeof data.state.profile.name !== 'string') throw new Error('Это не файл сохранения СКАЗ версии 1');
    modal(`<div class="overline">ВОССТАНОВЛЕНИЕ ПРОГРЕССА</div><h2>${esc(data.state.profile.name)}</h2><p>Файл заменит данные активной кампании «${esc(state.profile.campaign)}»: персонажа, журнал, этапы заданий и заметки карты. Тема останется прежней. Сервер проверит данные перед записью.</p><div class="dialog-actions"><button id="import-backup-first">Скачать текущие</button><button class="primary" id="confirm-import">Восстановить</button></div>`);
    $('#import-backup-first').onclick = exportState;
    $('#confirm-import').onclick = () => {
      if (demo) return toast('Восстановление доступно в локальном приложении с сервером');
      closeModal(); change('Прогресс восстановлен', () => { state = { ...data.state, theme: state.theme }; });
    };
  }
  document.addEventListener('click', async event => {
    const id = event.target.closest('button')?.id;
    if (id === 'session-settings') sessions();
    if (id === 'campaign-settings') campaigns();
    if (id === 'data-settings') settings();
    if (id === 'sync-retry') { try { pending ? await sendPending() : await load(); } catch {} }
    if (id === 'sync-draft' && pending) downloadDraft(pending);
    if (id === 'sync-current' && pending) {
      modal('<h2>Загрузить актуальные данные?</h2><p>Неотправленный черновик будет убран из очереди. Сначала скачай его, если хочешь сохранить изменения отдельно.</p><div class="dialog-actions"><button id="keep-draft">Скачать черновик</button><button id="discard-draft">Загрузить актуальное</button></div>');
      $('#keep-draft').onclick = () => downloadDraft(pending);
      $('#discard-draft').onclick = async () => { pending = null; rememberDraft(); closeModal(); await load(); };
    }
  });
  window.addEventListener('beforeunload', event => { if (status === 'saving') { event.preventDefault(); event.returnValue = ''; } });
  return { commit, paint, settings, preference, setTheme, sessionTitle, sessionDate: () => sessionInfo?.playedOn || '', contextKey: () => JSON.stringify(activeContext), editable: () => ['ready', 'demo'].includes(status), boot: () => demo ? paint() : load() };
})();
