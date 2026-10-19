import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../client/app.js',import.meta.url),'utf8');
function harness(){
 let editable=true;const elements=new Map(),handlers={},writes=[];
 const get=id=>{if(!elements.has(id))elements.set(id,{value:'',innerHTML:'',dataset:{},classList:{add(){},remove(){},toggle(){}},focus(){},scrollIntoView(){},append(node){elements.set('#'+node.id,node);},setAttribute(){},addEventListener(){},showModal(){this.open=true;},close(){this.open=false;}});return elements.get(id);};
 const context=vm.createContext({structuredClone,URL,Blob,location:{protocol:'http:',hash:'#hero'},history:{replaceState(){}},localStorage:{getItem:()=>null},setTimeout:()=>0,clearTimeout(){},
  document:{body:{dataset:{}},querySelector:get,querySelectorAll:()=>[],getElementById:id=>id==='blocked-form-message'?(elements.get('#'+id)||null):get('#'+id),createElement:()=>({setAttribute(){},scrollIntoView(){}}),addEventListener:(key,fn)=>handlers[key]=fn},window:{addEventListener(){},scrollTo(){}},
  SkazStorage:{preference:()=> 'polar',paint(){},boot(){},setTheme(){},sessionTitle:()=>'',sessionDate:()=>'',contextKey:()=> 'same',editable:()=>editable,commit:async(state,label)=>{writes.push({state:structuredClone(state),label});return {state};}},SkazEvents:{pendingCount:()=>0}
 });vm.runInContext(source,context);
 return {get,writes,block:()=>editable=false,run:code=>vm.runInContext(code,context),state:()=>JSON.parse(vm.runInContext('JSON.stringify(state)',context)),click:id=>handlers.click({target:{closest:()=>({id,dataset:{},classList:{contains:()=>false}})}})};
}

test('forms keep entered values when the tab becomes stale before save',async()=>{
 const cases=[
  ['addNote()',{'#note-body':'Рассказ мастера, ещё не отправлен'},'#save-note'],
  ['addNote(true)',{'#note-body':'Заметка о месте'},'#save-note'],
  ['editProfile()',{'#profile-name':'Новое имя','#profile-tagline':'Описание','#profile-campaign':'Кампания','#profile-max-hp':'42'},'#save-profile'],
  ['hpDialog()',{'#hp-value':'9'},'#apply-hp'],
  ["openSpell('word')",{'#cast-level':'1','#heal-target':'self'},'#cast-spell']
 ];
 for(const [open,values,save] of cases){
  const h=harness(),before=h.state();h.run(open);for(const [id,value] of Object.entries(values))h.get(id).value=value;
  h.block();await h.get(save).onclick();assert.equal(h.get('#dialog').open,true,open);assert.deepEqual(h.state(),before);assert.equal(h.writes.length,0);
  for(const [id,value] of Object.entries(values))assert.equal(h.get(id).value,value);
  assert.match(h.get('#blocked-form-message').textContent,/Введённые данные остаются в форме/);
 }
});

test('rest forms remain open after stale detection; ready note saves normally once',async()=>{
 for(const id of ['#short-rest','#long-rest']){const h=harness(),before=h.state();h.click('rest');h.block();await h.get(id).onclick();assert.equal(h.get('#dialog').open,true);assert.deepEqual(h.state(),before);assert.equal(h.writes.length,0);}
 const h=harness();h.run('addNote()');h.get('#note-body').value='Новая зацепка';h.get('#save-note').onclick();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(h.get('#dialog').open,false);assert.equal(h.writes.length,1);assert.equal(h.state().notes.at(-1).text,'Новая зацепка');
});
