import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../docs/design/fixtures/sheet-visual/',import.meta.url);
const manifest=JSON.parse(readFileSync(new URL('manifest.json',root),'utf8'));
const semantic=JSON.parse(readFileSync(new URL('../sheet-review-cases.json',root),'utf8'));
const assets=[...manifest.cases,...manifest.extraCases].flatMap(c=>c.assets).concat(manifest.qualityCase.asset);
test('visual samples map every semantic case without claiming an OCR benchmark',()=>{
 assert.equal(manifest.synthetic,true);assert.equal(manifest.status,'original-visual-design-samples-not-ocr-benchmark');
 assert.deepEqual(manifest.cases.map(c=>c.id),semantic.cases.map(c=>c.id));
 for(const c of manifest.cases)assert.deepEqual(c.expected,semantic.cases.find(x=>x.id===c.id).expected);
 assert(manifest.coverageLimits.length>=4);
});
test('each committed asset has verified bytes and digest with no undeclared visual files',()=>{
 assert.equal(new Set(assets.map(x=>x.file)).size,assets.length);
 for(const a of assets){assert.match(a.file,/^[a-z0-9-]+\.(png|jpg|pdf)$/);const b=readFileSync(new URL(a.file,root));assert.equal(b.length,a.bytes);assert.equal(createHash('sha256').update(b).digest('hex'),a.sha256);}
 assert.deepEqual(readdirSync(root).filter(x=>/\.(png|jpg|pdf)$/.test(x)).sort(),assets.map(x=>x.file).sort());
});
test('PNG regions stay within their actual page and preserve explicit blank fields',()=>{
 for(const c of [...manifest.cases,...manifest.extraCases]){for(const a of c.assets.filter(x=>x.kind==='png')){const b=readFileSync(new URL(a.file,root));assert.equal(b.subarray(1,4).toString(),'PNG');assert.equal(b.readUInt32BE(16),a.width);assert.equal(b.readUInt32BE(20),a.height);for(const r of c.regions.filter(r=>r.page===a.page)){const [x,y,w,h]=r.box;assert(x>=0&&y>=0&&w>0&&h>0&&x+w<=a.width&&y+h<=a.height);}}}
 for(const [id,field] of [['unknown-hp','hp.current'],['zero-charges','quantity']])assert.equal(manifest.cases.find(c=>c.id===id).regions.find(r=>r.field===field).blank,true);
});
test('rotation, poor quality, conflicts and edition rejection remain separate review cases',()=>{
 const rotated=assets.find(a=>a.kind==='jpeg-rotated');assert.equal(rotated.width,1754);assert.equal(rotated.height,1240);assert.equal(rotated.rotationToUprightClockwise,90);
 assert.equal(manifest.qualityCase.expectedValues,null);assert.equal(manifest.cases.find(c=>c.id==='conflicting-pages').assets.find(a=>a.kind==='text-pdf').pages,2);
 assert.equal(manifest.cases.find(c=>c.id==='unsupported-2024').expected.importAllowed,false);
 assert.equal(manifest.cases.find(c=>c.id==='same-name').context.expectedAction,'new-character-confirmation');
});

test('English two-column layout has explicit separate expected values',()=>{const c=manifest.extraCases.find(x=>x.id==='english-two-column');assert.equal(c.expected.name,'Lyra');assert.equal(c.expected.classes[0].name,'Bard');assert.equal(c.regions.length,14);assert.equal(new Set(c.regions.map(r=>r.box[0])).size,2);});

test('provenance points to the exact committed generator and semantic source',()=>{
 for(const [path,expected] of [['../scripts/build-sheet-visual-fixtures.py',manifest.generatorSha256],['../docs/design/fixtures/sheet-review-cases.json',manifest.semanticSourceSha256]]){
  assert.equal(createHash('sha256').update(readFileSync(new URL(path,import.meta.url))).digest('hex'),expected);
 }
});
