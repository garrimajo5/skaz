// Disposable loopback QA only: never accepts a campaign database or credentials.
import {readFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createArtLibrary} from '../server/art-library.mjs';
import {createArtLoadFixture} from './art-load-fixture.mjs';
const modes=['healthy','missing','corrupt','disconnect'];
export function createArtFailureFixture({initialMode='healthy'}={}){
 if(!modes.includes(initialMode))throw Error('Unknown art failure mode');
 const library=createArtLibrary(JSON.parse(readFileSync(new URL('../catalog/art-manifest.json',import.meta.url))),{base:fileURLToPath(new URL('../',import.meta.url))});
 let mode=initialMode,index,aliases=new Map(),faults=0;
 function setMode(next){if(!modes.includes(next))throw Error('Unknown art failure mode');mode=next;aliases=new Map();index=library.index();const salt=randomUUID();for(const entry of index.entries)for(const file of Object.values(entry.files)){const original=file.url;file.url='/art/common/'+createHash('sha256').update(salt+original).digest('hex')+'.png';aliases.set(file.url,original);}}
 setMode(mode);
 const artLibrary={index:()=>structuredClone(index),read(url){const original=aliases.get(url);if(!original)return null;if(mode==='missing'){faults++;return null;}if(mode==='corrupt'){faults++;return {bytes:Buffer.from('Synthetic invalid PNG'),etag:'"qa-corrupt"',type:'image/png'};}return library.read(original);}};
 const {server,snapshot}=createArtLoadFixture({artLibrary}),handler=server.listeners('request')[0];server.removeAllListeners('request');
 server.on('request',async(req,res)=>{
  const path=new URL(req.url,'http://127.0.0.1').pathname;
  if(path==='/qa/art-failure'){
   if(!['127.0.0.1:'+req.socket.localPort,'localhost:'+req.socket.localPort].includes(req.headers.host)){res.writeHead(403);return res.end();}
   res.setHeader('Cache-Control','no-store');
   if(req.method==='GET'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end('<!doctype html><html lang="ru"><title>СКАЗ: тест отказов изображений</title><h1>Только вымышленная RAM-игра</h1><p>Режим: '+mode+'. Сбоев: '+faults+'</p><form method="post"><label>Режим изображений <select name="mode">'+modes.map(m=>'<option '+(m===mode?'selected ':'')+'value="'+m+'">'+m+'</option>').join('')+'</select></label><button>Применить</button></form><p>После смены режима откройте справочник заново или перезагрузите его вкладку. Счётчик сбоев включает обрывы; qa-metrics их не учитывает.</p><a href="/#library">Открыть справочник</a></html>');}
   if(req.method!=='POST'){res.writeHead(405);return res.end();}
   if(req.headers.origin!=='http://'+req.headers.host){res.writeHead(403);return res.end();}
   let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>64){res.writeHead(413);return res.end();}}
   const fields=new URLSearchParams(body),next=fields.get('mode');if([...fields.keys()].some(k=>k!=='mode')||fields.getAll('mode').length!==1||!modes.includes(next)){res.writeHead(400);return res.end();}
   setMode(next);res.writeHead(303,{Location:'/qa/art-failure'});return res.end();
  }
  if(mode==='disconnect'&&req.method==='GET'&&aliases.has(path)){faults++;req.socket.destroy();return;}
  handler(req,res);
 });
 return {server,snapshot,status:()=>({mode,faults}),setMode};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const{server}=createArtFailureFixture();server.listen(4337,'127.0.0.1',()=>console.log('Synthetic art-failure QA: http://127.0.0.1:4337/qa/art-failure'));const stop=()=>{server.closeAllConnections();server.close();};process.once('SIGINT',stop);process.once('SIGTERM',stop);}