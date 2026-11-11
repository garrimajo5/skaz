// Run: node scripts/game-art-retry-fixture.mjs [port]. Select data/game-art-retry-fixture.json in settings. First import commits but returns truncated JSON; retry must leave campaign count at two.
// Optional --picker-free adds a clearly labelled synthetic selection button; never used in production.
// Disposable synthetic RAM fixture. Never opens a user's database or authenticates a real user.
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {openStore} from '../server/store.mjs';
import {createApp} from '../server/app.mjs';
const port=Number(process.argv[2]||4238);
const pickerFree=process.argv.includes('--picker-free');
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid fixture port');
const store=openStore(':memory:');store.catalog.installBundled({version:store.catalog.previewBundled().version});
const context=store.read().context,userId='transfer-fixture-owner',viewId='transfer-fixture-window';
store.access.apply({action:'bootstrap-owner',userId,displayName:'Вымышленный тестер',campaignId:context.campaignId,characterId:context.characterId});
const writer=store.forUser(userId,viewId,{write:true,personalArt:true});
const manifest=JSON.parse(await readFile(new URL('../catalog/art-manifest.json',import.meta.url)));
const png=await readFile(new URL('../'+manifest.entries.find(e=>e.id==='srd51:2014:spell:polymorph').files.thumbnail.path,import.meta.url));
writer.personalArt.change({characterId:context.characterId,catalogId:'srd51:2014:spell:shield',mutationId:randomUUID(),expectedRevision:0,action:'set',bytes:png});
const syntheticPackage=JSON.stringify(writer.exportActive('with-art'));
await writeFile(new URL('../data/game-art-retry-fixture.json',import.meta.url),syntheticPackage);let lose=true;let live=true;
const sessions={authenticate:()=>live?userId:null,check:()=>live?userId:null,login:()=>{throw Error('Synthetic fixture has no login');},logout:()=>{live=false;}};
const app=createApp(store,{sessions,publicOrigin:'https://fixture.invalid',individualWrites:true,personalArt:(id,options)=>store.forUser(id,viewId,{...options,personalArt:true}).personalArt});
const handle=app.listeners('request')[0];
const server=createServer((req,res)=>{
 if(req.headers.host!==`127.0.0.1:${port}`||req.headers.origin&&req.headers.origin!==`http://127.0.0.1:${port}`){res.writeHead(403);return res.end();}
 if(pickerFree&&req.url==='/fixture-package'){res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');return res.end(syntheticPackage);}
 if(pickerFree&&req.url==='/fixture-controls.js'){
  res.setHeader('Content-Type','text/javascript');return res.end(`
   const install=()=>{for(const root of document.querySelectorAll('fieldset')){
    if(root.querySelector('h2')?.textContent!=='Игра с личными изображениями'||root.querySelector('[data-fixture-load]'))continue;
    const button=document.createElement('button');button.dataset.fixtureLoad='';button.textContent='Тестовый стенд: подставить вымышленный пакет';
    button.onclick=async()=>{button.disabled=true;try{const response=await fetch('/fixture-package');if(!response.ok)throw Error('Fixture unavailable');const text=await response.text();const input=root.querySelector('input[type=file]'),transfer=new DataTransfer();transfer.items.add(new File([text],'synthetic-retry.json',{type:'application/json'}));input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));}finally{button.disabled=false;}};
    root.prepend(button);
   }};new MutationObserver(install).observe(document.body,{childList:true,subtree:true});install();
  `);
 }
 if(pickerFree&&(req.url==='/'||req.url==='/index.html')){const end=res.end.bind(res);res.end=(chunk,...args)=>end(chunk?Buffer.from(chunk).toString('utf8').replace('</body>','<script src="/fixture-controls.js"></script></body>'):chunk,...args);}
 if(req.url==='/fixture-summary'){res.setHeader('Content-Type','text/plain;charset=utf-8');return res.end('Вымышленных кампаний: '+writer.campaigns().length);}
 if(req.url==='/api/import/game-with-art'&&req.method==='POST'&&lose){const end=res.end.bind(res);res.end=(...args)=>{if(res.statusCode===200){lose=false;return end('{');}return end(...args);};}
 if(req.headers.origin)req.headers.origin='https://fixture.invalid';
 return handle(req,res);
});
server.listen(port,'127.0.0.1',()=>console.log('Synthetic main shell with personal art on '+port));
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>server.close(()=>{store.close();process.exit();}));