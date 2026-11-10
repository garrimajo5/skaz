import {AppError} from './state.mjs';
import {personalArtLimits} from './personal-art-image.mjs';

const headers={'Cache-Control':'private, no-store','Vary':'Cookie, X-Skaz-Identity','X-Content-Type-Options':'nosniff'};
const json=(response,value)=>{response.writeHead(200,{'Content-Type':'application/json; charset=utf-8',...headers});response.end(JSON.stringify(value));};
function fields(params,required,optional=[]){
 if([...params.keys()].some(key=>!required.includes(key)&&!optional.includes(key))||required.some(key=>params.getAll(key).length!==1)||optional.some(key=>params.getAll(key).length>1))throw new AppError(422,'Неверные параметры изображения');
 return Object.fromEntries(params);
}
// Mounted only with an explicit trusted session capability. No public filenames,
// actor IDs, shared art cache, conditional 304 or caller-supplied storage paths.
export async function personalArtHttp(request,response,api,readBody){
 const url=new URL(request.url,'http://localhost'),route=url.pathname;
 if(!route.startsWith('/api/personal-art/'))return false;
 if(!api)throw new AppError(404,'Личные изображения пока недоступны');
 if(['GET','HEAD'].includes(request.method)&&route==='/api/personal-art/image'){
  const {characterId,catalogId,role}=fields(url.searchParams,['characterId','catalogId'],['role']);
  const result=api.read(characterId,catalogId,role);
  if(!result.file)throw new AppError(404,'Используется стандартное изображение');
  response.writeHead(200,{'Content-Type':'image/png','Content-Length':result.file.bytes.length,...headers,'X-Skaz-Art-Revision':String(result.revision)});
  response.end(request.method==='HEAD'?undefined:result.file.bytes);return true;
 }
 if(request.method==='GET'&&route==='/api/personal-art/history'){
  const {characterId,catalogId}=fields(url.searchParams,['characterId','catalogId']);
  json(response,{entries:api.history(characterId,catalogId)});return true;
 }
 if(request.method==='GET'&&route==='/api/personal-art/export'){
  const {characterId}=fields(url.searchParams,['characterId']);json(response,api.exportCharacter(characterId));return true;
 }
 if(request.method==='GET'&&route==='/api/personal-art/usage'){
  const {characterId}=fields(url.searchParams,['characterId']);json(response,api.usage(characterId));return true;
 }
 if(request.method==='POST'&&route==='/api/personal-art/cleanup'){
  fields(url.searchParams,[]);
  const input=await readBody(request,4096);
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==2||!Object.hasOwn(input,'characterId')||!Object.hasOwn(input,'catalogId'))throw new AppError(422,'Нужна точная область очистки изображения');
  json(response,api.cleanup(input.characterId,input.catalogId));return true;
 }
 if(request.method==='POST'&&['/api/personal-art/change','/api/personal-art/import'].includes(route)){
  fields(url.searchParams,[]);
  if(route.endsWith('/import')){json(response,api.importCharacter(await readBody(request,46*1024*1024)));return true;}
  const input=await readBody(request,6*1024*1024);
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['characterId','catalogId','mutationId','expectedRevision','action','png','crop','targetRevision'].includes(k)))throw new AppError(422,'Неверная команда изображения');
  const {png,...command}=input;
  if(command.action==='set'){
   if(typeof png!=='string'||png.length>4*Math.ceil(personalArtLimits.inputBytes/3)||!png.length||!/^[A-Za-z0-9+/]*={0,2}$/.test(png))throw new AppError(422,'Нужен PNG в base64');
   const bytes=Buffer.from(png,'base64');
   if(bytes.toString('base64')!==png||bytes.length>personalArtLimits.inputBytes)throw new AppError(422,'Неверный PNG в base64');
   command.bytes=bytes;
  }else if(Object.hasOwn(input,'png'))throw new AppError(422,'Эта операция не принимает PNG');
  json(response,api.change(command));return true;
 }
 throw new AppError(405,'Метод личного изображения не поддерживается');
}
