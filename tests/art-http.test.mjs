import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server/app.mjs';
import {AppError} from '../server/state.mjs';

async function fixture(t,{protectedMode=true,library}={}){
 let signedIn=true,enabled=true,reads=0;
 const url='/art/common/'+'a'.repeat(64)+'.png';
 const artLibrary=library||{index:()=>({schemaVersion:1,entries:[{id:'spell-fixture',files:{thumbnail:{url}}}]}),read:path=>{reads++;return path===url?{bytes:Buffer.from('synthetic HTTP fixture'),type:'image/png',etag:'"fixture-v1"'}:null;}};
 const store={forUser:()=>({}),access:{user:()=>{if(!enabled)throw new AppError(403,'Аккаунт отключён');}}};
 const token='a'.repeat(64);
 const sessions={login(){},logout(){},check(){return signedIn?'art-user':null;},authenticate:value=>signedIn&&value===token?'art-user':null};
 const app=createApp(store,{...(protectedMode?{sessions,publicOrigin:'https://fixture.invalid'}:{}),...(library===null?{}:{artLibrary})});
 await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>{app.closeAllConnections();app.close(resolve);}));
 const base='http://127.0.0.1:'+app.address().port;
 return {url,reads:()=>reads,revoke:()=>signedIn=false,disable:()=>enabled=false,request:(path,options={})=>fetch(base+path,{...options,headers:{cookie:'__Host-skaz-session='+token,'x-skaz-identity':'art-user',...options.headers}})};
}
test('authenticated image GET/HEAD and conditional requests preserve content and revalidate',async t=>{
 const f=await fixture(t),index=await f.request('/api/art');assert.equal(index.status,200);assert.equal((await index.json()).entries[0].id,'spell-fixture');assert.equal(f.reads(),0);
 const image=await f.request(f.url);assert.equal(image.status,200);assert.equal(image.headers.get('content-type'),'image/png');assert.equal(image.headers.get('x-content-type-options'),'nosniff');assert.match(image.headers.get('cache-control'),/private.*must-revalidate/);assert.equal(await image.text(),'synthetic HTTP fixture');
 const head=await f.request(f.url,{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');assert.equal(head.headers.get('content-length'),image.headers.get('content-length'));
 const cached=await f.request(f.url,{headers:{'if-none-match':'"fixture-v1"'}});assert.equal(cached.status,304);assert.equal(await cached.text(),'');
 assert.equal((await f.request(f.url,{headers:{'if-none-match':'"old"'}})).status,200);
});
test('revocation blocks even conditional image requests before image reads; API checks tab identity',async t=>{
 const f=await fixture(t);assert.equal((await f.request('/api/art',{headers:{'x-skaz-identity':'other-user'}})).status,401);
 f.revoke();assert.equal((await f.request(f.url,{headers:{'if-none-match':'"fixture-v1"'}})).status,401);assert.equal((await f.request('/api/art')).status,401);assert.equal(f.reads(),0);
});
test('disabled accounts, foreign origins, missing files and methods fail safely',async t=>{
 const f=await fixture(t);assert.equal((await f.request(f.url,{headers:{origin:'https://foreign.invalid'}})).status,403);assert.equal(f.reads(),0);
 assert.equal((await f.request('/art/common/unknown.png')).status,404);
 const post=await f.request(f.url,{method:'POST'});assert.equal(post.status,405);assert.equal(post.headers.get('allow'),'GET, HEAD');
 f.disable();assert.equal((await f.request(f.url)).status,403);
});
test('default production registry publishes no pilot candidates and never reads arbitrary files',async t=>{
 const f=await fixture(t,{protectedMode:false,library:null});const response=await f.request('/api/art');assert.equal(response.status,200);assert.deepEqual((await response.json()).entries,[]);
 for(const path of [f.url,'/data/art-pilot-v1/fireball-v6.png','/catalog/art-manifest.json','/art/common/%2e%2e%2fsecret'])assert.equal((await f.request(path)).status,404);
});
