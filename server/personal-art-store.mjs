// Opt-in #38 storage; production startup does not enable this capability yet.
// Identity and character authorization must come from trusted session adapters.
import {createHash} from 'node:crypto';
import {AppError} from './state.mjs';
import {normalizePersonalArt,personalArtLimits} from './personal-art-image.mjs';
import {inspectPng} from '../scripts/art-registry.mjs';
import {personalArtTransfer,validatePersonalArtTransfer} from './personal-art-transfer.mjs';

const fail=(status,message)=>{throw new AppError(status,message);};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const validId=v=>typeof v==='string'&&/^[a-zA-Z0-9:_-]{1,160}$/.test(v);
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
export const personalStorageLimits=Object.freeze({bytes:32*1024*1024,versions:1000,bindings:1000});
export const personalArtRetentionMs=30*24*60*60*1000;

function setup(db){
 const nested=db.isTransaction;
 db.exec(nested?'SAVEPOINT personal_art_schema_setup':'BEGIN IMMEDIATE');
 try{
 const exists=name=>!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
 const versioned=exists('personal_art_schema');
 if(versioned&&db.prepare('SELECT version FROM personal_art_schema WHERE id=1').get()?.version!==1)throw Error('Неподдерживаемая версия личных изображений; база не изменена');
 const shapes={personal_art_versions:['user_id','character_id','catalog_id','revision','mutation_id','request_hash','master','thumbnail','master_sha','thumbnail_sha','created_at'],personal_art_imports:['user_id','character_id','mutation_id','request_hash','result_json','created_at']};
 for(const [table,columns] of Object.entries(shapes)){
  if(!exists(table)){if(versioned)throw Error('Отсутствует таблица личных изображений; требуется восстановление');continue;}
  const actual=db.prepare('PRAGMA table_info('+table+')').all().map(c=>c.name);
  if(JSON.stringify(actual)!==JSON.stringify(columns))throw Error('Неподдерживаемая структура личных изображений; база не изменена');
 }
  db.exec(`CREATE TABLE IF NOT EXISTS personal_art_schema(id INTEGER PRIMARY KEY CHECK(id=1),version INTEGER NOT NULL);
  INSERT OR IGNORE INTO personal_art_schema VALUES (1,1);`);
  createTables(db);
  db.exec(nested?'RELEASE personal_art_schema_setup':'COMMIT');
 }catch(error){db.exec(nested?'ROLLBACK TO personal_art_schema_setup':'ROLLBACK');if(nested)db.exec('RELEASE personal_art_schema_setup');throw error;}
}

function createTables(db){
 db.exec(`CREATE TABLE IF NOT EXISTS personal_art_versions (
  user_id TEXT NOT NULL REFERENCES access_users(id), character_id TEXT NOT NULL REFERENCES characters(id), catalog_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK(revision>0), mutation_id TEXT NOT NULL,
  request_hash TEXT NOT NULL, master BLOB, thumbnail BLOB, master_sha TEXT, thumbnail_sha TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY(user_id,character_id,catalog_id,revision), UNIQUE(user_id,mutation_id),
  CHECK((master IS NULL AND thumbnail IS NULL AND master_sha IS NULL AND thumbnail_sha IS NULL)
     OR (master IS NOT NULL AND thumbnail IS NOT NULL AND master_sha IS NOT NULL AND thumbnail_sha IS NOT NULL)));
 CREATE INDEX IF NOT EXISTS personal_art_user_character ON personal_art_versions(user_id,character_id);
 CREATE TABLE IF NOT EXISTS personal_art_imports (
  user_id TEXT NOT NULL REFERENCES access_users(id), character_id TEXT NOT NULL REFERENCES characters(id),
  mutation_id TEXT NOT NULL, request_hash TEXT NOT NULL, result_json TEXT NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY(user_id,mutation_id));`);
}

export function createPersonalArtStore(db,{authorize,catalogExists,limits=personalStorageLimits,now=Date.now}={}){
 if(typeof authorize!=='function'||typeof catalogExists!=='function')throw Error('Trusted synchronous authorization and catalog adapters required');
 limits={...personalStorageLimits,...limits};
 if(!Number.isSafeInteger(limits.bytes)||limits.bytes<1||!Number.isSafeInteger(limits.versions)||limits.versions<1)throw Error('Invalid personal art quota');
 if(!Number.isSafeInteger(limits.bindings)||limits.bindings<1||typeof now!=='function')throw Error('Invalid personal art policy');
 setup(db);
 let depth=0;
 function transaction(fn){
  const level=depth++,name='personal_art_nested_'+level,nested=level>0||db.isTransaction;
  try{db.exec(nested?'SAVEPOINT '+name:'BEGIN IMMEDIATE');try{const result=fn();db.exec(nested?'RELEASE '+name:'COMMIT');return result;}catch(e){db.exec(nested?'ROLLBACK TO '+name:'ROLLBACK');if(nested)db.exec('RELEASE '+name);throw e;}}finally{depth--;}
 }
 function characterScope(userId,characterId,write){
  if(![userId,characterId].every(validId))fail(422,'Неверная область изображения');
  if(authorize(userId,characterId,write)!==true)fail(404,'Изображение недоступно');
 }
 function scope(userId,characterId,catalogId,write){
  if(![userId,characterId,catalogId].every(validId))fail(422,'Неверная область изображения');
  // Check even before receipts and missing-file results. No captured grant/cache.
  characterScope(userId,characterId,write);
  if(catalogExists(catalogId)!==true)fail(404,'Запись каталога недоступна');
 }
 function latest(u,c,id){return db.prepare('SELECT * FROM personal_art_versions WHERE user_id=? AND character_id=? AND catalog_id=? ORDER BY revision DESC LIMIT 1').get(u,c,id);}
 function timestamp(){const value=now();if(!Number.isSafeInteger(value)||value<0)throw Error('Invalid personal art clock');return value;}
 function prune(userId,characterId,catalogId){
  // Never delete the latest row: even a standard-art tombstone preserves the
  // revision high-water mark so an expired command cannot run again.
  // Retention starts when a later version supersedes this one, not when the
  // original image was uploaded. Resetting a year-old image still grants undo.
  return db.prepare(`DELETE FROM personal_art_versions AS old WHERE user_id=? AND character_id=? AND catalog_id=?
   AND EXISTS (SELECT 1 FROM personal_art_versions newer WHERE newer.user_id=old.user_id AND newer.character_id=old.character_id AND newer.catalog_id=old.catalog_id AND newer.revision>old.revision AND newer.created_at<?)`)
   .run(userId,characterId,catalogId,new Date(timestamp()-personalArtRetentionMs).toISOString()).changes;
 }
 function metadata(row){return {revision:row?.revision??0,standard:!row?.master,mutationId:row?.mutation_id??null};}
 function file(row,role){
  if(!row?.master)return null;
  const bytes=Buffer.from(row[role]),expected=row[role+'_sha'];
  try{const info=inspectPng(bytes);if(info.sha256!==expected||info.width!==info.height||info.width>(role==='master'?512:96))throw Error('Invalid stored image');}
  catch{fail(409,'Личное изображение повреждено; требуется восстановление из копии');}
  return {bytes,sha256:expected,type:'image/png'};
 }
 function view(userId){
  if(!validId(userId))fail(422,'Неверный пользователь');
  const api={
   usage(characterId){
    characterScope(userId,characterId,false);
    return transaction(()=>{
     characterScope(userId,characterId,false);
     const totals=db.prepare('SELECT count(master) AS versions,coalesce(sum(length(master)+length(thumbnail)),0) AS bytes FROM personal_art_versions WHERE user_id=?').get(userId);
     const bindings=db.prepare('SELECT count(*) AS n FROM (SELECT 1 FROM personal_art_versions WHERE user_id=? GROUP BY character_id,catalog_id)').get(userId).n;
     return {...totals,bindings,limits:{...limits},retentionDays:personalArtRetentionMs/86400000};
    });
   },
   exportCharacter(characterId){
    characterScope(userId,characterId,false);
    return transaction(()=>{
     characterScope(userId,characterId,false);
     const rows=db.prepare(`SELECT v.* FROM personal_art_versions v WHERE v.user_id=? AND v.character_id=? AND v.revision=(SELECT max(n.revision) FROM personal_art_versions n WHERE n.user_id=v.user_id AND n.character_id=v.character_id AND n.catalog_id=v.catalog_id) ORDER BY catalog_id`).all(userId,characterId);
     return personalArtTransfer(rows.filter(row=>row.master!==null).map(row=>{scope(userId,characterId,row.catalog_id,false);return {catalogId:row.catalog_id,bytes:file(row,'master').bytes};}));
    });
   },
   importCharacter(request){
    if(!object(request)||Object.keys(request).length!==4||!['characterId','mutationId','expectedRevisions','bundle'].every(k=>Object.hasOwn(request,k)))fail(422,'Неверная команда переноса изображений');
    const {characterId,mutationId,expectedRevisions,bundle}=request;
    characterScope(userId,characterId,true);
    if(typeof mutationId!=='string'||!/^[-a-zA-Z0-9]{8,80}$/.test(mutationId)||!object(expectedRevisions))fail(422,'Неверная версия переноса');
    const entries=validatePersonalArtTransfer(bundle);
    if(Object.keys(expectedRevisions).length!==entries.length||entries.some(e=>!Object.hasOwn(expectedRevisions,e.catalogId)||!Number.isSafeInteger(expectedRevisions[e.catalogId])||expectedRevisions[e.catalogId]<0))fail(422,'Нужны точные версии всех переносимых изображений');
    const requestHash=hash(JSON.stringify({characterId,entries:entries.map(e=>({id:e.catalogId,sha:hash(e.bytes),revision:expectedRevisions[e.catalogId]}))}));
    return transaction(()=>{
     characterScope(userId,characterId,true);for(const entry of entries)scope(userId,characterId,entry.catalogId,true);
     const prior=db.prepare('SELECT * FROM personal_art_imports WHERE user_id=? AND mutation_id=?').get(userId,mutationId);
     if(prior){if(prior.request_hash!==requestHash)fail(409,'Идентификатор переноса уже использован');return {...JSON.parse(prior.result_json),replayed:true};}
     if(!entries.length)return {entries:[],replayed:false};
     db.prepare('DELETE FROM personal_art_imports WHERE user_id=? AND character_id=? AND created_at<?').run(userId,characterId,new Date(timestamp()-personalArtRetentionMs).toISOString());
     if(db.prepare('SELECT count(*) AS n FROM personal_art_imports WHERE user_id=?').get(userId).n>=1000)fail(409,'Лимит квитанций переноса исчерпан');
     const result={entries:entries.map(entry=>({catalogId:entry.catalogId,...api.change({characterId,catalogId:entry.catalogId,mutationId:'import-'+hash(mutationId+'\n'+entry.catalogId),expectedRevision:expectedRevisions[entry.catalogId],action:'set',bytes:entry.bytes})})),replayed:false};
     db.prepare('INSERT INTO personal_art_imports VALUES (?,?,?,?,?,?)').run(userId,characterId,mutationId,requestHash,JSON.stringify(result),new Date(timestamp()).toISOString());
     return result;
    });
   },
   read(characterId,catalogId,role='thumbnail'){
    scope(userId,characterId,catalogId,false);
    if(!['master','thumbnail'].includes(role))fail(422,'Неизвестный размер изображения');
    const row=latest(userId,characterId,catalogId);return {...metadata(row),file:file(row,role)};
   },
   history(characterId,catalogId){
    scope(userId,characterId,catalogId,false);
    return db.prepare('SELECT revision,mutation_id,created_at,master IS NULL AS standard FROM personal_art_versions WHERE user_id=? AND character_id=? AND catalog_id=? ORDER BY revision DESC').all(userId,characterId,catalogId)
     .map(r=>({revision:r.revision,mutationId:r.mutation_id,createdAt:r.created_at,standard:!!r.standard}));
   },
   cleanup(characterId,catalogId){
    scope(userId,characterId,catalogId,true);
    return transaction(()=>{scope(userId,characterId,catalogId,true);return {removed:prune(userId,characterId,catalogId),...metadata(latest(userId,characterId,catalogId))};});
   },
   change(request){
    if(!object(request)||Object.keys(request).some(k=>!['characterId','catalogId','mutationId','expectedRevision','action','bytes','crop','targetRevision'].includes(k)))fail(422,'Неверная команда изображения');
    const {characterId,catalogId,mutationId,expectedRevision,action}=request;
    scope(userId,characterId,catalogId,true);
    if(typeof mutationId!=='string'||!/^[-a-zA-Z0-9]{8,80}$/.test(mutationId)||!Number.isSafeInteger(expectedRevision)||expectedRevision<0||!['set','reset','restore'].includes(action))fail(422,'Неверная версия или операция изображения');
    if(action==='set'){
     if(!Buffer.isBuffer(request.bytes)||request.bytes.length>personalArtLimits.inputBytes||request.targetRevision!==undefined)fail(422,'Нужен PNG допустимого размера');
     if(request.crop!==undefined&&(!object(request.crop)||Object.keys(request.crop).length!==3||!['x','y','size'].every(k=>Number.isSafeInteger(request.crop[k]))))fail(422,'Неверное кадрирование');
    }else if(request.bytes!==undefined||request.crop!==undefined||(action==='reset'&&request.targetRevision!==undefined))fail(422,'Лишние поля команды');
    if(action==='restore'&&(!Number.isSafeInteger(request.targetRevision)||request.targetRevision<1))fail(422,'Неверная версия восстановления');
    const requestHash=hash(JSON.stringify({characterId,catalogId,expectedRevision,action,source:request.bytes?hash(request.bytes):null,crop:request.crop?{x:request.crop.x,y:request.crop.y,size:request.crop.size}:null,target:request.targetRevision??null}));
    return transaction(()=>{
     scope(userId,characterId,catalogId,true);
     const prior=db.prepare('SELECT * FROM personal_art_versions WHERE user_id=? AND mutation_id=?').get(userId,mutationId);
     if(prior){if(prior.request_hash!==requestHash)fail(409,'Идентификатор операции уже использован');return {...metadata(prior),replayed:true};}
     const current=latest(userId,characterId,catalogId);
     if((current?.revision??0)!==expectedRevision)fail(409,'Изображение изменилось; обновите карточку');
     if(expectedRevision===Number.MAX_SAFE_INTEGER)fail(409,'Предел версии изображения');
     // A reset of an already standard binding is a true no-op: no image,
     // history row or quota consumption. The revision still guards retries.
     if(action==='reset'&&!current?.master)return {...metadata(current),replayed:false,unchanged:true};
     let files=null;
     if(action==='set'){
      try{files=normalizePersonalArt(request.bytes,request.crop).files;}catch{fail(422,'Не удалось проверить PNG или кадрирование');}
     }else if(action==='restore'){
      const old=db.prepare('SELECT * FROM personal_art_versions WHERE user_id=? AND character_id=? AND catalog_id=? AND revision=?').get(userId,characterId,catalogId,request.targetRevision);
      if(!old)fail(404,'Версия изображения недоступна');
      if(old.master)files={master:file(old,'master'),thumbnail:file(old,'thumbnail')};
     }
     if(!files&&!current?.master)return {...metadata(current),replayed:false,unchanged:true};
     prune(userId,characterId,catalogId);
     const usage=db.prepare('SELECT count(master) AS versions,coalesce(sum(length(master)+length(thumbnail)),0) AS bytes FROM personal_art_versions WHERE user_id=?').get(userId);
     const added=files?files.master.bytes.length+files.thumbnail.bytes.length:0;
     if(files&&(usage.versions>=limits.versions||usage.bytes+added>limits.bytes))fail(409,'Лимит личных изображений и сохранённых версий исчерпан');
     if(!current&&db.prepare('SELECT count(*) AS n FROM (SELECT 1 FROM personal_art_versions WHERE user_id=? GROUP BY character_id,catalog_id)').get(userId).n>=limits.bindings)fail(409,'Лимит личных привязок изображений исчерпан');
     db.prepare('INSERT INTO personal_art_versions VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(userId,characterId,catalogId,expectedRevision+1,mutationId,requestHash,files?.master.bytes??null,files?.thumbnail.bytes??null,files?.master.sha256??null,files?.thumbnail.sha256??null,new Date(timestamp()).toISOString());
     return {...metadata(latest(userId,characterId,catalogId)),replayed:false};
    });
   },
  };
  return api;
 }
 return {forUser:view};
}
