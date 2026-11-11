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
