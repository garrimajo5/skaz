import {divineCommand} from './fixtures/divine-commands.mjs';
import {wizardCommand} from './fixtures/wizard-commands.mjs';
import {rangerCommand} from './fixtures/ranger-commands.mjs';
// Full application on disposable memory only; never accepts a database path.
import {openStore} from '../server/store.mjs';
import {createApp} from '../server/app.mjs';
import {templateStats} from '../server/character-stats.mjs';
import {randomUUID} from 'node:crypto';
import {previewClassLevel,spellChoiceOptions} from '../server/class-progression.mjs';
// --scenario=class-choices: paladin 1, ranger 1, sorcerer 2.
// --scenario=unknown-metamagic: sorcerer 9 with no inferred previous choices.
const args=new Map();for(const arg of process.argv.slice(2)){
 const match=/^--(port|scenario)=(.+)$/.exec(arg);const key=arg==='--lose-response'?'lose-response':match?.[1];
 if(!key||args.has(key))throw Error('Unknown or repeated fixture argument');args.set(key,match?.[2]??true);
}
const port=Number(args.get('port')||4245),scenario=args.get('scenario')||'original';
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid fixture port');
const scenarios={original:[['fighter',3],['wizard',2],['cleric',1]],'class-choices':[['paladin',1],['ranger',1],['sorcerer',2]],'unknown-metamagic':[['sorcerer',9]],'warlock-choices':[['warlock',1]],'unknown-invocations':[['warlock',4]],'subclass-choices':[['fighter',2],['barbarian',2],['rogue',2],['monk',2],['wizard',1],['ranger',2]],'champion-style':[['fighter',2]],'wizard-mastery':[['wizard',1]],'ranger-six':[['ranger',1]],'ranger-ten':[['ranger',1]],'ranger-fourteen':[['ranger',1]],'devotion':[['paladin',2]],'wizard-signature':[['wizard',1]],'life-domain':[['cleric',1]],'land-cantrip':[['druid',1]],'land-terrain':[['druid',1]],'archdruid':[['druid',1]]};
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
// Produce provenance through real atomic commands, never fabricate a ledger.
if(['champion-style','wizard-mastery'].includes(scenario)){
 const classId=scenario==='champion-style'?'fighter':'wizard',target=scenario==='champion-style'?9:17;
 while(store.read().characterSheet.level<target){
  const current=store.read(),fromLevel=current.characterSheet.level;
  const plan=previewClassLevel({classId,fromLevel,toLevel:fromLevel+1,constitution:current.characterStats.abilities.con}),choices={};
  for(const c of plan.choices)if(c.required){
   if(c.kind==='subclass')choices[c.id]={id:classId==='fighter'?'fighter-champion':'wizard-evocation'};
   else if(c.kind==='ability-score-improvement-or-feat'){
    const ability=Object.keys(current.characterStats.abilities).find(k=>current.characterStats.abilities[k]<=18);
    choices[c.id]={increases:Object.fromEntries(Object.keys(current.characterStats.abilities).map(k=>[k,k===ability?2:0]))};
   }else choices[c.id]=spellChoiceOptions(classId,fromLevel+1,c.kind,{knownIds:current.spellbook.map(row=>row.catalogId)}).slice(0,c.count).map(row=>row.spellId);
  }
  store.advanceCharacter(command(store,{classId,fromLevel,hpMethod:'fixed',hpRoll:null,choices,reviewedFeatures:plan.requiresFeatureReview}));
 }
}
if(scenario.startsWith('ranger-')){const target={'ranger-six':5,'ranger-ten':9,'ranger-fourteen':13}[scenario];while(store.read().characterSheet.level<target)store.advanceCharacter(rangerCommand(store));}
if(scenario==='wizard-signature')while(store.read().characterSheet.level<19)store.advanceCharacter(wizardCommand(store));
if(['land-terrain','archdruid'].includes(scenario)){const target=scenario==='land-terrain'?2:19;while(store.read().characterSheet.level<target)store.advanceCharacter(divineCommand(store));}
const app=createApp(store,{classAdvancement:true});let lost=false;
app.prependListener('request',(req,res)=>{
 if(process.argv.includes('--lose-response')&&req.url==='/api/class-advancement/apply'&&req.method==='POST'&&!lost){const end=res.end;res.end=function(chunk,...args){if(res.statusCode===200){lost=true;return end.call(this,'{',...args);}return end.call(this,chunk,...args);};}
});
app.listen(port,'127.0.0.1',()=>console.log('Synthetic full app on '+port));
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{app.closeAllConnections();app.close(()=>{store.close();process.exit();});});
