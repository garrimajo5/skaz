import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateSync} from 'node:zlib';
import {crc32} from '../scripts/art-registry.mjs';
import {perceptualHash,hashDistance,similarPairs,measureSimilarity} from '../scripts/art-similarity.mjs';
function chunk(type,data){const b=Buffer.alloc(data.length+12);b.writeUInt32BE(data.length);b.write(type,4);data.copy(b,8);b.writeUInt32BE(crc32(b.subarray(4,-4)),b.length-4);return b;}
function png({hidden=0,vertical=false,brightness=180}={}){
 const h=Buffer.alloc(13);h.writeUInt32BE(32);h.writeUInt32BE(32,4);h[8]=8;h[9]=6;
 const raw=Buffer.alloc(129*32);
 for(let y=0;y<32;y++)for(let x=0;x<32;x++){
  const i=y*129+1+x*4,inside=vertical?x>=10&&x<20&&y>3&&y<29:y>=10&&y<20&&x>3&&x<29;
  raw[i]=raw[i+1]=raw[i+2]=inside?brightness:hidden;raw[i+3]=inside?255:0;
 }
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',h),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
test('perceptual hash ignores transparent RGB and tolerates uniform subject brightness',()=>{
 for(const background of [0,255]){
  assert.equal(perceptualHash(png(),background),perceptualHash(png({hidden:255}),background));
  assert.equal(hashDistance(perceptualHash(png(),background),perceptualHash(png({brightness:160}),background)),0);
  assert.ok(hashDistance(perceptualHash(png(),background),perceptualHash(png({vertical:true}),background))>10);
 }
 assert.throws(()=>perceptualHash(png(),127),/background/);
 assert.throws(()=>perceptualHash(Buffer.from('<svg/>')),/PNG/);
});
test('distance counts all 63 bits and rejects malformed hashes',()=>{
 assert.equal(hashDistance('0000000000000000','7fffffffffffffff'),63);
 assert.equal(hashDistance('0000000000000001','0000000000000002'),2);
 for(const bad of ['','8000000000000000','ffffffffffffffff','zzzzzzzzzzzzzzzz'])assert.throws(()=>hashDistance(bad,'0000000000000000'),/hash/);
});
test('pair threshold requires both surfaces, deterministic order, unique IDs and no self-pairs',()=>{
 const entries=[{id:'b',dark:'0000000000000001',light:'0000000000000001'},{id:'a',dark:'0000000000000000',light:'0000000000000000'},{id:'c',dark:'0000000000000000',light:'7fffffffffffffff'}];
 assert.deepEqual(similarPairs(entries,1),[{ids:['a','b'],distance:{dark:1,light:1},review:'required'}]);
 assert.deepEqual(similarPairs([...entries].reverse(),1),similarPairs(entries,1));
 assert.deepEqual(similarPairs(entries,0),[]);
 assert.throws(()=>similarPairs([...entries,entries[0]]),/duplicate/);
 for(const n of [-1,64,1.5,NaN])assert.throws(()=>similarPairs(entries,n),/threshold/);
});
test('report reads delivered thumbnails and fails for missing bytes without silently skipping',()=>{
 const entry={id:'example',files:{thumbnail:{url:'/thumb.png'}}};let requested;
 const report=measureSimilarity({index:()=>({entries:[entry]}),read:url=>{requested=url;return {bytes:png()};}});
 assert.equal(requested,'/thumb.png');assert.equal(report.count,1);assert.deepEqual(report.pairs,[]);assert.match(report.purpose,/not duplicate/);
 assert.throws(()=>measureSimilarity({index:()=>({entries:[entry]}),read:()=>null}),/Missing art/);
});
