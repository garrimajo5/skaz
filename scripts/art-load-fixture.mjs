// Local-only, disposable measurement game. Never accepts a campaign database.
import {createApp} from '../server/app.mjs';
import {openStore} from '../server/store.mjs';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';

export function createArtLoadFixture(){
 const store=openStore(':memory:');
 const command=fields=>({mutationId:randomUUID(),expectedRevision:store.read().revision,characterId:store.read().context.characterId,...fields});
 try{
  store.catalog.installBundled({version:store.catalog.previewBundled().version});
  store.setSpell(command({catalogId:'srd51:2014:spell:fireball',status:'prepared'}));
  for(const slug of ['potion-of-healing','cloak-of-the-manta-ray'])store.addInventory(command({catalogId:'srd51:2014:item:'+slug,quantity:1}));
 }catch(error){store.close();throw error;}
 const server=createApp(store),handler=server.listeners('request')[0];server.removeAllListeners('request');
 const stats={requests:0,bodyBytes:0,groups:{shell:{requests:0,bodyBytes:0},api:{requests:0,bodyBytes:0},art:{requests:0,bodyBytes:0}}};
 const snapshot=()=>structuredClone(stats);
 server.on('request',(req,res)=>{
  if(req.url==='/qa-metrics'){res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');return res.end(JSON.stringify(snapshot()));}
  const group=req.url.startsWith('/art/')?'art':req.url.startsWith('/api/')?'api':'shell';
  let bytes=0;const write=res.write.bind(res),end=res.end.bind(res);
  const size=(chunk,encoding)=>typeof chunk==='string'?Buffer.byteLength(chunk,typeof encoding==='string'?encoding:'utf8'):chunk?.byteLength||0;
  const count=(chunk,encoding)=>{if(req.method!=='HEAD'&&![204,304].includes(res.statusCode))bytes+=size(chunk,encoding);};
  res.write=(chunk,...args)=>{count(chunk,args[0]);return write(chunk,...args);};
  res.end=(chunk,...args)=>{count(chunk,args[0]);return end(chunk,...args);};
  res.on('finish',()=>{stats.requests++;stats.bodyBytes+=bytes;stats.groups[group].requests++;stats.groups[group].bodyBytes+=bytes;});
  handler(req,res);
 });
 server.once('close',()=>store.close());
 return {server,snapshot};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const raw=process.argv[2]??'4193';if(!/^\d+$/.test(raw)||Number(raw)<1024||Number(raw)>65535)throw Error('Port must be 1024–65535');
 const {server}=createArtLoadFixture();
 server.listen(Number(raw),'127.0.0.1',()=>console.log('Fictional art QA: http://127.0.0.1:'+raw+'/#play; counters: /qa-metrics'));
 const stop=()=>{server.closeAllConnections();server.close();};process.once('SIGINT',stop);process.once('SIGTERM',stop);
}
