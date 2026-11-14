import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
// Tiny DOM adapter only for lifecycle/transport races; visual and native input
// behavior are checked separately in the browser and on Android.
class Element{
 constructor(tag){this.tagName=tag;this.children=[];this.listeners={};this.textContent='';this.value='';this.hidden=false;this.disabled=false;}
 append(e){this.children.push(e);e.parent=this;}
 replaceChildren(...children){this.children=[];for(const e of children)this.append(e);}
 setAttribute(k,v){this[k]=v;}
 addEventListener(k,fn){(this.listeners[k]??=[]).push(fn);}
 querySelectorAll(selector){const tags=selector.split(',');return walk(this).filter(e=>tags.includes(e.tagName));}
 emit(type){for(const fn of this.listeners[type]||[])fn({preventDefault(){}});this.parent?.emit(type);}
}
const walk=root=>root.children.flatMap(e=>[e,...walk(e)]);
function environment(){const root=new Element('div'),ctx=vm.createContext({document:{createElement:tag=>new Element(tag)},crypto:{randomUUID:()=> 'mutation-ui-test'}});vm.runInContext(readFileSync(new URL('../client/class-advancement.js',import.meta.url),'utf8')+';globalThis.editor=SkazClassAdvancement;',ctx);return {root,mount:ctx.editor.mount,button:text=>walk(root).find(e=>e.tagName==='button'&&e.textContent===text),status:()=>root.children[0].textContent};}
const data=()=>({revision:2,characterId:'fixture-character',classId:'fighter',className:'Воин',fromLevel:4,abilities:{str:10,dex:10,con:14,int:10,wis:10,cha:10},hp:7,maxHp:20,hitDie:10,plan:{choices:[],requiresFeatureReview:[]},options:{}});
const summary=()=>({hitPoints:{maximumDelta:8},proficiency:{before:2,after:3},newResources:[],unmanagedResources:[]});
const saved=()=>({characterSheet:{level:5},state:{maxHp:28}});

test('lost response preserves byte-identical command and double submit cannot duplicate a pending save',async()=>{
 const e=environment(),bodies=[];let release;await e.mount(e.root,{load:async()=>data(),preview:async()=>summary(),send:body=>{bodies.push(body);if(bodies.length===1)return Promise.reject(Error('Lost'));return new Promise(resolve=>release=resolve);}});
 await e.button('Проверить повышение').onclick();await e.button('Подтвердить повышение').onclick();assert.equal(e.button('Повторить сохранение').hidden,false);assert.equal(e.button('Проверить повышение').disabled,true);
 const retry=e.button('Повторить сохранение').onclick();await e.button('Повторить сохранение').onclick();assert.equal(bodies.length,2);assert.equal(bodies[0],bodies[1]);release(saved());await retry;assert.match(e.status(),/Сохранено: уровень 5/);assert.equal(e.button('Повторить сохранение').hidden,true);
});

test('definite conflict requires explicit reconciliation, reloads revision and never auto-resubmits',async()=>{
 const e=environment();let loads=0,sends=0;await e.mount(e.root,{load:async()=>({...data(),revision:++loads}),preview:async()=>summary(),send:async()=>{sends++;throw Object.assign(Error('Conflict'),{notApplied:true});}});
 await e.button('Проверить повышение').onclick();await e.button('Подтвердить повышение').onclick();assert.equal(e.button('Повторить сохранение').hidden,true);assert.equal(e.button('Сверить состояние и начать заново').hidden,false);assert.equal(loads,1);
 await e.button('Сверить состояние и начать заново').onclick();assert.equal(loads,2);assert.equal(sends,1);assert.equal(e.button('Подтвердить повышение').hidden,true);assert.equal(e.button('Проверить повышение').disabled,false);
});

test('destroyed editor ignores late preview and save responses',async()=>{
 for(const stage of ['preview','save']){
  const e=environment();let finish;const editor=await e.mount(e.root,{load:async()=>data(),preview:()=>stage==='preview'?new Promise(r=>finish=r):Promise.resolve(summary()),send:()=>new Promise(r=>finish=r)});
  let work=e.button('Проверить повышение').onclick();if(stage==='save'){await work;work=e.button('Подтвердить повышение').onclick();}editor.destroy();finish(stage==='preview'?summary():saved());await work;assert.equal(e.root.children.length,0);
 }
});

test('editing invalidates a checked preview and unsupported required choices never send',async()=>{
 const e=environment();let sends=0;await e.mount(e.root,{load:async()=>data(),preview:async()=>summary(),send:async()=>{sends++;return saved();}});await e.button('Проверить повышение').onclick();walk(e.root).find(n=>n.tagName==='select').emit('change');await e.button('Подтвердить повышение').onclick();assert.equal(sends,0);assert.equal(e.button('Подтвердить повышение').hidden,true);
 const f=environment();await f.mount(f.root,{load:async()=>({...data(),plan:{choices:[{id:'fighter:3:subclass',kind:'subclass',count:1,required:true}],requiresFeatureReview:[]}}),preview:async()=>{throw Error('must not preview');},send:async()=>{throw Error('must not send');}});assert.equal(f.button('Проверить повышение').disabled,true);await f.button('Проверить повышение').onclick();assert.match(f.status(),/неподдерживаемый/);
});

test('baseline resource binding retries identical payload and reloads the new revision before advancement',async()=>{
 const e=environment(),sends=[];let loads=0;
 await e.mount(e.root,{load:async()=>({...data(),revision:++loads,resourceSetup:loads===1?[{id:'fighter:second-wind',name:'Второе дыхание',max:1,canCreate:true,counters:[]}]:[]}),preview:async()=>summary(),send:async(body,kind)=>{sends.push({body,kind});if(sends.length===1)throw Error('Lost');return saved();}});
 const select=walk(e.root).find(n=>n.tagName==='select');select.value='manual';await e.button('Подключить выбранные ресурсы').onclick();assert.equal(sends.length,0);
 select.value='create';await e.button('Подключить выбранные ресурсы').onclick();assert.equal(sends[0].kind,'bind');assert.deepEqual(JSON.parse(sends[0].body).create,['fighter:second-wind']);
 await e.button('Повторить сохранение').onclick();assert.equal(sends[0].body,sends[1].body);assert.equal(loads,2);assert.match(e.status(),/Ресурсы подключены/);
 await e.button('Проверить повышение').onclick();await e.button('Подтвердить повышение').onclick();assert.equal(sends[2].kind,'advance');assert.equal(JSON.parse(sends[2].body).expectedRevision,2);
});

test('binding committed before a failed refresh offers reload, never a second mutation',async()=>{
 const e=environment();let loads=0,sends=0;
 await e.mount(e.root,{load:async()=>{loads++;if(loads===2)throw Error('offline');return {...data(),resourceSetup:loads===1?[{id:'class-fighter-second-wind',name:'Второе дыхание',max:1,canCreate:true,counters:[]}]:[]};},preview:async()=>summary(),send:async()=>{sends++;return saved();}});
 walk(e.root).find(n=>n.tagName==='select').value='create';await e.button('Подключить выбранные ресурсы').onclick();assert.match(e.status(),/Ресурсы сохранены/);assert.equal(e.button('Повторить сохранение').hidden,true);assert.equal(e.button('Сверить состояние и начать заново').hidden,false);
 await e.button('Сверить состояние и начать заново').onclick();assert.equal(loads,3);assert.equal(sends,1);assert.equal(e.button('Проверить повышение').disabled,false);
});

test('translated feature help renders as text but sends original receipt key',async()=>{
 const e=environment();let command;
 const name='<img src=x onerror=bad> Дополнительная атака';
 await e.mount(e.root,{load:async()=>({...data(),plan:{choices:[],requiresFeatureReview:['Extra Attack'],featureDetails:[{key:'Extra Attack',name,text:'Две атаки за действие.',sourcePage:25,source:{attribution:'CC-BY attribution'}}]}}),preview:async body=>{command=body;return summary();},send:async()=>saved()});
 assert.equal(walk(e.root).find(n=>n.tagName==='summary').textContent,name);
 assert.equal(walk(e.root).filter(n=>n.tagName==='img').length,0);
 assert.match(walk(e.root).find(n=>n.tagName==='a').href,/#page=25$/);
 walk(e.root).find(n=>n.type==='checkbox').checked=true;
 await e.button('Проверить повышение').onclick();
 assert.deepEqual(Array.from(command.reviewedFeatures),['Extra Attack']);
});
test('missing feature description remains visible with manual review and no invented rules',async()=>{
 const e=environment();await e.mount(e.root,{load:async()=>({...data(),plan:{choices:[],requiresFeatureReview:['Unknown feature']}}),preview:async()=>summary(),send:async()=>saved()});
 assert.equal(walk(e.root).find(n=>n.tagName==='summary').textContent,'Unknown feature');
 assert.ok(walk(e.root).some(n=>n.textContent.includes('Описание этого умения пока не подключено')));
 assert.equal(walk(e.root).filter(n=>n.tagName==='a').length,0);
});

test('two feature confirmations remain independent even when descriptions are expanded',async()=>{
 const e=environment();let command;
 const keys=['Reckless Attack','Danger Sense'];
 await e.mount(e.root,{load:async()=>({...data(),plan:{choices:[],requiresFeatureReview:keys,featureDetails:keys.map((key,i)=>({key,name:['Безрассудная атака','Чувство опасности'][i],text:'Условия применения вручную.'}))}}),preview:async body=>{command=body;return summary();},send:async()=>saved()});
 const boxes=walk(e.root).filter(n=>n.type==='checkbox');boxes[0].checked=true;
 await e.button('Проверить повышение').onclick();assert.deepEqual(Array.from(command.reviewedFeatures),['Reckless Attack']);
 boxes[1].checked=true;boxes[1].emit('change');assert.equal(e.button('Подтвердить повышение').hidden,true);
 await e.button('Проверить повышение').onclick();assert.deepEqual(Array.from(command.reviewedFeatures),keys);
});

test('prior feature reference is read-only and never adds receipt confirmations',async()=>{
 const e=environment();let command;await e.mount(e.root,{load:async()=>({...data(),plan:{choices:[],requiresFeatureReview:[],priorFeatureDetails:[{key:'Second Wind',name:'Второе дыхание',text:'Бонусное действие.'}]}}),preview:async body=>{command=body;return summary();},send:async()=>saved()});
 assert.ok(walk(e.root).some(n=>n.textContent==='Справка по умениям до уровня 4'));
 assert.ok(walk(e.root).some(n=>n.textContent==='Второе дыхание'));
 assert.equal(walk(e.root).filter(n=>n.type==='checkbox').length,0);
 await e.button('Проверить повышение').onclick();assert.equal(command.reviewedFeatures.length,0);
});

test('unsupported choices have readable titles without enabling unsupported optional controls',async()=>{
 const e=environment();await e.mount(e.root,{load:async()=>({...data(),plan:{requiresFeatureReview:[],choices:[{id:'wizard:18:spell-mastery',kind:'spell-mastery',count:2,required:true}]}}),preview:async()=>{throw Error('must remain blocked');},send:async()=>saved()});
 assert.ok(walk(e.root).some(n=>n.textContent==='Мастерство заклинаний — выбрать 2'));assert.equal(e.button('Проверить повышение').disabled,true);
 const f=environment();await f.mount(f.root,{load:async()=>({...data(),plan:{requiresFeatureReview:[],choices:[{id:'warlock:4:replace-invocation',kind:'replace-invocation',count:1,required:false}]}}),preview:async()=>summary(),send:async()=>saved()});
 assert.equal(f.button('Проверить повышение').disabled,false);assert.ok(!walk(f.root).some(n=>n.textContent.includes('replace-invocation')));
});

test('long feature help uses separate safe paragraphs without interpreting markup',async()=>{
 const e=environment();await e.mount(e.root,{load:async()=>({...data(),plan:{choices:[],requiresFeatureReview:['Wild Shape'],featureDetails:[{key:'Wild Shape',name:'Дикий облик',text:'Первое правило.\n\n<img src=x onerror=bad>\n\nПоследнее правило.'}]}}),preview:async()=>summary(),send:async()=>saved()});
 const help=walk(e.root).find(n=>n.tagName==='details');const ps=help.children.filter(n=>n.tagName==='p');
 assert.deepEqual(ps.map(p=>p.textContent),['Первое правило.','<img src=x onerror=bad>','Последнее правило.']);
 assert.equal(walk(e.root).filter(n=>n.tagName==='img').length,0);
 assert.equal(walk(e.root).filter(n=>n.type==='checkbox').length,1);
});

test('unavailable optional replacements are explained without blocking or sending empty choices',async()=>{
 for(const kind of ['replace-known-spell','replace-invocation']){
  const e=environment();let command;await e.mount(e.root,{load:async()=>({...data(),plan:{requiresFeatureReview:[],choices:[{id:'optional-replacement',kind,count:1,required:false}]}}),preview:async body=>{command=body;return summary();},send:async()=>saved()});
  assert.ok(walk(e.root).some(n=>n.tagName==='p'&&n.textContent.includes('Замена в мастере пока недоступна')));
  assert.equal(e.button('Проверить повышение').disabled,false);assert.equal(walk(e.root).filter(n=>n.type==='checkbox').length,0);
  await e.button('Проверить повышение').onclick();assert.deepEqual(Object.keys(command.choices),[]);
 }
});

test('confirmed preview names exact spell choices and editing removes stale summary',async()=>{
 const e=environment(),id='bard:6:known-spells';let sent;
 await e.mount(e.root,{load:async()=>({...data(),plan:{requiresFeatureReview:[],choices:[{id,kind:'known-spells',count:1,required:true}]},options:{[id]:[{spellId:'spell-a',name:{ru:'<b>Щит</b>',en:'Shield'},level:1},{spellId:'spell-b',name:{ru:'Полёт',en:'Fly'},level:3}]}}),preview:async()=>summary(),send:async body=>{sent=JSON.parse(body);return saved();}});
 const box=walk(e.root).find(n=>n.type==='checkbox'&&n.value==='spell-b');box.checked=true;
 await e.button('Проверить повышение').onclick();assert.ok(walk(e.root).some(n=>n.textContent==='Новые заклинания: Полёт / Fly.'));
 box.checked=false;box.emit('change');assert.ok(walk(e.root).some(n=>n.textContent==='Выбор изменён. Проверь итог ещё раз перед сохранением.'));assert.ok(!walk(e.root).some(n=>n.textContent==='Новые заклинания: Полёт / Fly.'));assert.equal(e.button('Подтвердить повышение').hidden,true);
 const first=walk(e.root).find(n=>n.type==='checkbox'&&n.value==='spell-a');first.checked=true;
 await e.button('Проверить повышение').onclick();assert.ok(walk(e.root).some(n=>n.textContent==='Новые заклинания: <b>Щит</b> / Shield.'));assert.equal(walk(e.root).filter(n=>n.tagName==='b').length,0);
 await e.button('Подтвердить повышение').onclick();assert.deepEqual(sent.choices[id],['spell-a']);
});
test('confirmed ASI preview shows only changed abilities and never appears after rejected preview',async()=>{
 const e=environment();let reject=true;const id='fighter:4:ability-score-improvement-or-feat';
 await e.mount(e.root,{load:async()=>({...data(),plan:{requiresFeatureReview:[],choices:[{id,kind:'ability-score-improvement-or-feat',count:1,required:true}]}}),preview:async()=>{if(reject)throw Error('invalid choice');return summary();},send:async()=>saved()});
 const n=walk(e.root).find(n=>n['aria-label']==='Телосложение: прибавка');n.value='2';
 await e.button('Проверить повышение').onclick();assert.ok(!walk(e.root).some(n=>n.textContent==='Телосложение: 14 → 16.'));
 reject=false;await e.button('Проверить повышение').onclick();assert.ok(walk(e.root).some(n=>n.textContent==='Телосложение: 14 → 16.'));
 assert.ok(!walk(e.root).some(n=>/^Сила: /.test(n.textContent)));
});

test('reference options stay read-only and keep their own source pages',async()=>{
 const e=environment();let command;
 await e.mount(e.root,{load:async()=>({...data(),plan:{choices:[],requiresFeatureReview:['Eldritch Invocations'],featureDetails:[{key:'Eldritch Invocations',name:'Воззвания',status:'unsupported',text:'Справка, не выбор.',sourcePage:47,source:{attribution:'SRD attribution'},referenceOptions:[{key:'Test option',name:'<b>Вариант</b>',text:'Требуется уровень 9.',sourcePage:49}]}]}}),preview:async body=>{command=body;return summary();},send:async()=>saved()});
 assert.equal(walk(e.root).filter(n=>n.type==='checkbox').length,1);
 assert.equal(walk(e.root).filter(n=>n.tagName==='b').length,0);
 assert.ok(walk(e.root).some(n=>n.tagName==='a'&&n.href.endsWith('#page=49')));
 const box=walk(e.root).find(n=>n.type==='checkbox');box.checked=true;
 await e.button('Проверить повышение').onclick();
 assert.deepEqual([...command.reviewedFeatures],['Eldritch Invocations']);assert.deepEqual(Object.keys(command.choices),[]);
});
