// Disposable RAM game only; the failure switch is never part of the production app.
import {createArtLoadFixture} from './art-load-fixture.mjs';
import {pathToFileURL} from 'node:url';
export function createMaterialCardsFixture(){
 const {server}=createArtLoadFixture(),handler=server.listeners('request')[0];
 server.removeAllListeners('request');let failNext=false;
 server.on('request',(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname==='/qa/material-failure'){
   if(req.method!=='POST'||req.headers.origin!=='http://'+req.headers.host){res.writeHead(403);return res.end();}
   failNext=true;res.writeHead(204);return res.end();
  }
  if(failNext&&url.pathname==='/api/catalog/entry'&&url.searchParams.get('id')==='srd51:2014:spell:fireball'){
   failNext=false;res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end(JSON.stringify({error:'Synthetic material lookup failure'}));
  }
  handler(req,res);
 });
 return {server};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const {server}=createMaterialCardsFixture();server.listen(4337,'127.0.0.1',()=>console.log('Synthetic material-card QA: http://127.0.0.1:4337/#library'));
 const stop=()=>{server.closeAllConnections();server.close();};process.once('SIGINT',stop);process.once('SIGTERM',stop);
}