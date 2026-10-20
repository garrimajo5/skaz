import {DatabaseSync} from 'node:sqlite';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Administrative, read-only database inspection. Never imported by the HTTP app.
// A positive data result cannot certify HTTPS, browser isolation or backup recovery.
export function accessReadiness(database){
 if(typeof database!=='string'||!database)throw new Error('Нужен путь существующей базы');
 const db=new DatabaseSync(database,{readOnly:true});
 try{
  db.exec('PRAGMA query_only=ON; BEGIN');
  const table=name=>Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
  if(!table('workspace')||db.prepare('SELECT schema_version FROM workspace WHERE id=1').get()?.schema_version!==2||!table('access_schema')||db.prepare('SELECT version FROM access_schema WHERE id=1').get()?.version!==1)throw new Error('Неподдерживаемая схема');
  const auth=table('auth_schema');if(auth&&db.prepare('SELECT version FROM auth_schema WHERE id=1').get()?.version!==1)throw new Error('Неподдерживаемая схема входа');
  if(auth&&!table('auth_credentials'))throw new Error('Неполная схема входа');
  const integrity=db.prepare('PRAGMA quick_check').all().every(row=>row.quick_check==='ok'),foreignKeyViolations=db.prepare('PRAGMA foreign_key_check').all().length;
  const campaigns=db.prepare(`SELECT c.id,
   (SELECT count(*) FROM campaign_memberships m JOIN access_users u ON u.id=m.user_id WHERE m.campaign_id=c.id AND m.role='owner' AND u.enabled=1) AS enabledOwners,
   (SELECT count(*) FROM characters h WHERE h.campaign_id=c.id) AS characters,
   (SELECT count(*) FROM characters h WHERE h.campaign_id=c.id AND NOT EXISTS(SELECT 1 FROM character_access g JOIN access_users u ON u.id=g.user_id WHERE g.character_id=h.id AND g.campaign_id=h.campaign_id AND u.enabled=1)) AS unassignedCharacters,
   (SELECT count(*) FROM sessions s LEFT JOIN session_details d ON d.session_id=s.id WHERE s.campaign_id=c.id AND coalesce(d.archived,0)=0) AS activeSessions
   FROM campaigns c ORDER BY c.id`).all();
  const enabledUsers=db.prepare('SELECT id FROM access_users WHERE enabled=1 ORDER BY id').all().map(({id})=>({id,
   hasCredentials:auth&&Boolean(db.prepare('SELECT 1 FROM auth_credentials WHERE user_id=?').get(id)),
   memberships:db.prepare('SELECT count(*) AS n FROM campaign_memberships WHERE user_id=?').get(id).n,
   usableCharacters:db.prepare(`SELECT count(DISTINCT g.character_id) AS n FROM character_access g JOIN campaign_memberships m ON m.user_id=g.user_id AND m.campaign_id=g.campaign_id WHERE g.user_id=? AND EXISTS(SELECT 1 FROM sessions s LEFT JOIN session_details d ON d.session_id=s.id WHERE s.campaign_id=g.campaign_id AND coalesce(d.archived,0)=0)`).get(id).n}));
  const blockers=[];
  if(!integrity||foreignKeyViolations)blockers.push('database-integrity');
  if(!auth)blockers.push('authentication-not-initialized');
  if(!enabledUsers.length)blockers.push('no-enabled-users');
  if(campaigns.some(c=>!c.enabledOwners))blockers.push('campaign-without-owner');
  if(campaigns.some(c=>c.unassignedCharacters))blockers.push('unassigned-characters');
  if(campaigns.some(c=>!c.activeSessions))blockers.push('campaign-without-active-session');
  if(enabledUsers.some(u=>!u.hasCredentials))blockers.push('user-without-credentials');
  if(enabledUsers.some(u=>!u.usableCharacters))blockers.push('user-without-usable-character');
  db.exec('COMMIT');
  return {scope:'database-only',dataReady:!blockers.length,changesAccess:false,integrity,foreignKeyViolations,authenticationInitialized:auth,campaigns,enabledUsers,blockers,manualChecks:['verified-backup-and-restore','browser-https-login-logout-two-users','review-every-assignment-with-owner','keep-shared-entry-point-until-explicit-switch']};
 }finally{db.close();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [database,...extra]=process.argv.slice(2);
 if(!database||extra.length){console.error('Использование: node scripts/access-readiness.mjs существующая-база.sqlite');process.exitCode=1;}
 else try{const report=accessReadiness(database);console.log(JSON.stringify(report,null,2));process.exitCode=report.dataReady?0:2;}
 catch{console.error('Не удалось проверить базу. Нужен существующий читаемый файл поддерживаемой схемы. Доступ не изменён.');process.exitCode=1;}
}
