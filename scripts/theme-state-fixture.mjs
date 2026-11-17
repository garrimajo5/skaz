// Local synthetic app + read-only browser measurements. Never opens a file DB.
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createApp} from '../server/app.mjs';
import {openStore} from '../server/store.mjs';

export function createThemeStateFixture(){
 const store=openStore(':memory:'),server=createApp(store),app=server.listeners('request')[0];
 const reports=[];let mode='normal';const waiting=new Set();
 server.removeAllListeners('request');
 server.on('request',async(req,res)=>{
  try{
   const pathname=new URL(req.url,'http://127.0.0.1').pathname;
   if(pathname.startsWith('/_qa/')){
    if(req.method==='POST'){
     if(req.headers.origin!==`http://127.0.0.1:${server.address().port}`){req.resume();res.writeHead(403).end();return;}
     let text='';for await(const part of req){text+=part;if(Buffer.byteLength(text)>512000){res.writeHead(413).end();return;}}
     const value=JSON.parse(text);
     if(pathname==='/_qa/report'){
      if(reports.length>=100){res.writeHead(429).end();return;}
      if(!value||!Array.isArray(value.rows)||!['polar','coal','atlas'].includes(value.theme)){res.writeHead(400).end();return;}
      reports.push({sequence:reports.length+1,mode,...value});
     }else if(pathname==='/_qa/mode'&&['normal','pending','conflict'].includes(value.mode)){
      mode=value.mode;for(const release of waiting)release();waiting.clear();
     }else{res.writeHead(400).end();return;}
     res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({count:reports.length,mode}));return;
    }
    if(req.method==='GET'&&pathname==='/_qa/reports'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify({synthetic:true,reports}));return;}
    if(req.method==='GET'&&pathname==='/_qa/audit.js'){res.writeHead(200,{'Content-Type':'text/javascript'}).end(await readFile(new URL('./browser-theme-audit.js',import.meta.url)));return;}
    if(req.method==='GET'&&pathname==='/_qa/controls.js'){res.writeHead(200,{'Content-Type':'text/javascript'}).end(await readFile(new URL('./fixtures/theme-state-controls.js',import.meta.url)));return;}
    res.writeHead(404).end();return;
   }
   if(req.method==='GET'&&(pathname==='/'||pathname==='/index.html')){
    const html=await readFile(new URL('../client/index.html',import.meta.url),'utf8');
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}).end(html.replace('</body>','<script src="/_qa/audit.js"></script><script src="/_qa/controls.js"></script></body>'));return;
   }
   if(req.method==='POST'&&pathname==='/api/resources/change'&&mode!=='normal'){
    req.resume();
    if(mode==='pending')await new Promise(resolve=>{waiting.add(resolve);res.once('close',()=>{waiting.delete(resolve);resolve();});});
    if(!res.destroyed)res.writeHead(409,{'Content-Type':'application/json'}).end(JSON.stringify({error:'Синтетический конфликт QA: состояние не изменено'}));return;
   }
   app(req,res);
  }catch{if(!res.headersSent)res.writeHead(400);res.end();}
 });
 const stop=()=>{for(const release of waiting)release();waiting.clear();server.closeAllConnections();return new Promise(resolve=>server.close(()=>{store.close();resolve();}));};
 return {server,stop};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const fixture=createThemeStateFixture();fixture.server.listen(4337,'127.0.0.1',()=>console.log('Synthetic theme QA http://127.0.0.1:4337; Ctrl+Shift+Y capture, Ctrl+Shift+1 normal, 2 pending, 3 conflict'));
 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>fixture.stop());
}
