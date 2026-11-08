// Loopback-only review of explicit public pilot assets; no game database.
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url);
const files=new Map([
 ['/', ['docs/design/pilot-v1/index.html','text/html; charset=utf-8']],
 ...['fire-bolt','potion-of-healing','goblin'].map(name=>['/'+name+'.png',['data/art-pilot-v1/'+name+'.png','image/png']]),
 ['/fonts.css',['client/fonts.css','text/css']],
 ...['inter-400-800-cyrillic','inter-400-800-latin','pt-serif-400-cyrillic','pt-serif-400-latin','pt-serif-700-cyrillic','pt-serif-700-latin'].map(name=>['/fonts/'+name+'.woff2',['client/fonts/'+name+'.woff2','font/woff2']])
]);
createServer((req,res)=>{
 const file=files.get(new URL(req.url,'http://localhost').pathname);
 if(!file||!['GET','HEAD'].includes(req.method)){res.writeHead(404).end();return;}
 try{const bytes=readFileSync(fileURLToPath(new URL(file[0],root)));res.writeHead(200,{'Content-Type':file[1],'Content-Length':bytes.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:bytes);}catch{res.writeHead(404).end();}
}).listen(4188,'127.0.0.1',()=>console.log('Art pilot review http://127.0.0.1:4188 (no game data)'));
