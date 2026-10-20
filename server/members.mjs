import {createHash} from 'node:crypto';
import {AppError} from './state.mjs';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const validId=value=>typeof value==='string'&&/^[a-zA-Z0-9-]{8,80}$/.test(value);
export function createMemberManagement(db,{user,membership,applyInTransaction}){
 function owner(actor,campaignId){user(actor);if(membership(actor,campaignId)!=='owner')throw new AppError(403,'Участниками управляет владелец кампании');}
 function snapshot(campaignId){
  const members=db.prepare(`SELECT u.id,u.display_name AS displayName,u.enabled,m.role FROM campaign_memberships m JOIN access_users u ON u.id=m.user_id WHERE m.campaign_id=? ORDER BY u.id`).all(campaignId).map(row=>({...row,enabled:Boolean(row.enabled),characterIds:db.prepare('SELECT character_id FROM character_access WHERE user_id=? AND campaign_id=? ORDER BY character_id').all(row.id,campaignId).map(g=>g.character_id)}));
  const characters=db.prepare("SELECT id,json_extract(data_json,'$.name') AS name FROM characters WHERE campaign_id=? ORDER BY id").all(campaignId);
  const value={campaignId,members,characters};return {...value,version:hash(value)};
 }
 function list(actor,campaignId){owner(actor,campaignId);return {...snapshot(campaignId),actorId:actor};}
 function change(actor,request,{guard,current}){
  const actions={'set-member':['role'],'remove-member':[],'grant-character':['characterId'],'revoke-character':['characterId']};
  const action=request?.action,extra=typeof action==='string'&&Object.hasOwn(actions,action)?actions[action]:undefined,fields=['action','mutationId','expectedVersion','campaignId','userId',...(extra??[])];
  if(!extra||!request||Array.isArray(request)||Object.keys(request).length!==fields.length||fields.some(key=>!Object.hasOwn(request,key))||!['mutationId','campaignId','userId'].every(key=>validId(request[key]))||typeof request.expectedVersion!=='string'||!/^[a-f0-9]{64}$/.test(request.expectedVersion)||extra.includes('characterId')&&!validId(request.characterId)||extra.includes('role')&&!['owner','gm','player'].includes(request.role))throw new AppError(422,'Неверные поля изменения доступа');
  const requestHash=hash(Object.fromEntries(fields.map(key=>[key,request[key]])));
  db.exec('BEGIN IMMEDIATE');
  try{
   guard();const selected=current();if(selected.campaignId!==request.campaignId)throw new AppError(409,'Выбрана другая кампания');
   owner(actor,request.campaignId);
   db.exec(`CREATE TABLE IF NOT EXISTS membership_changes(mutation_id TEXT PRIMARY KEY,actor_id TEXT NOT NULL REFERENCES access_users(id),campaign_id TEXT NOT NULL REFERENCES campaigns(id),request_hash TEXT NOT NULL,command_json TEXT NOT NULL,before_version TEXT NOT NULL,after_version TEXT NOT NULL,created_at TEXT NOT NULL)`);
   const receipt=db.prepare('SELECT actor_id,campaign_id,request_hash FROM membership_changes WHERE mutation_id=?').get(request.mutationId);
   if(receipt){if(receipt.actor_id!==actor||receipt.campaign_id!==request.campaignId||receipt.request_hash!==requestHash)throw new AppError(409,'Ключ изменения доступа уже использован');const result={...snapshot(request.campaignId),actorId:actor,replayed:true};db.exec('COMMIT');return result;}
   const before=snapshot(request.campaignId);if(before.version!==request.expectedVersion)throw new AppError(409,'Состав или доступ уже изменились. Обнови список перед новым решением.');
   if(actor===request.userId&&(action==='remove-member'||action==='revoke-character'||action==='set-member'&&request.role!=='owner'))throw new AppError(409,'Собственный доступ здесь не отзывается. Для выхода или передачи владения обратись к администратору.');
   const command={action,userId:request.userId,campaignId:request.campaignId,...Object.fromEntries(extra.map(key=>[key,request[key]]))};
   applyInTransaction(command);const after=snapshot(request.campaignId);
   db.prepare('INSERT INTO membership_changes VALUES(?,?,?,?,?,?,?,?)').run(request.mutationId,actor,request.campaignId,requestHash,JSON.stringify(command),before.version,after.version,new Date().toISOString());
   db.exec('COMMIT');return {...after,actorId:actor,replayed:false};
  }catch(error){db.exec('ROLLBACK');throw error;}
 }
 return Object.freeze({list,change});
}
