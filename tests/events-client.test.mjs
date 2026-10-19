import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../client/events.js',import.meta.url),'utf8');
function harness(){
 let key='first';const handlers={},tasks=[],requests=[],reviews=[];const region={innerHTML:'',setAttribute(){}};
 const context=vm.createContext({queueMicrotask:fn=>tasks.push(fn),document:{addEventListener:(name,fn)=>handlers[name]=fn,getElementById:()=>region},SkazStorage:{snapshotKey:()=>key,contextKey:()=>key.split(':')[0],proposalsData:()=>new Promise((resolve,reject)=>requests.push({resolve,reject})),newProposal:()=>reviews.push('new'),reviewProposal:item=>reviews.push(item)}});
 vm.runInContext(source,context);
 return{region,tasks,requests,reviews,setKey:value=>key=value,view:()=>vm.runInContext('SkazEvents.view()',context),count:()=>vm.runInContext('SkazEvents.pendingCount()',context),click:(id,dataset={})=>handlers.click({target:{closest:()=>({id,dataset})}}),filter:value=>handlers.change({target:{id:'proposal-filter',value}})};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const item=(status='pending')=>({id:'proposal-'+status,status,source:{text:'<script>source</script>',speaker:'Master',offsetMs:60000},suggestion:{kind:'journal',title:'<img src=x>',text:'Original'},appliedEntry:status==='accepted'?{title:'Corrected',text:'Corrected text'}:null});
test('event review displays escaped source, counts pending only and keeps accepted corrections',async()=>{
 const h=harness();h.view();h.tasks.shift()();h.requests[0].resolve({proposals:[{...item(),importedFrom:{proposalId:'original-proposal'}},item('accepted'),item('dismissed')]});await settle();
 assert.equal(h.count(),1);assert.match(h.region.innerHTML,/Перенесено из другой игры/);assert.match(h.region.innerHTML,/&lt;script&gt;source/);assert.doesNotMatch(h.region.innerHTML,/<script>|<img/);
 h.click('',{reviewProposal:'proposal-pending'});assert.equal(h.reviews[0].id,'proposal-pending');
 h.filter('accepted');assert.match(h.region.innerHTML,/Corrected text/);assert.doesNotMatch(h.region.innerHTML,/data-review-proposal/);
 h.filter('dismissed');assert.match(h.region.innerHTML,/Пропущено/);
});
test('old session event response cannot replace current events or open a stale review',async()=>{
 const h=harness();h.view();h.tasks.shift()();h.setKey('second');h.view();h.tasks.shift()();h.requests[1].resolve({proposals:[]});await settle();const current=h.region.innerHTML;
 h.requests[0].resolve({proposals:[item()]});await settle();assert.equal(h.region.innerHTML,current);assert.equal(h.count(),0);
 h.setKey('third');h.click('',{reviewProposal:'proposal-pending'});assert.equal(h.reviews.length,0);
});
test('events offer retry and do not imply microphone or AI processing',async()=>{
 const h=harness();assert.match(h.view(),/ручной ввод/);h.tasks.shift()();h.requests[0].reject(new Error('offline'));await settle();assert.match(h.region.innerHTML,/События недоступны/);
 h.click('proposals-retry');h.requests[1].resolve({proposals:[]});await settle();assert.match(h.region.innerHTML,/Нет событий на проверку/);h.click('new-proposal');assert.deepEqual(h.reviews,['new']);
});


test('decision refresh retains list position, clamps emptied last page and resets another session',async()=>{
 const h=harness(),items=Array.from({length:12},(_,i)=>({...item(),id:'proposal-'+i,suggestion:{kind:'journal',title:'Event '+i,text:'Text'}}));
 h.view();h.tasks.shift()();h.requests[0].resolve({proposals:items});await settle();h.click('proposals-next');assert.match(h.region.innerHTML,/11–12 из 12/);
 h.setKey('first:1');h.view();h.tasks.shift()();h.requests[1].resolve({proposals:items.slice(0,11)});await settle();assert.match(h.region.innerHTML,/11–11 из 11/);
 h.setKey('first:2');h.view();h.tasks.shift()();h.requests[2].resolve({proposals:items.slice(0,10)});await settle();assert.match(h.region.innerHTML,/1–10 из 10/);
 h.filter('accepted');h.setKey('second');h.view();h.tasks.shift()();h.requests[3].resolve({proposals:items});await settle();assert.match(h.region.innerHTML,/1–10 из 12/);
});


test('unknown or failed event count never masquerades as an empty queue',async()=>{
 const h=harness();assert.equal(h.count(),null);h.view();h.tasks.shift()();assert.equal(h.count(),null);
 h.requests[0].reject(new Error('offline'));await settle();assert.equal(h.count(),null);
 h.click('proposals-retry');h.requests[1].resolve({proposals:[item()]});await settle();assert.equal(h.count(),1);
 h.setKey('first:1');assert.equal(h.count(),null);
});
