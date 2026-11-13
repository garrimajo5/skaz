// Disposable synthetic game for conditions/contrast QA; never opens a campaign file.
import {openStore} from '../server/store.mjs';
import {createApp} from '../server/app.mjs';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';

export function createConditionsFixture({loseFirstResponse=false}={}) {
  if(typeof loseFirstResponse!=='boolean')throw Error('loseFirstResponse must be boolean');
  const store=openStore(':memory:');
  try {
    store.catalog.installBundled({version:store.catalog.previewBundled().version});
    const command=fields=>({mutationId:randomUUID(),expectedRevision:store.read().revision,...fields});
    for(const slug of ['shield','hold-person','mage-hand','fireball','healing-word','cure-wounds','thunderwave','shatter','vicious-mockery','detect-magic']) {
      store.setSpell(command({characterId:store.read().context.characterId,catalogId:'srd51:2014:spell:'+slug,status:'prepared'}));
    }
    store.update(command({label:'Synthetic conditions QA',state:{...store.read().state,conditions:{active:['blinded','paralyzed'],exhaustion:2},concentration:'Проверочная концентрация'}}));
  } catch(error) {store.close();throw error;}
  const server=createApp(store);let pendingLoss=loseFirstResponse;
  const observations={lostResponses:0};
  server.prependListener('request',(request,response)=>{
    if(request.method!=='PUT'||request.url!=='/api/workspace'||!pendingLoss)return;
    const end=response.end.bind(response);
    response.end=(data,...args)=>{
      if(response.statusCode===200&&pendingLoss){pendingLoss=false;observations.lostResponses++;return end('{');}
      return end(data,...args);
    };
  });
  server.once('close',()=>store.close());
  return {server,snapshot:()=>({workspace:store.read(),history:store.history(),...observations})};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const raw=process.argv[2]??'4321';
  if(!/^\d+$/.test(raw)||Number(raw)<1024||Number(raw)>65535||process.argv.slice(3).some(x=>x!=='--lose-first-response'))throw Error('Usage: node scripts/conditions-fixture.mjs [port] [--lose-first-response]');
  const {server}=createConditionsFixture({loseFirstResponse:process.argv.includes('--lose-first-response')});
  server.listen(Number(raw),'127.0.0.1',()=>console.log('Synthetic conditions QA http://127.0.0.1:'+raw+'/#play'));
  const stop=()=>{server.closeAllConnections();server.close();};process.once('SIGINT',stop);process.once('SIGTERM',stop);
}
