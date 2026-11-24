import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const read=path=>JSON.parse(readFileSync(new URL('../'+path,import.meta.url),'utf8'));
const layout=read('docs/design/fixtures/official-sheet-layout-80.json');
const sample=read('docs/design/fixtures/official-sheet-sample-80.json');
const alternate=read('docs/design/fixtures/official-sheet-alternative-sample-80.json');

test('public form witnesses pin their actual generator sources and do not claim acceptance',()=>{
 for(const evidence of [layout,sample,alternate]){
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


test('every selected sample value has its own bounded top-left raster region',()=>{
 assert.deepEqual(sample.regions.map(r=>r.fieldName).sort(),Object.keys(sample.expectedPdfValues).sort());
 for(const region of sample.regions){
  const image=sample.rasterPages.find(p=>p.page===region.page);
  const [x,y,w,h]=region.normalizedBox;assert(x>=0&&y>=0&&w>0&&h>0&&x+w<=image.width&&y+h<=image.height);
  assert.equal(region.blank,sample.expectedPdfValues[region.fieldName]==='');
 }
 const current=sample.regions.find(r=>r.fieldName==='HPCurrent'),temp=sample.regions.find(r=>r.fieldName==='HPTemp');
 assert.equal(current.blank,true);assert.equal(temp.blank,false);
 assert.notDeepEqual(current.normalizedBox,temp.normalizedBox);
});

test('alternate official sample pins a distinct layout and leaves blank maxHP separate from zero',()=>{
 assert.notEqual(alternate.source.sha256,sample.source.sha256);
 assert.equal(alternate.source.archiveMember,'Character Sheet - Alternative - Form Fillable.pdf');
 assert.match(alternate.source.archiveSha256,/^[a-f0-9]{64}$/);
 assert.equal(alternate.synthetic,true);
 assert.equal(alternate.artifact.redistributedInGit,false);
 assert.deepEqual([alternate.artifact.pages,alternate.artifact.canonicalNamedFields,alternate.artifact.widgets],[1,100,105]);
 assert.equal(alternate.expectedInterpretation.selectionStatus,'unreviewed');
 assert.deepEqual(alternate.expectedInterpretation.hp,{max:null,current:0,temp:0});
 assert.deepEqual(alternate.expectedInterpretation.dexterity,{score:14,printedModifier:2});
 assert.equal(alternate.expectedInterpretation.spellcastingPageIncluded,false);
 assert.deepEqual([alternate.expectedPdfValues.HPMax,alternate.expectedPdfValues.HPCurrent,alternate.expectedPdfValues.HPTemp],['','0','0']);
 assert.equal(alternate.expectedPdfValues['DEXmod '],'+2');
 const [page]=alternate.rasterPages;
 assert.equal(alternate.rasterPages.length,1);
 assert.equal(page.derivedFromPdfSha256,alternate.artifact.sha256);
 assert.deepEqual(alternate.inputVariants.map(v=>[v.kind,v.pages,v.files.length]),[['fillable-pdf',1,1],['png-pages',1,1]]);
 assert.deepEqual(alternate.regions.map(r=>r.fieldName).sort(),Object.keys(alternate.expectedPdfValues).sort());
 for(const region of alternate.regions){
  const [x,y,w,h]=region.normalizedBox;
  assert(x>=0&&y>=0&&w>0&&h>0&&x+w<=page.width&&y+h<=page.height);
  assert.equal(region.blank,alternate.expectedPdfValues[region.fieldName]==='');
 }
 assert.equal(new Set(alternate.regions.map(r=>r.normalizedBox.join(','))).size,alternate.regions.length);
});

test('the Russian print sheet keeps visible values and spell slots distinct from unknown',()=>{
 const ru=read('docs/design/fixtures/publisher-ru-sheet-sample-80.json');
 const get=fieldId=>ru.regions.find(r=>r.fieldId===fieldId);
 const generator=readFileSync(new URL('../'+ru.generator.file,import.meta.url),'utf8').replace(/\r\n/g,'\n');
 assert.equal(createHash('sha256').update(generator).digest('hex'),ru.generator.sha256);
 assert.deepEqual([ru.locale,ru.ruleset,ru.synthetic,ru.accepted],['ru','5e-2014',true,false]);
 assert.deepEqual([ru.source.fillable,ru.source.extractableText,ru.artifact.redistributedInGit],[false,false,false]);
 assert.notEqual(ru.source.sha256,layout.source.sha256);
 assert.deepEqual(ru.inputVariants.map(v=>[v.kind,v.pages,v.files.length]),[['non-fillable-pdf',3,1],['png-pages',3,3]]);
 assert.deepEqual(ru.rasterPages.map(p=>p.page),[1,2,3]);
 assert(ru.rasterPages.every(p=>p.derivedFromPdfSha256===ru.artifact.sha256));
 assert.equal(ru.regions.length,new Set(ru.regions.map(r=>r.fieldId)).size);
 for(const {page,pixelRect:[x,y,w,h]} of ru.regions){
  const image=ru.rasterPages.find(r=>r.page===page);
  assert(x>=0&&y>=0&&w>0&&h>0&&x+w<=image.width&&y+h<=image.height);
 }
 assert.deepEqual(['hp.max','hp.current','hp.temp'].map(id=>get(id).printed),[null,'0','0']);
 assert.deepEqual(ru.expectedInterpretation.hp,{max:null,current:0,temp:0});
 const {slots}=ru.expectedInterpretation;
 assert.deepEqual([get('spellcasting.slots.1.total').printed,get('spellcasting.slots.1.expended').printed],['4','1']);
 assert.equal(slots.printedLabel,'Потрачено ячеек');
 assert.equal(slots.printedTotal-slots.printedExpended,slots.derivedRemainingCandidate);
 assert.deepEqual([slots.printedRemaining,slots.chosenRemaining,slots.pactMagic],[null,null,null]);
});
