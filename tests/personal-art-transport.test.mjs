import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const context=vm.createContext({URLSearchParams,AbortController,AbortSignal});
vm.runInContext(readFileSync(new URL('../client/personal-art-transport.js',import.meta.url),'utf8')+';globalThis.transport=SkazPersonalArtTransport;',context);
const binding={characterId:'hero',catalogId:'shield'};
const history=(revision=1,standard=false)=>Response.json({entries:[{revision,standard}]});
function fixture(responses){const calls=[];const api=context.transport.create({identity:'alice',...binding,request:async(...args)=>{calls.push(args);const response=responses.shift();if(typeof response==='function')return response();return response;}});return {api,calls};}
test('private image reads carry immutable identity, bypass caches and reject redirects',async()=>{
 const f=fixture([history(),new Response('png',{headers:{'Content-Type':'image/png','X-Skaz-Art-Revision':'1'}})]);
 const state=await f.api.snapshot(binding);assert.equal(state.revision,1);assert.equal(await state.blob.text(),'png');
 for(const [url,options] of f.calls){assert.ok(url.startsWith('/api/personal-art/'));assert.equal(options.headers['X-Skaz-Identity'],'alice');assert.equal(options.cache,'no-store');assert.equal(options.credentials,'same-origin');assert.equal(options.redirect,'error');assert.ok(options.signal);}
 await assert.rejects(f.api.snapshot({...binding,characterId:'other'}),/Область/);assert.equal(f.calls.length,2);f.api.destroy();
});
test('404 for standard art is reauthorized and a concurrent change is explicit',async()=>{
 const good=fixture([history(2,true),new Response('',{status:404}),history(2,true)]);
 assert.equal((await good.api.snapshot(binding)).standard,true);good.api.destroy();
 const revoked=fixture([history(2,true),new Response('',{status:404}),Response.json({error:'Revoked'},{status:403})]);
 await assert.rejects(revoked.api.snapshot(binding),/Revoked/);revoked.api.destroy();
 const changed=fixture([history(2,true),new Response('',{status:404}),history(3,false)]);
 await assert.rejects(changed.api.snapshot(binding),/изменилось/);changed.api.destroy();
});
test('mismatched image revisions and active content never become a snapshot',async()=>{
 for(const headers of [{'Content-Type':'image/png','X-Skaz-Art-Revision':'2'},{'Content-Type':'image/svg+xml','X-Skaz-Art-Revision':'1'},{'Content-Type':'image/png'}]){
  const f=fixture([history(),new Response('data',{headers})]);await assert.rejects(f.api.snapshot(binding),/изменилось/);f.api.destroy();
 }
 const malformed=fixture([Response.json({entries:[{revision:1,standard:false},{revision:2,standard:false}]})]);await assert.rejects(malformed.api.history(binding),/Неверная история/);malformed.api.destroy();
});
test('writes retain exact body and cannot change scope; closing aborts pending requests',async()=>{
 let resolve;const f=fixture([()=>new Promise(r=>resolve=r)]);
 const body=JSON.stringify({...binding,action:'reset',mutationId:'stable-id',expectedRevision:1});
 const pending=f.api.change(body);assert.equal(f.calls[0][1].body,body);
 await assert.rejects(f.api.change(JSON.stringify({...binding,characterId:'other'})),/Область/);
 f.api.destroy();assert.equal(f.calls[0][1].signal.aborted,true);resolve(Response.json({revision:2}));await assert.rejects(pending,/закрыт/);
});
