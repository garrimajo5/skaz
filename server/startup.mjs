import {accessReadiness} from './access-readiness.mjs';

// Trusted process configuration only; no HTTP route can select a mode.
// The individual preflight opens an EXISTING database read-only before openStore.
export function startupOptions({database,port='4173',origin,mode='shared'}){
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
 return {database,port:number,publicOrigin:origin,mode};
}
