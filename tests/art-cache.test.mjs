import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../client/art-cache.js',import.meta.url),'utf8');
const factory=vm.runInNewContext(source+';createSkazArtCache',{Response});
const url=n=>'/art/common/'+String(n).padStart(64,'a')+'.png';
const blob=n=>new Blob([new Uint8Array(n)],{type:'image/png'});
function environment(){
 const stores=new Map();let chain=Promise.resolve();
 const locks={request:(_name,fn)=>{const result=chain.then(fn);chain=result.catch(()=>{});return result;}};
 const storage={open:async name=>{if(!stores.has(name))stores.set(name,new Map());const map=stores.get(name);return {keys:async()=>[...map.keys()],match:async key=>map.get(key)?.clone(),delete:async key=>map.delete(key),put:async(key,response)=>{map.set(key,response.clone());}};},delete:async name=>stores.delete(name)};
 return {storage,locks,origin:'https://skaz.test',identity:'alice-user',limit:30,maxFiles:3};
}
test('byte and file bounds use LRU order shared by two tabs',async()=>{
 const env=environment(),a=factory(env),b=factory(env);
 await Promise.all([a.put(url(1),blob(10)),b.put(url(2),blob(10)),a.put(url(3),blob(10))]);
 await b.get(url(1));await a.put(url(4),blob(10));assert.equal(await b.get(url(2)),null);
 assert.equal((await a.stats()).bytes,30);assert.equal((await a.stats()).files,3);
 await a.put(url(5),blob(25));assert.equal((await b.stats()).bytes,25);assert.equal((await b.stats()).files,1);
});
test('identities are isolated and lock prevents queued or future writes',async()=>{
 const env=environment(),a=factory(env),b=factory({...env,identity:'other-user'});
 await a.put(url(1),blob(10));assert.equal(await b.get(url(1)),null);
 const pending=a.put(url(2),blob(10));await a.clear({lock:true});await pending;
 assert.equal(await a.get(url(1)),null);assert.equal(await a.put(url(3),blob(10)),null);
 const reopened=factory(env);assert.equal((await reopened.stats()).files,0);
});
test('manual clear permits future caching and unavailable storage degrades without throwing',async()=>{
 const env=environment(),a=factory(env);await a.put(url(1),blob(10));await a.clear();assert.equal((await a.stats()).bytes,0);
 await a.put(url(2),blob(10));assert.equal((await a.get(url(2))).size,10);
 const bad=factory({...env,storage:{open:async()=>{throw Error('Quota or private mode');}}});assert.equal(await bad.put(url(1),blob(10)),null);assert.equal(await bad.get(url(1)),null);
 assert.equal(await factory({...env,locks:null}).stats(),null);
});
test('only common PNG thumbnails within the per-file limit can enter storage',async()=>{
 const a=factory({...environment(),limit:100000});
 for(const path of ['/api/workspace','https://tracking.test/a','/art/private/a.png'])assert.equal(await a.put(path,blob(10)),false);
 assert.equal(await a.put(url(1),new Blob(['svg'],{type:'image/svg+xml'})),false);
 assert.equal(await a.put(url(1),blob(32769)),false);assert.equal((await a.stats()).files,0);
});

test('a new content hash cannot reuse an old version and clearing one user preserves another',async()=>{
 const env=environment(),alice=factory(env),bob=factory({...env,identity:'bob-user'});
 await alice.put(url(1),blob(10));await bob.put(url(1),blob(20));
 assert.equal(await alice.get(url(2)),null);
 await alice.put(url(2),blob(15));assert.equal((await alice.get(url(2))).size,15);
 await alice.clear({lock:true});assert.equal((await bob.get(url(1))).size,20);
 assert.equal((await factory(env).stats()).files,0);
});
