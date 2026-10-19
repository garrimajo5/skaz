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
  let checkingRemote = false, remoteCheckSerial = 0;
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
      stale: 'В другом окне есть изменения',
    };
    box.dataset.status = status;
    box.innerHTML = `<span><span class="sync-dot"></span>${labels[status]}${message ? `<small>${esc(message)}</small>` : ''}</span><div>${status==='ready'?'<button id="sync-check" aria-label="Проверить обновления" title="Проверить обновления">↻</button>':''}${status==='stale'?'<button id="sync-refresh">Обновить игру</button>':''}${['error','pending','conflict'].includes(status) ? `<button id="sync-retry">${pending ? 'Повторить сохранение' : 'Подключиться'}</button>` : ''}${pending ? '<button id="sync-draft">Скачать черновик</button><button id="sync-current">Загрузить актуальное</button>' : ''}<button id="session-settings">Сессии</button><button id="campaign-settings">Кампании</button><button id="data-settings" aria-label="Данные и настройки">Данные и настройки</button></div>`;
  }
  async function checkRemote() {
    if(demo||status!=='ready'||pending||checkingRemote)return;
    const key=snapshotKey(),token=++remoteCheckSerial;checkingRemote=true;
    try{
      const remote=await request('/api/workspace');
      if(token!==remoteCheckSerial||status!=='ready'||pending||key!==snapshotKey())return;
      if(remote.schemaVersion!==1||!Number.isSafeInteger(remote.revision)||remote.revision<0||!remote.context)throw new Error('Неверная версия');
      if(remote.revision!==revision||JSON.stringify(remote.context)!==JSON.stringify(activeContext)){
        status='stale';message='Экран и открытая форма остались без изменений. Скопируй нужный текст из формы, закрой её и обнови игру.';paint();
      }else if(message==='Не удалось проверить обновления. При сохранении сервер снова проверит версию.'){message='';paint();}
    }catch{
      if(token===remoteCheckSerial&&status==='ready'&&key===snapshotKey()){message='Не удалось проверить обновления. При сохранении сервер снова проверит версию.';paint();}
    }finally{if(token===remoteCheckSerial)checkingRemote=false;}
  }
  function apply(payload) {
    ++remoteCheckSerial;checkingRemote=false;
    sessionInfo = payload.session || null;
    adoptContext(payload.context);
    revision = payload.revision;
    state = { ...payload.state, theme: state.theme };
    pending = null; message = ''; status = 'ready'; rememberDraft(); render();
  }
  async function load() {
    ++remoteCheckSerial;checkingRemote=false;
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
      if (operation === 'place-create' || operation === 'place-update') body.operation = operation === 'place-create' ? 'create' : 'update';
      if (operation === 'quest-create' || operation === 'quest-update') body.operation = operation === 'quest-create' ? 'create' : 'update';
      const url = operation === 'character-create' ? '/api/characters' : operation === 'proposal-create' ? '/api/proposals' : operation === 'proposal-decide' ? '/api/proposals/decide' : operation?.startsWith('place-') ? '/api/places' : operation?.startsWith('quest-') ? '/api/quests' : operation === 'spell-set' ? '/api/spellbook' : operation === 'import-active' ? '/api/import/active' : operation === 'inventory-remove' ? '/api/inventory/remove' : operation === 'inventory-undo' ? '/api/inventory/undo' : operation === 'inventory-add' ? '/api/inventory' : operation === 'session' ? '/api/sessions' : operation === 'create' ? '/api/campaigns' : operation === 'select' ? '/api/context/select' : '/api/workspace';
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
      const file = await request('/api/export/active-v6');
      if (key !== JSON.stringify(activeContext) || version !== revision || JSON.stringify(file.source?.context) !== key || file.source?.revision !== version) return toast('Игра изменилась. Обнови страницу перед экспортом.');
      download(file, 'skaz-active-v6.json');
    } catch (error) { toast(error.message || 'Не удалось скачать игру'); }
  }
  function previewActive(file) {
    if (demo || status !== 'ready') return toast('Импорт доступен после подключения и сохранения черновика');
    if (file.ruleset !== '5e-2014' || file.scope !== 'active-game' || typeof file.state?.profile?.name !== 'string' || typeof file.state?.profile?.campaign !== 'string' || !Array.isArray(file.inventory) || !Array.isArray(file.catalog?.entries)) throw new Error('Неверный файл игры v2–v6');
    if (file.schemaVersion >= 3 && !Array.isArray(file.spellbook)) throw new Error('В файле отсутствует список заклинаний');
    if (file.schemaVersion >= 4 && !Array.isArray(file.quests)) throw new Error('В файле отсутствует список заданий');
    if (file.schemaVersion >= 5 && !Array.isArray(file.places)) throw new Error('В файле отсутствует список мест');
    if (file.schemaVersion === 6 && !Array.isArray(file.proposals)) throw new Error('В файле v6 отсутствует список предложений событий');
    const key = JSON.stringify(activeContext), version = revision;
    modal(`<div class="overline">ПЕРЕНОС D&D 2014 · НОВАЯ КАМПАНИЯ</div><h2>${esc(file.state.profile.campaign)}</h2><p>Персонаж: ${esc(file.state.profile.name)}. Видов предметов: ${file.inventory.length}. Материалов каталога: ${file.catalog.entries.length}. Заклинаний: ${file.schemaVersion >= 3 ? file.spellbook.length : 'не включены в v2'}. Заданий: ${file.schemaVersion >= 4 ? file.quests.length : 'не включены в v' + file.schemaVersion}. Мест на карте: ${file.schemaVersion >= 5 ? file.places.length : 'не включены в этот формат'}. Предложений событий: ${file.schemaVersion === 6 ? file.proposals.length : 'не включены в этот формат'}.</p>${file.schemaVersion >= 4 ? '<p>Задания и места появятся в новой кампании. Сведения об исходной сессии сохранятся, даже если её архив отсутствует в файле.</p>' : ''}<p>Будет создана и открыта новая кампания. Существующие игры сохранятся. В файле только выбранный персонаж и текущая сессия: другие персонажи, архивы и история не переносятся. Сервер проверит данные и источники; конфликт отменит весь импорт.</p><div class="dialog-actions"><button id="confirm-active-import" class="primary">Создать новую кампанию из файла</button></div>`);
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
    toast(operation === 'character-create' ? 'Создан персонаж: ' + payload.state.profile.name : operation === 'select' ? 'Выбран персонаж: ' + payload.state.profile.name : operation === 'proposal-create' ? 'Предложение ждёт подтверждения' : operation === 'proposal-decide' ? 'Решение по событию сохранено' : operation.startsWith('place-') ? 'Место сохранено' : operation.startsWith('quest-') ? 'Задание сохранено' : operation === 'spell-set' ? 'Список заклинаний сохранён' : operation === 'import-active' ? 'Игра импортирована в новую кампанию' : operation === 'inventory-remove' ? 'Количество списано' : operation === 'inventory-undo' ? 'Операция инвентаря отменена' : operation === 'inventory-add' ? 'Предмет добавлен в инвентарь' : operation === 'session' ? 'Активная сессия: ' + sessionTitle() : 'Активна кампания: ' + payload.state.profile.campaign);
    return payload;
  }
  function newCharacter() {
    if (demo || status !== 'ready' || !activeContext) return toast('Сначала сохрани черновик или загрузи актуальные данные');
    const key=snapshotKey(),campaignId=activeContext.campaignId,characterId=crypto.randomUUID();
    modal(`<div class="overline">ДЕМО-ШАБЛОН · БАРД 5 УРОВНЯ</div><h2>Новый персонаж</h2><p>Кампания: ${esc(state.profile.campaign)}. Отдельные ресурсы, заметки, инвентарь и список заклинаний. Журнал сессии, задания и карта общие. Новый персонаж начнёт с ресурсов примера: 28/38 хитов и 124 зм; имущество и личные записи не копируются. Это ещё не конструктор классов.</p><form id="character-form"><label for="character-name">Имя</label><input id="character-name" required maxlength="80"><label for="character-tagline">Краткое описание</label><input id="character-tagline" maxlength="160"><div class="dialog-actions"><button type="submit" class="primary">Создать и выбрать</button></div></form>`);
    $('#character-form').onsubmit=async event=>{
      event.preventDefault();if(key!==snapshotKey())return toast('Игра изменилась. Открой форму заново.');
      const profile={name:$('#character-name').value.trim(),tagline:$('#character-tagline').value.trim()};
      if(!profile.name)return toast('Введи имя персонажа');
      try{await campaignCommand('character-create',{campaignId,characterId,template:'bard5-demo',profile});}catch(error){toast(error.message);}
    };
  }
  async function campaigns() {
    if (demo || status !== 'ready') return toast('Кампании доступны после подключения и сохранения черновика');
    const key=snapshotKey();
    modal('<h2>Твои кампании</h2><p>Загружаем список…</p>');
    try {
      const data = await request('/api/campaigns');
      if(key!==snapshotKey())return;
      modal(`<div class="overline">D&D 2014 · ЛОКАЛЬНЫЕ ИГРЫ</div><h2>Кампании и персонажи</h2><p>Выбран: ${esc(state.profile.name)}. Активная игра общая для всех вкладок. Ресурсы и личные записи у каждого персонажа свои, журнал сессии, задания и карта — общие.</p><div class="settings-actions">${data.campaigns.map((game,index)=>`<section class="panel"><h3>${esc(game.name)}</h3><div class="character-choices">${game.characters.map((character,ci)=>`<button data-select-character="${index}:${ci}" ${character.id===activeContext?.characterId?'disabled':''}>${esc(character.name)}${character.id===activeContext?.characterId?' · Выбран':' →'}</button>`).join('')}</div>${game.id===activeContext?.campaignId?'<button id="new-character">＋ Персонаж из демо-шаблона</button>':''}</section>`).join('')}<button id="new-campaign" class="primary">Новая кампания из демо-шаблона</button></div>`);
      $$('[data-select-character]').forEach(button=>button.onclick=async()=>{
        if(key!==snapshotKey())return toast('Игра изменилась. Открой список заново.');
        const [gi,ci]=button.dataset.selectCharacter.split(':').map(Number),game=data.campaigns[gi],character=game.characters[ci];
        if(game.sessions.length!==1)return toast('Нужна одна текущая сессия кампании');
        try{await campaignCommand('select',{context:{campaignId:game.id,characterId:character.id,sessionId:game.sessions[0].id}});}catch(error){toast(error.message);}
      });
      if($('#new-character'))$('#new-character').onclick=newCharacter;
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
  let inventorySerial=0;
  let inventoryFilter={owner:null,q:"",attunement:"",offset:0};
  async function inventory() {
    if (demo || status !== 'ready' || !activeContext) return toast('Инвентарь доступен после подключения и сохранения черновика');
    const key = JSON.stringify(activeContext), version = revision;
    const token=++inventorySerial;
    const visible=()=>token===inventorySerial && document.getElementById('dialog')?.open!==false && document.getElementById('inventory-view') && key===JSON.stringify(activeContext) && version===revision;
    modal('<h2 id="inventory-view">Инвентарь</h2><p>Загружаем предметы…</p>');
    try {
      const data = await request('/api/inventory');
      if (!visible()) return;
      if (JSON.stringify(data.context) !== key || data.revision !== revision) {
        modal('<h2>Игра изменилась в другой вкладке</h2><p>Обнови данные перед просмотром инвентаря.</p><button id="inventory-reload">Обновить данные</button>');
        $('#inventory-reload').onclick = async () => { closeModal(); await load(); };
        return;
      }
      const owner=JSON.stringify([activeContext.campaignId,activeContext.characterId]);
      if(inventoryFilter.owner!==owner)inventoryFilter={owner,q:'',attunement:'',offset:0};
      const pageSize=10;
      function drawInventory() {
        if(!visible())return;
        const query=inventoryFilter.q.trim().toLocaleLowerCase('ru');
        const matching=data.entries.map((item,index)=>({item,index})).filter(({item})=>{
          const info=item.entry.item||item.entry.artifact;
          return `${item.entry.name.ru} ${item.entry.name.en||''}`.toLocaleLowerCase('ru').includes(query) &&
            (!inventoryFilter.attunement || info?.attunement===(inventoryFilter.attunement==='required'));
        });
        const last=Math.max(0,Math.floor((matching.length-1)/pageSize)*pageSize);
        inventoryFilter.offset=Math.min(inventoryFilter.offset,last);
        const start=inventoryFilter.offset,shown=matching.slice(start,start+pageSize);
        const pages=suffix=>`<nav class="inventory-pages" aria-label="Страницы инвентаря${suffix?' внизу':''}"><button id="inventory-prev${suffix}" ${start===0?'disabled':''}>← Назад</button><span>${matching.length?start+1:0}–${Math.min(start+pageSize,matching.length)} из ${matching.length}</span><button id="inventory-next${suffix}" ${start+pageSize>=matching.length?'disabled':''}>Далее →</button></nav>`;
        modal(`<div class="overline">${esc(state.profile.name)} · ${esc(state.profile.campaign)}</div><h2 id="inventory-view" tabindex="-1" autofocus>Инвентарь</h2><p>${state.gold} зм · видов предметов: ${data.entries.length}</p><div class="inventory-tools"><button id="inventory-catalog" class="primary">Найти предмет в справочнике</button>${data.undo?`<button id="inventory-undo">Отменить: ${esc(data.undo.label)}</button>`:''}</div><form id="inventory-search" class="inventory-search"><label for="inventory-query">Название RU / EN<input id="inventory-query" type="search" maxlength="200" value="${esc(inventoryFilter.q)}" placeholder="Например, кольцо или ring"></label><label for="inventory-attunement">Требование настройки<select id="inventory-attunement"><option value="">Все предметы</option value="required" ${inventoryFilter.attunement==='required'?'selected':''}>Требует настройки</option><option value="none" ${inventoryFilter.attunement==='none'?'selected':''}>Без настройки</option></select></label><div class="dialog-actions"><button type="submit">Найти в инвентаре</button><button type="button" id="inventory-reset">Сбросить</button></div></form><p class="small">Фильтр показывает требование предмета, а не выполненную настройку персонажа.</p>${pages('')}<div class="inventory-grid">${shown.map(({item,index})=>`<article class="panel"><div class="panel-title"><h3>${esc(item.entry.name.ru)}</h3><strong>× ${item.quantity}</strong></div><p>${esc(item.entry.name.en||'')}</p><small>${(item.entry.item||item.entry.artifact)?.attunement===true?'Требует настройки':(item.entry.item||item.entry.artifact)?.attunement===false?'Без настройки':'Требование настройки не указано'}</small><div class="dialog-actions"><button data-inventory-read="${index}">Читать</button><button data-inventory-remove="${index}">Списать</button></div></article>`).join('') || `<p role="status">${data.entries.length?'По этим условиям ничего не найдено. Сбрось фильтры или измени название.':'Пока пусто. Найди предмет в справочнике и добавь его в инвентарь.'}</p>`}</div>${matching.length>pageSize?pages('-bottom'):''}<p>Здесь только сохранённые предметы. Списание меняет только количество. Настройка, лечение и бонусы не применяются автоматически. Отменить можно последнюю операцию, пока не было других изменений игры.</p>`);
        const current=()=>{
          if(!visible()){toast('Игра изменилась. Открой инвентарь заново.');return false;}
          return true;
        };
        $('#inventory-search').onsubmit=event=>{
          event.preventDefault();if(!current())return;
          const attunement=$('#inventory-attunement').value;
          if(!['','required','none'].includes(attunement))return;
          inventoryFilter={owner,q:$('#inventory-query').value.slice(0,200),attunement,offset:0};drawInventory();
        };
        $('#inventory-reset').onclick=()=>{if(!current())return;inventoryFilter={owner,q:'',attunement:'',offset:0};drawInventory();};
        for(const suffix of ['',...(matching.length>pageSize?['-bottom']:[])]){
          $('#inventory-prev'+suffix).onclick=()=>{if(!current()||inventoryFilter.offset===0)return;inventoryFilter.offset=Math.max(0,inventoryFilter.offset-pageSize);drawInventory();};
          $('#inventory-next'+suffix).onclick=()=>{if(!current()||inventoryFilter.offset+pageSize>=matching.length)return;inventoryFilter.offset+=pageSize;drawInventory();};
        }
        $$('[data-inventory-read]').forEach(button=>button.onclick=()=>{if(current())readInventoryItem(data.entries[Number(button.dataset.inventoryRead)]);});
        $$('[data-inventory-remove]').forEach(button=>button.onclick=()=>{if(current())removeInventory(data.entries[Number(button.dataset.inventoryRemove)]);});
        if(data.undo)$('#inventory-undo').onclick=async()=>{
          if(!current())return;
          try{await campaignCommand('inventory-undo',{characterId:activeContext.characterId,targetMutationId:data.undo.mutationId});await inventory();}
          catch(error){toast(error.message);}
        };
        $('#inventory-catalog').onclick=()=>{if(!current())return;closeModal();location.hash='library';};
      }
      drawInventory();
    } catch { if(!visible())return; modal('<h2>Не удалось открыть инвентарь</h2><p>Проверь соединение.</p><button id="inventory-retry">Повторить</button>'); $('#inventory-retry').onclick = inventory; }
  }
  function readInventoryItem(item) {
    if(!item?.entry)return;
    const entry=item.entry,info=entry.item||entry.artifact;
    const key=snapshotKey();
    let sourceLink='';
    try{const source=new URL(entry.source.url);if(['https:','http:'].includes(source.protocol)&&!source.username&&!source.password)sourceLink=`<p><a href="${esc(source.href)}" target="_blank" rel="noopener noreferrer">Открыть первоисточник ↗</a></p>`;}catch{}
    modal(`<button id="inventory-read-back">← К инвентарю</button><div class="overline">${esc(state.profile.name)} · В наличии: ${item.quantity}</div><h2>${esc(entry.name.ru)}</h2><p>${esc(entry.name.en)}</p>${info?`<p>Настройка: ${info.attunement?'требуется':'не требуется'}${info.attunementRequirement?' · '+esc(info.attunementRequirement):''}.</p>`:''}<p>Сохранённая карточка предмета. Чтение не меняет количество и не применяет эффекты.</p>${info?.charges?`<p>Максимум зарядов: ${esc(info.charges.max)}. Восстановление: ${esc(info.charges.recharge)} Это справочные значения, не текущий остаток.</p>`:''}${entry.id&&typeof SkazCatalog!=='undefined'?'<button id="inventory-reference">Правила и связи в справочнике →</button>':''}<div class="catalog-text">${esc(entry.text||'Текст не импортирован; используй ссылку на источник.')}</div><p>${esc(entry.source.title)} · ${esc(entry.source.version)}</p><p>${esc(entry.source.terms)}</p>${sourceLink}${entry.source.attribution?`<p>${esc(entry.source.attribution)}</p>`:''}${entry.source.changes?`<p>${esc(entry.source.changes)}</p>`:''}`);
    $('#inventory-read-back').onclick=inventory;
    if(entry.id&&typeof SkazCatalog!=='undefined')$('#inventory-reference').onclick=()=>{if(key!==snapshotKey())return toast('Игра изменилась. Открой инвентарь заново.');SkazCatalog.openReference(entry.id,()=>readInventoryItem(item),()=>key===snapshotKey());};
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
  async function spellbookData() {
    if(demo || status!=='ready')throw new Error('Сначала сохрани черновик или подключись к серверу');
    const key=snapshotKey(),data=await request('/api/spellbook');
    if(key!==snapshotKey() || JSON.stringify(data.context)!==JSON.stringify(activeContext) || data.revision!==revision)throw new Error('Игра изменилась. Обнови страницу и открой книгу снова.');
    return data;
  }
  async function spellbook() {
    if(demo || status!=='ready' || !activeContext)return toast('Список доступен после подключения и сохранения черновика');
    closeModal();location.hash='spells';
  }
  function editSpell(entry, selected = null, afterSave = null) {
    if (demo || status !== 'ready' || !activeContext) return toast('Сначала сохрани черновик или загрузи актуальные данные');
    if (entry.kind !== 'spell') return;
    const key = JSON.stringify(activeContext), version = revision, characterId = activeContext.characterId;
    let sourceLink='';
    try{const source=new URL(entry.source.url);if(['https:','http:'].includes(source.protocol)&&!source.username&&!source.password)sourceLink=`<p><a href="${esc(source.href)}" target="_blank" rel="noopener noreferrer">Открыть первоисточник ↗</a></p>`;}catch{}
    modal(`<div class="overline">${esc(state.profile.name)}</div><h2 tabindex="-1" autofocus>${esc(entry.name.ru)}</h2><p>Ручная отметка; ячейки и эффекты не меняются. Удаление убирает запись только из списка персонажа.</p><form id="spellbook-form"><label for="spellbook-status">Отметка</label><select id="spellbook-status"><option value="known" ${selected === 'known' ? 'selected' : ''}>Изучено</option><option value="prepared" ${selected === 'prepared' ? 'selected' : ''}>Подготовлено</option>${selected ? '<option value="remove">Убрать из моего списка</option>' : ''}</select><button type="submit" class="primary">Сохранить отметку</button></form><p class="session-text">${esc(entry.text || 'Сохранена только справочная ссылка; текста нет.')}</p><p>${esc(entry.source.title)} · ${esc(entry.source.version)}</p><p>${esc(entry.source.terms)}</p>${sourceLink}${entry.source.attribution ? `<p>${esc(entry.source.attribution)}</p><p>${esc(entry.source.changes)}</p>` : ''}`);
    $('#spellbook-form').onsubmit = async event => {
      event.preventDefault();
      if (key !== JSON.stringify(activeContext) || version !== revision) return toast('Игра изменилась. Открой список заново.');
      try { await campaignCommand('spell-set', { characterId, catalogId: entry.id, status: $('#spellbook-status').value }); if(afterSave)afterSave();else await spellbook(); }
      catch (error) { toast(error.message); }
    };
  }
  const questStatus = { active: 'В процессе', completed: 'Завершено', failed: 'Не выполнено' };
  async function questList() {
    if (demo || status !== 'ready') return toast('Задания доступны в локальном приложении после сохранения черновика');
    const key = JSON.stringify(activeContext), version = revision;
    try {
      const data = await request('/api/quests');
      if (key !== JSON.stringify(activeContext) || version !== revision || JSON.stringify(data.context) !== key || data.revision !== version) return toast('Игра изменилась. Обнови страницу и открой задания снова.');
      modal(`<div class="overline">${esc(state.profile.campaign)}</div><h2>Задания кампании</h2><button id="new-quest" class="primary">Новое задание</button><div class="settings-actions">${data.quests.map((q,i) => `<article class="panel"><h3>${esc(q.title)}</h3><p>${questStatus[q.status]} · Этапы: ${q.steps.filter(s => s.done).length}/${q.steps.length}</p><p class="session-text">${esc(q.description)}</p>${q.importedFrom ? '<p>Перенесено из другой игры; исходная сессия сохранена в файле переноса.</p>' : ''}<button data-quest-edit="${i}">Изменить задание</button></article>`).join('') || '<p>Заданий пока нет. Запиши первую зацепку или обещание.</p>'}</div><p>Награды и ресурсы меняются отдельно. Демо-сюжет не включён в этот список.</p>`);
      const open = q => {
        if (key !== JSON.stringify(activeContext) || version !== revision) return toast('Игра изменилась. Открой задания заново.');
        editQuest(q);
      };
      $('#new-quest').onclick = () => open(null);
      $$('[data-quest-edit]').forEach(button => button.onclick = () => open(data.quests[Number(button.dataset.questEdit)]));
    } catch (error) { toast(error.message || 'Не удалось загрузить задания'); }
  }
  function editQuest(selected = null) {
    if (demo || status !== 'ready' || !activeContext) return toast('Сначала сохрани черновик или загрузи актуальные данные');
    const key = JSON.stringify(activeContext), version = revision, campaignId = activeContext.campaignId;
    const questId = selected?.id || crypto.randomUUID();
    let steps = structuredClone(selected?.steps || []);
    modal(`<h2>${selected ? 'Изменить задание' : 'Новое задание'}</h2><form id="quest-form"><label for="quest-title">Название</label><input id="quest-title" maxlength="200" required value="${esc(selected?.title || '')}"><label for="quest-description">Что известно</label><textarea id="quest-description" maxlength="12000" rows="3">${esc(selected?.description || '')}</textarea><label for="quest-status">Статус</label><select id="quest-status">${Object.entries(questStatus).map(([value,label]) => `<option value="${value}" ${value === (selected?.status || 'active') ? 'selected' : ''}>${label}</option>`).join('')}</select><h3>Этапы</h3><div id="quest-steps"></div><button type="button" id="add-quest-step">Добавить этап</button><p>Статус выбираешь ты; отметки этапов не начисляют награды.</p><div class="dialog-actions"><button type="submit" class="primary">Сохранить задание</button></div></form>`);
    const readSteps = () => steps.map((step,i) => ({ id: step.id, title: $('#quest-step-' + i).value.trim(), done: $('#quest-done-' + i).checked }));
    const drawSteps = () => {
      $('#quest-steps').innerHTML = steps.map((step,i) => `<fieldset class="quest-step-editor"><legend>Этап ${i+1}</legend><label for="quest-step-${i}">Описание этапа</label><input id="quest-step-${i}" maxlength="500" required value="${esc(step.title)}"><label class="quest-check"><input id="quest-done-${i}" type="checkbox" ${step.done ? 'checked' : ''}>Выполнен</label><button type="button" data-remove-step="${i}">Убрать этап ${i+1}</button></fieldset>`).join('');
      $('#add-quest-step').disabled = steps.length >= 50;
      $$('[data-remove-step]').forEach(button => button.onclick = () => { steps = readSteps(); steps.splice(Number(button.dataset.removeStep),1); drawSteps(); });
    };
    drawSteps();
    $('#add-quest-step').onclick = () => { if (steps.length >= 50) return; steps = readSteps(); steps.push({ id: crypto.randomUUID(), title: '', done: false }); drawSteps(); $('#quest-step-' + (steps.length-1)).focus(); };
    $('#quest-form').onsubmit = async event => {
      event.preventDefault();
      if (key !== JSON.stringify(activeContext) || version !== revision) return toast('Игра изменилась. Открой задания заново.');
      const quest = { title: $('#quest-title').value.trim(), description: $('#quest-description').value, status: $('#quest-status').value, steps: readSteps() };
      if (!quest.title || quest.steps.some(step => !step.title)) return toast('Заполни название задания и каждого этапа');
      try { await campaignCommand(selected ? 'quest-update' : 'quest-create', { campaignId, questId, quest }); if (typeof SkazQuests === 'undefined' || typeof page === 'undefined' || page !== 'quests') await questList(); }
      catch (error) { toast(error.message); }
    };
  }
  const snapshotKey = () => JSON.stringify({ context: activeContext, revision });
  async function proposalsData() {
    if (demo || status !== 'ready') throw new Error('Сначала сохрани черновик или подключись к серверу');
    const key = snapshotKey(), data = await request('/api/proposals');
    if (key !== snapshotKey() || JSON.stringify(data.context) !== JSON.stringify(activeContext) || data.revision !== revision) throw new Error('Игра изменилась. Обнови страницу и открой события снова.');
    return data;
  }
  function newProposal() {
    if (demo || status !== 'ready' || !activeContext) return toast('Сначала сохрани черновик или загрузи актуальные данные');
    const key = snapshotKey(), target = { ...activeContext }, proposalId = crypto.randomUUID();
    modal(`<h2>Событие из текста</h2><p>Подготовка распознавания: пока фрагмент и краткую запись вводишь ты. Микрофон и AI не используются. Сначала создаётся предложение, затем ты подтверждаешь запись.</p><form id="proposal-form"><label for="proposal-source">Фрагмент разговора</label><textarea id="proposal-source" required maxlength="4000" rows="4" placeholder="Что рассказал мастер или игрок?"></textarea><label for="proposal-speaker">Кто сказал (необязательно)</label><input id="proposal-speaker" maxlength="120" placeholder="Например, мастер"><label for="proposal-minute">Минута с начала сессии</label><input id="proposal-minute" type="number" min="0" max="1440" step="1" required value="0"><label for="proposal-title">Краткий заголовок события</label><input id="proposal-title" required maxlength="2000"><label for="proposal-target">Куда записать после подтверждения</label><select id="proposal-target"><option value="journal">В журнал текущей сессии</option><option value="personal-note">В личные заметки персонажа</option></select><div class="dialog-actions"><button type="submit" class="primary">Создать предложение</button></div></form>`);
    $('#proposal-form').onsubmit = async event => {
      event.preventDefault(); if (key !== snapshotKey()) return toast('Игра изменилась. Открой форму заново.');
      const text = $('#proposal-source').value.trim(), title = $('#proposal-title').value.trim(), minutes = Number($('#proposal-minute').value);
      if (!text || !title || !Number.isSafeInteger(minutes) || minutes < 0 || minutes > 1440) return toast('Заполни текст, заголовок и минуту 0–1440');
      try { await campaignCommand('proposal-create', { ...target, proposalId, source: { kind: 'manual-text', speaker: $('#proposal-speaker').value, text, offsetMs: minutes*60000 }, suggestion: { kind: $('#proposal-target').value, title, text } }); }
      catch (error) { toast(error.message); }
    };
  }
  function reviewProposal(item) {
    if (demo || status !== 'ready' || !activeContext || item.status !== 'pending') return toast('Это событие сейчас нельзя изменить');
    const key = snapshotKey();
    modal(`<h2>Проверить событие</h2><p>Будет добавлена одна запись ${item.suggestion.kind === 'journal' ? 'в журнал текущей сессии' : 'в личные заметки персонажа'}. Хиты, золото и другие ресурсы не изменятся.</p><blockquote class="source session-text">${esc(item.source.text)}</blockquote><p>${esc(item.source.speaker || 'Говорящий не указан')} · ${Math.floor(item.source.offsetMs/60000)} мин. с начала сессии</p><form id="proposal-review"><label for="review-title">Заголовок</label><input id="review-title" required maxlength="2000" value="${esc(item.suggestion.title)}"><label for="review-text">Текст записи — можно исправить</label><textarea id="review-text" required maxlength="4000" rows="4">${esc(item.suggestion.text)}</textarea><div class="dialog-actions"><button type="submit" class="primary">Подтвердить запись</button><button type="button" id="dismiss-proposal">Пропустить событие</button></div></form>`);
    const decide = async decision => {
      if (key !== snapshotKey()) return toast('Игра изменилась. Открой событие заново.');
      const content = decision === 'accept' ? { title: $('#review-title').value.trim(), text: $('#review-text').value.trim() } : null;
      if (content && (!content.title || !content.text)) return toast('Заполни заголовок и текст');
      try { await campaignCommand('proposal-decide', { proposalId: item.id, decision, content }); }
      catch (error) { toast(error.message); }
    };
    $('#proposal-review').onsubmit = event => { event.preventDefault(); return decide('accept'); };
    $('#dismiss-proposal').onclick = () => decide('dismiss');
  }
  async function questsData() {
    if (demo || status !== 'ready') throw new Error('Сначала сохрани черновик или подключись к серверу');
    const key = snapshotKey();
    const data = await request('/api/quests');
    if (key !== snapshotKey() || JSON.stringify(data.context) !== JSON.stringify(activeContext) || data.revision !== revision) throw new Error('Игра изменилась. Обнови страницу и открой задания снова.');
    return data;
  }
  async function setQuestStep(selected, stepId, done, expectedKey) {
    if (expectedKey !== snapshotKey()) throw new Error('Игра изменилась. Открой задания заново.');
    if (!selected.steps.some(step => step.id === stepId) || typeof done !== 'boolean') throw new Error('Этап не найден');
    const { title, description, status, steps } = selected;
    return campaignCommand('quest-update', { campaignId: activeContext.campaignId, questId: selected.id,
      quest: { title, description, status, steps: steps.map(step => ({ ...step, done: step.id === stepId ? done : step.done })) } });
  }
  async function placesData() {
    if (demo || status !== 'ready') throw new Error('Сначала сохрани черновик или подключись к серверу');
    const key = snapshotKey();
    const data = await request('/api/places');
    if (key !== snapshotKey() || JSON.stringify(data.context) !== JSON.stringify(activeContext) || data.revision !== revision) throw new Error('Игра изменилась. Обнови страницу и открой карту снова.');
    return data;
  }
  function editPlace(selected = null) {
    if (demo || status !== 'ready' || !activeContext) return toast('Сначала сохрани черновик или загрузи актуальные данные');
    const key = snapshotKey(), campaignId = activeContext.campaignId, placeId = selected?.id || crypto.randomUUID();
    modal(`<h2>${selected ? 'Изменить место' : 'Новое место'}</h2><form id="place-form"><label for="place-title">Название</label><input id="place-title" maxlength="200" required value="${esc(selected?.title || '')}"><label for="place-description">Что мы знаем</label><textarea id="place-description" rows="3" maxlength="12000">${esc(selected?.description || '')}</textarea><label class="quest-check"><input type="checkbox" id="place-visited" ${selected?.visited ? 'checked' : ''}>Мы здесь побывали</label><p id="position-help">Коснись схемы, чтобы поставить отметку. Ползунки позволяют уточнить положение.</p><div id="place-position" class="place-position" aria-hidden="true"><span id="place-preview">◆</span></div><label for="place-x">Запад — восток</label><input id="place-x" type="range" min="0" max="100" step="0.1" value="${selected?.x ?? 50}"><label for="place-y">Север — юг</label><input id="place-y" type="range" min="0" max="100" step="0.1" value="${selected?.y ?? 50}"><div class="dialog-actions"><button type="submit" class="primary">Сохранить место</button></div></form>`);
    const preview = () => { $('#place-preview').style.left = $('#place-x').value + '%'; $('#place-preview').style.top = $('#place-y').value + '%'; };
    $('#place-x').oninput = preview; $('#place-y').oninput = preview;
    $('#place-position').onclick = event => {
      const box = event.currentTarget.getBoundingClientRect();
      $('#place-x').value = Math.max(0,Math.min(100,100*(event.clientX-box.left)/box.width)).toFixed(1);
      $('#place-y').value = Math.max(0,Math.min(100,100*(event.clientY-box.top)/box.height)).toFixed(1); preview();
    };
    preview();
    $('#place-form').onsubmit = async event => {
      event.preventDefault();
      if (key !== snapshotKey()) return toast('Игра изменилась. Открой место заново.');
      const place = { title: $('#place-title').value.trim(), description: $('#place-description').value, x: Number($('#place-x').value), y: Number($('#place-y').value), visited: $('#place-visited').checked };
      if (!place.title) return toast('Введи название места');
      try { await campaignCommand(selected ? 'place-update' : 'place-create', { campaignId, placeId, place }); }
      catch (error) { toast(error.message); }
    };
  }
  async function sessionReviewData(id) {
    if (demo || status !== 'ready' || !activeContext) throw new Error('Сначала сохрани черновик или подключись к серверу');
    const key = snapshotKey(), data = await request('/api/sessions/' + encodeURIComponent(id) + '/review');
    if (key !== snapshotKey() || data.revision !== revision || JSON.stringify(data.context) !== JSON.stringify(activeContext)) throw new Error('Игра изменилась. Открой архив заново.');
    return data;
  }
  function sessionTitle() { return sessionInfo?.name || (demo ? 'Демонстрационная сессия' : 'Сессия без названия'); }
  async function sessions() {
    if (demo || status !== 'ready' || !activeContext) return toast('Сессии доступны после подключения и сохранения черновика');
    const key = JSON.stringify(activeContext);
    modal('<h2>Сессии кампании</h2><p>Загружаем журнал…</p>');
    try {
      const { sessions: list } = await request('/api/campaigns/' + activeContext.campaignId + '/sessions');
      if (key !== JSON.stringify(activeContext)) return;
      modal(`<div class="overline">${esc(state.profile.campaign)}</div><h2>Сессии кампании</h2><div class="settings-actions">${list.slice().reverse().map((item, i) => `<section class="panel"><h3>${esc(item.name || 'Сессия без названия')}</h3><p>${esc(item.playedOn || 'Дата не указана')} · ${item.archived ? 'Архив' : 'Текущая'}</p><button data-session-view="${list.length - 1 - i}">Журнал и события</button></section>`).join('')}<button id="new-session" class="primary">Начать следующую сессию</button></div>`);
      $$('[data-session-view]').forEach(button => button.onclick = () => SkazArchive.open(list[Number(button.dataset.sessionView)].id, sessions));
      $('#new-session').onclick = () => {
        modal('<h2>Следующая сессия</h2><p>Текущий журнал станет архивом только для чтения. Ресурсы персонажа, карта, задания и личные заметки сохранятся. Это не отдых. Новый журнал будет пустым. Сначала проверь ожидающие события в журнале: после перехода их нельзя подтвердить. Исходные предложения и решения останутся доступны в архиве только для чтения.</p><form id="new-session-form"><label for="session-name">Название</label><input id="session-name" maxlength="120" required><label for="session-date">Дата игры</label><input id="session-date" type="date" required><div class="dialog-actions"><button type="submit" class="primary">Завершить текущую и начать</button></div></form>');
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
    modal(`<div class="overline">СКАЗ · ЛОКАЛЬНАЯ ВЕРСИЯ 0.2</div><h2>Данные приключения</h2><p>${demo ? 'Этот HTML-файл работает в демонстрационном режиме. Для сохранения в базе открой локальное приложение.' : 'Прогресс хранится в SQLite на этом компьютере. Тема выбирается отдельно для каждого браузера.'}</p><div class="settings-actions"><button id="export-state">Скачать прогресс без инвентаря (v1)</button>${!demo ? '<button id="export-active" class="primary">Скачать активную игру (v6)</button>' : ''}<label class="file-label">Импортировать JSON v1–v6<input id="import-state" type="file" accept=".json,application/json"></label><button id="import-old">Перенести данные раннего прототипа</button>${!demo ? '<button id="change-history">История сохранений</button><button id="saved-drafts">Несохранённые черновики</button>' : ''}</div><p>v6 переносит предложения событий, активного персонажа, текущую сессию, задания, места кампании, инвентарь и заклинания с источниками в новую кампанию. Другие персонажи, архивы сессий и история не входят. v2–v5 не содержат предложений событий. v2–v4 не содержат собственных мест кампании. v2/v3 не содержат сохранённых заданий; в v2 также нет списка заклинаний. v1 заменяет текущий прогресс без инвентаря, списка заклинаний и сохранённых заданий. Лимит импорта — 512 КиБ. Для полной копии нужна резервная копия SQLite.</p><p>Каждая кампания использует шаблон барда 5 уровня. В магии доступны 8 демонстрационных заклинаний. События из текста вводятся и подтверждаются вручную. Распознавание речи не подключено.</p><button class="text-button" id="reset-workspace">Начать демо заново</button>`);
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
      modal(`<h2>Несохранённые черновики</h2><p>Здесь остаются черновики закрытых вкладок. Прогресс можно скачать и восстановить импортом. Копии команд создания и переключения — только для сохранности; повтор доступен в исходной вкладке.</p>${drafts.map((draft, i) => `<div class="list-row"><strong>${esc(draft.label || (draft.operation?.startsWith('proposal-') ? 'Решение по событию' : draft.operation?.startsWith('place-') ? 'Сохранение места' : draft.operation?.startsWith('quest-') ? 'Сохранение задания' : draft.operation === 'spell-set' ? 'Изменение списка заклинаний' : draft.operation === 'import-active' ? 'Импорт игры в новую кампанию' : draft.operation === 'inventory-remove' ? 'Списание предмета' : draft.operation === 'inventory-undo' ? 'Отмена операции инвентаря' : draft.operation === 'inventory-add' ? 'Добавление предмета' : draft.operation === 'session' ? 'Начало сессии' : draft.operation === 'select' ? 'Переключение кампании' : 'Создание кампании'))}</strong><button data-draft-index="${i}">Скачать</button></div>`).join('') || '<p>Несохранённых черновиков нет.</p>'}`);
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
    if (data?.app === 'skaz-active' && [2,3,4,5,6].includes(data.schemaVersion)) return previewActive(data);
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
    if (id === 'open-quests') questList();
    if (id === 'open-spellbook') spellbook();
    if (id === 'open-inventory') inventory();
    if (id === 'session-settings') sessions();
    if (id === 'campaign-settings') campaigns();
    if (id === 'data-settings') settings();
    if (id === 'sync-retry') { try { pending ? await sendPending() : await load(); } catch {} }
    if(id==='sync-check')await checkRemote();
    if(id==='sync-refresh'&&status==='stale'){
      if(document.getElementById('dialog')?.open)return toast('Открытая форма не сохранена. Скопируй нужный текст и закрой её перед обновлением игры.');
      await load();
    }
    if (id === 'sync-draft' && pending) downloadDraft(pending);
    if (id === 'sync-current' && pending) {
      modal('<h2>Загрузить актуальные данные?</h2><p>Неотправленный черновик будет убран из очереди. Сначала скачай его, если хочешь сохранить изменения отдельно.</p><div class="dialog-actions"><button id="keep-draft">Скачать черновик</button><button id="discard-draft">Загрузить актуальное</button></div>');
      $('#keep-draft').onclick = () => downloadDraft(pending);
      $('#discard-draft').onclick = async () => { pending = null; rememberDraft(); closeModal(); await load(); };
    }
  });
  window.addEventListener('beforeunload', event => { if (status === 'saving') { event.preventDefault(); event.returnValue = ''; } });
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void checkRemote();});
  return { commit, paint, settings, sessionReviewData, newCharacter, inventory, addInventory, removeInventory, spellbook, spellbookData, editSpell, questList, editQuest, proposalsData, newProposal, reviewProposal, questsData, setQuestStep, placesData, editPlace, snapshotKey, preference, setTheme, sessionTitle, sessionDate: () => sessionInfo?.playedOn || '', contextKey: () => JSON.stringify(activeContext), editable: () => ['ready', 'demo'].includes(status), boot: () => demo ? paint() : load() };
})();
