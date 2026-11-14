// Full application on disposable memory only; never accepts a database path.
import {openStore} from '../server/store.mjs';
import {createApp} from '../server/app.mjs';
import {templateStats} from '../server/character-stats.mjs';
import {randomUUID} from 'node:crypto';
// --scenario=class-choices: paladin 1, ranger 1, sorcerer 2.
// --scenario=unknown-metamagic: sorcerer 9 with no inferred previous choices.
const args=new Map();for(const arg of process.argv.slice(2)){
 const match=/^--(port|scenario)=(.+)$/.exec(arg);const key=arg==='--lose-response'?'lose-response':match?.[1];
 if(!key||args.has(key))throw Error('Unknown or repeated fixture argument');args.set(key,match?.[2]??true);
}
const port=Number(args.get('port')||4245),scenario=args.get('scenario')||'original';
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid fixture port');
const scenarios={original:[['fighter',3],['wizard',2],['cleric',1]],'class-choices':[['paladin',1],['ranger',1],['sorcerer',2]],'unknown-metamagic':[['sorcerer',9]]};
if(!Object.hasOwn(scenarios,scenario))throw Error('Unknown fixture scenario');
const heroes=scenarios[scenario],store=openStore(':memory:',{classAdvancement:true});
store.catalog.installBundled({version:store.catalog.previewBundled().version});
const command=(view,extra)=>({mutationId:randomUUID(),expectedRevision:view.read().revision,characterId:view.read().context.characterId,...extra});
for(const [index,[id,level]]of heroes.entries()){
 const view=index===0?store:store.forView('fixture-'+id);
 if(index!==0)view.createCharacter(command(view,{campaignId:view.read().context.campaignId,characterId:randomUUID(),template:'bard5-demo',profile:{name:'RAM '+id,tagline:'Вымышленный герой'}}));
 view.saveCharacterStats(command(view,{stats:structuredClone(templateStats)}));
 view.saveCharacterSheet(command(view,{sheet:{ruleset:'5e-2014',ancestry:'',className:id,subclass:'',level,counters:[]}}));
 view.update(command(view,{label:'Синтетические хиты',state:{...view.read().state,profile:{...view.read().state.profile,name:'RAM '+id},hp:12,maxHp:30}}));
}
const app=createApp(store,{classAdvancement:true});let lost=false;
app.prependListener('request',(req,res)=>{
 if(process.argv.includes('--lose-response')&&req.url==='/api/class-advancement/apply'&&req.method==='POST'&&!lost){const end=res.end;res.end=function(chunk,...args){if(res.statusCode===200){lost=true;return end.call(this,'{',...args);}return end.call(this,chunk,...args);};}
});
app.listen(port,'127.0.0.1',()=>console.log('Synthetic full app on '+port));
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{app.closeAllConnections();app.close(()=>{store.close();process.exit();});});
