import test from 'node:test';
import assert from 'node:assert/strict';
import {measureArt} from '../scripts/art-budget.mjs';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createArtLibrary} from '../server/art-library.mjs';
function fixture(){
 let reads=0;
 const files={thumbnail:{url:'/small',width:96,height:96},card:{url:'/large',width:384,height:384}};
 return {index:()=>({encoder:'test',recipe:'test',entries:['a','b'].map(id=>({id,files}))}),read:url=>{reads++;return {bytes:Buffer.alloc(url==='/small'?10:100)};},stats:()=>({reads})};
}
test('selected IDs and identical URLs are counted once; logical and transferred totals differ',()=>{
 const report=measureArt(fixture(),{ids:['b','a','a'],budgets:{thumbnail:10,card:100}});
 assert.equal(report.selectedCount,2);assert.equal(report.summary.card.totalBytes,200);
 assert.equal(report.uniqueFiles,2);assert.equal(report.uniqueBytes,110);
 assert.equal(report.serverCache.reads,2);assert.deepEqual(report.violations,[]);
 assert.deepEqual(report.entries.map(e=>e.id),['a','b']);
});
test('unknown art and unavailable delivery fail instead of reporting incomplete measurements',()=>{
 assert.throws(()=>measureArt(fixture(),{ids:['missing']}),/No accepted artwork/);
 const lib=fixture();lib.read=()=>null;assert.throws(()=>measureArt(lib),/Missing delivered art/);
});
test('exact boundary passes and one byte over reports the specific role and ID',()=>{
 const r=measureArt(fixture(),{ids:['a'],budgets:{thumbnail:9,card:100}});
 assert.deepEqual(r.violations,[{id:'a',role:'thumbnail',bytes:10,limit:9}]);
 assert.equal(r.summary.thumbnail.p95Bytes,10);
 assert.throws(()=>measureArt(fixture(),{budgets:{thumbnail:Infinity,card:100}}),/Invalid byte budget/);
});
test('empty selection is zero and duplicates in the index are rejected',()=>{
 const r=measureArt(fixture(),{ids:[]});assert.equal(r.uniqueBytes,0);assert.equal(r.summary.card.maxBytes,0);
 const lib=fixture(),index=lib.index();index.entries[1].id='a';lib.index=()=>index;
 assert.throws(()=>measureArt(lib),/Duplicate art ID/);
});
test('actual accepted library is measurable without changing the cache budget or manifest',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../catalog/art-manifest.json',import.meta.url)));
 const before=JSON.stringify(manifest),base=fileURLToPath(new URL('../',import.meta.url));
 const report=measureArt(createArtLibrary(manifest,{base,maxCacheBytes:32768}));
 assert.equal(report.selectedCount,manifest.entries.filter(e=>e.status==='accepted').length);
 assert.ok(report.serverCache.bytes<=32768);assert.equal(JSON.stringify(manifest),before);
 assert.deepEqual(report.violations,[]);
 assert.ok(report.uniqueBytes>report.serverCache.bytes);
});
