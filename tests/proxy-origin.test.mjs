import test from 'node:test';
import http from 'node:http';
import assert from 'node:assert/strict';
import { openStore } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';
test('public origin is explicit HTTPS only; proxy headers cannot widen access',async t=>{
 const s=openStore(':memory:');t.after(()=>s.close());
 for(const publicOrigin of ['http://example.com','https://example.com/path','https://example.com/','https://user:password@example.com','null','*',''])assert.throws(()=>createApp(s,{publicOrigin}),/HTTPS origin/);
 const app=createApp(s,{publicOrigin:'https://example.com'});await new Promise(r=>app.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>app.close(r)));
 const url=`http://127.0.0.1:${app.address().port}/api/health`;
 assert.equal((await fetch(url,{headers:{Origin:'https://example.com'}})).status,200);
 assert.equal((await fetch(url,{headers:{Origin:'https://other.example','X-Forwarded-Host':'example.com','X-Forwarded-Proto':'https'}})).status,403);
 assert.equal(await new Promise((resolve,reject)=>http.get(url,{headers:{Origin:'https://example.com',Host:'example.com'}},r=>{r.resume();resolve(r.statusCode);}).on('error',reject)),403);
 assert.equal((await fetch(url,{headers:{Origin:'null'}})).status,403);
 assert.equal((await fetch(url).then(r=>r.json())).mode,'private-server');
});
test('default local server continues rejecting public origins',async t=>{
 const s=openStore(':memory:'),app=createApp(s);await new Promise(r=>app.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>app.close(r));s.close();});
 const url=`http://127.0.0.1:${app.address().port}/api/health`;
 assert.equal((await fetch(url,{headers:{Origin:'https://example.com'}})).status,403);assert.equal((await fetch(url).then(r=>r.json())).mode,'local');
});
