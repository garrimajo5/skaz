import {request} from 'node:http';
import test from 'node:test';import assert from 'node:assert/strict';import {createArtFailureFixture} from '../scripts/art-failure-fixture.mjs';
test('RAM fault modes affect PNG only, rotate cache versions and preserve game state',async t=>{
 const f=createArtFailureFixture(),{server}=f;await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r);}));const base='http://127.0.0.1:'+server.address().port;
 const state=await fetch(base+'/api/workspace').then(r=>r.json());const urls=new Set();
 for(const mode of ['healthy','missing','corrupt','disconnect','healthy']){
  f.setMode(mode);const index=await fetch(base+'/api/art').then(r=>r.json());const url=index.entries.find(e=>e.id==='srd51:2014:spell:fireball').files.thumbnail.url;assert.ok(!urls.has(url));urls.add(url);
  if(mode==='disconnect')await assert.rejects(fetch(base+url));else{const r=await fetch(base+url);assert.equal(r.status,mode==='missing'?404:200);const bytes=Buffer.from(await r.arrayBuffer());if(mode==='healthy')assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');if(mode==='corrupt'){assert.match(r.headers.get('content-type'),/image\/png/);assert.notEqual(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');}}
  assert.deepEqual(await fetch(base+'/api/workspace').then(r=>r.json()),state);assert.equal((await fetch(base+'/api/catalog?q=Fireball')).status,200);
 }
 assert.equal(f.status().faults,3);
});
test('fault control rejects foreign origin, malformed modes and duplicate fields',async t=>{
 const f=createArtFailureFixture(),{server}=f;await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r);}));const base='http://127.0.0.1:'+server.address().port;
 assert.equal((await fetch(base+'/qa/art-failure',{method:'POST',headers:{Origin:'https://foreign.invalid'},body:'mode=missing'})).status,403);
 for(const body of ['mode=unknown','mode=corrupt&mode=healthy','mode=corrupt&other=x','x'.repeat(65)])assert.equal((await fetch(base+'/qa/art-failure',{method:'POST',headers:{Origin:base},body})).status,body.length>64?413:400);
 for(const method of ['GET','POST']){const status=await new Promise((resolve,reject)=>{const req=request(base+'/qa/art-failure',{method,headers:{Host:'foreign.invalid',Origin:'http://foreign.invalid'}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);req.end(method==='POST'?'mode=missing':undefined);});assert.equal(status,403);}
 assert.equal(f.status().mode,'healthy');const r=await fetch(base+'/qa/art-failure',{method:'POST',headers:{Origin:base},body:'mode=corrupt',redirect:'manual'});assert.equal(r.status,303);assert.equal(f.status().mode,'corrupt');
});