// Disposable loopback-only preview harness. Synthetic identity and RAM storage;
// this is not authentication QA and never opens a user's game database.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {createPersonalArtStore} from '../server/personal-art-store.mjs';
import {personalArtHttp} from '../server/personal-art-http.mjs';
const port=Number(process.argv[2]||4226);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid fixture port');
const db=new DatabaseSync(':memory:');
db.exec("PRAGMA foreign_keys=ON;CREATE TABLE access_users(id TEXT PRIMARY KEY);CREATE TABLE characters(id TEXT PRIMARY KEY);INSERT INTO access_users VALUES('preview-user');INSERT INTO characters VALUES('preview-character');");
const api=createPersonalArtStore(db,{authorize:(u,c)=>u==='preview-user'&&c==='preview-character',catalogExists:id=>id==='srd51:2014:spell:shield'}).forUser('preview-user');
const html=`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>СКАЗ · личный арт · RAM QA</title><style>body{font:16px system-ui;margin:16px;background:#101b2b;color:#edf4fc}button,input{font:inherit}button{padding:12px}fieldset{max-width:600px}label{display:block;margin:12px}canvas{border:1px solid #8885}#result{overflow-wrap:anywhere}</style><h1>Тест личного арта</h1><p>Вымышленный пользователь, отдельное RAM-хранилище. Закрытие сервера удалит тестовые изменения. Это не проверка входа.</p><div id="editor"></div><p id="result" role="status"></p><script src="/personal-art-preview.js"></script><script>
let revision=0;SkazPersonalArtPreview.create(document.querySelector('#editor'),{label:'Только для тестового пользователя и тестового персонажа.',onSave:async({bytes,crop})=>{const png=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=reject;reader.readAsDataURL(new Blob([bytes],{type:'image/png'}));});const response=await fetch('/api/personal-art/change',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({characterId:'preview-character',catalogId:'srd51:2014:spell:shield',mutationId:crypto.randomUUID(),expectedRevision:revision,action:'set',png,crop})});const result=await response.json();if(!response.ok)throw Error(result.error);revision=result.revision;document.querySelector('#result').textContent='RAM-ревизия '+revision+'; кадр '+JSON.stringify(crop);}});
</script></html>`;
const server=createServer(async(req,res)=>{
 try{
  if(req.headers.host!==`127.0.0.1:${port}`||req.headers.origin&&req.headers.origin!==`http://127.0.0.1:${port}`)throw Object.assign(Error('Loopback only'),{status:403});
  if(await personalArtHttp(req,res,api,async(request,limit)=>{let size=0;const chunks=[];for await(const chunk of request){size+=chunk.length;if(size>limit)throw Object.assign(Error('Too large'),{status:413});chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks));}))return;
  if(req.url==='/personal-art-preview.js'){res.setHeader('Content-Type','text/javascript');res.end(await readFile(new URL('../client/personal-art-preview.js',import.meta.url)));return;}
  if(req.url!=='/')throw Object.assign(Error('Not found'),{status:404});
  res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);
 }catch(error){res.writeHead(error.status||500,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:error.message}));}
});
server.listen(port,'127.0.0.1',()=>console.log('Synthetic personal preview on '+port));
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>server.close(()=>{db.close();process.exit();}));
