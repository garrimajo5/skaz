import {mkdir,writeFile,readFile,lstat,realpath,open} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes,randomUUID} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {openStore} from '../server/store.mjs';
import {createApp} from '../server/app.mjs';
import {deploymentOrigin} from './verify-deployment.mjs';

const kind='skaz-synthetic-auth-fixture',manifestName='fixture.json',credentialName='skaz-fixture-credentials.json';
const roles=['owner','player','waiting'];

// Creates a NEW private directory only. No existing database, deployment
// configuration, account or network listener is accepted by this preparation.
export async function prepareAuthFixture(directory,origin){
 origin=deploymentOrigin(origin);
 if(typeof directory!=='string'||!directory)throw new Error('Нужен новый отдельный каталог');
 const folder=path.resolve(directory),id=randomUUID();
 await mkdir(folder,{mode:0o700});
 const database=path.join(folder,'fixture.sqlite');
 const reservation=await open(database,'wx',0o600);await reservation.close();
 const store=openStore(database);
 try{
  const first=store.read().context,users=roles.map(role=>({role,id:'fixture-'+role+'-'+randomUUID()}));
  store.access.apply({action:'bootstrap-owner',userId:users[0].id,displayName:'Тест · владелец',campaignId:first.campaignId,characterId:first.characterId});
  const view=store.forView('synthetic-player');
  view.createCharacter({mutationId:randomUUID(),expectedRevision:view.read().revision,campaignId:first.campaignId,characterId:randomUUID(),template:'bard5-demo',profile:{name:'Тест · отдельный герой игрока',tagline:'Синтетическая игра для проверки входа'}});
  for(const user of users.slice(1))store.access.apply({action:'create-user',userId:user.id,displayName:user.role==='player'?'Тест · игрок':'Тест · без назначения'});
  store.access.apply({action:'set-member',userId:users[1].id,campaignId:first.campaignId,role:'player'});
  store.access.apply({action:'grant-character',userId:users[1].id,campaignId:first.campaignId,characterId:view.read().context.characterId});
  const auth=store.authentication(),credentials=[];
  for(const user of users){
   const login='test-'+user.role,password=randomBytes(24).toString('base64url');
   await auth.setPassword(user.id,login,password);credentials.push({...user,login,password});
  }
  const marker=new DatabaseSync(database);
  try{marker.exec('CREATE TABLE auth_fixture_marker(id TEXT PRIMARY KEY,kind TEXT NOT NULL)');marker.prepare('INSERT INTO auth_fixture_marker VALUES (?,?)').run(id,kind);}finally{marker.close();}
  await writeFile(path.join(folder,credentialName),JSON.stringify({kind,id,origin,credentials},null,2)+'\n',{flag:'wx',mode:0o600});
  const manifest={kind,version:1,id,origin,users};
  // The marker is written last. Partial preparation cannot be served.
  await writeFile(path.join(folder,manifestName),JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});
  return {prepared:true,syntheticOnly:true,directory:folder,origin,credentialsFile:path.join(folder,credentialName),users};
 }finally{store.close();}
}

export async function serveAuthFixture(directory,port){
 if(typeof directory!=='string'||!directory||!Number.isInteger(port)||port<0||port>65535)throw new Error('Нужны каталог стенда и допустимый loopback-порт');
 const folder=await realpath(directory);
 for(const name of [manifestName,'fixture.sqlite']){
  const entry=await lstat(path.join(folder,name));
  if(!entry.isFile()||entry.isSymbolicLink())throw new Error('Стенд требует собственные обычные файлы');
 }
 const manifest=JSON.parse(await readFile(path.join(folder,manifestName),'utf8'));
 if(manifest.kind!==kind||manifest.version!==1||typeof manifest.id!=='string'||!Array.isArray(manifest.users)||manifest.users.length!==3||roles.some((role,i)=>manifest.users[i]?.role!==role))throw new Error('Неизвестный синтетический стенд');
 const origin=deploymentOrigin(manifest.origin),database=path.join(folder,'fixture.sqlite');
 const check=new DatabaseSync(database,{readOnly:true});
 try{
  const marker=check.prepare('SELECT id,kind FROM auth_fixture_marker').all();
  if(marker.length!==1||marker[0].id!==manifest.id||marker[0].kind!==kind)throw new Error('База не принадлежит синтетическому стенду');
  const actual=check.prepare('SELECT id FROM access_users ORDER BY id').all().map(row=>row.id);
  if(JSON.stringify(actual)!==JSON.stringify(manifest.users.map(user=>user.id).sort()))throw new Error('Состав стенда изменился');
 }finally{check.close();}
 const store=openStore(database);
 try{
  const server=createApp(store,{publicOrigin:origin,sessions:store.authentication(),individualWrites:true});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  let closing;
  return {server,origin,close:()=>closing??=(new Promise((resolve,reject)=>server.close(error=>{store.close();error?reject(error):resolve();})))};
 }catch(error){store.close();throw error;}
}

if(process.argv[1]&&await realpath(process.argv[1]).catch(()=>null)===fileURLToPath(import.meta.url)){
 const [action,directory,value,...extra]=process.argv.slice(2);
 try{
  if(extra.length||!value)throw new Error('Неверные аргументы');
  if(action==='prepare')console.log(JSON.stringify(await prepareAuthFixture(directory,value)));
  else if(action==='serve'&&/^\d+$/.test(value)&&Number(value)>0){
   const fixture=await serveAuthFixture(directory,Number(value));
   console.log(JSON.stringify({syntheticOnly:true,listen:'127.0.0.1:'+fixture.server.address().port,origin:fixture.origin}));
   for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>fixture.close().then(()=>process.exit(0)));
  }else throw new Error('Неверная команда');
 }catch{console.error('Стенд не запущен. prepare: новый-каталог HTTPS-origin; serve: каталог loopback-порт. Секреты не выводятся.');process.exitCode=1;}
}
