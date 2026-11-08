import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import{readFile}from'node:fs/promises';
const source=await readFile(new URL('../client/storage.js',import.meta.url),'utf8');
const snippet=source.slice(source.indexOf('  let badgeSavingSince='),source.indexOf('  function paint()'));
function harness(){let now=0,paints=0;const timers=[];const context=vm.createContext({status:'ready',count:0,resourceSending:false,pendingCount:()=>context.count,Date:{now:()=>now},setTimeout:fn=>timers.push(fn),paint:()=>paints++});vm.runInContext(snippet,context);return {set:(status,count=0,sending=false)=>Object.assign(context,{status,count,resourceSending:sending}),chip:()=>vm.runInContext('compactStatus()',context),advance:ms=>now+=ms,fire:()=>timers.splice(0).forEach(fn=>fn()),paints:()=>paints};}
test('every save chip stays under twenty characters including a full queue and denial',()=>{
 const h=harness();for(const status of ['demo','loading','ready','saving','error','pending','conflict','stale','denied','resource-pending','resource-conflict'])for(const count of [0,1,10,999,1000]){h.set(status,count);assert.ok(h.chip().text.length<=20,status+' '+count);}
 h.set('denied');assert.equal(h.chip().text,'Нет доступа');h.set('stale');assert.equal(h.chip().text,'Есть обновления');h.set('resource-pending',10);assert.equal(h.chip().kind,'pending');
});
test('saving is delayed one second, never says saved early, and completed timers are ignored',()=>{
 const h=harness();h.set('saving',1);assert.equal(h.chip().text,'В очереди · 1');h.advance(999);assert.notEqual(h.chip().text,'Сохраняю…');h.advance(1);assert.equal(h.chip().text,'Сохраняю…');h.set('ready');assert.equal(h.chip().text,'Сохранено');h.fire();assert.equal(h.paints(),0);
 h.set('resource-pending',2,true);assert.equal(h.chip().kind,'saving');h.advance(1000);h.fire();assert.equal(h.paints(),1);assert.equal(h.chip().text,'Сохраняю…');
});
