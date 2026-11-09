import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {deflateSync} from 'node:zlib';
import {createArtLibrary} from '../server/art-library.mjs';
import {crc32,inspectPng,inventory} from '../scripts/art-registry.mjs';
function chunk(type,data){const b=Buffer.alloc(data.length+12);b.writeUInt32BE(data.length);b.write(type,4);data.copy(b,8);b.writeUInt32BE(crc32(b.subarray(4,-4)),b.length-4);return b;}
function png(color=60){const h=Buffer.alloc(13);h.writeUInt32BE(120);h.writeUInt32BE(60,4);h[8]=8;h[9]=6;const raw=Buffer.alloc(481*60,color);for(let y=0;y<60;y++)raw[y*481]=0;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',h),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);}
function fixture(t){
 const base=mkdtempSync(join(tmpdir(),'skaz-art-library-'));t.after(()=>rmSync(base,{recursive:true,force:true}));mkdirSync(join(base,'assets/art'),{recursive:true});
 const source=png(),path='assets/art/sample.png';writeFileSync(join(base,path),source);const entry=inventory()[0],file={path,...inspectPng(source)};
 const item={id:entry.id,contentSha256:entry.contentSha256,status:'accepted',version:1,crop:{x:.5,y:.5},provenance:{method:'original',author:'Test',source:'Synthetic pixels',usage:'Tests only',attribution:'Test',reviewedBy:'Test'},review:{by:'Test',evidence:'Fixture'},files:{original:file,thumbnail:file}};
 const manifest={schemaVersion:1,ruleset:'5e-2014',entries:[item]};
 return {base,item,manifest,entry,source,options:{base,entries:[entry]},create(options={}){return createArtLibrary(manifest,{...this.options,...options});}};
}
test('only accepted common art enters a path-free index; registry errors fail closed',t=>{
 const f=fixture(t);for(const status of ['pilot','draft','placeholder']){f.item.status=status;const lib=f.create();assert.deepEqual(lib.index().entries,[]);assert.equal(lib.read('/assets/art/sample.png'),null);}
 f.item.status='accepted';const lib=f.create();const index=lib.index();assert.equal(index.entries[0].id,f.entry.id);assert.doesNotMatch(JSON.stringify(index),/assets\/|Synthetic pixels|reviewedBy/);
 index.entries[0].files.thumbnail.url='mutated';assert.notEqual(lib.index().entries[0].files.thumbnail.url,'mutated');
 f.item.contentSha256='0'.repeat(64);assert.throws(()=>f.create(),/Stale/);
});
test('delivery is lazy, bounded to roles, preserves aspect and returns byte ETags',t=>{
 const f=fixture(t),lib=f.create(),e=lib.index().entries[0];assert.equal(lib.stats().bytes,0);
 for(const [role,width,height] of [['thumbnail',96,48],['card',120,60]]){
  const result=lib.read(e.files[role].url),info=inspectPng(result.bytes);assert.equal(info.width,width);assert.equal(info.height,height);assert.equal(result.etag,'"'+info.sha256+'"');assert.equal(result.type,'image/png');
 }
 for(const path of ['/../secret','/art/common/unknown.png',e.files.card.url+'?x=1','/data/art-pilot-v1/fireball-v6.png'])assert.equal(lib.read(path),null);
 assert.equal(lib.stats().files,2);
});
test('cached bytes cannot be mutated by a caller; source and recipe URLs are stable',t=>{
 const f=fixture(t),lib=f.create(),url=lib.index().entries[0].files.thumbnail.url;
 const first=lib.read(url),original=Buffer.from(first.bytes);first.bytes.fill(0);assert.deepEqual(lib.read(url).bytes,original);
 assert.deepEqual(lib.index(),f.create().index());f.item.crop.x=0;assert.equal(lib.index().entries[0].crop.x,.5);
});
test('LRU has a strict byte budget and can be cleared; oversized files are not retained',t=>{
 const f=fixture(t),measure=f.create(),e=measure.index().entries[0];const a=measure.read(e.files.thumbnail.url).bytes.length,b=measure.read(e.files.card.url).bytes.length;
 const lib=f.create({maxCacheBytes:Math.max(a,b)});lib.read(e.files.thumbnail.url);lib.read(e.files.card.url);assert.equal(lib.stats().files,1);assert.ok(lib.stats().bytes<=Math.max(a,b));
 lib.read(e.files.thumbnail.url);assert.equal(lib.stats().files,1);lib.clear();assert.equal(lib.stats().bytes,0);
 const disabled=f.create({maxCacheBytes:0});assert.ok(disabled.read(e.files.card.url));assert.equal(disabled.stats().files,0);
 for(const maxCacheBytes of [-1,Infinity,1.5,65*1024*1024])assert.throws(()=>f.create({maxCacheBytes}),/options/);
});
test('changed source cannot be served under an old URL; a reviewed replacement changes URLs',t=>{
 const f=fixture(t),lib=f.create(),url=lib.index().entries[0].files.card.url;
 const bytes=png(90);writeFileSync(join(f.base,f.item.files.original.path),bytes);assert.equal(lib.read(url),null);
 const file={path:f.item.files.original.path,...inspectPng(bytes)};f.item.files={original:file,thumbnail:file};f.item.version++;
 const replacement=f.create();assert.notEqual(replacement.index().entries[0].files.card.url,url);assert.equal(replacement.read(url),null);
 rmSync(join(f.base,file.path));assert.equal(replacement.read(replacement.index().entries[0].files.card.url),null);
});
