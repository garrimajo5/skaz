import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {openStore} from '../server/store.mjs';
import {privateDatabaseBackup} from './private-backup.mjs';
export async function administerAuthentication({database,requestFile,backupFile}){
 if(typeof requestFile!=='string'||!requestFile||(await stat(requestFile)).size>8192)throw new Error('Нужен приватный JSON команды до 8192 байт');
 const request=JSON.parse((await readFile(requestFile,'utf8')).replace(/^\uFEFF/,''));
 const fields=request?.action==='set-password'?['action','userId','login','password']:request?.action==='revoke-sessions'?['action','userId']:[];
 if(!fields.length||Object.keys(request).length!==fields.length||fields.some(k=>!Object.hasOwn(request,k)))throw new Error('Неверная команда входа');
 const {source,destination}=await privateDatabaseBackup(database,backupFile),store=openStore(source);
 try{
  store.access.user(request.userId);
  const auth=store.authentication();
  const result=request.action==='set-password'?await auth.setPassword(request.userId,request.login,request.password):(auth.revokeAll(request.userId),{userId:request.userId});
  return {applied:true,action:request.action,...result,backup:destination};
 }finally{store.close();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [database,requestFile,backupFile,...extra]=process.argv.slice(2);
 if(extra.length||!backupFile){console.error('Использование: node scripts/auth-admin.mjs база.sqlite приватная-команда.json новая-копия.sqlite');process.exitCode=1;}
 else administerAuthentication({database,requestFile,backupFile}).then(result=>console.log(JSON.stringify(result))).catch(()=>{console.error('Команда входа не выполнена. Проверьте поля, пользователя и новый путь копии. Секреты в вывод не включаются.');process.exitCode=1;});
}
