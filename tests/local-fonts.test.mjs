import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createApp} from '../server/app.mjs';
import {openStore} from '../server/store.mjs';
const root=new URL('../',import.meta.url),manifest=JSON.parse(await readFile(new URL('client/fonts/manifest.json',root)));
test('local font subsets match pinned provenance and contain valid WOFF2 headers',async()=>{
 assert.equal(manifest.length,6);
 for(const item of manifest){const bytes=await readFile(new URL('client/fonts/'+item.file,root));assert.equal(bytes.subarray(0,4).toString(),'wOF2');assert.equal(createHash('sha256').update(bytes).digest('hex'),item.sha256);assert.ok(bytes.length>1000);}
 for(const file of ['Inter-LICENSE.txt','PT-Serif-OFL.txt'])assert.match(await readFile(new URL('client/fonts/'+file,root),'utf8'),/SIL OPEN FONT LICENSE/);
 const css=await readFile(new URL('client/fonts.css',root),'utf8');assert.doesNotMatch(css,/https?:/);assert.match(css,/U\+0400-045F/);assert.match(css,/U\+0000-00FF/);
 assert.doesNotMatch(await readFile(new URL('client/style.css',root),'utf8'),/@import|fonts\.google/);
});
test('font routes serve exact local bytes with nosniff and do not expose arbitrary font-directory files',async t=>{
 const store=openStore(':memory:'),app=createApp(store);await new Promise(r=>app.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>app.close(r));store.close();});const base='http://127.0.0.1:'+app.address().port;
 for(const item of manifest){const response=await fetch(base+'/fonts/'+item.file);assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'font/woff2');assert.equal(response.headers.get('x-content-type-options'),'nosniff');assert.equal(createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex'),item.sha256);}
 assert.equal((await fetch(base+'/fonts/manifest.json')).status,404);
 assert.equal((await fetch(base+'/fonts.css')).status,200);
});
