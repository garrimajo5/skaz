import {spellLearningMode} from './spell-learning.mjs';
import {buildAdvancementChange,validateAdvancementCommand,validateAdvancementSnapshot,buildResourceBinding,validateResourceBindingCommand} from './class-advancement.mjs';
import {checkAdvancementCompatibility,setupAdvancement,readAdvancement,persistAdvancement} from './class-advancement-store.mjs';
import {validateResourceCommand,applyResourceCommand} from './resource-operations.mjs';
import {setupResourceHistory,recordResource,inverseResource,historyDetail,independentResourcesSince,resourceReceipt} from './resource-history.mjs';
import {setupCharacterSheets,readCharacterSheet,validateSheetCommand,saveCharacterSheet,validateCounterCommand,changeCharacterCounter} from './character-sheet.mjs';
import {setupCharacterStats,readCharacterStats,validateStatsCommand,saveCharacterStats} from './character-stats.mjs';
import { setupViews, ensureView } from './views.mjs';
import { createAccess, createUserReader, createUserWriter } from './access.mjs';
import { createAuthentication } from './authentication.mjs';
import {createPersonalArtAccess} from './personal-art-access.mjs';
import {gameArtPackage,validateGameArtPackage} from './game-art-package.mjs';
import { validateCharacterCreate, createCharacter } from './characters.mjs';
import { setupProposals, readProposals, validateProposalCreate, validateProposalDecision, createProposal, decideProposal } from './proposals.mjs';
import { setupPlaces, readPlaces, validatePlaceCommand, savePlace } from './places.mjs';
import { setupQuests, readQuests, validateQuestCommand, saveQuest } from './quests.mjs';
import { setupSpellbook, readSpellbook, validateSpellCommand, setSpell } from './spellbook.mjs';
import { validateTransfer, importTransfer } from './transfer.mjs';
import { DatabaseSync, backup } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { AppError, seed, validateState } from './state.mjs';
import { createCatalog, isKnownBundledUpgrade } from './catalog.mjs';
import { validateChargeCommand, changeCharges, setupInventory, validateInventoryQuantity, readInventory, addInventory, removeInventory, validateInventoryUndo, undoInventory } from './inventory.mjs';
import { setupSessions, validateSession, startSession, listSessions, readSession } from './sessions.mjs';
import { migrateEntities, readEntities, writeEntities, joinState, contextIds, createGame, selectGame, listGames } from './entities.mjs';

export function openStore(filename, {classAdvancement=false}={}) {
  if(typeof classAdvancement!=='boolean')throw new AppError(422,'Неверный режим повышения уровня');
  if (filename !== ':memory:') mkdirSync(path.dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  try{checkAdvancementCompatibility(db,{enabled:classAdvancement});}catch(error){db.close();throw error;}
  db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS workspace (
      id INTEGER PRIMARY KEY CHECK(id=1), schema_version INTEGER NOT NULL,
      revision INTEGER NOT NULL, state_json TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS changes (
      mutation_id TEXT PRIMARY KEY, revision INTEGER NOT NULL UNIQUE,
      request_hash TEXT NOT NULL, label TEXT NOT NULL,
      before_json TEXT NOT NULL, after_json TEXT NOT NULL, created_at TEXT NOT NULL
    );
  `);
  db.prepare('INSERT OR IGNORE INTO workspace VALUES (1, 1, 0, ?, ?)').run(JSON.stringify(seed), new Date().toISOString());
  if (![1, 2].includes(db.prepare('SELECT schema_version FROM workspace').get().schema_version)) {
    db.close(); throw new Error('Версия базы не поддерживается. Нужна миграция; база не изменена.');
  }
  try { migrateEntities(db); } catch (error) { db.close(); throw error; }
  setupSessions(db);
  setupViews(db);
  let access;
  try { access = createAccess(db); } catch(error) { db.close(); throw error; }
  const catalog = createCatalog(db);
  setupInventory(db);
  setupSpellbook(db);
  setupCharacterStats(db);
  setupCharacterSheets(db);
  if(classAdvancement)try{setupAdvancement(db);}catch(error){db.close();throw error;}
  setupResourceHistory(db);
  setupQuests(db);
  setupPlaces(db);
  setupProposals(db);
  db.exec(`CREATE TABLE IF NOT EXISTS context_changes (
    mutation_id TEXT PRIMARY KEY REFERENCES changes(mutation_id),
    operation TEXT NOT NULL, before_json TEXT NOT NULL, after_json TEXT NOT NULL
  )`);
  function createView(viewId, authorize = () => {}, authorizeMutation = () => {}, personalArt, artOwner) {
  function read() {
    authorize();
    const context = readEntities(db, viewId);
    const session = readSession(db, context.session.id);
    const characterSheet = readCharacterSheet(db, context.character.id);
    const advancement = classAdvancement ? readAdvancement(db, context.character.id) : null;
    const spellLearning = advancement ? spellLearningMode({classId:advancement.classId}) : characterSheet ? null : spellLearningMode({classId:"bard"});
    return { schemaVersion: 1, revision: context.revision, updatedAt: context.updatedAt, context: contextIds(context),
      session: { name: session.name, playedOn: session.playedOn }, sessionNumber: session.number,
      spellbook:readSpellbook(db,context.character.id),
      characterStats: readCharacterStats(db,context.character.id),
      characterSheet, spellLearning,
      ...(classAdvancement?{advancement}:{}),
      state: joinState({ campaign: context.campaign.data, character: context.character.data, session: context.session.data }) };
  }
  function exportActive(version = 2) {
    const withArt=version==='with-art';
    if(withArt&&!personalArt)throw new AppError(403,'Перенос личных изображений не включён');
    if(withArt)version=classAdvancement?13:12;
    db.exec('BEGIN');
    try {
      const current = read();
      if(current.advancement&&version<13)throw new AppError(409,'Повышение уровня требует экспорт v13 или полную SQLite-копию');
      if(current.advancement)validateAdvancementSnapshot(current.advancement,current.characterSheet,current.characterStats,current.spellbook);
      if(!personalArt&&db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='personal_art_versions'").get()){
        const hasArt=db.prepare(`SELECT 1 FROM personal_art_versions v WHERE character_id=? ${artOwner?'AND user_id=?':''} AND master IS NOT NULL AND revision=(SELECT max(n.revision) FROM personal_art_versions n WHERE n.user_id=v.user_id AND n.character_id=v.character_id AND n.catalog_id=v.catalog_id) LIMIT 1`).get(current.context.characterId,...(artOwner?[artOwner]:[]));
        if(hasArt)throw new AppError(409,'Личные изображения требуют экспорт игры с изображениями');
      }
      const art=personalArt?.exportCharacter(current.context.characterId);
      if(art?.entries.length&&!withArt)throw new AppError(409,'Личные изображения требуют экспорт игры с изображениями');
      const inventory = readInventory(db, current.context.characterId);
      const spellbook = readSpellbook(db, current.context.characterId);
      const quests = readQuests(db, current.context.campaignId);
      const places = readPlaces(db, current.context.campaignId);
      const proposals = readProposals(db, current.context);
      if (![2,3,4,5,6,7,8,9,10,11,12,13].includes(version)) throw new AppError(422, 'Неверная версия экспорта');
      if(version<12&&(current.state.concentrationChecks!==undefined||current.state.deathSaves!==undefined))throw new AppError(409,'Здоровье и проверки требуют экспорт v12');
      if(version<11&&current.state.tempHp!==undefined)throw new AppError(409,'Временные хиты требуют экспорт v11');
      if(version<10&&current.characterSheet&&['spellcasting','saveProficiencies'].some(key=>Object.hasOwn(current.characterSheet,key)))throw new AppError(409,'Настройки заклинаний требуют экспорт v10 или SQLite backup');
      if(version<9&&current.characterSheet!==null)throw new AppError(409,'Собственный класс и счётчики требуют экспорт v9 или SQLite backup');
      if (version < 8 && current.characterStats!==null) throw new AppError(409,'Ручные характеристики требуют экспорт v8 или SQLite backup');
      if (version < 7 && inventory.some(item => item.chargeCounts)) throw new AppError(409, 'Остатки зарядов требуют экспорт v7 или SQLite backup');
      if (version < 6 && proposals.length) throw new AppError(409, 'Предложения событий требуют экспорт v6 или SQLite backup');
      if (version < 5 && places.length) throw new AppError(409, 'Места кампании требуют экспорт v5 или SQLite backup');
      if (version < 4 && quests.length) throw new AppError(409, 'Задания требуют экспорт v4 или SQLite backup');
      if (version === 2 && spellbook.length) throw new AppError(409, 'Список заклинаний требует экспорт v3 или SQLite backup');
      const entries = new Map();
      const snapshots=new Map([...inventory,...spellbook].map(item=>[item.catalogId,item.entry]));
      const pending = [...snapshots.keys()];
      const lookup = db.prepare('SELECT entry_json FROM catalog_entries WHERE id=?');
      while (pending.length) {
        const id = pending.pop();
        if (entries.has(id)) continue;
        const row = lookup.get(id);
        if (!row) throw new AppError(409, 'В каталоге отсутствует связанная запись: ' + id);
        const installed = JSON.parse(row.entry_json),snapshot=snapshots.get(id);
        if(snapshot&&JSON.stringify(installed)!==JSON.stringify(snapshot)&&!isKnownBundledUpgrade(snapshot,installed))throw new AppError(409,'Сохранённая карточка отличается от каталога: '+id);
        // Export the saved edition, including its original dependency closure.
        const entry=snapshot||installed;
        entries.set(id, entry);
        pending.push(...(entry.links || []));
      }
      const result = {
        app: 'skaz-active', schemaVersion: version, ruleset: '5e-2014', scope: 'active-game',
        exportedAt: new Date().toISOString(), source: { revision: current.revision, context: current.context },
        state: current.state, session: current.session,
        ...(version>=8?{characterStats:current.characterStats}:{}),
        ...(version>=9?{characterSheet:current.characterSheet}:{}),
        ...(version>=13?{advancement:current.advancement??null}:{}),
        inventory: inventory.map(({ catalogId, quantity, chargeCounts }) => ({ catalogId, quantity, ...(version >= 7 && chargeCounts ? { chargeCounts } : {}) })),
        ...(version >= 3 ? { spellbook: spellbook.map(({ catalogId, status }) => ({ catalogId, status })) } : {}),
        ...(version >= 4 ? { quests: quests.map(({ id, campaignId, createdSessionId, importedFrom, title, description, status, steps }) => ({ origin: importedFrom || { campaignId, questId: id, sessionId: createdSessionId }, quest: { title, description, status, steps } })) } : {}),
        ...(version >= 5 ? { places: places.map(({ id, campaignId, createdSessionId, importedFrom, title, description, x, y, visited }) => ({ origin: importedFrom || { campaignId, placeId: id, sessionId: createdSessionId }, place: { title, description, x, y, visited } })) } : {}),
        ...(version >= 6 ? { proposals: proposals.map(({ id, campaignId, sessionId, characterId, importedFrom, source, suggestion, status, appliedEntry }) => ({ origin: importedFrom || { campaignId, sessionId, characterId, proposalId: id }, source, suggestion, status, appliedEntry })) } : {}),
        catalog: { schemaVersion: 1, entries: [...entries.values()].sort((a, b) => a.id.localeCompare(b.id, 'en')) },
      };
      const exported=withArt?gameArtPackage(result,art,{lookup:id=>{const row=lookup.get(id);return row?JSON.parse(row.entry_json):null;}}):result;
      db.exec('COMMIT');
      return exported;
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  function update(request) {
    const next = validateState(request.state);
    const { expectedRevision, label } = request;
    const hash = createHash('sha256').update(JSON.stringify({ expectedRevision, label, state: next })).digest('hex');
    return mutate(request, hash, label, () => {const current=read();if(current.state.deathSaves!==undefined&&next.deathSaves===undefined)throw new AppError(409,'Обнови страницу: отсутствуют спасброски от смерти');if(current.state.concentrationChecks!==undefined&&next.concentrationChecks===undefined)throw new AppError(409,'Обнови страницу: отсутствуют проверки концентрации');if(current.state.tempHp!==undefined&&next.tempHp===undefined)throw new AppError(409,'Обнови страницу: отсутствуют временные хиты');if(current.characterSheet&&(JSON.stringify(current.state.slots)!==JSON.stringify(next.slots)||current.state.inspiration!==next.inspiration))throw new AppError(409,'Счётчики собственного класса изменяются в ручном листе');writeEntities(db, next, viewId); return next; });
  }
  function mutate(request, hash, label, apply, operation, allowStale, afterAuthorization) {
    const { mutationId, expectedRevision } = request;
    // Receipts belong to the originating window; another window cannot replay them.
    if (viewId !== undefined) hash = createHash('sha256').update(JSON.stringify({ viewId, hash })).digest('hex');
    if (typeof mutationId !== 'string' || !/^[a-zA-Z0-9-]{8,80}$/.test(mutationId)) throw new AppError(400, 'Нужен идентификатор изменения');
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new AppError(400, 'Нужна версия состояния');
    if (typeof label !== 'string' || !label.trim() || label.length > 200) throw new AppError(400, 'Нужно описание изменения');
    db.exec('BEGIN IMMEDIATE');
    try {
      const previous = db.prepare('SELECT * FROM changes WHERE mutation_id=?').get(mutationId);
      authorizeMutation({ phase: previous ? 'replay' : 'before', previous, mutationId });
      if (previous) {
        if (previous.request_hash !== hash) throw new AppError(409, 'Идентификатор уже использован для другого изменения');
        const receipt = db.prepare("SELECT after_json FROM context_changes WHERE mutation_id=? AND operation!='state'").get(mutationId);
        const response = { ...read(), replayed: true, ...(receipt ? { affectedContext: JSON.parse(receipt.after_json) } : {}) };
        db.exec('COMMIT');
        return response;
      }
      const current = read();
      if (current.revision !== expectedRevision && !(expectedRevision<current.revision&&allowStale?.())) throw new AppError(409, 'Данные изменились в другой вкладке. Загрузи актуальную версию.');
      const now = new Date().toISOString();
      const revision = current.revision + 1;
      const next = apply();
      db.prepare('INSERT INTO changes VALUES (?, ?, ?, ?, ?, ?, ?)').run(mutationId, revision, hash, label, JSON.stringify(current.state), JSON.stringify(next), now);
      const defaultContext = readEntities(db);
      const defaultState = joinState({ campaign: defaultContext.campaign.data, character: defaultContext.character.data, session: defaultContext.session.data });
      db.prepare('UPDATE workspace SET revision=?, state_json=?, updated_at=? WHERE id=1').run(revision, JSON.stringify(defaultState), now);
      const affectedContext = contextIds(readEntities(db, viewId));
      db.prepare('INSERT INTO context_changes VALUES (?, ?, ?, ?)').run(mutationId, operation || 'state', JSON.stringify(current.context), JSON.stringify(affectedContext));
      authorizeMutation({ phase: 'after', mutationId, beforeContext: current.context, context: affectedContext });
      afterAuthorization?.(affectedContext);
      const response = { ...read(), ...(operation ? { affectedContext } : {}) };
      db.exec('COMMIT');
      return response;
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  function gameCommand(operation, request) {
    const allowed = operation === 'session' ? ['mutationId', 'expectedRevision', 'session'] : operation === 'create' ? ['mutationId', 'expectedRevision', 'state'] : ['mutationId', 'expectedRevision', 'context'];
    if (!request || typeof request !== 'object' || Array.isArray(request) || Object.keys(request).some(key => !allowed.includes(key))) throw new AppError(400, 'Неверные поля команды');
    let payload;
    if (operation === 'session') payload = validateSession(request.session);
    else if (operation === 'create') payload = validateState(request.state);
    else {
      const ids = request.context;
      const keys = ['campaignId', 'characterId', 'sessionId'];
      if (!ids || typeof ids !== 'object' || Array.isArray(ids) || Object.keys(ids).length !== 3 || keys.some(key => typeof ids[key] !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(ids[key]))) throw new AppError(400, 'Нужны ID кампании, персонажа и сессии');
      payload = Object.fromEntries(keys.map(key => [key, ids[key]]));
    }
    const hash = createHash('sha256').update(JSON.stringify({ operation, expectedRevision: request.expectedRevision, payload })).digest('hex');
    return mutate(request, hash, operation === 'session' ? 'Начало сессии' : operation === 'create' ? 'Создание кампании' : 'Переключение игры', () => {
      if (operation === 'session') startSession(db, payload, viewId);
      else if (operation === 'create') createGame(db, payload, viewId); else selectGame(db, payload, viewId);
      return read().state;
    }, operation);
  }
  return {
    catalog: {...catalog, search: params => catalog.search(params, new Set(readSpellbook(db, read().context.characterId).map(item => item.catalogId)))},
    changeResource: request => {
      const payload=validateResourceCommand(request),hash=createHash('sha256').update(JSON.stringify({operation:'resource',expectedRevision:request.expectedRevision,payload})).digest('hex');
      // Preserve the established revision/identity receipt checks for replay.
      const label=payload.resource.kind==='cast'?'Сотворение: '+(payload.resource.command?.spell?.name||'отмена'):payload.resource.kind==='health'?'Здоровье: '+({damage:'урон',heal:'лечение',temporary:'временные хиты',restore:'отмена',pass:'концентрация пройдена',fail:'концентрация провалена','critical-damage':'критический урон','death-success':'успех от смерти','death-failure':'провал от смерти','death-1':'натуральная 1','death-20':'натуральная 20','death-stabilize':'стабилизация'}[payload.resource.operation])+' '+payload.delta:(payload.resource.kind==='hp'?'Хиты':payload.resource.kind==='slot'?payload.resource.level+' круг':payload.resource.kind==='inspiration'?'Вдохновение':payload.resource.kind==='counter'?'Счётчик':'Заряды')+': '+payload.before+' → '+(payload.resource.kind==='hp'?Math.max(0,Math.min(payload.maximum,payload.before+payload.delta)):payload.before+payload.delta);
      const saved=mutate(request,hash,payload.targetMutationId?'Отмена изменения ресурса':label,()=>{
        if(payload.targetMutationId){const inverse=inverseResource(db,read(),payload.targetMutationId);if(['delta','before','maximum'].some(k=>payload[k]!==inverse[k])||JSON.stringify(payload.resource)!==JSON.stringify(inverse.resource))throw new AppError(409,'Отмена не соответствует исходной операции');}
        const result=applyResourceCommand(db,read(),payload,request.mutationId,next=>writeEntities(db,next,viewId));
        recordResource(db,request.mutationId,{...payload,title:result.title,...(result.casting?{casting:result.casting}:{}),...(result.health?{tempAfter:result.health.tempHp,concentrationAfter:result.health.concentration,...(result.health.deathSaves?{deathAfter:result.health.deathSaves}:{}),...(result.health.concentrationChecks?{checksAfter:result.health.concentrationChecks}:{})}:{})},result.after,payload.targetMutationId||null);
        return result.state;
      },'resource',()=>independentResourcesSince(db,request.expectedRevision,payload));
      return {...saved,resourceReceipt:resourceReceipt(db,request.mutationId)};
    },
    undoResource: request=>{
      const payload=validateInventoryUndo(request),hash=createHash('sha256').update(JSON.stringify({operation:'resource-undo',expectedRevision:request.expectedRevision,payload})).digest('hex');
      return mutate(request,hash,'Отмена изменения ресурса',()=>{
        const current=read();if(payload.characterId!==current.context.characterId)throw new AppError(409,'Выбран другой персонаж');
        const inverse=inverseResource(db,current,payload.targetMutationId);
        const result=applyResourceCommand(db,current,inverse,request.mutationId,next=>writeEntities(db,next,viewId));
        recordResource(db,request.mutationId,{...inverse,title:result.title,...(result.casting?{casting:result.casting}:{}),...(result.health?{tempAfter:result.health.tempHp,concentrationAfter:result.health.concentration,...(result.health.deathSaves?{deathAfter:result.health.deathSaves}:{}),...(result.health.concentrationChecks?{checksAfter:result.health.concentrationChecks}:{})}:{})},result.after,payload.targetMutationId);
        return result.state;
      },'resource-undo');
    },
    createCharacter: request => {
      const payload = validateCharacterCreate(request);
      const hash = createHash('sha256').update(JSON.stringify({operation:'character-create',expectedRevision:request.expectedRevision,payload})).digest('hex');
      return mutate(request,hash,'Создание персонажа',()=>{createCharacter(db,payload,read().context,viewId);return read().state;},'character-create');
    },
    proposals: () => { const current = read(); return { revision: current.revision, context: current.context, proposals: readProposals(db,current.context) }; },
    createProposal: request => {
      const payload = validateProposalCreate(request);
      const hash = createHash('sha256').update(JSON.stringify({ operation: 'proposal-create', expectedRevision: request.expectedRevision, payload })).digest('hex');
      return mutate(request, hash, 'Предложение события', () => { createProposal(db,payload,request.mutationId,read().context); return read().state; }, 'proposal-create');
    },
    decideProposal: request => {
      const payload = validateProposalDecision(request);
      const hash = createHash('sha256').update(JSON.stringify({ operation: 'proposal-decide', expectedRevision: request.expectedRevision, payload })).digest('hex');
      return mutate(request, hash, payload.decision === 'accept' ? 'Подтверждение события' : 'Пропуск события', () => {
        const current = read(); const next = decideProposal(db,payload,request.mutationId,current.context,current.state); writeEntities(db,next,viewId); return next;
      }, 'proposal-decide');
    },
    places: () => { const current = read(); return { revision: current.revision, context: current.context, places: readPlaces(db, current.context.campaignId) }; },
    savePlace: request => {
      const payload = validatePlaceCommand(request);
      const hash = createHash('sha256').update(JSON.stringify({ operation: 'place-save', expectedRevision: request.expectedRevision, payload })).digest('hex');
      return mutate(request, hash, payload.operation === 'create' ? 'Новое место на карте' : 'Изменение места', () => {
        savePlace(db, payload, request.mutationId, read().context);
        return read().state;
      }, 'place-save');
    },
    quests: () => { const current = read(); return { revision: current.revision, context: current.context, quests: readQuests(db, current.context.campaignId) }; },
    saveQuest: request => {
      const payload = validateQuestCommand(request);
      const hash = createHash('sha256').update(JSON.stringify({ operation: 'quest-save', expectedRevision: request.expectedRevision, payload })).digest('hex');
      return mutate(request, hash, payload.operation === 'create' ? 'Создание задания' : 'Изменение задания', () => {
        saveQuest(db, payload, request.mutationId, read().context);
        return read().state;
      }, 'quest-save');
    },
    changeCharacterCounter:request=>{const payload=validateCounterCommand(request),hash=createHash('sha256').update(JSON.stringify({operation:'character-sheet-counter',expectedRevision:request.expectedRevision,payload})).digest('hex');return mutate(request,hash,'Изменение счётчика класса',()=>{changeCharacterCounter(db,payload,request.mutationId,read().context.characterId);return read().state;},'character-sheet-counter');},
    bindClassResources:request=>{
      if(!classAdvancement)throw new AppError(403,'Повышение уровня ещё не включено');
      const payload=validateResourceBindingCommand(request);
      const hash=createHash('sha256').update(JSON.stringify({operation:'class-resource-binding',payload})).digest('hex');
      return mutate(request,hash,'Подключение ресурсов класса',()=>{
        const change=buildResourceBinding(read(),payload);
        persistAdvancement(db,change,request.mutationId,payload.characterId);
        return change.state;
      },'class-resource-binding');
    },
    advanceCharacter:request=>{
      if(!classAdvancement)throw new AppError(403,'Повышение уровня ещё не включено');
      const payload=validateAdvancementCommand(request);
      const hash=createHash('sha256').update(JSON.stringify({operation:'class-advancement',payload})).digest('hex');
      return mutate(request,hash,'Повышение уровня персонажа',()=>{
        const change=buildAdvancementChange(read(),payload);
        persistAdvancement(db,change,request.mutationId,payload.characterId);
        writeEntities(db,change.state,viewId);
        return change.state;
      },'class-advancement');
    },
    saveCharacterSheet:request=>{
      const payload=validateSheetCommand(request),hash=createHash('sha256').update(JSON.stringify({operation:'character-sheet',expectedRevision:request.expectedRevision,payload})).digest('hex');
      return mutate(request,hash,'Ручной класс и счётчики',()=>{const current=read();if(current.advancement&&(!payload.sheet||payload.sheet.level!==current.characterSheet.level||payload.sheet.className!==current.characterSheet.className))throw new AppError(409,'Класс и уровень связаны с историей повышения');saveCharacterSheet(db,payload,request.mutationId,current.context.characterId);return read().state;},'character-sheet');
    },
    saveCharacterStats: request => {
      const payload=validateStatsCommand(request);
      const hash=createHash('sha256').update(JSON.stringify({operation:'character-stats',expectedRevision:request.expectedRevision,payload})).digest('hex');
      return mutate(request,hash,'Ручные характеристики персонажа',()=>{
        saveCharacterStats(db,payload,request.mutationId,read().context.characterId);
        return read().state;
      },'character-stats');
    },
    spellbook: () => { const current = read(); return { revision: current.revision, context: current.context, spellLearning:current.spellLearning, entries: readSpellbook(db, current.context.characterId) }; },
    setSpell: request => {
      const payload = validateSpellCommand(request);
      const hash = createHash('sha256').update(JSON.stringify({ operation: 'spell-set', expectedRevision: request.expectedRevision, payload })).digest('hex');
      return mutate(request, hash, 'Изменение списка заклинаний', () => {
        setSpell(db, payload, request.mutationId, read().context.characterId);
        return read().state;
      }, 'spell-set');
    },
    inventory: () => {
      const current = read();
      const last = db.prepare(`SELECT c.mutation_id AS mutationId, c.label FROM changes c
        JOIN inventory_changes i ON i.mutation_id=c.mutation_id
        JOIN context_changes x ON x.mutation_id=c.mutation_id
        WHERE c.revision=? AND i.character_id=? AND x.operation IN ('inventory-add','inventory-remove','inventory-charges')`).get(current.revision, current.context.characterId);
      return { revision: current.revision, context: current.context, entries: readInventory(db, current.context.characterId), undo: last ? { ...last } : null };
    },
    changeCharges: request => {
      const payload = validateChargeCommand(request);
      const hash = createHash('sha256').update(JSON.stringify({ operation: 'inventory-charges', expectedRevision: request.expectedRevision, payload })).digest('hex');
      return mutate(request, hash, 'Изменение зарядов предмета', () => {
        changeCharges(db, payload, request.mutationId, read().context.characterId);
        return read().state;
      }, 'inventory-charges');
    },
    addInventory: request => {
      const payload = validateInventoryQuantity(request);
      const hash = createHash('sha256').update(JSON.stringify({ operation: 'inventory-add', expectedRevision: request.expectedRevision, payload })).digest('hex');
      return mutate(request, hash, 'Добавление предмета', () => {
        addInventory(db, payload, request.mutationId, read().context.characterId);
        return read().state;
      }, 'inventory-add');
    },
    removeInventory: request => {
      const payload = validateInventoryQuantity(request);
      const hash = createHash('sha256').update(JSON.stringify({ operation: 'inventory-remove', expectedRevision: request.expectedRevision, payload })).digest('hex');
      return mutate(request, hash, 'Списание предмета', () => {
        removeInventory(db, payload, request.mutationId, read().context.characterId);
        return read().state;
      }, 'inventory-remove');
    },
    undoInventory: request => {
      const payload = validateInventoryUndo(request);
      const hash = createHash('sha256').update(JSON.stringify({ operation: 'inventory-undo', expectedRevision: request.expectedRevision, payload })).digest('hex');
      return mutate(request, hash, 'Отмена операции инвентаря', () => {
        undoInventory(db, payload, request.mutationId, read());
        return read().state;
      }, 'inventory-undo');
    },
    context: () => readEntities(db, viewId),
    campaigns: () => listGames(db),
    createCampaign: request => gameCommand('create', request),
    selectContext: request => gameCommand('select', request),
    startSession: request => gameCommand('session', request),
    sessions: campaignId => listSessions(db, campaignId),
    session: id => readSession(db, id),
    sessionReview: id => {
      db.exec('BEGIN');
      try {
        const current = read(), session = readSession(db,id);
        if (session.campaignId !== current.context.campaignId) throw new AppError(404, 'Сессия не найдена в активной кампании');
        const proposals = readProposals(db,{ ...current.context,sessionId:id });
        const result = { revision: current.revision, context: current.context, characterName: current.state.profile.name, session, proposals };
        db.exec('COMMIT'); return result;
      } catch(error) { db.exec('ROLLBACK'); throw error; }
    },
    importActive: request => {
      if (!request || typeof request !== 'object' || Array.isArray(request) || Object.keys(request).some(key => !['mutationId','expectedRevision','destination','file'].includes(key)) || request.destination !== 'new-campaign') throw new AppError(400, 'Импорт требует новую кампанию');
      const withArt=request.file?.app==='skaz-game-with-art';
      if(withArt&&!personalArt)throw new AppError(403,'Перенос личных изображений не включён');
      const parsed=withArt?validateGameArtPackage(request.file):null;
      const payload = parsed?.game??validateTransfer(request.file);
      if(payload.advancement&&!classAdvancement)throw new AppError(403,'Перенос повышения уровня ещё не включён');
      const hash = createHash('sha256').update(JSON.stringify({ operation: 'import-active', expectedRevision: request.expectedRevision, payload,...(withArt?{personalArt:request.file.personalArt}:{}) })).digest('hex');
      return mutate(request, hash, 'Импорт игры с инвентарём', () => {
        importTransfer(db, payload, request.mutationId, viewId);
        return read().state;
      }, 'import-active',undefined,withArt?context=>personalArt.importCharacter({characterId:context.characterId,mutationId:request.mutationId,expectedRevisions:Object.fromEntries(parsed.art.map(entry=>[entry.catalogId,0])),bundle:request.file.personalArt}):undefined);
    },
    read, update, exportActive,
    history: (scope='all') => {const current=read();const rows=scope==='session'?db.prepare(`SELECT c.* FROM changes c JOIN context_changes x ON x.mutation_id=c.mutation_id WHERE json_extract(x.after_json,'$.campaignId')=? AND json_extract(x.after_json,'$.characterId')=? AND json_extract(x.after_json,'$.sessionId')=? ORDER BY c.revision DESC LIMIT 50`).all(current.context.campaignId,current.context.characterId,current.context.sessionId):db.prepare('SELECT * FROM changes ORDER BY revision DESC LIMIT 50').all();return rows.map(row=>historyDetail(db,row,current));},
    backup: destination => backup(db, destination),
    close: () => db.close(),
  };
  }
  const root = createView();
  let authentication,personalArtAccess;
  return { ...root, access, authentication: () => authentication ??= createAuthentication(db), forUser: (userId, viewId, { write = false, guard = () => {}, personalArt=false } = {}) => {
    if (typeof write !== 'boolean') throw new AppError(422, 'Режим записи должен быть логическим значением');
    if (typeof guard !== 'function') throw new AppError(422,'Нужна доверенная проверка сессии');
    if(typeof personalArt!=='boolean')throw new AppError(422,'Неверный режим личных изображений');
    // Trusted opt-in only; production HTTP does not enable this capability yet.
    const art=personalArt?(personalArtAccess??=createPersonalArtAccess(db,access))(userId,{write,guard}):undefined;
    const scopedView=(id,authorize,mutation)=>createView(id,authorize,mutation,art,userId);
    const scoped=write?createUserWriter(db,access,userId,viewId,scopedView,guard):createUserReader(db,access,userId,viewId,scopedView,guard);
    return art?Object.freeze({...scoped,personalArt:art}):scoped;
  },
    forView: viewId => { ensureView(db, viewId); return createView(viewId); } };
}
