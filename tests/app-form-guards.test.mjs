import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../client/app.js',import.meta.url),'utf8');
function harness(){
 let editable=true,revision=0;const elements=new Map(),handlers={},writes=[];
 const get=id=>{if(!elements.has(id))elements.set(id,{value:'',innerHTML:'',dataset:{},classList:{add(){},remove(){},toggle(){}},focus(){},scrollIntoView(){},append(node){elements.set('#'+node.id,node);},setAttribute(){},addEventListener(){},showModal(){this.open=true;},close(){this.open=false;}});return elements.get(id);};
 const context=vm.createContext({structuredClone,URL,Blob,location:{protocol:'http:',hash:'#hero'},history:{replaceState(){}},localStorage:{getItem:()=>null},setTimeout:()=>0,clearTimeout(){},
  document:{body:{dataset:{}},querySelector:get,querySelectorAll:()=>[],getElementById:id=>id==='blocked-form-message'?(elements.get('#'+id)||null):get('#'+id),createElement:()=>({setAttribute(){},scrollIntoView(){}}),addEventListener:(key,fn)=>handlers[key]=fn},window:{addEventListener(){},scrollTo(){}},
  SkazStorage:{preference:()=> 'polar',paint(){},boot(){},setTheme(){},sessionTitle:()=>'',sessionDate:()=>'',contextKey:()=> 'same',snapshotKey:()=> 'same:'+revision,editable:()=>editable,commit:async(state,label)=>{writes.push({state:structuredClone(state),label});revision++;return {state};}},SkazEvents:{pendingCount:()=>0}
 });vm.runInContext(source,context);
 return {get,writes,block:()=>editable=false,run:code=>vm.runInContext(code,context),state:()=>JSON.parse(vm.runInContext('JSON.stringify(state)',context)),click:id=>handlers.click({target:{closest:()=>({id,dataset:{},classList:{contains:()=>false}})}})};
}

test('manual sheet never applies fixed demo healing or presents its attack as a usable roll',async()=>{
 const h=harness();h.run('SkazStorage.manualStats=()=>true');h.run("openSpell('word')");h.get('#cast-level').value='1';h.get('#heal-target').value='self';const before=h.state();await h.get('#cast-spell').onclick();assert.deepEqual(h.state(),before);assert.equal(h.writes.length,0);assert.match(h.get('#dialog-content').innerHTML,/Демо-применение отключено/);assert.match(h.run('hero()'),/data-roll="rapier" disabled/);
});

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

test('player resource changes write a personal entry instead of changing the common session journal',async()=>{
 const h=harness();h.run("SkazStorage.can=action=>action!=='shared'");h.run('hpDialog()');h.get('#hp-value').value='4';await h.get('#apply-hp').onclick();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(h.writes.length,1);assert.equal(h.writes[0].state.hp,24);assert.equal(h.writes[0].state.journal.length,0);assert.equal(h.writes[0].state.notes.length,1);assert.match(h.writes[0].state.notes[0].text,/28 → 24/);
});

test('initial HTTP rendering waits for saved state instead of flashing the demonstration hero',()=>{
 const h=harness();h.run('SkazStorage.readyToDisplay=()=>false;render()');assert.match(h.get('#main').innerHTML,/Открываем твою игру/);assert.equal(h.get('#campaign-name').textContent,'');assert.equal(h.get('#quick-state').innerHTML,'');
 h.run('SkazStorage.readyToDisplay=()=>true;render()');assert.match(h.get('#main').innerHTML,/Элиан/);
});

test('damage and healing undo restore the saved state once without offering undo of undo',async()=>{
 for(const heal of [false,true]){
  const h=harness(),before=h.state();h.run(`hpDialog(${heal})`);h.get('#hp-value').value='7';h.get('#apply-hp').onclick();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.state().hp,before.hp+(heal?7:-7));assert.equal(h.writes.length,1);
  const undo=h.get('#undo').onclick;await undo();await undo();
  assert.deepEqual(h.state(),before);assert.equal(h.writes.length,2);
  assert.equal(h.writes[1].label,'Отмена: '+(heal?'Здоровье восстановлено':'Урон применён'));
  assert.doesNotMatch(h.get('#toast').innerHTML,/<button/);assert.doesNotMatch(h.get('#toast').innerHTML,/Отмена: Отмена:/);
 }
});

test('rapid double undo sends only one save while its first save is still pending',async()=>{
 const h=harness();await h.run("change('Урон применён',()=>{state.hp-=7})");
 h.run('let finishUndo;SkazStorage.commit=next=>new Promise(resolve=>{finishUndo=()=>resolve({state:next})})');
 const undo=h.get('#undo').onclick,first=undo();assert.equal(h.get('#undo').disabled,true);assert.equal(undo(),undefined);
 h.run('finishUndo()');await first;assert.equal(h.state().hp,28);assert.doesNotMatch(h.get('#toast').innerHTML,/<button/);
});

test('old undo cannot erase a later change or a newer server snapshot',async()=>{
 for(const newer of ["change('Золото',()=>{state.gold+=1})","Promise.resolve(SkazStorage.snapshotKey=()=> 'new-server-revision')"]){
  const h=harness();await h.run("change('Урон применён',()=>{state.hp-=7})");const undo=h.get('#undo').onclick;
  await h.run(newer);const current=h.state(),writes=h.writes.length;await undo();
  assert.deepEqual(h.state(),current);assert.equal(h.writes.length,writes);
 }
});

test('replaced or expired notifications cannot run their saved undo handlers',async()=>{
 for(const action of ["toast('Другое уведомление')",'expireToast()']){
  const h=harness();h.run('setTimeout=fn=>{globalThis.expireToast=fn;return 0}');
  await h.run("change('Урон применён',()=>{state.hp-=7})");const undo=h.get('#undo').onclick;
  h.run(action);await undo();assert.equal(h.state().hp,21);assert.equal(h.writes.length,1);
 }
});

test('undo refuses a different game and failed undo does not create a new inverse action',async()=>{
 const other=harness();await other.run("change('Урон применён',()=>{state.hp-=7})");other.run("SkazStorage.contextKey=()=> 'other'");await other.get('#undo').onclick();assert.equal(other.writes.length,1);assert.equal(other.state().hp,21);
 const failed=harness();await failed.run("change('Урон применён',()=>{state.hp-=7})");failed.run("SkazStorage.commit=async()=>{throw new Error('Нет соединения')}");const undo=failed.get('#undo').onclick;await undo();await undo();
 assert.equal(failed.state().hp,21);assert.match(failed.get('#toast').innerHTML,/Не сохранено/);assert.doesNotMatch(failed.get('#toast').innerHTML,/<button/);
});
