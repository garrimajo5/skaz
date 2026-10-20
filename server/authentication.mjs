import {randomBytes,createHash,scrypt,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {AppError} from './state.mjs';
const derive=promisify(scrypt);
const policy=Object.freeze({N:131072,r:8,p:1,maxmem:256*1024*1024});
const digest=value=>createHash('sha256').update(value).digest('hex');
const invalid=()=>new AppError(401,'Неверный логин или пароль');
let activeDerivations=0;
async function key(password,salt) {
  if(activeDerivations>=2)throw new AppError(503,'Вход занят. Попробуй немного позже.');
  activeDerivations++;
  try{return await derive(password,salt,32,policy);}finally{activeDerivations--;}
}
function loginName(value) {
  if(typeof value!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,63}$/.test(value))throw new AppError(422,'Логин: 3–64 латинских символа, цифры, точка, дефис или подчёркивание');
  return value.toLowerCase();
}
function passwordValue(value) {
  if(typeof value!=='string'||[...value].length<15||[...value].length>128||Buffer.byteLength(value)>512)throw new AppError(422,'Пароль: от 15 до 128 символов');
  return value; // Spaces and Unicode are never silently trimmed or normalized.
}
const validToken=token=>typeof token==='string'&&/^[a-f0-9]{64}$/.test(token);

// Trusted server API, not a registration endpoint. No identity is created here.
export function createAuthentication(db,{now=Date.now}={}) {
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS auth_schema(id INTEGER PRIMARY KEY CHECK(id=1),version INTEGER NOT NULL);
      INSERT OR IGNORE INTO auth_schema VALUES(1,1);`);
    if(db.prepare('SELECT version FROM auth_schema WHERE id=1').get().version!==1)throw new Error('Неподдерживаемая версия входа');
    db.exec(`CREATE TABLE IF NOT EXISTS auth_credentials(
      user_id TEXT PRIMARY KEY REFERENCES access_users(id),login TEXT NOT NULL UNIQUE,
      salt TEXT NOT NULL,key_hex TEXT NOT NULL,version TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS auth_sessions(
      token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES access_users(id),
      credential_version TEXT NOT NULL,created_at INTEGER NOT NULL,last_seen INTEGER NOT NULL,expires_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS auth_sessions_user ON auth_sessions(user_id);
      CREATE TABLE IF NOT EXISTS auth_attempts(bucket TEXT PRIMARY KEY,started_at INTEGER NOT NULL,attempts INTEGER NOT NULL);
      CREATE TRIGGER IF NOT EXISTS auth_disable_user AFTER UPDATE OF enabled ON access_users WHEN NEW.enabled=0
      BEGIN DELETE FROM auth_sessions WHERE user_id=NEW.id;
      UPDATE auth_credentials SET version=lower(hex(randomblob(16))) WHERE user_id=NEW.id; END;
      COMMIT;`);
  }catch(error){db.exec('ROLLBACK');throw error;}
  const transaction=fn=>{db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}};
  const enabled=userId=>Boolean(db.prepare('SELECT 1 FROM access_users WHERE id=? AND enabled=1').get(userId));
  async function setPassword(userId,login,password) {
    const normalized=loginName(login);passwordValue(password);
    if(typeof userId!=='string'||!enabled(userId))throw new AppError(404,'Пользователь недоступен');
    const previous=db.prepare('SELECT version FROM auth_credentials WHERE user_id=?').get(userId)?.version;
    const salt=randomBytes(16).toString('hex'),derived=await key(password,Buffer.from(salt,'hex'));
    try{return transaction(()=>{
      if(!enabled(userId))throw new AppError(404,'Пользователь недоступен');
      if(db.prepare('SELECT version FROM auth_credentials WHERE user_id=?').get(userId)?.version!==previous)throw new AppError(409,'Данные входа уже изменились');
      if(db.prepare('SELECT 1 FROM auth_credentials WHERE login=? AND user_id<>?').get(normalized,userId))throw new AppError(409,'Логин уже занят');
      db.prepare(`INSERT INTO auth_credentials VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET login=excluded.login,salt=excluded.salt,key_hex=excluded.key_hex,version=excluded.version`).run(userId,normalized,salt,derived.toString('hex'),randomBytes(16).toString('hex'));
      db.prepare('DELETE FROM auth_sessions WHERE user_id=?').run(userId);
      return {userId,login:normalized};
    });}finally{derived.fill(0);}
  }
  function reserveAttempt(login) {
    const time=now();
    const allowed=transaction(()=>{
      db.prepare('DELETE FROM auth_attempts WHERE started_at<=?').run(time-15*60*1000);
      const buckets=[['global',60*1000,20],['login:'+digest(login),15*60*1000,5]];
      for(const [bucket,duration,limit]of buckets){
        const row=db.prepare('SELECT * FROM auth_attempts WHERE bucket=?').get(bucket);
        if(row&&time-row.started_at<duration&&row.attempts>=limit)return false;
      }
      for(const [bucket,duration]of buckets){
        const row=db.prepare('SELECT * FROM auth_attempts WHERE bucket=?').get(bucket);
        db.prepare('INSERT OR REPLACE INTO auth_attempts VALUES(?,?,?)').run(bucket,row&&time-row.started_at<duration?row.started_at:time,row&&time-row.started_at<duration?row.attempts+1:1);
      }
      return true;
    });
    if(!allowed)throw new AppError(429,'Слишком много попыток входа. Попробуй позже.');
  }
  async function login(login,password) {
    let normalized;
    try{normalized=loginName(login);passwordValue(password);}catch{throw invalid();}
    reserveAttempt(normalized);
    const row=db.prepare('SELECT * FROM auth_credentials WHERE login=?').get(normalized);
    const derived=await key(password,Buffer.from(row?.salt??'00000000000000000000000000000000','hex'));
    try {
      const expected=Buffer.from(row?.key_hex??'00'.repeat(32),'hex');
      const matches=expected.length===derived.length&&timingSafeEqual(derived,expected);
      return transaction(()=>{
        if(!row||!matches||!enabled(row.user_id)||db.prepare('SELECT version FROM auth_credentials WHERE user_id=?').get(row.user_id)?.version!==row.version)throw invalid();
        const time=now(),token=randomBytes(32).toString('hex'),expiresAt=time+12*60*60*1000;
        db.prepare('DELETE FROM auth_sessions WHERE expires_at<=? OR last_seen<=?').run(time,time-2*60*60*1000);
        // A small household needs at most ten active devices per user.
        db.prepare('DELETE FROM auth_sessions WHERE token_hash IN (SELECT token_hash FROM auth_sessions WHERE user_id=? ORDER BY created_at DESC,rowid DESC LIMIT -1 OFFSET 9)').run(row.user_id);
        db.prepare('INSERT INTO auth_sessions VALUES(?,?,?,?,?,?)').run(digest(token),row.user_id,row.version,time,time,expiresAt);
        return {token,userId:row.user_id,expiresAt};
      });
    }finally{derived.fill(0);}
  }
  function authenticate(token) {
    if(!validToken(token))return null;
    return transaction(()=>{
      const hash=digest(token),row=db.prepare(`SELECT s.*,u.enabled,c.version FROM auth_sessions s JOIN access_users u ON u.id=s.user_id JOIN auth_credentials c ON c.user_id=s.user_id WHERE s.token_hash=?`).get(hash);
      if(!row)return null;
      const time=now();
      if(!row.enabled||row.version!==row.credential_version||time>=row.expires_at||time-row.last_seen>=2*60*60*1000||time<row.last_seen){db.prepare('DELETE FROM auth_sessions WHERE token_hash=?').run(hash);return null;}
      db.prepare('UPDATE auth_sessions SET last_seen=? WHERE token_hash=?').run(time,hash);return row.user_id;
    });
  }
  // Read-only identity check for a caller's existing SQLite transaction. It must
  // not begin a nested transaction or extend the session lifetime.
  function check(token) {
    if(!validToken(token))return null;
    const row=db.prepare(`SELECT s.*,u.enabled,c.version FROM auth_sessions s JOIN access_users u ON u.id=s.user_id JOIN auth_credentials c ON c.user_id=s.user_id WHERE s.token_hash=?`).get(digest(token));
    const time=now();
    return row&&row.enabled&&row.version===row.credential_version&&time<row.expires_at&&time>=row.last_seen&&time-row.last_seen<2*60*60*1000?row.user_id:null;
  }
  function logout(token){if(validToken(token))db.prepare('DELETE FROM auth_sessions WHERE token_hash=?').run(digest(token));}
  function revokeAll(userId){
    if(typeof userId!=='string')throw new AppError(422,'Нужен пользователь');
    transaction(()=>{
      db.prepare('DELETE FROM auth_sessions WHERE user_id=?').run(userId);
      db.prepare('UPDATE auth_credentials SET version=? WHERE user_id=?').run(randomBytes(16).toString('hex'),userId);
    });
  }
  return Object.freeze({setPassword,login,authenticate,check,logout,revokeAll});
}

export const SESSION_COOKIE='__Host-skaz-session';
export function sessionCookie(token) {
  if(!validToken(token))throw new Error('Invalid session token');
  return `${SESSION_COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=43200`;
}
export const clearSessionCookie=()=>`${SESSION_COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0`;
export function cookieToken(header) {
  if(typeof header!=='string'||header.length>8192)return null;
  const matches=header.split(';').map(part=>part.trim()).filter(part=>part.startsWith(SESSION_COOKIE+'='));
  if(matches.length!==1)return null;
  const token=matches[0].slice(SESSION_COOKIE.length+1);return validToken(token)?token:null;
}
