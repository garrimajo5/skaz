import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../client/character-sheet.js',import.meta.url),'utf8');
function controls(current,max,allowed=true){
 const context=vm.createContext({esc:value=>String(value).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;'),SkazStorage:{sheet:()=>({counters:[{id:'counter-test',name:'<Лёд>',current,max}]}),snapshotKey:()=> 'hero:revision',canResource:()=>allowed}});
 vm.runInContext(source,context);return vm.runInContext('SkazCharacterSheet.controls()',context);
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
 const context=vm.createContext({esc:String});vm.runInContext(source,context);const api=vm.runInContext('SkazCharacterSheet',context);
 const fields={name:'2 круг',label:'Ячейка 2 круга',current:2,max:3,attributes:d=>'data-delta="'+d+'"',pending:[1]};
 const slots=api.tracker({...fields,shape:'circle'}),classResource=api.tracker({...fields,shape:'diamond'});
 assert.match(slots,/tracker-mark circle/);assert.match(classResource,/tracker-mark diamond/);
 assert.equal((slots.match(/data-delta="-1"/g)||[]).length,2);assert.equal((slots.match(/data-delta="1"/g)||[]).length,1);
 assert.match(slots,/Ячейка 2 круга, доступна/);assert.match(slots,/Ячейка 2 круга, потрачена/);assert.equal((slots.match(/Ждёт подтверждения сервера/g)||[]).length,1);
});

test('hold recovery emits once on release, suppresses ghost click and cancels scrolling or stale context',()=>{
 const events={};let now=0,key='hero-a',clicks=[];const context=vm.createContext({Date:{now:()=>now},document:{addEventListener:(name,handler)=>events[name]=handler},SkazStorage:{snapshotKey:()=>key}});vm.runInContext(source,context);const api=vm.runInContext('SkazCharacterSheet',context);api.bindTrackerGestures();
 const button={dataset:{tracker:'true',resource:'slot2',delta:'-1'},isConnected:true,click(){clicks.push(this.dataset.delta);}},event=(overrides={})=>({pointerId:1,button:0,isPrimary:true,clientX:20,clientY:20,target:{closest:()=>button},preventDefault(){},...overrides});
 events.pointerdown(event());now=600;events.pointerup(event());assert.deepEqual(clicks,['1']);assert.equal(button.dataset.delta,'-1');assert.equal(api.suppressTrackerClick(event({isTrusted:true,detail:1})),true);assert.equal(api.suppressTrackerClick(event({isTrusted:false,detail:0})),false);
 const replacement={dataset:{...button.dataset}};assert.equal(api.suppressTrackerClick(event({isTrusted:true,detail:1,target:{closest:()=>replacement}})),true);
 now=700;events.pointerdown(event());now=800;events.pointerup(event());assert.equal(api.suppressTrackerClick(event({isTrusted:true,detail:1})),false);assert.equal(clicks.length,1);
 events.pointerdown(event());now=1500;events.pointermove(event({clientY:40}));events.pointerup(event());assert.equal(clicks.length,1);
 events.pointerdown(event());now=2100;key='hero-b';events.pointerup(event());assert.equal(clicks.length,1);
 events.pointerdown(event());now=2800;events.pointercancel(event());events.pointerup(event());assert.equal(clicks.length,1);
 button.dataset={tracker:'true',counterId:'manual-counter',counterDelta:'-1'};button.click=()=>clicks.push(button.dataset.counterDelta);events.pointerdown(event());now=3400;events.pointerup(event());assert.deepEqual(clicks,['1','1']);assert.equal(button.dataset.counterDelta,'-1');
});
