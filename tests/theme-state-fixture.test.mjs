import test from 'node:test';import assert from 'node:assert/strict';
import {createThemeStateFixture} from '../scripts/theme-state-fixture.mjs';
async function fixture(t){const f=createThemeStateFixture();await new Promise(resolve=>f.server.listen(0,'127.0.0.1',resolve));t.after(()=>f.stop());const url=`http://127.0.0.1:${f.server.address().port}`;return {url,post:(path,data,origin=url)=>fetch(url+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(data)})};}
test('theme fixture serves the real shell with QA-only instrumentation and no file database',async t=>{const f=await fixture(t);const html=await (await fetch(f.url)).text();assert.match(html,/class-advancement-shell.js/);assert.match(html,/_qa\/audit.js/);const state=await(await fetch(f.url+'/api/workspace')).json();assert.ok(state);assert.equal((await fetch(f.url+'/_qa/unknown')).status,404);});
test('measurement sink rejects cross-origin writes and malformed reports',async t=>{const f=await fixture(t);assert.equal((await f.post('/_qa/report',{theme:'polar',rows:[]},'https://example.invalid')).status,403);assert.equal((await f.post('/_qa/report',{theme:'unknown',rows:[]})).status,400);assert.equal((await f.post('/_qa/report',{theme:'polar',rows:[]})).status,200);const data=await(await fetch(f.url+'/_qa/reports')).json();assert.equal(data.reports.length,1);assert.equal(data.reports[0].sequence,1);});
test('pending request is released as conflict without changing server state',async t=>{const f=await fixture(t);const before=await(await fetch(f.url+'/api/workspace')).json();await f.post('/_qa/mode',{mode:'pending'});const pending=f.post('/api/resources/change',{});await new Promise(resolve=>setTimeout(resolve,50));await f.post('/_qa/mode',{mode:'conflict'});assert.equal((await pending).status,409);assert.deepEqual(await(await fetch(f.url+'/api/workspace')).json(),before);});
test('independent RAM fixtures do not share reports or fault modes',async t=>{const a=await fixture(t),b=await fixture(t);await a.post('/_qa/mode',{mode:'conflict'});await a.post('/_qa/report',{theme:'atlas',rows:[]});assert.equal((await a.post('/api/resources/change',{})).status,409);assert.notEqual((await b.post('/api/resources/change',{})).status,409);assert.equal((await(await fetch(b.url+'/_qa/reports')).json()).reports.length,0);});

test('report identity and fault mode belong to the server, not the submitted measurement',async t=>{
 const f=await fixture(t);await f.post('/_qa/mode',{mode:'conflict'});
 assert.equal((await f.post('/_qa/report',{theme:'polar',rows:[],sequence:999,mode:'normal'})).status,200);
 const {reports}=await(await fetch(f.url+'/_qa/reports')).json();
 assert.equal(reports[0].sequence,1);assert.equal(reports[0].mode,'conflict');
});
