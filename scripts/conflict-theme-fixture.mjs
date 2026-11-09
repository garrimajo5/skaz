// Disposable local game for the conflict-state colour audit. Never opens a file DB.
import {createApp} from '../server/app.mjs';
import {openStore} from '../server/store.mjs';
const raw=process.argv[2]??'4216';
if(!/^\d+$/.test(raw)||Number(raw)<1024||Number(raw)>65535)throw Error('Port must be 1024–65535');
const store=openStore(':memory:'),server=createApp(store),handler=server.listeners('request')[0];
server.removeAllListeners('request');
server.on('request',(req,res)=>{
 if(req.method==='POST'&&req.url==='/api/resources/change'){
  req.resume();
  res.writeHead(409,{'Content-Type':'application/json'}).end(JSON.stringify({error:'Тестовый конфликт версии: требуется сверка'}));
  return;
 }
 handler(req,res);
});
server.listen(Number(raw),'127.0.0.1',()=>console.log('Synthetic conflict game: http://127.0.0.1:'+raw+'/#play'));
const stop=()=>{server.closeAllConnections();server.close(()=>store.close());};
process.once('SIGINT',stop);process.once('SIGTERM',stop);
