// Synthetic, memory-only manual-profile QA; never opens a campaign database.
import {randomUUID} from 'node:crypto';
import {openStore} from '../server/store.mjs';
import {createApp} from '../server/app.mjs';
import {pathToFileURL} from 'node:url';

export function createManualProfileFixture({loseFirstResponse=false,profileEditors=true}={}) {
if(typeof profileEditors!=='boolean')throw Error('profileEditors must be boolean');
if(typeof loseFirstResponse!=='boolean')throw Error('loseFirstResponse must be boolean');
const store=openStore(':memory:');
store.createCharacter({mutationId:randomUUID(),expectedRevision:store.read().revision,campaignId:store.read().context.campaignId,characterId:randomUUID(),template:'manual-2014',profile:{name:'QA Ручной герой',tagline:'Вымышленный профиль'},manual:{stats:{abilities:{str:16,dex:31,con:14,int:18,wis:12,cha:10},armorClass:16,initiative:3,speed:30},sheet:{ruleset:'5e-2014',ancestry:'',className:'QA Волшебник',subclass:'',level:21,counters:[{id:'counter-synthetic',name:'QA Запас',current:8,max:7}],spellcasting:{ability:'int',dcOverride:null,attackOverride:null}},hp:10,maxHp:20,tempHp:0,gold:0}});
const server=createApp(store,{profileEditors});
let pendingLoss=loseFirstResponse;
const observations={lostResponses:0};
server.prependListener('request',(request,response)=>{
  if(!pendingLoss||request.method!=='POST'||request.url!=='/api/character-stats')return;
  const end=response.end.bind(response);
  response.end=(data,...args)=>{
    if(pendingLoss&&response.statusCode===200){pendingLoss=false;observations.lostResponses++;return end('{');}
    return end(data,...args);
  };
});
server.once('close',()=>store.close());
return {server,snapshot:()=>({workspace:store.read(),history:store.history(),...observations})};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(process.argv.slice(2).some(arg=>!['--lose-first-response','--profile-recovery'].includes(arg)))throw Error('Usage: node scripts/manual-profile-fixture.mjs [--lose-first-response] [--profile-recovery]');
 const {server}=createManualProfileFixture({loseFirstResponse:process.argv.includes('--lose-first-response'),profileEditors:!process.argv.includes('--profile-recovery')});
 server.listen(4337,'127.0.0.1',()=>console.log('Synthetic manual profile: http://127.0.0.1:4337/#hero'));
 const stop=()=>{server.closeAllConnections();server.close();};
 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,stop);
}
