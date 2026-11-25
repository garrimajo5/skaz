const profileRulesSource=await readFile(new URL('../client/profile-rules.js',import.meta.url),'utf8');
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../client/character-sheet.js',import.meta.url),'utf8');
function controls(current,max,allowed=true){
 const context=vm.createContext({structuredClone,esc:value=>String(value).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;'),SkazStorage:{sheet:()=>({counters:[{id:'counter-test',name:'<Лёд>',current,max}]}),snapshotKey:()=> 'hero:revision',canResource:()=>allowed}});
 vm.runInContext(profileRulesSource,context);vm.runInContext(source,context);return vm.runInContext('SkazCharacterSheet.controls()',context);
}
test('small counters expose one command per dot without absolute positions or duplicate IDs',()=>{
 for(const max of [1,4,10])for(const current of [0,max]){
  const html=controls(current,max);assert.equal((html.match(/<button /g)||[]).length,max);
  assert.equal((html.match(/data-counter-delta="-1"/g)||[]).length,current);
  assert.equal((html.match(/data-counter-delta="1"/g)||[]).length,max-current);
  assert.equal((html.match(/data-sheet-context="hero:revision"/g)||[]).length,max);
  assert.doesNotMatch(html,/ id="|<Лёд>/);assert.match(html,/&lt;Лёд&gt;/);
 }
 assert.doesNotMatch(controls(0,0),/<button/);
 assert.equal((controls(2,4,false).match(/ disabled/g)||[]).length,4);
});
test('large counters retain bounded minus and plus, including read-only access',()=>{
 for(const max of [11,9999]){
  const zero=controls(0,max),full=controls(max,max);
  assert.equal((zero.match(/<button /g)||[]).length,2);
  assert.doesNotMatch(zero,/data-counter-delta="-1"[^>]*disabled/); // still accepts hold-to-restore at zero
  assert.doesNotMatch(zero,/data-counter-delta="1"[^>]*disabled/);
  assert.match(full,/data-counter-delta="1"[^>]*disabled/);
  assert.doesNotMatch(full,/data-counter-delta="-1"[^>]*disabled/);
  assert.equal((controls(1,max,false).match(/ disabled/g)||[]).length,2);
 }
});

test('tracker shapes differ without colour and filled marks spend and empty marks restore without extra controls',()=>{
 const context=vm.createContext({structuredClone,esc:String});vm.runInContext(profileRulesSource,context);vm.runInContext(source,context);const api=vm.runInContext('SkazCharacterSheet',context);
 const fields={name:'2 круг',label:'Ячейка 2 круга',current:2,max:3,attributes:d=>'data-delta="'+d+'"',pending:[1]};
 const slots=api.tracker({...fields,shape:'circle'}),classResource=api.tracker({...fields,shape:'diamond'});
 assert.match(slots,/tracker-mark circle/);assert.match(classResource,/tracker-mark diamond/);
 assert.match(slots,/<span class="tracker-name">2 круг<\/span> <span class="tracker-balance">2 \/ 3<\/span>/);
 assert.equal((slots.match(/data-delta="-1"/g)||[]).length,2);assert.equal((slots.match(/data-delta="1"/g)||[]).length,1);
 assert.match(slots,/Ячейка 2 круга, доступна/);assert.match(slots,/Ячейка 2 круга, потрачена/);assert.equal((slots.match(/Ждёт подтверждения сервера/g)||[]).length,1);
});

test('hold recovery emits once on release, suppresses ghost click and cancels scrolling or stale context',()=>{
 const events={};let now=0,key='hero-a',clicks=[];const context=vm.createContext({structuredClone,Date:{now:()=>now},document:{addEventListener:(name,handler)=>events[name]=handler},SkazStorage:{snapshotKey:()=>key}});vm.runInContext(profileRulesSource,context);vm.runInContext(source,context);const api=vm.runInContext('SkazCharacterSheet',context);api.bindTrackerGestures();
 const button={dataset:{tracker:'true',resource:'slot2',delta:'-1'},isConnected:true,click(){clicks.push(this.dataset.delta);}},event=(overrides={})=>({pointerId:1,button:0,isPrimary:true,clientX:20,clientY:20,target:{closest:()=>button},preventDefault(){},...overrides});
 events.pointerdown(event());now=600;events.pointerup(event());assert.deepEqual(clicks,['1']);assert.equal(button.dataset.delta,'-1');assert.equal(api.suppressTrackerClick(event({isTrusted:true,detail:1})),true);assert.equal(api.suppressTrackerClick(event({isTrusted:false,detail:0})),false);
 const replacement={dataset:{...button.dataset}};assert.equal(api.suppressTrackerClick(event({isTrusted:true,detail:1,target:{closest:()=>replacement}})),true);
 now=700;events.pointerdown(event());now=800;events.pointerup(event());assert.equal(api.suppressTrackerClick(event({isTrusted:true,detail:1})),false);assert.equal(clicks.length,1);
 events.pointerdown(event());now=1500;events.pointermove(event({clientY:40}));events.pointerup(event());assert.equal(clicks.length,1);
 events.pointerdown(event());now=2100;key='hero-b';events.pointerup(event());assert.equal(clicks.length,1);
 events.pointerdown(event());now=2800;events.pointercancel(event());events.pointerup(event());assert.equal(clicks.length,1);
 button.dataset={tracker:'true',counterId:'manual-counter',counterDelta:'-1'};button.click=()=>clicks.push(button.dataset.counterDelta);events.pointerdown(event());now=3400;events.pointerup(event());assert.deepEqual(clicks,['1','1']);assert.equal(button.dataset.counterDelta,'-1');
});

test('unlimited class resource is a readable infinity without numeric spending controls',()=>{
 const context=vm.createContext({structuredClone,esc:String,SkazStorage:{sheet:()=>({counters:[]}),unlimitedResources:()=>[{name:'Дикий облик',unlimited:true}],snapshotKey:()=> 'hero:revision',canResource:()=>true}});vm.runInContext(profileRulesSource,context);vm.runInContext(source,context);const html=vm.runInContext('SkazCharacterSheet.controls()',context);assert.match(html,/Дикий облик/);assert.match(html,/aria-label="Неограниченно">∞/);assert.doesNotMatch(html,/<button|data-counter-delta|9999/);
});

test('confirmed Lore skill panel shows calculated ranks and retains the manual fallback',()=>{
 let html='',trained=true;const context=vm.createContext({structuredClone,esc:String,modal:v=>html=v,SkazStorage:{stats:()=>({abilities:{str:8,dex:14,con:14,int:12,wis:10,cha:18}}),sheet:()=>({level:3,saveProficiencies:['dex','cha']}),classSkills:()=>trained?{jackOfAllTrades:true,skills:[{id:'arcana',name:'Магия',ability:'int',rank:'expertise',modifier:5},{id:'persuasion',name:'Убеждение',ability:'cha',rank:'proficient',modifier:6},{id:'stealth',name:'Скрытность',ability:'dex',rank:'untrained',modifier:3}]}:null}});vm.runInContext(profileRulesSource,context);vm.runInContext(source,context);vm.runInContext('SkazCharacterSheet.checks()',context);assert.match(html,/Магия <strong>\+5<\/strong> · Компетентность/);assert.match(html,/Скрытность <strong>\+3<\/strong> · Мастер на все руки/);trained=false;vm.runInContext('SkazCharacterSheet.checks()',context);assert.match(html,/не включает владение навыком/);assert.doesNotMatch(html,/Магия <strong>/);
});

test('rogue panel has no Jack of All Trades and tools require a chosen ability',()=>{
 let html='';const context=vm.createContext({structuredClone,esc:String,modal:v=>html=v,SkazStorage:{stats:()=>({abilities:{str:8,dex:14,con:14,int:12,wis:10,cha:18}}),sheet:()=>({level:6,saveProficiencies:[]}),classSkills:()=>({jackOfAllTrades:false,skills:[{id:'arcana',name:'Магия',ability:'int',rank:'untrained',modifier:1}],tools:{proficiencyBonus:6}})}});vm.runInContext(profileRulesSource,context);vm.runInContext(source,context);vm.runInContext('SkazCharacterSheet.checks()',context);assert.match(html,/ЛОВ · проверка без владения \+2/);assert.match(html,/Магия <strong>\+1<\/strong> · без владения/);assert.doesNotMatch(html,/Мастер на все руки/);assert.match(html,/Бонус владения \+6/);assert.match(html,/характеристики, выбранной для этой проверки/);
});

test('derived save benefits never double manual proficiency or apply a different level',()=>{
 let html='',level=15;const context=vm.createContext({structuredClone,esc:String,modal:v=>html=v,SkazStorage:{stats:()=>({abilities:{str:10,dex:10,con:10,int:10,wis:14,cha:10}}),sheet:()=>({level,saveProficiencies:level===15?['wis']:[]}),classSaveBenefits:()=>({level:15,saveProficiencies:['wis']}),classSkills:()=>null}});vm.runInContext(profileRulesSource,context);vm.runInContext(source,context);vm.runInContext('SkazCharacterSheet.checks()',context);assert.match(html,/Спасбросок \+7 [^>]*data-ui-icon="saved"/);assert.doesNotMatch(html,/Спасбросок \+12/);level=14;vm.runInContext('SkazCharacterSheet.checks()',context);assert.match(html,/Спасбросок \+2<\/p>/);
});
test('Reliable Talent is shown only on eligible skills and tools',()=>{
 let html='';const context=vm.createContext({structuredClone,esc:String,modal:v=>html=v,SkazStorage:{stats:()=>({abilities:{str:10,dex:16,con:10,int:10,wis:10,cha:10}}),sheet:()=>({level:11}),classSkills:()=>({jackOfAllTrades:false,skills:[{name:'Скрытность',ability:'dex',rank:'expertise',modifier:11,minimumD20:10},{name:'Магия',ability:'int',rank:'untrained',modifier:0,minimumD20:null}],tools:{proficiencyBonus:8,minimumD20:10}})}});vm.runInContext(profileRulesSource,context);vm.runInContext(source,context);vm.runInContext('SkazCharacterSheet.checks()',context);assert.match(html,/итог от \+21/);assert.match(html,/Магия <strong>\+0<\/strong> · без владения<\/p>/);assert.match(html,/результат к20 от1 до9 считается10/);
});

test('Diamond Soul panel names the manual death saving throw bonus',()=>{
 let html='';const context=vm.createContext({structuredClone,esc:String,modal:v=>html=v,SkazStorage:{stats:()=>({abilities:{str:10,dex:10,con:10,int:10,wis:10,cha:10}}),sheet:()=>({level:14}),classSaveBenefits:()=>({level:14,saveProficiencies:['str','dex','con','int','wis','cha'],deathSaveProficiency:true,origin:{name:'Алмазная душа'}}),classSkills:()=>null}});vm.runInContext(profileRulesSource,context);vm.runInContext(source,context);vm.runInContext('SkazCharacterSheet.checks()',context);assert.match(html,/от смерти также добавь мастерство \+5/);assert.equal((html.match(/Спасбросок \+5 [^>]*data-ui-icon="saved"/g)||[]).length,6);
});

test('Champion shows a conditional physical check without changing saves, mental checks, or mismatched heroes',()=>{
 let html='',level=7;const context=vm.createContext({structuredClone,esc:String,modal:v=>html=v,SkazStorage:{stats:()=>({abilities:{str:8,dex:14,con:14,int:12,wis:10,cha:18}}),sheet:()=>({level,saveProficiencies:['str']}),classSkills:()=>null,classCheckBenefits:()=>({level:7,bonus:2,untrainedAbilities:['str','dex','con'],origin:{name:'Выдающийся атлет'}})}});
 vm.runInContext(profileRulesSource,context);vm.runInContext(source,context);vm.runInContext('SkazCharacterSheet.checks()',context);
 assert.match(html,/СИЛ · проверка -1/);assert.match(html,/Без владения · Выдающийся атлет: <strong>\+1/);assert.match(html,/Спасбросок \+2 [^>]*data-ui-icon="saved"/);assert.match(html,/ИНТ · проверка \+1/);assert.equal((html.match(/Без владения · Выдающийся атлет/g)||[]).length,3);assert.match(html,/Инициатива на листе остаётся ручным итогом/);
 level=6;vm.runInContext('SkazCharacterSheet.checks()',context);assert.doesNotMatch(html,/Выдающийся атлет/);
});


test('manual excess renders numeric controls even above a zero or small maximum',()=>{
 for(const [current,max] of [[8,7],[1,0]]){
  const html=controls(current,max);assert.ok(html.includes(current+' / '+max));
  assert.ok(html.includes('data-counter-delta="-1"'));assert.ok(html.includes('data-counter-delta="1"'));
  assert.equal((html.match(/<button /g)||[]).length,2);
 }
});
