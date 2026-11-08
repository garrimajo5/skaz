// Loopback-only review of explicit public pilot assets; no game database.
import {createServer} from 'node:http';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url);
const candidates=JSON.parse(readFileSync(new URL('../docs/design/pilot-v1/candidates.json',import.meta.url))).entries;
const slugs=candidates.map(entry=>entry.id.split(':').at(-1));
if(slugs.some(slug=>! /^[a-z]+(?:-[a-z]+)*$/.test(slug)))throw Error('Invalid pilot filename');
for(const [index,entry] of candidates.entries())if(!new RegExp('^data/art-pilot-v1/'+slugs[index]+'(?:-v[1-9][0-9]*)?\\.png$').test(entry.path))throw Error('Invalid versioned pilot path');
const files=new Map([
 ['/', ['docs/design/pilot-v1/index.html','text/html; charset=utf-8']],
 ['/all',['docs/design/pilot-v1/all.html','text/html; charset=utf-8']],
 ['/candidates.json',['docs/design/pilot-v1/candidates.json','application/json']],
 ...candidates.map((entry,index)=>['/'+slugs[index]+'.png',[entry.path,'image/png']]),
 ['/fonts.css',['client/fonts.css','text/css']],
 ...['inter-400-800-cyrillic','inter-400-800-latin','pt-serif-400-cyrillic','pt-serif-400-latin','pt-serif-700-cyrillic','pt-serif-700-latin'].map(name=>['/fonts/'+name+'.woff2',['client/fonts/'+name+'.woff2','font/woff2']])
]);
// Prepared pilot is optional and never exposes arbitrary paths or game data.
const preparedPath=new URL('../data/art-delivery/manifest.json',import.meta.url);
let prepared;
if(existsSync(preparedPath)){
 prepared=JSON.parse(readFileSync(preparedPath));
 for(const entry of prepared.entries){
  const source=candidates.find(e=>e.id===entry.id);
  if(!source||source.sha256!==entry.source.sha256)throw Error('Stale prepared pilot');
  for(const role of ['thumbnail','card']){
   const f=entry.files[role];
   if(!/^data\/art-delivery\/[a-z-]+-(thumbnail|card)-[a-f0-9]{16}\.png$/.test(f.path)||f.derivedFrom!==source.sha256)throw Error('Invalid prepared pilot path/provenance');
   const url='/prepared/'+f.path.split('/').at(-1);files.set(url,[f.path,'image/png']);entry[role+'Url']=url;
  }
 }
}
createServer((req,res)=>{
 if(new URL(req.url,'http://localhost').pathname==='/prepared.json'&&prepared&&['GET','HEAD'].includes(req.method)){
  res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(req.method==='HEAD'?undefined:JSON.stringify(prepared));return;
 }
 const file=files.get(new URL(req.url,'http://localhost').pathname);
 if(!file||!['GET','HEAD'].includes(req.method)){res.writeHead(404).end();return;}
 try{const bytes=readFileSync(fileURLToPath(new URL(file[0],root)));res.writeHead(200,{'Content-Type':file[1],'Content-Length':bytes.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:bytes);}catch{res.writeHead(404).end();}
}).listen(4188,'127.0.0.1',()=>console.log('Art pilot review http://127.0.0.1:4188 (no game data)'));
