// Synthetic, memory-only manual-profile QA; never opens a campaign database.
import {randomUUID} from 'node:crypto';
import {openStore} from '../server/store.mjs';
import {createApp} from '../server/app.mjs';
const store=openStore(':memory:');
store.createCharacter({mutationId:randomUUID(),expectedRevision:store.read().revision,campaignId:store.read().context.campaignId,characterId:randomUUID(),template:'manual-2014',profile:{name:'QA Ручной герой',tagline:'Вымышленный профиль'},manual:{stats:{abilities:{str:16,dex:31,con:14,int:18,wis:12,cha:10},armorClass:16,initiative:3,speed:30},sheet:{ruleset:'5e-2014',ancestry:'',className:'QA Волшебник',subclass:'',level:21,counters:[{id:'counter-synthetic',name:'QA Запас',current:8,max:7}],spellcasting:{ability:'int',dcOverride:null,attackOverride:null}},hp:10,maxHp:20,tempHp:0,gold:0}});
const server=createApp(store);
server.listen(4337,'127.0.0.1',()=>console.log('Synthetic manual profile: http://127.0.0.1:4337/#hero'));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{store.close();process.exit(0);}));
