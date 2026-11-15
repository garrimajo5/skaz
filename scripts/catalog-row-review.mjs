// Read-only loopback fixture: real row markup, CSS and accepted catalog artwork.
// No game database, authentication state or deployment configuration is opened.
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {bundledCatalog} from '../server/bundled-catalog.mjs';
import {createArtLibrary} from '../server/art-library.mjs';
const base=fileURLToPath(new URL('../',import.meta.url));
const art=createArtLibrary(JSON.parse(readFileSync(new URL('../catalog/art-manifest.json',import.meta.url))),{base});
const slugs=['confusion','conjure-animals','conjure-celestial','conjure-elemental','conjure-fey','conjure-minor-elementals','conjure-woodland-beings','contact-other-plane','contagion'];
const entries=slugs.map(slug=>bundledCatalog().bundle.entries.find(e=>e.id==='srd51:2014:spell:'+slug));
if(entries.some(e=>!e))throw Error('Missing fixture spell');
const html=`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Catalog row review</title>
<link rel="stylesheet" href="/client/fonts.css"><link rel="stylesheet" href="/client/style.css"><link rel="stylesheet" href="/client/local.css"><link rel="stylesheet" href="/client/catalog.css"><link rel="stylesheet" href="/client/quick.css">
<body data-theme="polar"><nav aria-label="Тема"><button data-theme="polar">Полярис</button><button data-theme="atlas">Атлас</button><button data-theme="coal">Уголь</button></nav>
<section class="catalog" style="padding:8px"><div class="catalog-grid" id="rows"></div></section>
<script src="/client/icons.js"></script><script src="/client/art.js"></script><script src="/client/ui.js"></script>
<script>document.querySelector('nav').onclick=e=>{if(e.target.dataset.theme)document.body.dataset.theme=e.target.dataset.theme};
fetch('/fixture-data.json').then(r=>r.json()).then(entries=>{document.querySelector('#rows').innerHTML=entries.map((entry,index)=>SkazUI.entryRow({entry,name:entry.name,className:'catalog-card catalog-row',primary:{attribute:'data-catalog-entry',value:index},metadata:'<ul class="catalog-card-summary"><li>'+entry.spell.level+' ур</li><li>'+entry.spell.castingTime+'</li><li>'+ (entry.spell.range.feet||'На себя')+' фт</li></ul>'})).join('')});</script></body></html>`;
const allowed=new Set(['fonts.css','style.css','local.css','catalog.css','quick.css','icons.js','art.js','ui.js','icons.svg']);
const server=createServer((req,res)=>{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
  const path=new URL(req.url,'http://localhost').pathname;
  let body,type='application/json; charset=utf-8';
  if(path==='/'){body=html;type='text/html; charset=utf-8';}
  else if(path==='/fixture-data.json')body=JSON.stringify(entries);
  else if(path==='/api/art')body=JSON.stringify(art.index());
  else if(path.startsWith('/art/common/')){const result=art.read(path);if(result){body=result.bytes;type=result.type;}}
  else if(path.startsWith('/client/')&&(allowed.has(path.slice(8))||/^\/client\/fonts\/[a-z0-9-]+\.woff2$/.test(path))){
    try{body=readFileSync(new URL('..'+path,import.meta.url));type=path.endsWith('.css')?'text/css':path.endsWith('.js')?'text/javascript':path.endsWith('.svg')?'image/svg+xml':'font/woff2';}catch{}
  }
  if(body===undefined){res.writeHead(404).end();return;}
  res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'}).end(req.method==='HEAD'?undefined:body);
});
server.listen(0,'127.0.0.1',()=>console.log('Catalog row review http://127.0.0.1:'+server.address().port+' PID '+process.pid));
