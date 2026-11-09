import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const context=vm.createContext({Uint8Array,DataView});
vm.runInContext(readFileSync(new URL('../client/personal-art-preview.js',import.meta.url),'utf8')+';globalThis.preview=SkazPersonalArtPreview;',context);
const {crop,dimensions}=context.preview;
test('crop remains integer and inside portrait, landscape and one-pixel PNG at all controls',()=>{
 for(const [w,h] of [[2048,1],[1,2048],[301,700],[700,301],[2048,2048]])for(const zoom of [100,101,199,400])for(const x of [0,49,50,100])for(const y of [0,50,100]){
  const c=crop(w,h,zoom,x,y);assert.ok(Object.values(c).every(Number.isSafeInteger));assert.ok(c.x>=0&&c.y>=0&&c.size>=1&&c.x+c.size<=w&&c.y+c.size<=h);
 }
 assert.equal(JSON.stringify(crop(700,301)),JSON.stringify({x:200,y:0,size:301}));
 for(const args of [[0,30],[Infinity,30],[20,20,99],[20,20,401],[20,20,100,101],[20,20,100,50,NaN]])assert.throws(()=>crop(...args));
});
test('preview rejects decompression dimensions and unsupported header before browser decode',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../catalog/art-manifest.json',import.meta.url))),file=readFileSync(new URL('../'+manifest.entries[0].files.thumbnail.path,import.meta.url));
 const buffer=()=>file.buffer.slice(file.byteOffset,file.byteOffset+file.byteLength);
 assert.equal(dimensions(buffer()).width,96);
 for(const [offset,value] of [[0,0],[24,16],[25,3],[28,1]]){const b=buffer();new Uint8Array(b)[offset]=value;assert.throws(()=>dimensions(b));}
 const huge=buffer();new DataView(huge).setUint32(16,999999);assert.throws(()=>dimensions(huge));
 assert.throws(()=>dimensions(new ArrayBuffer(4*1024*1024+1)));
});
