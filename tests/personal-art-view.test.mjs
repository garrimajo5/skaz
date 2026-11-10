import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){let scope={identity:'owner',characterId:'hero',viewId:'window'},refreshes=0;const requests=[];const c=vm.createContext({SkazStorage:{personalArtReadScope:()=>scope},SkazArt:{refreshPrivate(){refreshes++;}},SkazPersonalArtTransport:{create(options){const item={options,destroyed:0};requests.push(item);return {snapshot(binding,role){item.binding=binding;item.role=role;return new Promise((resolve,reject)=>{item.resolve=resolve;item.reject=reject;});},destroy(){item.destroyed++;}};}}});vm.runInContext(readFileSync(new URL('../client/personal-art-view.js',import.meta.url),'utf8'),c);return {api:vm.runInContext('SkazPersonalArtView',c),requests,get scope(){return scope;},set scope(v){scope=v;},get refreshes(){return refreshes;}};}
test('private delivery limits concurrent reads and never reuses files between heroes',async()=>{
 const f=fixture(),pending=Array.from({length:6},(_,i)=>f.api.read('spell-'+i,'thumbnail').catch(e=>e));assert.equal(f.requests.length,4);
 f.scope={...f.scope,characterId:'other'};f.api.sync();for(const r of f.requests)r.resolve({standard:false,blob:'old'});const results=await Promise.all(pending);assert.equal(f.requests.length,4);assert.ok(results.every(e=>e.message));assert.ok(f.requests.every(r=>r.destroyed>=1));
 const next=f.api.read('spell-0','card');assert.equal(f.requests[4].options.characterId,'other');assert.equal(f.requests[4].role,'master');f.requests[4].resolve({standard:false,blob:'new'});assert.equal(await next,'new');
});
test('standard fallback is explicit; failed permission or revision reads never become standard',async()=>{
 const f=fixture();const standard=f.api.read('a','thumbnail');f.requests[0].resolve({standard:true});assert.equal(await standard,null);
 const denied=f.api.read('a','thumbnail');f.requests[1].reject(Error('Access revoked'));await assert.rejects(denied,/revoked/);
 assert.equal(f.requests[1].destroyed,1);
});
test('session close discards in-flight images and drains waiting readers without new requests',async()=>{
 const f=fixture(),pending=Array.from({length:9},()=>f.api.read('a','card').catch(e=>e));f.api.lock();for(const r of f.requests)r.resolve({standard:false,blob:'late'});await settle();assert.ok((await Promise.all(pending)).every(e=>e.message));assert.equal(f.requests.length,4);assert.equal(await f.api.read('a','card'),null);
});
test('invalidation rejects a late snapshot even when identity is unchanged',async()=>{
 const f=fixture(),first=f.api.read('a','thumbnail');f.api.invalidate();f.requests[0].resolve({standard:false,blob:'stale'});await assert.rejects(first,/изменилась/);
 const again=f.api.read('a','thumbnail');f.requests[1].resolve({standard:false,blob:'current'});assert.equal(await again,'current');assert.equal(f.requests.length,2);
});