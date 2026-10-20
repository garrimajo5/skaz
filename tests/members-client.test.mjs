import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
const source=readFileSync(new URL('../client/members.js',import.meta.url),'utf8');
const roster=()=>({campaignId:'campaign-one',actorId:'member-alice',version:'a'.repeat(64),characters:[{id:'hero-one',name:'<Private hero>'}],members:[{id:'member-alice',displayName:'Alice',enabled:true,role:'owner',characterIds:['hero-one']},{id:'member-boris',displayName:'<Boris>',enabled:true,role:'player',characterIds:[]}]});
function harness({list=async()=>roster(),change=async()=>roster()}={}){
 let html='',open=true,key='first',allowed=true;const elements=new Map(),groups={},events={};
 const get=id=>{if(id==='dialog')return {open};return elements.get(id)||null;};
 function modal(value){html=value;open=true;elements.clear();for(const match of value.matchAll(/id="([^"]+)"/g))elements.set(match[1],{value:'',dataset:{}});for(const name of['member-role','member-remove','member-hero'])groups[name]=[...value.matchAll(new RegExp('data-'+name+'="([^"]+)"','g'))].map(m=>({dataset:{[name.replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]:m[1]}}));}
 const context=vm.createContext({document:{getElementById:get,querySelectorAll:selector=>groups[selector.slice(6,-1)]||[],addEventListener:(name,fn)=>events[name]=fn},modal,crypto:{randomUUID},SkazStorage:{can:()=>allowed,contextKey:()=>key,membersData:list,changeMembers:change}});vm.runInContext(source,context);
 return {api:vm.runInContext('SkazMembers',context),get,group:name=>groups[name],html:()=>html,close:()=>open=false,switch:()=>key='second',deny:()=>allowed=false};
}
const tick=()=>new Promise(r=>setImmediate(r));
test('membership decisions escape names and require explicit confirmation before a write',async()=>{
 const calls=[],c=harness({change:async command=>{calls.push(command);return roster();}});await c.api.open();assert.match(c.html(),/&lt;Boris&gt;/);assert.ok(!c.html().includes('<Private hero>'));
 c.group('member-hero')[1].onclick();assert.match(c.html(),/Проверить изменение/);assert.equal(calls.length,0);await c.get('members-confirm').onclick();assert.equal(calls.length,1);assert.equal(calls[0].action,'grant-character');assert.equal(calls[0].userId,'member-boris');assert.equal(calls[0].expectedVersion,'a'.repeat(64));assert.match(c.html(),/Доступ сохранён/);
});
test('lost response retries the identical confirmed decision; no automatic repeat or new action',async()=>{
 const calls=[],c=harness({change:async command=>{calls.push(JSON.stringify(command));if(calls.length===1)throw new Error('offline');return {...roster(),replayed:true};}});await c.api.open();c.group('member-hero')[1].onclick();await c.get('members-confirm').onclick();assert.equal(calls.length,1);assert.match(c.html(),/members-retry/);assert.match(c.html(),/Новые решения пока заблокированы/);
 c.group('member-remove')[1].onclick();assert.equal(calls.length,1);await c.get('members-retry').onclick();assert.equal(calls[0],calls[1]);assert.match(c.html(),/уже была подтверждена/);
});
test('rejected decisions clear retry and explicit refresh reads actual roster',async()=>{
 let reads=0,writes=0;const c=harness({list:async()=>{reads++;return roster();},change:async()=>{writes++;throw Object.assign(new Error('Roster changed'),{status:409});}});await c.api.open();c.group('member-hero')[1].onclick();await c.get('members-confirm').onclick();assert.match(c.html(),/Roster changed/);assert.match(c.html(),/data-member-role="1" disabled/);c.group('member-hero')[1].onclick();assert.ok(!c.get('members-confirm'));assert.ok(!c.get('members-retry'));await c.get('members-refresh').onclick();assert.equal(reads,2);assert.equal(writes,1);
});
test('closed or switched campaign ignores late roster and command replies',async()=>{
 let deliver;const c=harness({list:()=>new Promise(r=>deliver=r)});const loading=c.api.open();c.close();deliver(roster());await loading;assert.ok(!c.html().includes('Кто играет вместе'));
 const d=harness({change:()=>new Promise(r=>deliver=r)});await d.api.open();d.group('member-hero')[1].onclick();const writing=d.get('members-confirm').onclick();d.switch();deliver(roster());await writing;assert.ok(!d.html().includes('Доступ сохранён'));
 const e=harness();e.deny();await e.api.open();assert.equal(e.html(),'');
});
