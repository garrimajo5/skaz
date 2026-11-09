import test from 'node:test';import assert from 'node:assert/strict';
import {createArtLoadFixture} from '../scripts/art-load-fixture.mjs';

test('disposable load fixture counts actual UTF-8 and PNG bytes, excludes metrics and HEAD bodies',async t=>{
 const {server,snapshot}=createArtLoadFixture();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
 const base='http://127.0.0.1:'+server.address().port;let total=0;
 const read=async path=>{const response=await fetch(base+path);assert.equal(response.status,200);const bytes=Buffer.from(await response.arrayBuffer());total+=bytes.length;return bytes;};
 await read('/');const workspace=JSON.parse(await read('/api/workspace'));assert.ok(workspace.state);
 const index=JSON.parse(await read('/api/art'));const url=index.entries.find(e=>e.id==='srd51:2014:spell:fireball').files.thumbnail.url;
 const png=await read(url);assert.equal(snapshot().bodyBytes,total);assert.equal(snapshot().requests,4);assert.equal(snapshot().groups.art.bodyBytes,png.length);
 const head=await fetch(base+url,{method:'HEAD'});assert.equal((await head.arrayBuffer()).byteLength,0);
 assert.equal(snapshot().bodyBytes,total);assert.equal(snapshot().requests,5);
 const before=snapshot();await fetch(base+'/qa-metrics');assert.deepEqual(snapshot(),before);
 const changed=snapshot();changed.groups.art.bodyBytes=0;assert.equal(snapshot().groups.art.bodyBytes,png.length);
});
