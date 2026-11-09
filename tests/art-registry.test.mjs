import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join,resolve,sep} from 'node:path';import {deflateSync} from 'node:zlib';
import {inventory,validate,inspectPng,crc32} from '../scripts/art-registry.mjs';
function chunk(type,data){const b=Buffer.alloc(data.length+12);b.writeUInt32BE(data.length);b.write(type,4);data.copy(b,8);b.writeUInt32BE(crc32(b.subarray(4,-4)),b.length-4);return b;}
function png({width=2,height=2,filter=0,trailing=false}={}){const h=Buffer.alloc(13);h.writeUInt32BE(width);h.writeUInt32BE(height,4);h[8]=8;h[9]=6;const raw=Buffer.alloc((width*4+1)*height);raw[0]=filter;
return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',h),chunk('IDAT',Buffer.concat([deflateSync(raw),...(trailing?[Buffer.from('extra')]:[])])),chunk('IEND',Buffer.alloc(0))]);}
function fixture(t){const base=mkdtempSync(join(tmpdir(),'skaz-art-'));t.after(()=>{assert.ok(resolve(base).startsWith(resolve(tmpdir())+sep));rmSync(base,{recursive:true,force:true});});mkdirSync(join(base,'assets/art'),{recursive:true});const bytes=png();writeFileSync(join(base,'assets/art/sample.png'),bytes);
const entries=inventory().slice(0,2),file={path:'assets/art/sample.png',...inspectPng(bytes)};
const item={id:entries[0].id,contentSha256:entries[0].contentSha256,status:'accepted',version:1,crop:{x:.5,y:.5},provenance:{method:'original',author:'Test fixture',source:'Procedural test pixels',usage:'Test only',attribution:'Test fixture',reviewedBy:'Test'},review:{by:'Test',evidence:'Synthetic test only'},files:{original:file,thumbnail:file}};
return {base,entries,item,manifest:{schemaVersion:1,ruleset:'5e-2014',entries:[item]}};}
test('inventory preserves every artwork identity, edition and source; generated report is reproducible',()=>{
const entries=inventory();assert.equal(entries.length,570);assert.deepEqual(Object.fromEntries(['spell','item','artifact','monster'].map(k=>[k,entries.filter(e=>e.kind===k).length])),{spell:319,item:49,artifact:1,monster:201});
assert.deepEqual(entries,JSON.parse(readFileSync(new URL('../catalog/art-inventory.json',import.meta.url))));
const m=JSON.parse(readFileSync(new URL('../catalog/art-manifest.json',import.meta.url))),r=validate(m);assert.deepEqual(r,JSON.parse(readFileSync(new URL('../catalog/art-coverage.json',import.meta.url))));assert.equal(r.complete,false);assert.equal(r.uncovered.length,570-m.entries.filter(e=>e.status==='accepted').length);
const e={...entries[0]};assert.throws(()=>inventory([e,e]),/Duplicate/);assert.throws(()=>inventory([{...e,ruleset:'5e-2024'}]),/edition/);
});
test('new catalog IDs are missing; pilot/draft/placeholder never count as accepted',t=>{
const f=fixture(t);for(const status of ['pilot','draft','placeholder']){f.item.status=status;const r=validate(f.manifest,f.entries,f.base);assert.equal(r.statuses[status].length,1);assert.equal(r.uncovered.length,2);assert.equal(r.missing.length,1);assert.equal(r.complete,false);assert.deepEqual(r.errors,[]);}
f.item.status='accepted';assert.equal(validate(f.manifest,f.entries.slice(0,1),f.base).complete,true);
});
test('stale snapshots, duplicate IDs and reused original artwork fail explicitly',t=>{
const f=fixture(t);f.manifest.entries.push(structuredClone(f.item));assert.match(validate(f.manifest,f.entries,f.base).errors[0].error,/Duplicate/);
f.manifest.entries[1].id=f.entries[1].id;f.manifest.entries[1].contentSha256=f.entries[1].contentSha256;assert.match(validate(f.manifest,f.entries,f.base).errors[0].error,/Identical/);
f.manifest.entries=[{...f.item,contentSha256:'0'.repeat(64)}];assert.match(validate(f.manifest,f.entries,f.base).errors[0].error,/Stale/);
});
test('unknown IDs and absent licensing or visual review cannot be accepted',t=>{
const f=fixture(t);for(const alter of [i=>i.id='unknown',i=>delete i.provenance.usage,i=>delete i.review.evidence,i=>i.crop.x=2,i=>i.version=0]){const item=structuredClone(f.item);alter(item);const r=validate({...f.manifest,entries:[item]},f.entries,f.base);assert.ok(r.errors.length);assert.equal(r.statuses.accepted.length,0);}
});
test('PNG validation catches corruption, truncation, unsafe sizes, invalid filters and trailing content',()=>{
const good=png();assert.equal(inspectPng(good).width,2);const broken=Buffer.from(good);broken[20]^=1;
for(const b of [broken,good.subarray(0,-1),Buffer.concat([good,Buffer.from('junk')]),png({filter:5}),png({trailing:true})])assert.throws(()=>inspectPng(b));
const h=Buffer.alloc(13);h.writeUInt32BE(9000);h.writeUInt32BE(9000,4);h[8]=8;h[9]=6;assert.throws(()=>inspectPng(Buffer.concat([good.subarray(0,8),chunk('IHDR',h)])),/2048/);
});
test('paths, checksums, dimensions, missing and extra files are checked independently',t=>{
const f=fixture(t);for(const alter of [i=>i.files.original.path='../secret.png',i=>i.files.original.path='assets/art/missing.png',i=>i.files.original.width=3,i=>i.files.original.sha256='a'.repeat(64)]){const item=structuredClone(f.item);alter(item);assert.ok(validate({...f.manifest,entries:[item]},f.entries,f.base).errors.length);}
writeFileSync(join(f.base,'assets/art/orphan.png'),png());assert.match(validate(f.manifest,f.entries,f.base).errors[0].error,/Unreferenced/);
});
