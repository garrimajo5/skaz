import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server/app.mjs';
import {AppError} from '../server/state.mjs';
import {readFile} from 'node:fs/promises';
import {get} from 'node:http';
import {gunzipSync} from 'node:zlib';
import {inspectPng} from '../scripts/art-registry.mjs';

async function fixture(t,{protectedMode=true,library}={}){
 let signedIn=true,enabled=true,reads=0,indexReads=0;
 const url='/art/common/'+'a'.repeat(64)+'.png';
 const artLibrary=library||{index:()=>{indexReads++;return {schemaVersion:1,entries:[{id:'spell-fixture',files:{thumbnail:{url}}}]};},read:path=>{reads++;return path===url?{bytes:Buffer.from('synthetic HTTP fixture'),type:'image/png',etag:'"fixture-v1"'}:null;}};
 const access={user:identity=>{if(!enabled)throw new AppError(403,'Аккаунт отключён');return {id:identity,role:identity==='art-user'?'owner':'player'};}};
 const store={access,forUser:identity=>{access.user(identity);return {};}};
 const token='a'.repeat(64), playerToken='b'.repeat(64);
 const sessions={login(){},logout(){},check(){return signedIn?'art-user':null;},authenticate:value=>signedIn?({[token]:'art-user',[playerToken]:'art-player'}[value]??null):null};
 const app=createApp(store,{...(protectedMode?{sessions,publicOrigin:'https://fixture.invalid'}:{}),...(library===null?{}:{artLibrary})});
 await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>{app.closeAllConnections();app.close(resolve);}));
 const base='http://127.0.0.1:'+app.address().port;
 const headersForPlayer={cookie:'__Host-skaz-session='+playerToken,'x-skaz-identity':'art-player'};
 const headersForOwner={cookie:'__Host-skaz-session='+token,'x-skaz-identity':'art-user'};
 const raw=(path,headers)=>new Promise((resolve,reject)=>{
  get(base+path,{headers:{...headersForOwner,...headers}},incoming=>{
   const chunks=[];
   incoming.on('data',chunk=>chunks.push(chunk));
   incoming.on('end',()=>resolve({status:incoming.statusCode,headers:incoming.headers,bytes:Buffer.concat(chunks)}));
   incoming.on('error',reject);
  }).on('error',reject);
 });
 return {url,reads:()=>reads,indexReads:()=>indexReads,revoke:()=>signedIn=false,disable:()=>enabled=false,
  headersForPlayer,raw,request:(path,options={})=>fetch(base+path,{...options,headers:{...headersForOwner,...options.headers}})};
}
test('common art negotiates two representations of the same bytes for both personal roles',async t=>{
 const f=await fixture(t);
 const [plain,compressed,player]=await Promise.all([
  f.raw('/api/art',{}),
  f.raw('/api/art',{'accept-encoding':'br, gzip'}),
  f.raw('/api/art',{...f.headersForPlayer,'accept-encoding':'gzip'})
 ]);
 for(const result of [plain,compressed,player]){
  assert.equal(result.status,200);
  assert.equal(result.headers['cache-control'],'no-store');
  assert.equal(result.headers['content-type'],'application/json; charset=utf-8');
  assert.equal(result.headers['x-content-type-options'],'nosniff');
  assert.equal(result.headers.vary,'Accept-Encoding');
  assert.equal(Number(result.headers['content-length']),result.bytes.length);
 }
 assert.equal(plain.headers['content-encoding'],undefined);
 assert.equal(compressed.headers['content-encoding'],'gzip');
 assert.equal(player.headers['content-encoding'],'gzip');
 assert.deepEqual(gunzipSync(compressed.bytes),plain.bytes);
 assert.deepEqual(player.bytes,compressed.bytes);
 assert.equal(JSON.parse(plain.bytes).entries[0].id,'spell-fixture');
 assert.equal(f.indexReads(),1);
});
test('art encoding honors exclusions, explicit identity preferences and fallback',async t=>{
 const f=await fixture(t);
 const cases=[
  ['',200,undefined],
  ['identity',200,undefined],
  ['br, gzip;q=0',200,undefined],
  ['*;q=1, gzip;q=0',200,undefined],
  ['gzip;q=0.5, identity;q=0.9',200,undefined],
  ['gzip;q=0.5, identity;q=0',200,'gzip'],
  ['x-gzip',200,'gzip'],
  ['*;q=0.5',200,'gzip'],
  ['*;q=0, identity;q=0.4',200,undefined],
  ['br, identity;q=0',406,undefined],
  ['*;q=0',406,undefined]
 ];
 for(const [header,status,encoding] of cases){
  const result=await f.raw('/api/art',{'accept-encoding':header});
  assert.equal(result.status,status,header);
  assert.equal(result.headers['content-encoding'],encoding,header);
  assert.equal(result.headers.vary,'Accept-Encoding',header);
  assert.equal(result.headers['cache-control'],'no-store',header);
 }
});
test('gzip leaves the other API and PNG alone, including when an art request is denied',async t=>{
 const f=await fixture(t);
 const gzip={'accept-encoding':'gzip'};
 for(const headers of [{cookie:''},{'x-skaz-identity':'other-user'}]){
  const rejected=await f.raw('/api/art',{...gzip,...headers});
  assert.equal(rejected.status,401);
  assert.equal(rejected.headers['content-encoding'],undefined);
 }
 const foreign=await f.raw('/api/art',{...gzip,origin:'https://foreign.invalid'});
 assert.equal(foreign.status,403);
 assert.equal(foreign.headers['content-encoding'],undefined);
 assert.equal(f.indexReads(),0);
 for(const route of ['/api/me','/api/health',f.url]){
  const response=await f.raw(route,gzip);
  assert.equal(response.status,200);
  assert.equal(response.headers['content-encoding'],undefined);
 }
 assert.equal((await f.raw('/api/art',gzip)).status,200);
 f.revoke();
 const revoked=await f.raw('/api/art',gzip);
 assert.equal(revoked.status,401);
 assert.equal(revoked.headers['content-encoding'],undefined);
 assert.equal(f.indexReads(),1);
});
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
 const disabledIndex=await f.raw('/api/art',{'accept-encoding':'gzip'});
 assert.equal(disabledIndex.status,403);
 assert.equal(disabledIndex.headers['content-encoding'],undefined);
 assert.equal(f.indexReads(),0);
});
test('default production registry publishes no pilot candidates and never reads arbitrary files',async t=>{
 const f=await fixture(t,{protectedMode:false,library:null});
 const [identity,compressed]=await Promise.all([f.raw('/api/art',{}),f.raw('/api/art',{'accept-encoding':'gzip'})]);
 assert.equal(identity.status,200);
 assert.equal(compressed.status,200);
 assert.equal(compressed.headers['content-encoding'],'gzip');
 assert.deepEqual(gunzipSync(compressed.bytes),identity.bytes);
 const manifest=JSON.parse(await readFile(new URL('../catalog/art-manifest.json',import.meta.url),'utf8'));
 const index=JSON.parse(identity.bytes);
 assert.deepEqual(index.entries.map(e=>e.id),manifest.entries.filter(e=>e.status==='accepted').map(e=>e.id));
 for(const entry of index.entries)for(const file of Object.values(entry.files)){
  const image=await f.request(file.url);assert.equal(image.status,200);const measured=inspectPng(Buffer.from(await image.arrayBuffer()));
  assert.equal(measured.width,file.width);assert.equal(measured.height,file.height);assert.equal(image.headers.get('etag'),'"'+measured.sha256+'"');
 }
 for(const path of [f.url,'/data/art-pilot-v1/fireball-v6.png','/catalog/art-manifest.json','/art/common/%2e%2e%2fsecret'])assert.equal((await f.request(path)).status,404);
});
