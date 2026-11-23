import {accessReadiness} from './access-readiness.mjs';

// Trusted process configuration only; no HTTP route can select a mode.
// The individual preflight opens an EXISTING database read-only before openStore.
export function startupOptions({database,port='4173',origin,mode='shared',classAdvancement='0',personalArt='0',profileEditors='1',profileWriteFormat='15'}){
 if(!['0','1'].includes(profileEditors))throw new Error('SKAZ_PROFILE_EDITORS: 0 или 1');
 if (!['14', '15'].includes(profileWriteFormat)) throw new Error('SKAZ_PROFILE_WRITE_FORMAT: 14 или 15');
 if (profileWriteFormat === '14' && profileEditors !== '0') {
  throw new Error('SKAZ_PROFILE_WRITE_FORMAT=14 требует SKAZ_PROFILE_EDITORS=0');
 }
 if(!['0','1'].includes(personalArt))throw new Error('SKAZ_PERSONAL_ART: 0 или 1');
 if(personalArt==='1'&&mode!=='individual')throw new Error('Личные изображения требуют индивидуального HTTPS-входа');
 if(!['0','1'].includes(classAdvancement))throw new Error('SKAZ_CLASS_ADVANCEMENT: 0 или 1');
 if(!['shared','individual'].includes(mode))throw new Error('SKAZ_AUTH_MODE: shared или individual');
 const number=Number(port);
 if(!Number.isInteger(number)||number<1||number>65535)throw new Error('PORT должен быть от 1 до 65535');
 if(origin!==undefined){
  let url;try{url=new URL(origin);}catch{throw new Error('Нужен HTTPS origin');}
  if(url.protocol!=='https:'||url.origin!==origin||url.username||url.password)throw new Error('Нужен HTTPS origin без пути');
 }
 if(mode==='individual'){
  if(!origin)throw new Error('Индивидуальный вход требует SKAZ_PUBLIC_ORIGIN с HTTPS');
  let report;
  try{report=accessReadiness(database);}catch{throw new Error('Индивидуальный вход требует существующую подготовленную базу; изменений нет');}
  if(!report.dataReady)throw new Error('Индивидуальный вход: назначения или данные входа не готовы; изменений нет');
 }
 return {database,...(profileEditors==='0'?{profileEditors:false}:{}),...(profileWriteFormat==='14'?{profileWriteFormat:14}:{}),port:number,publicOrigin:origin,mode,...(personalArt==='1'?{personalArt:true}:{}),...(classAdvancement==='1'?{classAdvancement:true}:{})};
}
