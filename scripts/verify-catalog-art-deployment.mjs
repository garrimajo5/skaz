// Read-only game verification; only the temporary login session is created/revoked.
// Usage: node scripts/verify-catalog-art-deployment.mjs HTTPS_ORIGIN PRIVATE_ACCESS_JSON
import {readFile} from 'node:fs/promises';
import {setTimeout as pace} from 'node:timers/promises';
import assert from 'node:assert/strict';
import {inspectPng} from './art-registry.mjs';
import {verifyIndividualDeployment} from './verify-individual-deployment.mjs';
import {bundledCatalog} from '../server/bundled-catalog.mjs';
import {validateCatalog} from '../server/catalog.mjs';
const [origin,credentialFile]=process.argv.slice(2);
const credentials=JSON.parse(await readFile(credentialFile,'utf8'));
const manifest=JSON.parse(await readFile(new URL('../catalog/art-manifest.json',import.meta.url),'utf8'));
let images=0,entries=0;
async function request(url,options){await pace(150);return fetch(url,{...options,signal:AbortSignal.timeout(15000)});}
try{
 const result=await verifyIndividualDeployment({origin,outerLogin:credentials.outerLogin,account:credentials.account,minimumCatalogCount:633,classAdvancement:true,fetchImpl:async(url,options)=>{
  let response=await request(url,options);
  if(new URL(url).pathname==='/api/catalog/coverage'&&response.status===200){
   response=new Response(await response.arrayBuffer(),{status:response.status,headers:response.headers});
   const art=await request(origin+'/api/art',options);assert.equal(art.status,200);
   const index=await art.json();entries=index.entries.length;
   assert.deepEqual(index.entries.map(e=>[e.id,e.contentSha256,e.version]).sort(),manifest.entries.filter(e=>e.status==='accepted').map(e=>[e.id,e.contentSha256,e.version]).sort());
   const fixes=validateCatalog(bundledCatalog().bundle).filter(e=>['srd51:2014:spell:wall-of-force','srd51:2014:spell:globe-of-invulnerability'].includes(e.id));
   assert.equal(fixes.length,2);
   for(const entry of fixes){
    const rule=await request(origin+'/api/catalog/entry?'+new URLSearchParams({id:entry.id}),options);
    assert.equal(rule.status,200);assert.deepEqual((await rule.json()).entry,entry);
   }
   for(const entry of index.entries)for(const file of Object.values(entry.files)){
    const png=await request(origin+file.url,options);assert.equal(png.status,200);
    const info=inspectPng(Buffer.from(await png.arrayBuffer()));
    assert.equal(info.width,file.width);assert.equal(info.height,file.height);assert.equal(png.headers.get('etag'),'"'+info.sha256+'"');images++;
    if(images%200===0)console.log(JSON.stringify({checkedImages:images}));
   }
   for(const name of ['catalog.css','quick.css','ui.js','art.js','catalog.js','spellbook.js']){
    const asset=await request(origin+'/'+name,options);assert.equal(asset.status,200);
    assert.equal((await asset.text()).replaceAll('\r\n','\n'),(await readFile(new URL('../client/'+name,import.meta.url),'utf8')).replaceAll('\r\n','\n'));
   }
   const headers={...options.headers};delete headers.Cookie;
   for(const route of ['/api/art',index.entries[0].files.thumbnail.url]){
    const denied=await request(origin+route,{...options,headers});assert.equal(denied.status,401);await denied.body?.cancel();
   }
  }
  return response;
 }});
 assert.equal(entries,580);assert.equal(images,1160);
 console.log(JSON.stringify({verified:true,entries,images,exactClientFiles:6,catalogTotal:result.catalogTotal,checks:result.checks}));
}catch{console.error('Protected deployment verification failed; no credentials or game contents logged.');process.exitCode=1;}
