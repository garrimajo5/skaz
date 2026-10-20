import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { AppError } from './state.mjs';
import { bundledCatalog } from './bundled-catalog.mjs';
import { createCatalog, validateCatalog } from './catalog.mjs';
import { splitState } from './entities.mjs';

const missing = () => { throw new AppError(404, 'Данные недоступны'); };
const disabled = () => { throw new AppError(403, 'Операция пока недоступна в режиме индивидуального доступа'); };
const permissions = (role, write) => ({
  mode: 'individual', role, character: write, shared: write && role !== 'player',
  manageCampaign: write && role !== 'player', catalog: false, newCampaign: write,
  select: write, import: write, history: write, export: true,
});
const id = value => {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9-]{8,80}$/.test(value)) throw new AppError(422, 'Неверный идентификатор доступа');
  return value;
};

// Administrative API only. No HTTP route exposes this object. It stores identity
// and grants, not passwords; authentication must supply a verified user ID later.
export function createAccess(db) {
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec('CREATE TABLE IF NOT EXISTS access_schema (id INTEGER PRIMARY KEY CHECK(id=1), version INTEGER NOT NULL)');
    db.prepare('INSERT OR IGNORE INTO access_schema VALUES (1,1)').run();
    if (db.prepare('SELECT version FROM access_schema WHERE id=1').get().version !== 1) throw new Error('Неподдерживаемая версия модели доступа');
    db.exec(`
    CREATE TABLE IF NOT EXISTS access_users (
      id TEXT PRIMARY KEY, display_name TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)));
    CREATE TABLE IF NOT EXISTS campaign_memberships (
      user_id TEXT NOT NULL REFERENCES access_users(id),
      campaign_id TEXT NOT NULL REFERENCES campaigns(id),
      role TEXT NOT NULL CHECK(role IN ('owner','gm','player')),
      PRIMARY KEY(user_id,campaign_id));
    CREATE TABLE IF NOT EXISTS character_access (
      user_id TEXT NOT NULL, campaign_id TEXT NOT NULL, character_id TEXT NOT NULL,
      PRIMARY KEY(user_id,character_id),
      FOREIGN KEY(user_id,campaign_id) REFERENCES campaign_memberships(user_id,campaign_id) ON DELETE CASCADE,
      FOREIGN KEY(character_id,campaign_id) REFERENCES characters(id,campaign_id));
    CREATE TABLE IF NOT EXISTS user_views (
      user_id TEXT NOT NULL REFERENCES access_users(id), client_view_id TEXT NOT NULL,
      browser_view_id TEXT NOT NULL UNIQUE REFERENCES browser_contexts(view_id),
      PRIMARY KEY(user_id,client_view_id));
    CREATE TABLE IF NOT EXISTS access_audit (
      sequence INTEGER PRIMARY KEY, action TEXT NOT NULL, user_id TEXT NOT NULL,
      campaign_id TEXT, character_id TEXT, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS user_changes (
      mutation_id TEXT PRIMARY KEY REFERENCES changes(mutation_id),
      user_id TEXT NOT NULL REFERENCES access_users(id),
      before_context TEXT NOT NULL, after_context TEXT NOT NULL);
    COMMIT;`); } catch(error) { db.exec('ROLLBACK'); throw error; }

  function user(userId) {
    id(userId);
    const row = db.prepare('SELECT id,display_name AS displayName,enabled FROM access_users WHERE id=? AND enabled=1').get(userId);
    if (!row) missing();
    return { ...row, enabled: true };
  }
  function membership(userId, campaignId) {
    user(userId); id(campaignId);
    const row = db.prepare('SELECT role FROM campaign_memberships WHERE user_id=? AND campaign_id=?').get(userId,campaignId);
    if (!row) missing();
    return row.role;
  }
  function character(userId, campaignId, characterId) {
    membership(userId,campaignId); id(characterId);
    if (!db.prepare('SELECT 1 FROM character_access WHERE user_id=? AND campaign_id=? AND character_id=?').get(userId,campaignId,characterId)) missing();
  }
  function context(userId, value) {
    if (!value || typeof value !== 'object') missing();
    character(userId,value.campaignId,value.characterId); id(value.sessionId);
    if (!db.prepare('SELECT 1 FROM sessions WHERE id=? AND campaign_id=?').get(value.sessionId,value.campaignId)) missing();
  }
  function remainingOwner(userId, campaignId) {
    if (db.prepare("SELECT 1 FROM campaign_memberships m JOIN access_users u ON u.id=m.user_id WHERE m.user_id=? AND m.campaign_id=? AND m.role='owner' AND u.enabled=1").get(userId,campaignId)
      && !db.prepare("SELECT 1 FROM campaign_memberships m JOIN access_users u ON u.id=m.user_id WHERE m.campaign_id=? AND m.user_id<>? AND m.role='owner' AND u.enabled=1").get(campaignId,userId)) {
      throw new AppError(409, 'Сначала назначьте другого активного владельца кампании');
    }
  }
  function apply(command) {
    if (!command || typeof command !== 'object' || Array.isArray(command)) throw new AppError(422,'Нужна административная команда');
    const fields = {
      'create-user': ['action','userId','displayName'],
      'set-member': ['action','userId','campaignId','role'],
      'remove-member': ['action','userId','campaignId'],
      'grant-character': ['action','userId','campaignId','characterId'],
      'revoke-character': ['action','userId','campaignId','characterId'],
      'set-enabled': ['action','userId','enabled'],
      'bootstrap-owner': ['action','userId','displayName','campaignId','characterId'],
    }[command.action];
    if (!fields || Object.keys(command).length !== fields.length || fields.some(key=>!Object.hasOwn(command,key))) throw new AppError(422,'Неверные поля административной команды');
    id(command.userId);
    if (fields.includes('campaignId')) id(command.campaignId);
    if (fields.includes('characterId')) id(command.characterId);
    if (fields.includes('displayName') && (typeof command.displayName !== 'string' || !command.displayName.trim() || command.displayName.length > 80)) throw new AppError(422,'Нужно имя до 80 символов');
    if (fields.includes('role') && !['owner','gm','player'].includes(command.role)) throw new AppError(422,'Неизвестная роль');
    if (fields.includes('enabled') && typeof command.enabled !== 'boolean') throw new AppError(422,'Нужен логический статус пользователя');
    const {action,userId,campaignId,characterId} = command;
    db.exec('BEGIN IMMEDIATE');
    try {
      const existing = db.prepare('SELECT * FROM access_users WHERE id=?').get(userId);
      if (action === 'create-user' || action === 'bootstrap-owner') {
        if (existing && (existing.display_name !== command.displayName.trim() || existing.enabled !== 1)) throw new AppError(409,'Пользователь уже существует с другими данными');
        db.prepare('INSERT OR IGNORE INTO access_users(id,display_name) VALUES (?,?)').run(userId,command.displayName.trim());
      } else if (!existing) missing();
      if (campaignId && !db.prepare('SELECT 1 FROM campaigns WHERE id=?').get(campaignId)) missing();
      if (characterId && !db.prepare('SELECT 1 FROM characters WHERE id=? AND campaign_id=?').get(characterId,campaignId)) missing();
      if (action === 'set-member' || action === 'bootstrap-owner') {
        user(userId);
        if (action === 'set-member' && command.role !== 'owner') remainingOwner(userId,campaignId);
        db.prepare('INSERT INTO campaign_memberships VALUES (?,?,?) ON CONFLICT(user_id,campaign_id) DO UPDATE SET role=excluded.role').run(userId,campaignId,action === 'bootstrap-owner' ? 'owner' : command.role);
      }
      if (action === 'remove-member') {
        remainingOwner(userId,campaignId);
        db.prepare('DELETE FROM campaign_memberships WHERE user_id=? AND campaign_id=?').run(userId,campaignId);
      }
      if (action === 'grant-character' || action === 'bootstrap-owner') {
        membership(userId,campaignId);
        db.prepare('INSERT OR IGNORE INTO character_access VALUES (?,?,?)').run(userId,campaignId,characterId);
      }
      if (action === 'revoke-character') db.prepare('DELETE FROM character_access WHERE user_id=? AND campaign_id=? AND character_id=?').run(userId,campaignId,characterId);
      if (action === 'set-enabled') {
        if (!command.enabled) for (const row of db.prepare('SELECT campaign_id FROM campaign_memberships WHERE user_id=?').all(userId)) remainingOwner(userId,row.campaign_id);
        db.prepare('UPDATE access_users SET enabled=? WHERE id=?').run(Number(command.enabled),userId);
      }
      db.prepare('INSERT INTO access_audit(action,user_id,campaign_id,character_id,created_at) VALUES (?,?,?,?,?)').run(action,userId,campaignId??null,characterId??null,new Date().toISOString());
      db.exec('COMMIT');
      return { applied:true, action, userId, ...(campaignId ? {campaignId}:{}), ...(characterId ? {characterId}:{}) };
    } catch(error) { db.exec('ROLLBACK'); throw error; }
  }
  function bindView(userId, clientViewId) {
    user(userId); id(clientViewId);
    db.exec('BEGIN IMMEDIATE');
    try {
      const saved = db.prepare('SELECT browser_view_id FROM user_views WHERE user_id=? AND client_view_id=?').get(userId,clientViewId);
      if (saved) {
        const selected=db.prepare('SELECT campaign_id AS campaignId,character_id AS characterId,session_id AS sessionId FROM browser_contexts WHERE view_id=?').get(saved.browser_view_id);
        context(userId,selected); db.exec('COMMIT'); return saved.browser_view_id;
      }
      // Do not copy the unrestricted default hero or silently retarget a revoked view.
      const selected=db.prepare(`SELECT g.campaign_id,g.character_id,s.id AS session_id
        FROM character_access g JOIN campaign_memberships m ON m.user_id=g.user_id AND m.campaign_id=g.campaign_id
        JOIN sessions s ON s.campaign_id=g.campaign_id LEFT JOIN session_details d ON d.session_id=s.id
        WHERE g.user_id=? AND coalesce(d.archived,0)=0 ORDER BY g.rowid,s.rowid DESC LIMIT 1`).get(userId);
      if (!selected) missing();
      if (db.prepare('SELECT count(*) AS n FROM browser_contexts').get().n >= 10000) throw new AppError(409,'Достигнут лимит сохранённых окон');
      const viewId='user-'+createHash('sha256').update(userId+'\0'+clientViewId).digest('hex');
      if (db.prepare('SELECT 1 FROM browser_contexts WHERE view_id=?').get(viewId)) throw new AppError(409,'Идентификатор окна уже занят');
      db.prepare('INSERT INTO browser_contexts VALUES (?,?,?,?)').run(viewId,selected.campaign_id,selected.character_id,selected.session_id);
      db.prepare('INSERT INTO user_views VALUES (?,?,?)').run(userId,clientViewId,viewId);
      db.exec('COMMIT'); return viewId;
    } catch(error) { db.exec('ROLLBACK'); throw error; }
  }
  function hasPlayableCharacter(userId) {
    user(userId);
    return Boolean(db.prepare(`SELECT 1 FROM character_access g
      JOIN campaign_memberships m ON m.user_id=g.user_id AND m.campaign_id=g.campaign_id
      JOIN sessions s ON s.campaign_id=g.campaign_id LEFT JOIN session_details d ON d.session_id=s.id
      WHERE g.user_id=? AND coalesce(d.archived,0)=0 LIMIT 1`).get(userId));
  }
  return { apply, user, membership, character, context, bindView, hasPlayableCharacter };
}

// Read-only first stage. The trusted caller supplies an authenticated user ID;
// this facade is deliberately NOT wired to the existing shared-password HTTP API.
export function createUserReader(db, access, userId, clientViewId, createView, guard=()=>{}) {
  guard();
  const viewId=access.bindView(userId,clientViewId), view=createView(viewId,()=>active());
  const shared=new Map(validateCatalog(bundledCatalog().bundle).map(entry=>[entry.id,entry]));
  const visible=entry=>isDeepStrictEqual(shared.get(entry.id),entry);
  const catalog=createCatalog(db,{ visible });
  function active() {
    guard();
    access.user(userId);
    const ids=db.prepare('SELECT campaign_id AS campaignId,character_id AS characterId,session_id AS sessionId FROM browser_contexts WHERE view_id=?').get(viewId);
    access.context(userId,ids); return ids;
  }
  // Each complete read shares a SQLite snapshot with its authorization checks.
  function read(fn, ownTransaction=false) {
    if (ownTransaction) { active(); return fn(); }
    db.exec('BEGIN');
    try { active(); const result=fn(); db.exec('COMMIT'); return result; }
    catch(error) { db.exec('ROLLBACK'); throw error; }
  }
  const result={};
  result.permissions=()=>read(()=>permissions(access.membership(userId,active().campaignId),false));
  for (const method of ['read','context','proposals','places','quests','spellbook','inventory']) result[method]=()=>read(()=>view[method]());
  result.inventory=()=>read(()=>({...view.inventory(),undo:null}));
  result.campaigns=()=>read(()=>view.campaigns().filter(c=>db.prepare('SELECT 1 FROM campaign_memberships WHERE user_id=? AND campaign_id=?').get(userId,c.id)).map(c=>({...c,characters:c.characters.filter(h=>db.prepare('SELECT 1 FROM character_access WHERE user_id=? AND character_id=?').get(userId,h.id))})));
  result.sessions=campaignId=>read(()=>{access.membership(userId,campaignId);return view.sessions(campaignId);});
  result.session=sessionId=>read(()=>{
    const row=db.prepare('SELECT campaign_id FROM sessions WHERE id=?').get(id(sessionId));
    if (!row) missing(); access.membership(userId,row.campaign_id); return view.session(sessionId);
  });
  result.sessionReview=sessionId=>read(()=>view.sessionReview(sessionId),true);
  result.exportActive=(version=7)=>read(()=>{
    const exported=view.exportActive(version);
    if (exported.catalog.entries.some(entry=>!visible(entry))) disabled();
    return exported;
  },true);
  result.catalog={};
  for (const method of ['search','coverage','spellInventory','lookup']) result.catalog[method]=(...args)=>read(()=>catalog[method](...args));
  for (const method of ['importEntries','reviewedImport','previewBundled','installBundled']) result.catalog[method]=disabled;
  // Never leak a raw store method by spreading it into a scoped capability.
  for (const method of ['update','createCampaign','selectContext','startSession','createCharacter','importActive','createProposal','decideProposal','savePlace','saveQuest','setSpell','changeCharges','addInventory','removeInventory','undoInventory','history','backup','close','forView','forUser']) result[method]=disabled;
  return Object.freeze({...result,catalog:Object.freeze(result.catalog)});
}

// Write capability remains opt-in for a trusted authentication adapter. All
// authorization and automatic ownership of NEW entities occur inside mutate's
// transaction, including replay checks and the actor receipt.
export function createUserWriter(db, access, userId, clientViewId, createView, guard=()=>{}) {
  const reader=createUserReader(db,access,userId,clientViewId,createView,guard);
  const viewId=access.bindView(userId,clientViewId);
  const shared=new Map(validateCatalog(bundledCatalog().bundle).map(entry=>[entry.id,entry]));
  function current() {
    guard();
    const ids=db.prepare('SELECT campaign_id AS campaignId,character_id AS characterId,session_id AS sessionId FROM browser_contexts WHERE view_id=?').get(viewId);
    access.context(userId,ids);return ids;
  }
  function requireGM(context) {
    if (!['owner','gm'].includes(access.membership(userId,context.campaignId))) throw new AppError(403,'Изменение общих данных доступно мастеру или владельцу');
  }
  function allowed(method, request, context, beforeState) {
    access.context(userId,context);
    if (['savePlace','saveQuest','startSession','createCharacter'].includes(method)) requireGM(context);
    if (method==='selectContext') access.context(userId,request?.context);
    if (method==='undoInventory' && !db.prepare('SELECT 1 FROM user_changes WHERE mutation_id=? AND user_id=?').get(request?.targetMutationId??'',userId)) missing();
    if (method==='update') {
      const before=splitState(beforeState),after=splitState(request?.state);
      if (!isDeepStrictEqual(before.campaign,after.campaign) || !isDeepStrictEqual(before.session,after.session)) requireGM(context);
    }
    if (method==='createProposal' && request?.suggestion?.kind==='journal') requireGM(context);
    if (method==='decideProposal') {
      const row=db.prepare('SELECT campaign_id,character_id,suggestion_json FROM event_proposals WHERE id=?').get(request?.proposalId??'');
      if (!row || row.campaign_id!==context.campaignId || row.character_id!==context.characterId) missing();
      if (JSON.parse(row.suggestion_json).kind==='journal') requireGM(context);
    }
    if (['addInventory','setSpell'].includes(method) && request?.status!=='remove') {
      const row=db.prepare('SELECT entry_json FROM catalog_entries WHERE id=?').get(request?.catalogId??'');
      if (!row || !isDeepStrictEqual(shared.get(request.catalogId),JSON.parse(row.entry_json))) missing();
    }
    if (method==='importActive') {
      if (!Array.isArray(request?.file?.catalog?.entries) || request.file.catalog.entries.some(entry=>!isDeepStrictEqual(shared.get(entry?.id),entry))) disabled();
    }
  }
  const result={...reader};
  result.permissions=()=>{
    db.exec('BEGIN');
    try {const selected=current(),value=permissions(access.membership(userId,selected.campaignId),true);db.exec('COMMIT');return value;}
    catch(error){db.exec('ROLLBACK');throw error;}
  };
  result.inventory=()=>{
    db.exec('BEGIN');
    try {
      current();
      const inventory=createView(viewId).inventory();
      if (inventory.undo && !db.prepare('SELECT 1 FROM user_changes WHERE mutation_id=? AND user_id=?').get(inventory.undo.mutationId,userId)) inventory.undo=null;
      db.exec('COMMIT');return inventory;
    } catch(error) {db.exec('ROLLBACK');throw error;}
  };
  const methods=['update','createCampaign','selectContext','startSession','createCharacter','importActive','createProposal','decideProposal','savePlace','saveQuest','setSpell','changeCharges','addInventory','removeInventory','undoInventory'];
  for (const method of methods) result[method]=request=>{
    const mutationView=createView(viewId,()=>{},event=>{
      // Revocation is checked inside BEGIN IMMEDIATE, not merely at dispatch.
      if (event.phase !== 'after') current();
      else access.context(userId,event.beforeContext);
      if (event.phase==='before') allowed(method,request,current(),mutationView.read().state);
      if (event.phase==='replay') {
        const receipt=db.prepare('SELECT * FROM user_changes WHERE mutation_id=? AND user_id=?').get(event.mutationId,userId);
        if (!receipt) missing();
        const before=JSON.parse(receipt.before_context),after=JSON.parse(receipt.after_context);
        access.context(userId,before);access.context(userId,after);
        allowed(method,request,before,JSON.parse(event.previous.before_json));
      }
      if (event.phase==='after') {
        const next=event.context;
        if (['createCampaign','importActive'].includes(method)) {
          if (next.campaignId===event.beforeContext.campaignId) throw new Error('Создание не сменило кампанию');
          db.prepare("INSERT INTO campaign_memberships VALUES (?,?,'owner')").run(userId,next.campaignId);
        }
        if (['createCampaign','importActive','createCharacter'].includes(method)) {
          db.prepare('INSERT INTO character_access VALUES (?,?,?)').run(userId,next.campaignId,next.characterId);
          db.prepare("INSERT INTO access_audit(action,user_id,campaign_id,character_id,created_at) VALUES ('claim-created',?,?,?,?)").run(userId,next.campaignId,next.characterId,new Date().toISOString());
        }
        access.context(userId,next);
        db.prepare('INSERT INTO user_changes VALUES (?,?,?,?)').run(event.mutationId,userId,JSON.stringify(event.beforeContext),JSON.stringify(next));
      }
    });
    return mutationView[method](request);
  };
  result.history=()=>{
    db.exec('BEGIN');
    try {
      const selected=current();
      const rows=db.prepare(`SELECT c.revision,c.label,c.created_at AS createdAt,u.before_context,u.after_context
        FROM user_changes u JOIN changes c ON c.mutation_id=u.mutation_id WHERE u.user_id=? ORDER BY c.revision DESC`).all(userId);
      const filtered=[];
      for (const row of rows) {
        const before=JSON.parse(row.before_context),after=JSON.parse(row.after_context);
        try {access.context(userId,before);access.context(userId,after);} catch(error) {if(error instanceof AppError&&error.status===404)continue;throw error;}
        if (after.campaignId!==selected.campaignId || after.characterId!==selected.characterId) continue;
        filtered.push({revision:row.revision,label:row.label,createdAt:row.createdAt});if(filtered.length===50)break;
      }
      db.exec('COMMIT');return filtered;
    } catch(error) {db.exec('ROLLBACK');throw error;}
  };
  return Object.freeze(result);
}
