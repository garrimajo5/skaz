// Disposable synthetic RAM fixture. Never opens a user's database or authenticates a real user.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {openStore} from '../server/store.mjs';
import {createApp} from '../server/app.mjs';
import {templateStats} from '../server/character-stats.mjs';
const port=Number(process.argv[2]||4231);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid fixture port');
const classAdvancement=process.argv.includes('--advancement');
const store=openStore(':memory:',{classAdvancement});store.catalog.installBundled({version:store.catalog.previewBundled().version});
const context=store.read().context,userId='transfer-fixture-owner',viewId='transfer-fixture-window';
store.access.apply({action:'bootstrap-owner',userId,displayName:'Вымышленный тестер',campaignId:context.campaignId,characterId:context.characterId});
const writer=store.forUser(userId,viewId,{write:true,personalArt:true});
const manifest=JSON.parse(await readFile(new URL('../catalog/art-manifest.json',import.meta.url)));
const png=await readFile(new URL('../'+manifest.entries.find(e=>e.id==='srd51:2014:spell:shield').files.thumbnail.path,import.meta.url));
writer.personalArt.change({characterId:context.characterId,catalogId:'srd51:2014:spell:shield',mutationId:randomUUID(),expectedRevision:0,action:'set',bytes:png});
if(classAdvancement){
 const fields=extra=>({mutationId:randomUUID(),expectedRevision:writer.read().revision,characterId:context.characterId,...extra});
 writer.saveCharacterStats(fields({stats:structuredClone(templateStats)}));
 writer.saveCharacterSheet(fields({sheet:{ruleset:'5e-2014',ancestry:'',className:'fighter',subclass:'',level:3,counters:[]}}));
 writer.bindClassResources(fields({classId:'fighter',bindings:[],create:['class-fighter-second-wind']}));
}
const sample=writer.exportActive('with-art');let live=true;
const sessions={authenticate:()=>live?userId:null,check:()=>live?userId:null,login:()=>{throw Error('Synthetic fixture has no login');},logout:()=>{live=false;}};
const app=createApp(store,{classAdvancement,sessions,publicOrigin:'https://fixture.invalid',individualWrites:true,personalArt:(id,options)=>store.forUser(id,viewId,{...options,personalArt:true}).personalArt});
const handle=app.listeners('request')[0];
const html=`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>СКАЗ · перенос с артами · RAM QA</title><style>body{font:16px system-ui;margin:16px;background:#101b2b;color:#edf4fc}button,input,a{font:inherit}button,a{padding:12px;display:inline-block;min-height:44px;box-sizing:border-box;max-width:100%;white-space:normal}input{max-width:100%}label{display:block;margin:16px 0}fieldset{max-width:680px}p{overflow-wrap:anywhere}a{color:#91dfd1}</style><h1>Вымышленная игра · перенос с артами</h1><p>Изолированная RAM-база. Закрытие сервера удаляет тестовые игры. Это не проверка входа.</p><p><a href="/fixture-package" download="synthetic-game-with-art.json">Скачать вымышленный пакет</a></p><label><input id="lose-response" type="checkbox">Потерять один успешный ответ импорта</label><button id="summary">Проверить число игр</button><p id="counts" role="status"></p><div id="transfer"></div><script src="/personal-art-session.js"></script><script src="/personal-art-command.js"></script><script src="/game-art-transfer.js"></script><script src="/game-art-transfer-panel.js"></script><script>
const transport=SkazGameArtTransfer.create({identity:'${userId}',viewId:'${viewId}',request:async(url,options)=>{const response=await fetch(url,options);const lose=document.querySelector('#lose-response');if(url==='/api/import/game-with-art'&&response.ok&&lose.checked){lose.checked=false;await response.body?.cancel();throw Error('Тест: успешный ответ потерян после записи.');}return response;}});
const panel=SkazGameArtTransferPanel.create(document.querySelector('#transfer'),{transport});
document.querySelector('#summary').onclick=async()=>{const response=await fetch('/fixture-summary',{cache:'no-store'}),data=await response.json();document.querySelector('#counts').textContent='Кампаний: '+data.campaigns+'; текущих личных изображений: '+data.images;};
window.addEventListener('beforeunload',event=>{if(panel.pending){event.preventDefault();event.returnValue='';}});
window.addEventListener('pagehide',()=>panel.destroy(),{once:true});
</script></html>`;
const scripts=new Set(['personal-art-session.js','personal-art-command.js','game-art-transfer.js','game-art-transfer-panel.js']);
const server=createServer(async(req,res)=>{
 try{
  if(req.headers.host!==`127.0.0.1:${port}`||req.headers.origin&&req.headers.origin!==`http://127.0.0.1:${port}`)throw Error('Loopback only');
  // This fixture emulates only the already validated loopback proxy Origin;
  // production createApp retains its strict HTTPS/session checks unchanged.
  if(req.url.startsWith('/api/')){if(req.headers.origin)req.headers.origin='https://fixture.invalid';return handle(req,res);}
  res.setHeader('Cache-Control','no-store');
  if(req.url==='/fixture-package'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(sample));}
  if(req.url==='/fixture-summary'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({campaigns:writer.campaigns().length,images:writer.exportActive('with-art').personalArt.entries.length}));}
  if(scripts.has(req.url.slice(1))){res.setHeader('Content-Type','text/javascript');return res.end(await readFile(new URL('../client'+req.url,import.meta.url)));}
  if(req.url!=='/'){res.writeHead(404);return res.end();}res.setHeader('Content-Type','text/html;charset=utf-8');res.end(html);
 }catch(error){res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:error.message}));}
});
server.listen(port,'127.0.0.1',()=>console.log('Synthetic RAM game/art transfer on '+port));
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>server.close(()=>{store.close();process.exit();}));
