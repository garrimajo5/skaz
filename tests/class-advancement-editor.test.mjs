import test from 'node:test';
import assert from 'node:assert/strict';
import {walk,environment} from './helpers/advancement-dom.mjs';
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


test('style selection starts empty, previews its name, invalidates edits and replays exact selection',async()=>{
 const e=environment(),key='paladin:2:fighting-style',sent=[],commands=[];
 const d={...data(),classId:'paladin',fromLevel:1,plan:{requiresFeatureReview:[],choices:[{id:key,kind:'fighting-style',count:1,required:true}]},styleOptions:{[key]:[{id:'defense',name:'Оборона',text:'При ношении доспеха +1 КД.'},{id:'dueling',name:'Дуэлянт',text:'Бонус к урону.'}]}};
 await e.mount(e.root,{load:async()=>d,preview:async q=>{commands.push(q);if(q.choices[key].length!==1)throw Error('Выбери стиль');return summary();},send:async body=>{sent.push(body);if(sent.length===1)throw Error('Lost');return saved();}});
 const select=walk(e.root).find(n=>n.tagName==='select'&&n.name===key);assert.ok(select);assert.equal(select.value,'');
 await e.button('Проверить повышение').onclick();assert.equal(e.button('Подтвердить повышение').hidden,true);assert.equal(commands[0].choices[key].length,0);
 select.value='defense';select.emit('change');assert.ok(walk(e.root).some(n=>n.textContent==='При ношении доспеха +1 КД.'));
 await e.button('Проверить повышение').onclick();assert.ok(walk(e.root).some(n=>n.textContent==='Боевой стиль: Оборона. Боевые бонусы учитывай вручную.'));
 select.value='dueling';select.emit('change');assert.equal(e.button('Подтвердить повышение').hidden,true);
 await e.button('Проверить повышение').onclick();await e.button('Подтвердить повышение').onclick();assert.equal(select.disabled,true);
 await e.button('Повторить сохранение').onclick();assert.equal(sent.length,2);assert.equal(sent[0],sent[1]);assert.deepEqual(JSON.parse(sent[0]).choices[key],['dueling']);
});

test('saved styles remain visible and do not bypass a later mandatory subclass',async()=>{
 const e=environment();await e.mount(e.root,{load:async()=>({...data(),selectedStyles:[{id:'defense',name:'Оборона',text:'При ношении доспеха +1 КД.'}],plan:{requiresFeatureReview:[],choices:[{id:'paladin:3:subclass',kind:'subclass',count:1,required:true}]}}),preview:async()=>{throw Error('must remain blocked');},send:async()=>saved()});
 assert.ok(walk(e.root).some(n=>n.textContent==='Оборона — При ношении доспеха +1 КД.'));assert.equal(e.button('Проверить повышение').disabled,true);
});


test('metamagic multi-selection counts, invalidates preview and retries unchanged after lost response',async()=>{
 const e=environment(),id='sorcerer:3:metamagic',sent=[];
 await e.mount(e.root,{load:async()=>({...data(),plan:{requiresFeatureReview:[],choices:[{id,kind:'metamagic',count:2,required:true}]},metamagicOptions:{[id]:[{id:'careful-spell',name:'Осторожное заклинание',text:'Текст первого варианта.'},{id:'twinned-spell',name:'Удвоенное заклинание',text:'Текст второго варианта.'}]}}),preview:async q=>{if(q.choices[id].length!==2)throw Error('Выбери два варианта');return summary();},send:async body=>{sent.push(body);if(sent.length===1)throw Error('Lost');return saved();}});
 const boxes=walk(e.root).filter(n=>n.type==='checkbox');assert.equal(boxes.length,2);boxes[0].checked=true;boxes[0].emit('change');assert.ok(walk(e.root).some(n=>n.textContent==='Выбрано 1 из 2'));
 await e.button('Проверить повышение').onclick();assert.equal(e.button('Подтвердить повышение').hidden,true);
 boxes[1].checked=true;boxes[1].emit('change');await e.button('Проверить повышение').onclick();assert.ok(walk(e.root).some(n=>n.textContent.startsWith('Метамагия: Осторожное заклинание; Удвоенное заклинание.')));
 boxes[1].checked=false;boxes[1].emit('change');assert.equal(e.button('Подтвердить повышение').hidden,true);
 boxes[1].checked=true;boxes[1].emit('change');await e.button('Проверить повышение').onclick();await e.button('Подтвердить повышение').onclick();assert.ok(boxes.every(b=>b.disabled));await e.button('Повторить сохранение').onclick();assert.equal(sent[0],sent[1]);assert.deepEqual(JSON.parse(sent[0]).choices[id],['careful-spell','twinned-spell']);
});

test('unknown prior metamagic explains its block and never silently initializes selections',async()=>{
 const e=environment(),id='sorcerer:10:metamagic';await e.mount(e.root,{load:async()=>({...data(),plan:{requiresFeatureReview:[],choices:[{id,kind:'metamagic',count:1,required:true}]},metamagicOptions:{},choiceNotices:{[id]:'Прежние варианты не подтверждены.'}}),preview:async()=>{throw Error('must not preview');},send:async()=>saved()});
 assert.equal(e.button('Проверить повышение').disabled,true);assert.ok(walk(e.root).some(n=>n.textContent==='Прежние варианты не подтверждены.'));assert.equal(walk(e.root).filter(n=>n.type==='checkbox').length,0);
});

test('invocation form excludes unavailable choices, names preview and retries exact selected IDs',async()=>{
 const e=environment(),key='warlock:2:invocations',sent=[];
 await e.mount(e.root,{load:async()=>({...data(),plan:{requiresFeatureReview:[],choices:[{id:key,kind:'invocations',count:2,required:true}]},invocationOptions:{[key]:[{id:'armor-of-shadows',name:'Доспех теней',text:'Описание.',eligible:true},{id:'devils-sight',name:'Дьявольское зрение',text:'Описание.',eligible:true},{id:'chains-of-carceri',name:'Цепи Карцери',text:'Описание.',eligible:false,reasons:['warlock-level','pact']}]}}),preview:async q=>{if(q.choices[key].length!==2)throw Error('Нужны два');return summary();},send:async body=>{sent.push(body);if(sent.length===1)throw Error('Lost');return saved();}});
 const boxes=walk(e.root).filter(n=>n.type==='checkbox');assert.equal(boxes.length,2);boxes[0].checked=true;boxes[0].emit('change');await e.button('Проверить повышение').onclick();assert.equal(e.button('Подтвердить повышение').hidden,true);
 boxes[1].checked=true;boxes[1].emit('change');await e.button('Проверить повышение').onclick();assert.ok(walk(e.root).some(n=>n.textContent.startsWith('Воззвания: Доспех теней; Дьявольское зрение.')));await e.button('Подтвердить повышение').onclick();await e.button('Повторить сохранение').onclick();assert.equal(sent[0],sent[1]);assert.deepEqual(JSON.parse(sent[0]).choices[key],['armor-of-shadows','devils-sight']);
});
test('optional invocation replacement omits empty choice and partial input never bypasses server validation',async()=>{
 const e=environment(),id='warlock:4:replace-invocation',commands=[];
 await e.mount(e.root,{load:async()=>({...data(),plan:{requiresFeatureReview:[],choices:[{id,kind:'replace-invocation',count:1,required:false}]},selectedInvocations:[{id:'armor-of-shadows',name:'Доспех теней',text:'Старое.'}],invocationOptions:{[id]:[{id:'eldritch-sight',name:'Мистическое зрение',text:'Новое.',eligible:true}]}}),preview:async q=>{commands.push(q);if(q.choices[id]&&(!q.choices[id].add||!q.choices[id].remove))throw Error('Выбери обе стороны замены');return summary();},send:async()=>saved()});
 await e.button('Проверить повышение').onclick();assert.deepEqual(Object.keys(commands[0].choices),[]);
 const remove=walk(e.root).find(n=>n.name===id+':remove'),add=walk(e.root).find(n=>n.name===id+':add');remove.value='armor-of-shadows';remove.emit('change');await e.button('Проверить повышение').onclick();assert.equal(e.button('Подтвердить повышение').hidden,true);
 add.value='eldritch-sight';add.emit('change');await e.button('Проверить повышение').onclick();assert.ok(walk(e.root).some(n=>n.textContent.startsWith('Замена воззвания: Доспех теней → Мистическое зрение.')));
});
test('tome grants require explicit three cantrips and switching pact excludes hidden selections',async()=>{
 const e=environment(),id='warlock:3:pact-boon',commands=[];
 await e.mount(e.root,{load:async()=>({...data(),plan:{requiresFeatureReview:[],choices:[{id,kind:'pact-boon',count:1,required:true}]},pactOptions:[{id:'tome',name:'Гримуар',text:'Книга.',supported:true},{id:'chain',name:'Цепь',text:'Фамильяр.',supported:true}],pactCantrips:['one','two','three'].map(spellId=>({spellId,name:{ru:spellId,en:spellId}}))}),preview:async q=>{commands.push(q);return summary();},send:async()=>saved()});
 const select=walk(e.root).find(n=>n.name===id);assert.equal(select.value,'');select.value='tome';select.emit('change');for(const box of walk(e.root).filter(n=>n.type==='checkbox'))box.checked=true;
 await e.button('Проверить повышение').onclick();assert.deepEqual([...commands[0].choices[id].cantrips],['one','two','three']);assert.ok(walk(e.root).some(n=>n.textContent==='Заговоры Гримуара: one; two; three.'));
 select.value='chain';select.emit('change');assert.equal(e.button('Подтвердить повышение').hidden,true);await e.button('Проверить повышение').onclick();assert.equal(commands[1].choices[id].cantrips.length,0);
});

test('level twenty keeps saved choices and rules readable without presenting mutation controls',async()=>{
 const e=environment();let mutations=0;
 await e.mount(e.root,{load:async()=>({...data(),atMaximum:true,fromLevel:20,className:'Колдун',selectedInvocations:[{id:'book-of-ancient-secrets',name:'Книга древних тайн',text:'Ритуальная книга.',ritualNames:['Сигнал тревоги','Опознание']}],selectedPact:{id:'tome'},pactOptions:[{id:'tome',name:'Договор гримуара'}],plan:{choices:[],requiresFeatureReview:[],priorFeatureDetails:[{name:'Таинственный мастер',text:'Описание.',sourcePage:48}]}}),preview:async()=>{mutations++;},send:async()=>{mutations++;}});
 assert.ok(walk(e.root).some(n=>n.textContent==='Колдун: 20'));assert.ok(walk(e.root).some(n=>n.textContent.startsWith('Выбранные ритуалы: Сигнал тревоги; Опознание.')));assert.match(e.status(),/максимальный уровень 20/);assert.equal(e.button('Проверить повышение').hidden,true);assert.equal(e.button('Подтвердить повышение').hidden,true);assert.equal(walk(e.root).filter(n=>['input','select'].includes(n.tagName)).length,0);assert.equal(mutations,0);
});

test('invocation search keeps checked choices visible and never drops them from the command',async()=>{
 const e=environment(),id='warlock:2:invocations';let submitted;
 await e.mount(e.root,{load:async()=>({...data(),plan:{requiresFeatureReview:[],choices:[{id,kind:'invocations',count:2,required:true}]},invocationOptions:{[id]:[{id:'armor-of-shadows',name:'Доспех теней',text:'Доспехи мага.',eligible:true},{id:'devils-sight',name:'Дьявольское зрение',text:'Темнота.',eligible:true},{id:'beast-speech',name:'Речь зверей',text:'Животные.',eligible:true}]}}),preview:async q=>{submitted=q;return summary();},send:async()=>saved()});
 const box=walk(e.root).find(n=>n.value==='armor-of-shadows');box.checked=true;box.emit('change');const search=walk(e.root).find(n=>n.type==='search');search.value='зрение';search.emit('input');
 const rows=walk(e.root).find(n=>n.className==='advancement-spells').children;assert.equal(rows[0].hidden,false);assert.equal(rows[1].hidden,false);assert.equal(rows[2].hidden,true);
 const other=walk(e.root).find(n=>n.value==='devils-sight');other.checked=true;other.emit('change');await e.button('Проверить повышение').onclick();assert.deepEqual([...submitted.choices[id]],['armor-of-shadows','devils-sight']);
});

test('new invocation carries its ritual choices, and deselecting it excludes hidden rituals',async()=>{
 const e=environment(),id='warlock:5:invocations',commands=[];
 await e.mount(e.root,{load:async()=>({...data(),fromLevel:4,plan:{requiresFeatureReview:[],choices:[{id,kind:'invocations',count:1,required:true}]},invocationOptions:{[id]:[{id:'book-of-ancient-secrets',name:'Книга древних тайн',text:'Ритуалы.',eligible:true},{id:'eldritch-sight',name:'Мистическое зрение',text:'Магия.',eligible:true}]},ritualOptions:[{id:'alarm',name:{ru:'Сигнал тревоги',en:'Alarm'}},{id:'identify',name:{ru:'Опознание',en:'Identify'}}]}),preview:async q=>{commands.push(q);return summary();},send:async()=>saved()});
 const book=walk(e.root).find(n=>n.type==='checkbox'&&n.value==='book-of-ancient-secrets'),alarm=walk(e.root).find(n=>n.value==='alarm'),identify=walk(e.root).find(n=>n.value==='identify');
 assert.equal(alarm.parent.parent.hidden,true);book.checked=true;book.emit('change');assert.equal(alarm.parent.parent.hidden,false);
 alarm.checked=true;identify.checked=true;alarm.emit('change');identify.emit('change');await e.button('Проверить повышение').onclick();
 assert.deepEqual(JSON.parse(JSON.stringify(commands[0].choices[id])),[{id:'book-of-ancient-secrets',rituals:['alarm','identify']}]);assert.ok(walk(e.root).some(n=>n.textContent.includes('ритуалы: Сигнал тревоги; Опознание')));
 book.checked=false;book.emit('change');assert.equal(alarm.parent.parent.hidden,true);assert.equal(e.button('Подтвердить повышение').hidden,true);
 const other=walk(e.root).find(n=>n.value==='eldritch-sight');other.checked=true;other.emit('change');await e.button('Проверить повышение').onclick();assert.deepEqual([...commands[1].choices[id]],['eldritch-sight']);
});

test('subclass form requires an explicit selection, names the preview and preserves the exact retry',async()=>{
 const e=environment(),key='fighter:3:subclass',sent=[];const option={id:'fighter-champion',name:'Чемпион',features:[{key:'Improved Critical',name:'Улучшенный критический удар',level:3,text:'Оружие: 19 или 20.',sourcePage:25}]};
 await e.mount(e.root,{load:async()=>({...data(),fromLevel:2,subclassOptions:[option],plan:{requiresFeatureReview:[],choices:[{id:key,kind:'subclass',count:1,required:true}]}}),preview:async q=>{if(q.choices[key].id!=='fighter-champion')throw Error('Выбери подкласс');return summary();},send:async body=>{sent.push(body);if(sent.length===1)throw Error('Lost');return saved();}});
 const select=walk(e.root).find(n=>n.name===key);assert.equal(select.value,'');await e.button('Проверить повышение').onclick();assert.equal(e.button('Подтвердить повышение').hidden,true);
 select.value=option.id;select.emit('change');await e.button('Проверить повышение').onclick();assert.ok(walk(e.root).some(n=>n.textContent.startsWith('Подкласс: Чемпион.')));await e.button('Подтвердить повышение').onclick();await e.button('Повторить сохранение').onclick();assert.equal(sent[0],sent[1]);assert.deepEqual(JSON.parse(sent[0]).choices[key],{id:'fighter-champion'});
});

test('selected subclass reference hides future abilities and an unsupported additional style blocks mutation',async()=>{
 const e=environment(),id='fighter:10:subclass-fighting-style';let sends=0;
 await e.mount(e.root,{load:async()=>({...data(),fromLevel:9,selectedSubclass:{name:'Чемпион',features:[{name:'Атлет',level:7,text:'Полученное умение.'},{name:'Уцелевший',level:18,text:'Будущее умение.'}]},choiceNotices:{[id]:'Нужен подтверждённый первый стиль.'},plan:{requiresFeatureReview:[],choices:[{id,kind:'subclass-fighting-style',count:1,required:true}]}}),preview:async()=>summary(),send:async()=>{sends++;return saved();}});
 assert.ok(walk(e.root).some(n=>n.textContent==='Атлет'));assert.ok(!walk(e.root).some(n=>n.textContent==='Уцелевший'));assert.equal(e.button('Проверить повышение').disabled,true);await e.button('Проверить повышение').onclick();assert.equal(sends,0);
});

test('Hunter nested initial choice and later option both require explicit user input and appear in preview',async()=>{
 const first=environment(),key='ranger:3:subclass',group={name:'Добыча охотника',options:[{id:'colossus-slayer',name:'Убийца колоссов',text:'Раз в ход +1к8.'}]};let initial;
 await first.mount(first.root,{load:async()=>({...data(),fromLevel:2,subclassOptions:[{id:'ranger-hunter',name:'Охотник',features:[],additionalChoice:group}],plan:{requiresFeatureReview:[],choices:[{id:key,kind:'subclass',count:1,required:true}]}}),preview:async q=>{initial=q;if(q.choices[key].optionId!=='colossus-slayer')throw Error('Выбери добычу');return summary();},send:async()=>saved()});
 const subclass=walk(first.root).find(n=>n.name===key);subclass.value='ranger-hunter';subclass.emit('change');const choice=walk(first.root).find(n=>n.name===key+':option');assert.equal(choice.value,'');await first.button('Проверить повышение').onclick();assert.equal(first.button('Подтвердить повышение').hidden,true);choice.value='colossus-slayer';choice.emit('change');await first.button('Проверить повышение').onclick();assert.equal(initial.choices[key].optionId,'colossus-slayer');assert.ok(walk(first.root).some(n=>n.textContent==='Умение Охотника: Убийца колоссов.'));
 const later=environment(),id='ranger:7:defensive-tactics';let next;await later.mount(later.root,{load:async()=>({...data(),fromLevel:6,hunterOptions:{[id]:{name:'Защитная тактика',options:[{id:'steel-will',name:'Стальная воля',text:'Спасброски от испуга.'}]}},plan:{requiresFeatureReview:[],choices:[{id,kind:'hunter-option',count:1,required:true}]}}),preview:async q=>{next=q;return summary();},send:async()=>saved()});const select=walk(later.root).find(n=>n.name===id);assert.equal(select.value,'');select.value='steel-will';select.emit('change');await later.button('Проверить повышение').onclick();assert.equal(next.choices[id].id,'steel-will');assert.ok(walk(later.root).some(n=>n.textContent.startsWith('Охотник: Стальная воля.')));
});

test('Champion style confirmation starts blank, rejects duplicates and previews old versus new',async()=>{
 const e=environment(),id='fighter:10:champion-style';let command;
 await e.mount(e.root,{load:async()=>({...data(),fromLevel:9,championStyles:[{id:'archery',name:'Стрельба',text:'Атаки.'},{id:'defense',name:'Оборона',text:'Доспехи.'}],plan:{requiresFeatureReview:[],choices:[{id,kind:'champion-style',count:1,required:true}]}}),preview:async q=>{command=q;const c=q.choices[id];if(!c.previousId||!c.newId||c.previousId===c.newId)throw Error('Нужны два разных стиля');return summary();},send:async()=>saved()});
 const previous=walk(e.root).find(n=>n.name===id+':previousId'),added=walk(e.root).find(n=>n.name===id+':newId');assert.equal(previous.value,'');assert.equal(added.value,'');await e.button('Проверить повышение').onclick();assert.equal(e.button('Подтвердить повышение').hidden,true);
 previous.value='archery';added.value='archery';added.emit('change');await e.button('Проверить повышение').onclick();assert.equal(e.button('Подтвердить повышение').hidden,true);added.value='defense';added.emit('change');await e.button('Проверить повышение').onclick();assert.deepEqual(JSON.parse(JSON.stringify(command.choices[id])),{previousId:'archery',newId:'defense'});assert.ok(walk(e.root).some(n=>n.textContent.startsWith('Прежний стиль: Стрельба. Дополнительный стиль: Оборона.')));
});

test('wizard mastery selects one spell per circle and distinguishes saved choice from manual free casting',async()=>{
 const e=environment(),id='wizard:18:spell-mastery';let sent;
 await e.mount(e.root,{load:async()=>({...data(),fromLevel:17,wizardOptions:{[id]:[{id:'shield',name:{ru:'Щит',en:'Shield'},circle:1},{id:'misty-step',name:{ru:'Туманный шаг',en:'Misty Step'},circle:2}]},plan:{requiresFeatureReview:[],choices:[{id,kind:'spell-mastery',count:2,required:true}]}}),preview:async q=>{sent=q;if(q.choices[id].spellIds.some(v=>!v))throw Error('Выбери оба круга');return summary();},send:async()=>saved()});
 const first=walk(e.root).find(n=>n.name===id+':1'),second=walk(e.root).find(n=>n.name===id+':2');assert.equal(first.value,'');assert.equal(second.value,'');await e.button('Проверить повышение').onclick();assert.equal(e.button('Подтвердить повышение').hidden,true);first.value='shield';second.value='misty-step';second.emit('change');await e.button('Проверить повышение').onclick();assert.deepEqual([...sent.choices[id].spellIds],['shield','misty-step']);assert.ok(walk(e.root).some(n=>n.textContent.startsWith('Мастерство: Щит; Туманный шаг. Подготовка обязательна;')));
});

import {rangerTerrainOptions,rangerEnemyTypeOptions} from '../server/class-ranger-choices.mjs';
import {advanceRangerHistory} from '../server/class-ranger-history.mjs';
test('ranger form starts blank, requires rules confirmation and excludes hidden race/language fields',async()=>{
 const e=environment(),terrain='ranger:6:favored-terrain',enemy='ranger:6:favored-enemy-and-language',sent=[];let previewed;
 await e.mount(e.root,{load:async()=>({...data(),fromLevel:5,rangerTerrains:rangerTerrainOptions(),rangerEnemyTypes:rangerEnemyTypeOptions(),plan:{requiresFeatureReview:[],choices:[{id:terrain,kind:'favored-terrain',count:1,required:true},{id:enemy,kind:'favored-enemy-and-language',count:1,required:true}]}}),preview:async q=>{previewed=JSON.parse(JSON.stringify(q));advanceRangerHistory(6,{terrain:previewed.choices[terrain],enemy:previewed.choices[enemy]});return summary();},send:async body=>{sent.push(body);if(sent.length===1)throw Error('Lost');return saved();}});
 const field=name=>{const found=walk(e.root).find(n=>n.name===name);assert.ok(found,name);return found;},set=(name,value)=>{const f=field(name);f.value=value;f.emit('change');};
 assert.equal(field(terrain+':id').value,'');assert.equal(field(enemy+':current:languageMode').value,'');await e.button('Проверить повышение').onclick();assert.equal(e.button('Подтвердить повышение').hidden,true);
 set(terrain+':previousId','forest');set(terrain+':id','swamp');set(enemy+':previous:enemy','beasts');set(enemy+':previous:languageMode','none');set(enemy+':current:enemy','humanoids');set(enemy+':current:race1','Орки');set(enemy+':current:race2','Гноллы');set(enemy+':current:languageMode','spoken');set(enemy+':current:languageName','Орочий');
 await e.button('Проверить повышение').onclick();assert.equal(e.button('Подтвердить повышение').hidden,true);for(const part of ['previous','current']){field(enemy+':'+part+':rulesConfirmed').checked=true;field(enemy+':'+part+':rulesConfirmed').emit('change');}
 await e.button('Проверить повышение').onclick();assert.equal(e.button('Подтвердить повышение').hidden,false);assert.ok(walk(e.root).some(n=>n.textContent.includes('Орки / Гноллы; язык: Орочий')));
 set(enemy+':current:enemy','oozes');set(enemy+':current:languageMode','none');await e.button('Проверить повышение').onclick();assert.deepEqual(previewed.choices[enemy].current.enemy,{kind:'type',id:'oozes'});assert.deepEqual(previewed.choices[enemy].current.language,{mode:'none'});assert.equal(field(enemy+':current:race1').parent.parent.hidden,true);assert.equal(field(enemy+':current:languageName').parent.hidden,true);
 await e.button('Подтвердить повышение').onclick();await e.button('Повторить сохранение').onclick();assert.equal(sent[0],sent[1]);
});

test('unknown ranger history remains blocked and saved choices are readable at maximum level',async()=>{
 const e=environment(),id='ranger:6:favored-terrain';await e.mount(e.root,{load:async()=>({...data(),fromLevel:5,rangerTerrains:[],plan:{requiresFeatureReview:[],choices:[{id,kind:'favored-terrain',count:1,required:true}]},choiceNotices:{[id]:'Нужна подтверждённая история.'}}),preview:async()=>summary(),send:async()=>saved()});assert.equal(e.button('Проверить повышение').disabled,true);
 const ready=environment();await ready.mount(ready.root,{load:async()=>({...data(),atMaximum:true,fromLevel:20,rangerTerrains:rangerTerrainOptions(),rangerEnemyTypes:rangerEnemyTypeOptions(),selectedRangerChoices:{terrains:[{id:'forest',acquiredLevel:null}],enemies:[{enemy:{kind:'humanoids',races:['Орки','Гноллы']},language:{mode:'spoken',name:'Орочий'},acquiredLevel:6}]},plan:{requiresFeatureReview:[],choices:[]}}),preview:async()=>summary(),send:async()=>saved()});assert.ok(walk(ready.root).some(n=>n.textContent.includes('Прежняя местность, подтверждена на6: Лес')));assert.ok(walk(ready.root).some(n=>n.textContent.includes('Орки / Гноллы; язык: Орочий')));assert.equal(ready.button('Проверить повышение').hidden,true);
});

test('preview announces derived saves and conditional physical checks without claiming manual totals changed',async()=>{
 const e=environment();await e.mount(e.root,{load:async()=>data(),preview:async()=>({...summary(),classSaveBenefits:{origin:{name:'Алмазная душа'},saveProficiencies:['str','dex','con','int','wis','cha'],deathSaveProficiency:true},classCheckBenefits:{origin:{name:'Выдающийся атлет'},bonus:2}}),send:async()=>saved()});await e.button('Проверить повышение').onclick();const text=walk(e.root).map(n=>n.textContent).join(' ');assert.match(text,/Алмазная душа: в спасбросках СИЛ, ЛОВ, ТЕЛ, ИНТ, МДР, ХАР/);assert.match(text,/без повторного бонуса/);assert.match(text,/спасбросках от смерти/);assert.match(text,/бонус \+2 к проверкам СИЛ/);assert.match(text,/ручная инициатива не меняются/);
});
