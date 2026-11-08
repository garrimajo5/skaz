import test from 'node:test';import assert from 'node:assert/strict';
import {deflateSync} from 'node:zlib';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {derivePng,decodeSource,preparePilot} from '../scripts/art-derivatives.mjs';
import {inspectPng,crc32,sha256} from '../scripts/art-registry.mjs';
const signature=Buffer.from([137,80,78,71,13,10,26,10]);
function chunk(t,d){const b=Buffer.alloc(d.length+12);b.writeUInt32BE(d.length);b.write(t,4);d.copy(b,8);b.writeUInt32BE(crc32(b.subarray(4,-4)),b.length-4);return b;}
function png({width=2,height=1,pixels=Buffer.from([255,0,0,255,0,0,255,0]),filter=0,metadata=false}={}){
 const h=Buffer.alloc(13);h.writeUInt32BE(width);h.writeUInt32BE(height,4);h[8]=8;h[9]=6;const stride=width*4,raw=Buffer.alloc((stride+1)*height);
 for(let y=0;y<height;y++){raw[y*(stride+1)]=filter;for(let x=0;x<stride;x++){const a=x>=4?pixels[y*stride+x-4]:0,b=y?pixels[(y-1)*stride+x]:0,c=y&&x>=4?pixels[(y-1)*stride+x-4]:0;const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c),predictor=[0,a,b,Math.floor((a+b)/2),pa<=pb&&pa<=pc?a:pb<=pc?b:c][filter];raw[y*(stride+1)+x+1]=(pixels[y*stride+x]-predictor)&255;}}
 return Buffer.concat([signature,chunk('IHDR',h),...(metadata?[chunk('caBX',Buffer.from('source provenance'))]:[]),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
test('all five PNG predictors decode exactly, including previous row boundaries',()=>{
 const pixels=Buffer.from(Array.from({length:3*2*4},(_,i)=>(i*71)%256));for(let filter=0;filter<5;filter++)assert.deepEqual(decodeSource(png({width:3,height:2,pixels,filter})).pixels,pixels);
});
test('area resize preserves alpha without blue halos and preserves aspect without upscaling',()=>{
 const out=derivePng(png(),1);assert.deepEqual([...decodeSource(out).pixels],[255,0,0,128]);assert.equal(inspectPng(out).width,1);
 const larger=inspectPng(derivePng(png(),96));assert.equal(larger.width,2);assert.equal(larger.height,1);
 assert.deepEqual(derivePng(png(),1),out);assert.throws(()=>derivePng(png(),0),/size/);
});
test('source provenance stays intact while delivery is strict; corruption and misplaced metadata fail',()=>{
 const src=png({metadata:true}),before=Buffer.from(src);assert.throws(()=>inspectPng(src),/caBX/);inspectPng(derivePng(src,1));assert.deepEqual(src,before);
 const broken=Buffer.from(src);broken[48]^=1;assert.throws(()=>derivePng(broken,1),/CRC/);
 assert.throws(()=>derivePng(Buffer.concat([png(),chunk('caBX',Buffer.from('late'))]),1),/order/);
 assert.throws(()=>derivePng(src.subarray(0,-3),1),/Truncated/);
});
test('declared color metadata survives re-encoding without source provenance payload',()=>{
 const src=png({metadata:true}),gamma=Buffer.alloc(4);gamma.writeUInt32BE(45455);
 const withGamma=Buffer.concat([src.subarray(0,33),chunk('gAMA',gamma),src.subarray(33)]);
 const output=derivePng(withGamma,1);assert.equal(inspectPng(output).width,1);
 assert.ok(output.includes(chunk('gAMA',gamma)));assert.equal(output.includes(Buffer.from('caBX')),false);
});
test('batch ties both files to source, repeats exactly and rejects changed originals and duplicate IDs',t=>{
 const base=mkdtempSync(join(tmpdir(),'skaz-derived-'));t.after(()=>rmSync(base,{recursive:true,force:true}));
 mkdirSync(join(base,'docs/design/pilot-v1'),{recursive:true});mkdirSync(join(base,'data/art-pilot-v1'),{recursive:true});
 const source=png({metadata:true}),entry={id:'srd51:2014:spell:fireball',path:'data/art-pilot-v1/fireball.png',sha256:sha256(source),contentSha256:'a'.repeat(64)};
 const metadata=join(base,'docs/design/pilot-v1/candidates.json');writeFileSync(metadata,JSON.stringify({entries:[entry]}));writeFileSync(join(base,entry.path),source);
 const first=preparePilot(base),second=preparePilot(base);assert.deepEqual(first,second);assert.equal(first.entries[0].status,'pilot');
 for(const f of Object.values(first.entries[0].files)){assert.equal(f.derivedFrom,entry.sha256);assert.equal(inspectPng(readFileSync(join(base,f.path))).sha256,f.sha256);}
 assert.deepEqual(readFileSync(join(base,entry.path)),source);
 writeFileSync(metadata,JSON.stringify({entries:[entry,entry]}));assert.throws(()=>preparePilot(base),/duplicate/);
 writeFileSync(metadata,JSON.stringify({entries:[{...entry,sha256:'b'.repeat(64)}]}));assert.throws(()=>preparePilot(base),/hash mismatch/);
});
