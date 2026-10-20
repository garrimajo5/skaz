import {readFile,realpath} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {deploymentOrigin} from './verify-deployment.mjs';

// Only login/logout mutate session metadata. Never writes game data or prints
// a response body, identity, cookie or credential. Redirects are never followed.
export async function verifyIndividualDeployment({origin,outerLogin,account,minimumCatalogCount=1,fetchImpl=fetch}){
 origin=deploymentOrigin(origin);
 if(!outerLogin||typeof outerLogin.username!=='string'||!outerLogin.username||/[:\r\n]/.test(outerLogin.username)||typeof outerLogin.password!=='string'||!outerLogin.password||/[\r\n]/.test(outerLogin.password)||!account||typeof account.login!=='string'||!account.login||typeof account.password!=='string'||!account.password)throw new Error('Нужны оба набора данных входа');
 if(!Number.isSafeInteger(minimumCatalogCount)||minimumCatalogCount<1)throw new Error('Неверный минимум каталога');
 const basic='Basic '+Buffer.from(outerLogin.username+':'+outerLogin.password).toString('base64');let cookie,identity;
 async function request(route,{outer=true,personal=false,method='GET',body,originHeader}={}){
  try{return await fetchImpl(origin+route,{method,redirect:'manual',signal:AbortSignal.timeout(15000),headers:{...(outer?{Authorization:basic}:{}),...(personal?{Cookie:cookie,...(identity?{'X-Skaz-Identity':identity}:{})}:{}),...(originHeader?{Origin:originHeader}:{}),...(body?{'Content-Type':'application/json','X-Skaz-Client':'local-v1'}:{})},...(body?{body:JSON.stringify(body)}:{})});}
  catch{throw new Error('Нет проверенного HTTPS-соединения или сервер не ответил');}
 }
 async function status(route,options,expected){const r=await request(route,options);await r.body?.cancel();if(r.status!==expected)throw new Error('Не подтверждена защита или готовность сервера');}
 async function json(route,options){const r=await request(route,options);if(r.status!==200){await r.body?.cancel();throw new Error('Личный API не подтвердил готовность');}try{return await r.json();}catch{throw new Error('Некорректный ответ личного API');}}
 for(const route of ['/','/api/workspace','/api/export/active-v9'])await status(route,{outer:false},401);
 await status('/api/workspace',{},401);
 const form=await request('/');if(form.status!==200||!(await form.text()).includes('login-form'))throw new Error('Нет индивидуальной формы входа');
 const signed=await request('/api/auth/login',{method:'POST',originHeader:origin,body:{login:account.login,password:account.password}});
 if(signed.status!==200){await signed.body?.cancel();throw new Error('Индивидуальный вход не подтверждён');}
 const header=signed.headers.get('set-cookie')??'';
 // Keep a syntactically valid token for cleanup even when its flags are wrong.
 if(/^__Host-skaz-session=[a-f0-9]{64}(;|$)/.test(header))cookie=header.split(';')[0];
 try{
  if(!cookie||!/;\s*Secure(?:;|$)/i.test(header)||!/;\s*HttpOnly(?:;|$)/i.test(header)||!/;\s*SameSite=Strict(?:;|$)/i.test(header)||!/;\s*Path=\/(?:;|$)/i.test(header)||/;\s*Domain=/i.test(header))throw new Error('Не подтверждена защита cookie');
  let result;try{result=await signed.json();}catch{throw new Error('Некорректное подтверждение входа');}if(result.signedIn!==true||Object.hasOwn(result,'token'))throw new Error('Неверное подтверждение входа');
  const page=await request('/',{personal:true});const html=await page.text();identity=html.match(/<body\b[^>]*\bdata-user-id="([a-zA-Z0-9-]{8,80})"/)?.[1];if(page.status!==200||!identity)throw new Error('Сервер не подтвердил личность');
  const health=await json('/api/health',{personal:true});if(health.status!=='ok'||health.mode!=='individual'||health.storage!=='sqlite')throw new Error('Неверный режим сервера');
  const game=await json('/api/workspace',{personal:true}),file=await json('/api/export/active-v9',{personal:true});
  if(game.permissions?.mode!=='individual'||file.schemaVersion!==9||file.source?.revision!==game.revision||!isDeepStrictEqual(file.state,game.state)||!isDeepStrictEqual(file.source?.context,game.context))throw new Error('Не подтверждена сохранность экспорта');
  const coverage=await json('/api/catalog/coverage',{personal:true});if(!Number.isSafeInteger(coverage.total)||coverage.total<minimumCatalogCount)throw new Error('Недостаточный охват личного каталога');
  await status('/api/health',{personal:true,originHeader:'https://skaz-check.invalid'},403);
  return {catalogTotal:coverage.total,checks:['HTTPS и общий вход защищают страницы и API','Общего пароля недостаточно для личного листа','Индивидуальный вход и защищённая cookie подтверждены','Личный режим, экспорт v9 и каталог проверены','Чужой Origin отклонён','Проверочный сеанс отозван после проверки']};
 }finally{
  if(cookie){
   // Without a pinned identity, first obtain it only from authenticated HTML.
   if(!identity){const r=await request('/',{personal:true});identity=(await r.text()).match(/<body\b[^>]*\bdata-user-id="([a-zA-Z0-9-]{8,80})"/)?.[1];}
   const out=await request('/api/auth/logout',{personal:true,method:'POST',originHeader:origin,body:{}});await out.body?.cancel();if(out.status!==200)throw new Error('Не удалось подтвердить отзыв проверочного сеанса');
   await status('/api/workspace',{personal:true},401);
  }
 }
}

if(process.argv[1]&&await realpath(process.argv[1]).catch(()=>null)===fileURLToPath(import.meta.url)){
 try{
  if(process.env.NODE_TLS_REJECT_UNAUTHORIZED==='0')throw new Error('Проверка TLS отключена');
  const [origin,file,minimum='1',...extra]=process.argv.slice(2);if(!file||extra.length)throw new Error('Нужны HTTPS origin и приватный JSON доступа');
  let credentials;try{credentials=JSON.parse(await readFile(file,'utf8'));}catch{throw new Error('Не удалось прочитать приватный JSON доступа');}
  const result=await verifyIndividualDeployment({origin,outerLogin:credentials.outerLogin,account:credentials.account,minimumCatalogCount:Number(minimum)});
  result.checks.forEach(check=>console.log('OK: '+check));console.log('Личный каталог: '+result.catalogTotal);
 }catch(error){console.error(error.message);process.exitCode=1;}
}
