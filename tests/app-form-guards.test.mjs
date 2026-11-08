const healthSource=await readFile(new URL('../client/health.js',import.meta.url),'utf8');
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const sheetSource=await readFile(new URL('../client/character-sheet.js',import.meta.url),'utf8');
const source=await readFile(new URL('../client/app.js',import.meta.url),'utf8');
function harness(){
 let editable=true,revision=0;const elements=new Map(),handlers={},writes=[];
 const get=id=>{if(!elements.has(id))elements.set(id,{value:'',innerHTML:'',dataset:{},classList:{add(){},remove(){},toggle(){}},focus(){},scrollIntoView(){},append(node){elements.set('#'+node.id,node);},setAttribute(){},addEventListener(){},showModal(){this.open=true;},close(){this.open=false;}});return elements.get(id);};
 const context=vm.createContext({structuredClone,URL,Blob,location:{protocol:'http:',hash:'#hero'},history:{replaceState(){}},localStorage:{getItem:()=>null},setTimeout:()=>0,clearTimeout(){},
  document:{body:{dataset:{}},querySelector:get,querySelectorAll:()=>[],getElementById:id=>id==='blocked-form-message'?(elements.get('#'+id)||null):get('#'+id),createElement:()=>({setAttribute(){},scrollIntoView(){}}),addEventListener:(key,fn)=>handlers[key]=fn},window:{addEventListener(){},scrollTo(){}},
  SkazStorage:{preference:()=> 'polar',paint(){},boot(){},setTheme(){},sessionTitle:()=>'',sessionDate:()=>'',contextKey:()=> 'same',snapshotKey:()=> 'same:'+revision,editable:()=>editable,commit:async(state,label)=>{writes.push({state:structuredClone(state),label});revision++;return {state};}},SkazEvents:{pendingCount:()=>0}
 });vm.runInContext(healthSource,context);vm.runInContext(sheetSource,context);vm.runInContext(source,context);
 return {get,writes,block:()=>editable=false,run:code=>vm.runInContext(code,context),state:()=>JSON.parse(vm.runInContext('JSON.stringify(state)',context)),click:(id,dataset={})=>handlers.click({target:{closest:()=>({id,dataset,classList:{contains:()=>false}})}})};
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
  assert.equal(h.writes[1].label,'Отмена: '+(heal?'+7 хитов · 28 → 35':'−7 хитов · 28 → 21'));
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

test('health entry starts empty, previews clamping and submits explicit numbers with Enter',async()=>{
 const h=harness();h.run('hpDialog()');assert.match(h.get('#dialog-content').innerHTML,/inputmode="numeric"/);assert.doesNotMatch(h.get('#dialog-content').innerHTML,/value="7"/);
 await h.get('#apply-hp').onclick();assert.equal(h.writes.length,0);
 h.get('#hp-value').value='99';h.get('#hp-value').oninput();assert.equal(h.get('#hp-preview').textContent,'28 → 0 хитов · Погиб · Урон сверх оставшихся хитов: 71');assert.equal(h.get('#apply-hp').textContent,'Применить −99');
 await h.get('#hp-value').onkeydown({key:'Enter',preventDefault(){}});assert.equal(h.writes.length,0);await h.get('#confirm-death').onclick();await new Promise(r=>setImmediate(r));assert.equal(h.state().hp,0);assert.match(h.writes[0].label,/−99 хитов · 28 → 0/);
});

test('health entry rejects stale preview and keeps concentration reminder with undo',async()=>{
 const h=harness();h.run('hpDialog()');h.get('#hp-value').value='12';h.run("SkazStorage.snapshotKey=()=> 'changed'");await h.get('#apply-hp').onclick();assert.equal(h.writes.length,0);
 const c=harness();c.run("state.concentration='Свет';hpDialog()");c.get('#hp-value').value='22';await c.get('#apply-hp').onclick();assert.match(c.get('#toast').innerHTML,/Телосложение Сл 11/);assert.match(c.get('#toast').innerHTML,/id="undo"/);
});

test('quick resources spend and restore one unit, obey bounds and refuse manual or read-only sheets',async()=>{
 const h=harness();h.click('',{resource:'slot1',delta:'-1'});await new Promise(r=>setImmediate(r));assert.equal(h.state().slots[1],2);assert.equal(h.writes.length,1);assert.match(h.writes[0].label,/3 → 2/);
 await h.get('#undo').onclick();assert.equal(h.state().slots[1],3);assert.doesNotMatch(h.get('#toast').innerHTML,/<button/);
 h.click('',{resource:'slot1',delta:'1'});await new Promise(r=>setImmediate(r));assert.equal(h.state().slots[1],4);const count=h.writes.length;h.click('',{resource:'slot1',delta:'1'});assert.equal(h.writes.length,count);
 h.run('SkazStorage.sheet=()=>({level:5})');h.click('',{resource:'inspiration',delta:'-1'});assert.equal(h.writes.length,count);
 h.run('SkazStorage.sheet=()=>null');h.block();h.click('',{resource:'inspiration',delta:'-1'});assert.equal(h.writes.length,count);
});


test('fixed resource groups render only their book circle and remain in the bottom panel',()=>{
 const h=harness();const one=h.run('resourceControls(1)');assert.equal((one.match(/data-resource="slot1"/g)||[]).length,5);assert.doesNotMatch(one,/data-resource="(?:slot2|slot3|inspiration)"/);assert.doesNotMatch(h.run('resourceControls(0)'),/data-resource/);assert.match(h.get('#quick-state').innerHTML,/quick-resources/);
 h.run('SkazStorage.sheet=()=>({counters:[]});');assert.equal(h.run('resourceControls(1)'),'');
});

test('quick personal note saves once on Enter, preserves newlines and never writes common journal',async()=>{
 const h=harness();h.run('quickNote()');h.get('#quick-note-body').value='Запомнить имя';let prevented=0;
 const handler=h.get('#quick-note-body').onkeydown;
 handler({key:'Enter',shiftKey:true,preventDefault(){prevented++;}});handler({key:'Enter',isComposing:true,preventDefault(){prevented++;}});assert.equal(h.writes.length,0);
 await handler({key:'Enter',preventDefault(){prevented++;}});await handler({key:'Enter',preventDefault(){prevented++;}});
 assert.equal(h.writes.length,1);assert.equal(h.state().notes.at(-1).text,'Запомнить имя');assert.equal(h.state().journal.length,0);assert.equal(prevented,2);
});

test('quick note refuses changed snapshot or permissions and leaves typed text available',async()=>{
 for(const stale of [true,false]){const h=harness();h.run('quickNote()');h.get('#quick-note-body').value='Не потерять';if(stale)h.run("SkazStorage.snapshotKey=()=> 'another-game'");else h.block();await h.get('#quick-note-save').onclick();assert.equal(h.writes.length,0);assert.equal(h.get('#dialog').open,true);assert.equal(h.get('#quick-note-body').value,'Не потерять');}
});

test('ending concentration has one-shot undo and rejects stale control from another snapshot',async()=>{
 const h=harness();h.run("state.concentration='Гипнотический узор'");const before=h.state();await h.run("endConcentration('Гипнотический узор',SkazStorage.snapshotKey())");assert.equal(h.state().concentration,null);assert.equal(h.writes.length,1);
 const undo=h.get('#undo').onclick;await undo();await undo();assert.deepEqual(h.state(),before);assert.equal(h.writes.length,2);assert.doesNotMatch(h.get('#toast').innerHTML,/<button/);
 await h.run("endConcentration('Гипнотический узор','old-context')");assert.equal(h.writes.length,2);
 h.block();await h.run("endConcentration('Гипнотический узор',SkazStorage.snapshotKey())");assert.equal(h.state().concentration,before.concentration);assert.equal(h.writes.length,2);
});

test('bottom bar escapes concentration and exposes queue count without claiming it is saved',()=>{
 const h=harness();h.run("state.concentration='<img src=x>';SkazStorage.pendingCount=()=>3;render()");const html=h.get('#quick-state').innerHTML;assert.doesNotMatch(html,/<img/);assert.match(html,/&lt;img/);assert.match(html,/Не подтверждено сервером: 3/);assert.match(html,/quick-note/);
});

test('resource toast undo references its original mutation rather than an unrelated increment',async()=>{
 const h=harness();h.run(`var queuedCommands=[];var queueGeneration=0;SkazStorage.resourceGeneration=()=>queueGeneration;SkazStorage.resourceDelta=(resource,delta,key,targetMutationId)=>{const command={resource,delta,key,targetMutationId,mutationId:'command-'+queuedCommands.length,before:3,maximum:4};queuedCommands.push(command);queueGeneration++;return command;};resourceAction({kind:'slot',level:1},-1,'Ячейка');`);
 await h.get('#undo').onclick();const commands=h.run('queuedCommands');assert.equal(commands.length,2);assert.equal(commands[1].targetMutationId,commands[0].mutationId);assert.equal(commands[1].delta,1);assert.doesNotMatch(h.get('#toast').innerHTML,/<button/);
});

test('combat values render only in the common panel across hero and demo spell pages',()=>{
 const h=harness();
 for(const page of ['hero()','demoSpellsPage()']){
  const html=h.run(page);assert.doesNotMatch(html,/data-resource=|class="hp-number"|id="inspire"|id="rest"|class="slots"/);
 }
 const panel=h.run('quickPanel()');assert.equal((panel.match(/data-health="damage"/g)||[]).length,1);assert.equal((panel.match(/data-health="heal"/g)||[]).length,1);assert.equal((panel.match(/id="rest"/g)||[]).length,1);assert.match(panel,/Хиты: 28 из 38/);
 h.run("SkazStorage.sheet=()=>({counters:[],level:2,className:'Тест'});SkazStorage.snapshotKey=()=> 'test'");
 assert.doesNotMatch(h.run('hero()'),/data-counter-delta|id="rest"/);
 assert.doesNotMatch(h.run('quickPanel()'),/id="rest" class="secondary" disabled/);
});

test('damage applies resistance before vulnerability with rounding and never modifies healing',async()=>{
 const h=harness();h.run('hpDialog()');h.get('#hp-value').value='7';h.get('#hp-half').onclick();assert.equal(h.get('#apply-hp').textContent,'Применить −3');
 h.get('#hp-double').onclick();assert.equal(h.get('#apply-hp').textContent,'Применить −6');
 h.get('#hp-heal').onclick();assert.equal(h.get('#apply-hp').textContent,'Применить +7');assert.equal(h.get('#hp-factors').hidden,true);
 h.get('#hp-damage').onclick();assert.equal(h.get('#apply-hp').textContent,'Применить −7');
 h.get('#hp-half').onclick();await h.get('#apply-hp').onclick();assert.equal(h.state().hp,25);assert.equal(h.writes.length,1);
 await h.get('#apply-hp').onclick();assert.equal(h.writes.length,1);
});

test('zero after resistance cannot submit and concentration preview uses final damage and owned save',()=>{
 const h=harness();h.run("state.concentration='<test>';SkazStorage.stats=()=>({abilities:{con:14}});SkazStorage.sheet=()=>({level:5,saveProficiencies:['con']});hpDialog()");
 h.get('#hp-value').value='23';h.get('#hp-value').oninput();assert.match(h.get('#hp-concentration').textContent,/Сл 11 · твой бонус \+5/);
 h.get('#hp-half').onclick();assert.match(h.get('#hp-concentration').textContent,/Сл 10/);
 h.get('#hp-value').value='1';h.get('#hp-value').oninput();assert.equal(h.get('#apply-hp').disabled,true);h.get('#apply-hp').onclick();assert.equal(h.writes.length,0);assert.equal(h.get('#hp-concentration').textContent,'');
 h.get('#hp-heal').onclick();assert.equal(h.get('#hp-concentration').textContent,'');
});

test('recent health values are bounded, deduplicated and scoped to current game',async()=>{
 const h=harness();for(const n of [2,4,6,8,4]){h.run('hpDialog()');h.get('#hp-value').value=String(n);await h.get('#apply-hp').onclick();}
 h.run('hpDialog()');const html=h.get('#dialog-content').innerHTML;assert.match(html,/data-hp-recent="4".*data-hp-recent="8".*data-hp-recent="6"/);assert.doesNotMatch(html,/data-hp-recent="2"/);
 h.run("SkazStorage.contextKey=()=> 'another';hpDialog()");assert.doesNotMatch(h.get('#dialog-content').innerHTML,/data-hp-recent=/);
});

test('temporary entry replaces rather than adds, can clear, and damage preview includes absorption',async()=>{
 const h=harness();h.run('state.tempHp=5;hpDialog()');h.get('#hp-value').value='12';h.get('#hp-value').oninput();assert.match(h.get('#hp-preview').textContent,/28 → 21 хитов · временные 5 → 0/);await h.get('#apply-hp').onclick();assert.equal(h.state().hp,21);assert.equal(h.state().tempHp,0);await h.get('#undo').onclick();assert.equal(h.state().hp,28);assert.equal(h.state().tempHp,5);
 h.run('hpDialog()');h.get('#hp-temporary').onclick();h.get('#hp-value').value='3';await h.get('#apply-hp').onclick();assert.equal(h.state().tempHp,3);assert.equal(h.state().hp,28);
 h.run('hpDialog()');h.get('#hp-temporary').onclick();h.get('#hp-value').value='0';await h.get('#apply-hp').onclick();assert.equal(h.state().tempHp,0);
});

test('long rest clears temporary HP and one undo restores that reserve',async()=>{
 const h=harness();h.run('state.tempHp=8');h.click('rest');await h.get('#long-rest').onclick();await new Promise(r=>setImmediate(r));assert.equal(h.state().tempHp,0);assert.equal(h.state().hp,38);await h.get('#undo').onclick();assert.equal(h.state().tempHp,8);assert.equal(h.state().hp,28);
});

test('manual-class rest restores health and clears temp HP without inventing counter recovery',async()=>{
 const h=harness();h.run('state.tempHp=9;SkazStorage.sheet=()=>({counters:[{id:"ki",current:1,max:4}]})');const before=h.state();h.click('rest');await h.get('#long-rest').onclick();await new Promise(r=>setImmediate(r));assert.equal(h.state().hp,38);assert.equal(h.state().tempHp,0);assert.deepEqual(h.state().slots,before.slots);assert.equal(h.state().inspiration,before.inspiration);
});

test('concentration question remains visible independently of toast, is escaped and rejects stale buttons',()=>{
 const h=harness();h.run(`state.concentration='<Bless>';state.concentrationChecks=[{id:'damage-question',spell:'<Bless>',damage:8,dc:10}];`);
 assert.match(h.run('quickPanel()'),/Проверка концентрации · СЛ 10/);assert.match(h.run('quickPanel()'),/concentration-pending/);
 h.run(`var answered=0;SkazStorage.resourceDelta=()=>{answered++;throw Error('unexpected')};answerConcentration('fail','damage-question','stale')`);assert.equal(h.run('answered'),0);
 h.run('state.concentration=null');assert.equal(h.run('concentrationQuestion()'),'');
});
test('manual concentration end clears pending questions and its one undo restores them',async()=>{
 const h=harness();h.run(`state.concentration='Bless';state.concentrationChecks=[{id:'damage-question',spell:'Bless',damage:8,dc:10}];endConcentration('Bless',SkazStorage.snapshotKey());`);await new Promise(r=>setImmediate(r));
 assert.equal(h.state().concentration,null);assert.deepEqual(h.state().concentrationChecks,[]);
 await h.get('#undo').onclick();await new Promise(r=>setImmediate(r));assert.equal(h.state().concentration,'Bless');assert.equal(h.state().concentrationChecks.length,1);
});

test('zero health replaces ordinary damage with named death state and a touch-sized saves dialog',()=>{
 const h=harness();h.run("state.hp=0;state.deathSaves={successes:1,failures:2,status:'dying'}");const html=h.run('healthVitals()');assert.match(html,/Без сознания/);assert.match(html,/Успехи ●○○ · Провалы ●●○/);assert.doesNotMatch(html,/data-health="damage"/);h.run('deathDialog()');assert.match(h.get('#dialog-content').innerHTML,/Натуральная 20/);assert.match(h.get('#dialog-content').innerHTML,/Критический урон/);
 h.run("state.deathSaves={successes:0,failures:3,status:'dead'}");assert.match(h.run('healthVitals()'),/data-health="heal" disabled/);h.run('hpDialog(true)');assert.match(h.get('#toast').innerHTML,/не воскрешает/);
});
