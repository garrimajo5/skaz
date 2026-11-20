import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const read=path=>JSON.parse(readFileSync(new URL('../'+path,import.meta.url),'utf8'));
const layout=read('docs/design/fixtures/official-sheet-layout-80.json');
const sample=read('docs/design/fixtures/official-sheet-sample-80.json');

test('public form witnesses pin their actual generator sources and do not claim acceptance',()=>{
 for(const evidence of [layout,sample]){
  assert.equal(evidence.accepted,false);assert.equal(evidence.complete,false);
  for(const [path,hash] of Object.entries(evidence.inputSha256)){
   const source=readFileSync(new URL('../'+path,import.meta.url),'utf8').replace(/\r\n/g,'\n');
   assert.equal(createHash('sha256').update(source).digest('hex'),hash,path);
  }
 }
 assert.equal(sample.source.sha256,layout.source.sha256);
 assert.equal(sample.synthetic,true);assert.equal(sample.artifact.redistributedInGit,false);
});

test('raster variants preserve PDF provenance and are alternatives, not six imported pages',()=>{
 assert.equal(sample.rasterPages.length,3);assert.deepEqual(sample.rasterPages.map(x=>x.page),[1,2,3]);
 for(const page of sample.rasterPages){assert.equal(page.derivedFromPdfSha256,sample.artifact.sha256);assert(page.width*page.height<=12000000);assert(page.bytes>0);}
 assert.deepEqual(sample.inputVariants.map(v=>v.pages),[3,3]);
 assert.equal(sample.inputVariants[0].files.length,1);assert.equal(sample.inputVariants[1].files.length,3);
 const bytes=sample.rasterPages.reduce((n,p)=>n+p.bytes,0);assert(bytes<10*1024*1024);assert(sample.artifact.bytes<10*1024*1024);
});

test('printed expended and derived remaining stay distinct and unconfirmed',()=>{
 const slots=sample.expectedInterpretation.slots;
 assert.equal(layout.slotLabelWitness.meaning,'spent-not-remaining');
 assert.equal(slots.printedRemaining,null);assert.equal(slots.chosenRemaining,null);
 assert.equal(slots.printedTotal-slots.printedExpended,slots.derivedRemainingCandidate);
 assert.equal(sample.expectedInterpretation.selectionStatus,'unreviewed');
 assert.equal(sample.expectedPdfValues[layout.slotLabelWitness.internalFieldName],String(slots.printedExpended));
 assert.equal(sample.expectedInterpretation.hp.current,null);assert.equal(sample.expectedInterpretation.hp.temp,0);
 assert.equal(sample.expectedInterpretation.printedTotalLevel,null);
});
