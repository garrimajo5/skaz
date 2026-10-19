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
      const url = operation === 'spell-set' ? '/api/spellbook' : operation === 'import-active' ? '/api/import/active' : operation === 'inventory-remove' ? '/api/inventory/remove' : operation === 'inventory-undo' ? '/api/inventory/undo' : operation === 'inventory-add' ? '/api/inventory' : operation === 'session' ? '/api/sessions' : operation === 'create' ? '/api/campaigns' : operation === 'select' ? '/api/context/select' : '/api/workspace';
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
  async function exportActive() {
    if (demo || status !== 'ready') return toast('Сначала сохрани черновик или загрузи актуальные данные');
    const key = JSON.stringify(activeContext), version = revision;
    try {
      const file = await request('/api/export/active-v3');
      if (key !== JSON.stringify(activeContext) || version !== revision || JSON.stringify(file.source?.context) !== key || file.source?.revision !== version) return toast('Игра изменилась. Обнови страницу перед экспортом.');
      download(file, 'skaz-active-v3.json');
    } catch (error) { toast(error.message || 'Не удалось скачать игру'); }
  }
  function previewActive(file) {
    if (demo || status !== 'ready') return toast('Импорт доступен после подключения и сохранения черновика');
    if (file.ruleset !== '5e-2014' || file.scope !== 'active-game' || typeof file.state?.profile?.name !== 'string' || typeof file.state?.profile?.campaign !== 'string' || !Array.isArray(file.inventory) || !Array.isArray(file.catalog?.entries)) throw new Error('Неверный файл игры v2/v3');
    if (file.schemaVersion === 3 && !Array.isArray(file.spellbook)) throw new Error('В файле v3 отсутствует список заклинаний');
    const key = JSON.stringify(activeContext), version = revision;
    modal(`<div class="overline">ПЕРЕНОС D&D 2014 · НОВАЯ КАМПАНИЯ</div><h2>${esc(file.state.profile.campaign)}</h2><p>Персонаж: ${esc(file.state.profile.name)}. Видов предметов: ${file.inventory.length}. Материалов каталога: ${file.catalog.entries.length}. Заклинаний: ${file.schemaVersion === 3 ? file.spellbook.length : 'не включены в v2'}.</p><p>Будет создана и открыта новая кампания. Существующие игры сохранятся. В файле только текущая сессия: архивы и история не переносятся. Сервер проверит данные и источники; конфликт отменит весь импорт.</p><div class="dialog-actions"><button id="confirm-active-import" class="primary">Создать новую кампанию из файла</button></div>`);
    $('#confirm-active-import').onclick = async () => {
      if (key !== JSON.stringify(activeContext) || version !== revision) return toast('Игра изменилась. Выбери файл заново.');
      try { await campaignCommand('import-active', { destination: 'new-campaign', file }); }
      catch (error) { toast(error.message); }
    };
  }
  function adoptContext(context) {
    if (activeContext && JSON.stringify(activeContext) !== JSON.stringify(context)) toast('Активная игра изменена');
    activeContext = context || null;
  }
  async function campaignCommand(operation, data) {
    if (demo || status !== 'ready') throw new Error('Сначала сохрани черновик или загрузи актуальные данные');
    const command = { mutationId: crypto.randomUUID(), expectedRevision: revision, ...data };
    if (new Blob([JSON.stringify(command)]).size > 512 * 1024) throw new Error('Команда больше 512 КиБ. Для переноса используй резервную копию SQLite.');
    pending = { ...command, operation };
    rememberDraft();
    closeModal();
    const payload = await sendPending();
    toast(operation === 'spell-set' ? 'Список заклинаний сохранён' : operation === 'import-active' ? 'Игра импортирована в новую кампанию' : operation === 'inventory-remove' ? 'Количество списано' : operation === 'inventory-undo' ? 'Операция инвентаря отменена' : operation === 'inventory-add' ? 'Предмет добавлен в инвентарь' : operation === 'session' ? 'Активная сессия: ' + sessionTitle() : 'Активна кампания: ' + payload.state.profile.campaign);
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
  async function inventory() {
    if (demo || status !== 'ready' || !activeContext) return toast('Инвентарь доступен после подключения и сохранения черновика');
    const key = JSON.stringify(activeContext), version = revision;
    modal('<h2>Инвентарь</h2><p>Загружаем предметы…</p>');
    try {
      const data = await request('/api/inventory');
      if (key !== JSON.stringify(activeContext) || version !== revision) return;
      if (JSON.stringify(data.context) !== key || data.revision !== revision) {
        modal('<h2>Игра изменилась в другой вкладке</h2><p>Обнови данные перед просмотром инвентаря.</p><button id="inventory-reload">Обновить данные</button>');
        $('#inventory-reload').onclick = async () => { closeModal(); await load(); };
        return;
      }
      modal(`<div class="overline">${esc(state.profile.name)} · ${esc(state.profile.campaign)}</div><h2 tabindex="-1" autofocus>Инвентарь</h2><p>${state.gold} зм · видов предметов: ${data.entries.length}</p><div class="settings-actions">${data.entries.map((item, index) => `<article class="panel"><div class="panel-title"><h3>${esc(item.entry.name.ru)}</h3><strong>× ${item.quantity}</strong></div><p>${esc(item.entry.name.en)}</p><small>${esc(item.entry.source.title)} · ${esc(item.entry.source.version)}</small><button data-inventory-remove="${index}">Списать</button></article>`).join('') || '<p>Пока пусто. Найди предмет в справочнике и добавь его в инвентарь.</p>'}</div><p>Здесь только сохранённые предметы. Снаряжение демо-барда не перенесено. Списание меняет только количество. Лечение и бонусы не применяются автоматически. Отменить можно последнюю операцию, пока не было других изменений игры.</p>${data.undo ? `<button id="inventory-undo">Отменить: ${esc(data.undo.label)}</button>` : ''}<button id="inventory-catalog" class="primary">Найти предмет в справочнике</button>`);
      $$('[data-inventory-remove]').forEach(button => button.onclick = () => {
        if (key !== JSON.stringify(activeContext) || version !== revision) return toast('Игра изменилась. Открой инвентарь заново.');
        removeInventory(data.entries[Number(button.dataset.inventoryRemove)]);
      });
      if (data.undo) $('#inventory-undo').onclick = async () => {
        if (key !== JSON.stringify(activeContext) || version !== revision) return toast('Игра изменилась. Открой инвентарь заново.');
        try { await campaignCommand('inventory-undo', { characterId: activeContext.characterId, targetMutationId: data.undo.mutationId }); await inventory(); }
        catch (error) { toast(error.message); }
      };
      $('#inventory-catalog').onclick = () => { closeModal(); location.hash = 'library'; };
    } catch { modal('<h2>Не удалось открыть инвентарь</h2><p>Проверь соединение.</p><button id="inventory-retry">Повторить</button>'); $('#inventory-retry').onclick = inventory; }
  }
  function addInventory(entry) {
    if (demo || status !== 'ready' || !activeContext) return toast('Сначала сохрани черновик или загрузи актуальные данные');
    if (!['item', 'artifact'].includes(entry.kind)) return;
    const key = JSON.stringify(activeContext), version = revision, characterId = activeContext.characterId;
    modal(`<div class="overline">${esc(state.profile.name)} · ${esc(state.profile.campaign)}</div><h2 tabindex="-1" autofocus>${esc(entry.name.ru)}</h2><p>Добавление имущества. Золото не списывается, бонусы и лечение не применяются. Отмена доступна в инвентаре до следующего изменения игры.</p><form id="inventory-add-form"><label for="inventory-quantity">Сколько добавить</label><input id="inventory-quantity" type="number" min="1" max="999" step="1" value="1" required inputmode="numeric"><div class="dialog-actions"><button type="submit" class="primary">Добавить в инвентарь</button></div></form>`);
    $('#inventory-add-form').onsubmit = async event => {
      event.preventDefault();
      if (key !== JSON.stringify(activeContext) || version !== revision) return toast('Игра изменилась. Открой карточку заново.');
      const quantity = Number($('#inventory-quantity').value);
      if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 999) return toast('Количество: целое от 1 до 999');
      try { await campaignCommand('inventory-add', { characterId, catalogId: entry.id, quantity }); await inventory(); }
      catch (error) { toast(error.message); }
    };
  }
  function removeInventory(item) {
    if (demo || status !== 'ready' || !activeContext) return toast('Сначала сохрани черновик или загрузи актуальные данные');
    const key = JSON.stringify(activeContext), version = revision, characterId = activeContext.characterId;
    modal(`<div class="overline">${esc(state.profile.name)} · ${esc(state.profile.campaign)}</div><h2 tabindex="-1" autofocus>Списать: ${esc(item.entry.name.ru)}</h2><p>В наличии: ${item.quantity}. Это учёт расхода, потери или передачи. Лечение и другие эффекты не применяются.</p><form id="inventory-remove-form"><label for="inventory-remove-quantity">Сколько списать</label><input id="inventory-remove-quantity" type="number" min="1" max="${item.quantity}" step="1" value="1" required inputmode="numeric"><div class="dialog-actions"><button type="submit" class="primary">Списать количество</button></div></form>`);
    $('#inventory-remove-form').onsubmit = async event => {
      event.preventDefault();
      if (key !== JSON.stringify(activeContext) || version !== revision) return toast('Игра изменилась. Открой инвентарь заново.');
      const quantity = Number($('#inventory-remove-quantity').value);
      if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > item.quantity) return toast('Укажи целое количество в пределах остатка');
      try { await campaignCommand('inventory-remove', { characterId, catalogId: item.catalogId, quantity }); await inventory(); }
      catch (error) { toast(error.message); }
    };
  }
  async function spellbook() {
    if (demo || status !== 'ready' || !activeContext) return toast('Список доступен после подключения и сохранения черновика');
    const key = JSON.stringify(activeContext), version = revision;
    modal('<h2>Мои заклинания из каталога</h2><p>Загружаем…</p>');
    try {
      const data = await request('/api/spellbook');
      if (key !== JSON.stringify(activeContext) || version !== revision) return;
      if (JSON.stringify(data.context) !== key || data.revision !== version) return modal('<h2>Игра изменилась</h2><p>Обнови страницу и открой список снова.</p>');
      modal(`<div class="overline">${esc(state.profile.name)} · D&D 2014</div><h2 tabindex="-1" autofocus>Мои заклинания из каталога</h2><p>Ручные отметки. Доступность по классу и уровень проверяет игрок. Эти записи не расходуют ячейки и не применяют эффекты.</p><div class="settings-actions">${data.entries.map((item,index) => `<article class="panel"><h3>${esc(item.entry.name.ru)}</h3><p>${item.status === 'prepared' ? 'Подготовлено' : 'Изучено'} · ${esc(item.entry.name.en)}</p><button data-spell-edit="${index}">Читать и изменить</button></article>`).join('') || '<p>Список пуст. Добавь заклинание из справочника.</p>'}</div><button id="spellbook-catalog">Открыть справочник</button>`);
      $$('[data-spell-edit]').forEach(button => button.onclick = () => {
        if (key !== JSON.stringify(activeContext) || version !== revision) return toast('Игра изменилась. Открой список заново.');
        const item = data.entries[Number(button.dataset.spellEdit)]; editSpell(item.entry, item.status);
      });
      $('#spellbook-catalog').onclick = () => { closeModal(); location.hash = 'library'; };
    } catch { modal('<h2>Список недоступен</h2><p>Проверь соединение и открой список снова.</p>'); }
  }
  function editSpell(entry, selected = null) {
    if (demo || status !== 'ready' || !activeContext) return toast('Сначала сохрани черновик или загрузи актуальные данные');
    if (entry.kind !== 'spell') return;
    const key = JSON.stringify(activeContext), version = revision, characterId = activeContext.characterId;
    modal(`<div class="overline">${esc(state.profile.name)}</div><h2 tabindex="-1" autofocus>${esc(entry.name.ru)}</h2><p>Ручная отметка; ячейки и эффекты не меняются. Удаление убирает запись только из списка персонажа.</p><form id="spellbook-form"><label for="spellbook-status">Отметка</label><select id="spellbook-status"><option value="known" ${selected === 'known' ? 'selected' : ''}>Изучено</option><option value="prepared" ${selected === 'prepared' ? 'selected' : ''}>Подготовлено</option>${selected ? '<option value="remove">Убрать из моего списка</option>' : ''}</select><button type="submit" class="primary">Сохранить отметку</button></form><p class="session-text">${esc(entry.text || 'Сохранена только справочная ссылка; текста нет.')}</p><p>${esc(entry.source.title)} · ${esc(entry.source.version)}</p><p>${esc(entry.source.terms)}</p>${entry.source.attribution ? `<p>${esc(entry.source.attribution)}</p><p>${esc(entry.source.changes)}</p>` : ''}`);
    $('#spellbook-form').onsubmit = async event => {
      event.preventDefault();
      if (key !== JSON.stringify(activeContext) || version !== revision) return toast('Игра изменилась. Открой список заново.');
      try { await campaignCommand('spell-set', { characterId, catalogId: entry.id, status: $('#spellbook-status').value }); await spellbook(); }
      catch (error) { toast(error.message); }
    };
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
    modal(`<div class="overline">СКАЗ · ЛОКАЛЬНАЯ ВЕРСИЯ 0.2</div><h2>Данные приключения</h2><p>${demo ? 'Этот HTML-файл работает в демонстрационном режиме. Для сохранения в базе открой локальное приложение.' : 'Прогресс хранится в SQLite на этом компьютере. Тема выбирается отдельно для каждого браузера.'}</p><div class="settings-actions"><button id="export-state">Скачать прогресс без инвентаря (v1)</button>${!demo ? '<button id="export-active" class="primary">Скачать игру с предметами и заклинаниями (v3)</button>' : ''}<label class="file-label">Импортировать JSON v1, v2 или v3<input id="import-state" type="file" accept=".json,application/json"></label><button id="import-old">Перенести данные раннего прототипа</button>${!demo ? '<button id="change-history">История сохранений</button><button id="saved-drafts">Несохранённые черновики</button>' : ''}</div><p>v3 переносит активного персонажа, текущую сессию, инвентарь и заклинания с источниками в новую кампанию. Архивы сессий и история не входят. v2 не содержит списка заклинаний. v1 заменяет текущий прогресс без инвентаря и списка заклинаний. Лимит импорта — 512 КиБ. Для полной копии нужна резервная копия SQLite.</p><p>Каждая кампания использует шаблон барда 5 уровня. В магии доступны 8 демонстрационных заклинаний. Распознавание речи пока демонстрационное.</p><button class="text-button" id="reset-workspace">Начать демо заново</button>`);
    $('#export-state').onclick = exportState;
    if (!demo) $('#export-active').onclick = exportActive;
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
      modal(`<h2>Несохранённые черновики</h2><p>Здесь остаются черновики закрытых вкладок. Прогресс можно скачать и восстановить импортом. Копии команд создания и переключения — только для сохранности; повтор доступен в исходной вкладке.</p>${drafts.map((draft, i) => `<div class="list-row"><strong>${esc(draft.label || (draft.operation === 'spell-set' ? 'Изменение списка заклинаний' : draft.operation === 'import-active' ? 'Импорт игры в новую кампанию' : draft.operation === 'inventory-remove' ? 'Списание предмета' : draft.operation === 'inventory-undo' ? 'Отмена операции инвентаря' : draft.operation === 'inventory-add' ? 'Добавление предмета' : draft.operation === 'session' ? 'Начало сессии' : draft.operation === 'select' ? 'Переключение кампании' : 'Создание кампании'))}</strong><button data-draft-index="${i}">Скачать</button></div>`).join('') || '<p>Несохранённых черновиков нет.</p>'}`);
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
    if (data?.app === 'skaz-active' && [2,3].includes(data.schemaVersion)) return previewActive(data);
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
    if (id === 'open-spellbook') spellbook();
    if (id === 'open-inventory') inventory();
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
  return { commit, paint, settings, inventory, addInventory, removeInventory, spellbook, editSpell, preference, setTheme, sessionTitle, sessionDate: () => sessionInfo?.playedOn || '', contextKey: () => JSON.stringify(activeContext), editable: () => ['ready', 'demo'].includes(status), boot: () => demo ? paint() : load() };
})();
