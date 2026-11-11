import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const q={mutationId:'test-mutation',expectedRevision:2,characterId:'test-character',classId:'fighter',fromLevel:3},body=JSON.stringify(q);
const saved=()=>({context:{characterId:q.characterId},affectedContext:{characterId:q.characterId},revision:3,characterSheet:{level:4},state:{maxHp:42},advancement:{classId:'fighter',events:[{mutationId:q.mutationId,level:4}]}});
function fixture(request){let current=true;const c=vm.createContext({AbortController,AbortSignal,fetch:request});vm.runInContext(readFileSync(new URL('../client/class-advancement-transport.js',import.meta.url),'utf8'),c);const api=vm.runInContext('SkazClassAdvancementTransport',c).create({scope:{identity:'test-user',viewId:'test-window'},isCurrent:()=>current,request});return {api,change:()=>current=false};}
test('transport validates mutation provenance before acknowledging any successful response',async()=>{
 for(const mutate of [v=>delete v.advancement,v=>v.advancement.events=[],v=>v.context.characterId='other',v=>v.affectedContext.characterId='other',v=>v.revision=2,v=>v.advancement.classId='wizard']){const v=saved();mutate(v);const f=fixture(async()=>Response.json(v));await assert.rejects(f.api.send(body,'advance'),/происхождение/);f.api.destroy();}
 const calls=[],f=fixture(async(path,o)=>{calls.push({path,o});return Response.json(saved());});await f.api.send(body,'advance');assert.equal(calls[0].o.body,body);assert.equal(calls[0].o.headers['X-Skaz-Identity'],'test-user');assert.equal(calls[0].o.headers['X-Skaz-View'],'test-window');assert.equal(calls[0].o.redirect,'error');f.api.destroy();
});
test('uncertain server response retains retry semantics while definitive rejection can reconcile',async()=>{
 for(const status of [401,403,409,422,500,503]){const f=fixture(async()=>Response.json({error:'failed'},{status}));await assert.rejects(f.api.send(body,'advance'),e=>e.notApplied===(status<500));f.api.destroy();}
 const f=fixture(async()=>new Response('{'));await assert.rejects(f.api.send(body,'advance'),e=>!e.notApplied);f.api.destroy();
});
test('destroy or context switch prevents late acknowledgement and further requests',async()=>{
 for(const reason of ['destroy','context']){let resolve,count=0;const f=fixture(()=>{count++;return new Promise(r=>resolve=r);});const work=f.api.send(body,'advance');reason==='destroy'?f.api.destroy():f.change();resolve(Response.json(saved()));await assert.rejects(work,/изменились/);await assert.rejects(f.api.classes(),/изменились/);assert.equal(count,1);f.api.destroy();}
});
test('binding receipt and later replay revision remain valid without replaying the level',async()=>{
 const value=saved();value.revision=8;value.characterSheet.level=5;value.advancement.binding={mutationId:q.mutationId};const f=fixture(async()=>Response.json(value));await f.api.send(body,'bind');await f.api.send(body,'advance');f.api.destroy();
});

test('context changed while response body is read cannot acknowledge the old hero',async()=>{
 let finish,started;const reading=new Promise(r=>started=r);
 const f=fixture(async()=>({ok:true,json:()=>{started();return new Promise(r=>finish=r);}}));
 const work=f.api.send(body,'advance');await reading;f.change();finish(saved());
 await assert.rejects(work,/изменились/);f.api.destroy();
});
