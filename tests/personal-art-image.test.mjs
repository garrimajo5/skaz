import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateSync} from 'node:zlib';
import {normalizePersonalArt,personalArtLimits} from '../server/personal-art-image.mjs';
import {decodeSource} from '../scripts/art-derivatives.mjs';
import {crc32} from '../scripts/art-registry.mjs';
const signature=Buffer.from([137,80,78,71,13,10,26,10]);
function chunk(t,d){const b=Buffer.alloc(d.length+12);b.writeUInt32BE(d.length);b.write(t,4);d.copy(b,8);b.writeUInt32BE(crc32(b.subarray(4,-4)),b.length-4);return b;}
function png(width=3,height=2,{alpha=true,extra=[],pixels}={}){
 const channels=alpha?4:3,h=Buffer.alloc(13);h.writeUInt32BE(width);h.writeUInt32BE(height,4);h[8]=8;h[9]=alpha?6:2;
 const raw=Buffer.alloc((width*channels+1)*height);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)Buffer.from(pixels?.(x,y)??[x*70,y*90,25,...(alpha?[255]:[])]).copy(raw,y*(width*channels+1)+1+x*channels);
 return Buffer.concat([signature,chunk('IHDR',h),...extra,chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
test('personal crop preserves the chosen pixels and RGB becomes opaque RGBA',()=>{
 const result=normalizePersonalArt(png(3,2,{alpha:false}),{x:1,y:0,size:2});
 assert.deepEqual([...decodeSource(result.files.master.bytes).pixels],[70,0,25,255,140,0,25,255,70,90,25,255,140,90,25,255]);
 assert.deepEqual(result.crop,{x:1,y:0,size:2});assert.equal(result.files.thumbnail.width,2);
});
test('default crop is centered and deterministic; callers cannot mutate input through result',()=>{
 const input=png(6,2),copy=Buffer.from(input),a=normalizePersonalArt(input),b=normalizePersonalArt(input);
 assert.deepEqual(a.crop,{x:2,y:0,size:2});assert.deepEqual(a,b);assert.deepEqual(input,copy);
 a.files.master.bytes[0]=0;assert.deepEqual(input,copy);assert.notDeepEqual(a.files.master.bytes,b.files.master.bytes);
});
test('crop rejects fractional, missing, excess and out-of-bounds coordinates',()=>{
 for(const crop of [{x:0,y:0,size:0},{x:-1,y:0,size:1},{x:0,y:0,size:3},{x:2,y:0,size:2},{x:0,y:.5,size:1},{x:NaN,y:0,size:1},{x:0,y:0},{x:0,y:0,size:1,url:'x'},[]])assert.throws(()=>normalizePersonalArt(png(),crop),/crop/);
});
test('normalization strips ancillary chunks and transparent RGB without modifying source',()=>{
 const gamma=Buffer.alloc(4);gamma.writeUInt32BE(45455);const phys=Buffer.alloc(9);phys.writeUInt32BE(2835);phys.writeUInt32BE(2835,4);phys[8]=1;
 const input=png(1,1,{extra:[chunk('gAMA',gamma),chunk('pHYs',phys)],pixels:()=>[200,80,99,0]});
 const out=normalizePersonalArt(input).files.master.bytes;
 assert.equal(out.includes(Buffer.from('gAMA')),false);assert.equal(out.includes(Buffer.from('pHYs')),false);
 assert.deepEqual([...decodeSource(out).pixels],[0,0,0,0]);assert.ok(input.includes(Buffer.from('gAMA')));
});
test('untrusted image input rejects active formats, metadata, corruption and oversized declarations',()=>{
 for(const bytes of [Buffer.from('<svg onload="alert(1)"/>'),Buffer.alloc(personalArtLimits.inputBytes+1),png(1,1,{extra:[chunk('tEXt',Buffer.from('secret'))]}),png(1,1,{extra:[chunk('acTL',Buffer.alloc(8))]})])assert.throws(()=>normalizePersonalArt(bytes));
 const bad=png();bad[bad.length-1]^=1;assert.throws(()=>normalizePersonalArt(bad),/checksum/);
 const huge=png();huge.writeUInt32BE(2049,16);huge.writeUInt32BE(crc32(huge.subarray(12,29)),29);assert.throws(()=>normalizePersonalArt(huge),/2048/);
 assert.throws(()=>normalizePersonalArt(Buffer.concat([png(),Buffer.from('trailer')])),/trailing/);
 assert.throws(()=>normalizePersonalArt('not bytes'),/PNG/);
});
test('both output sizes are bounded and downsampling does not leak transparent colors',()=>{
 const result=normalizePersonalArt(png(600,600,{pixels:(x)=>x%2?[0,0,255,0]:[255,0,0,255]}));
 assert.equal(result.files.master.width,512);assert.equal(result.files.thumbnail.width,96);
 for(const f of Object.values(result.files)){assert.equal(f.width,f.height);const p=decodeSource(f.bytes).pixels;for(let i=0;i<p.length;i+=4){assert.equal(p[i],255);assert.equal(p[i+2],0);assert.ok(p[i+3]>0&&p[i+3]<255);}}
});
