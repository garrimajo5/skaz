import test from 'node:test';
import assert from 'node:assert/strict';
import {classFeatureDetails} from '../server/class-features.mjs';
import {classProgression,previewClassLevel} from '../server/class-progression.mjs';
test('fighter table keys all have explanations while archetype remains explicitly unsupported',()=>{
 for(let level=1;level<=20;level++){
  const keys=classProgression('fighter',level).progression.featuresEn;
  const details=classFeatureDetails('fighter',keys);
  assert.deepEqual(details.map(d=>d.key),keys);
  for(const d of details){assert.ok(d.id);assert.ok(d.text.length>60);assert.equal(d.source.usage,'cc-by-4.0');assert.ok([24,25].includes(d.sourcePage));if(d.key.startsWith('Martial Archetype'))assert.equal(d.status,'unsupported');}
 }
});
test('description data is isolated and never claims unsupported classes have fighter rules',()=>{
 const first=classFeatureDetails('fighter',['Extra Attack'])[0];first.name='corrupt';first.source.usage='wrong';first.keys.push('fake');
 const second=classFeatureDetails('fighter',['Extra Attack'])[0];assert.equal(second.name,'Дополнительная атака');assert.equal(second.source.usage,'cc-by-4.0');assert.ok(!second.keys.includes('fake'));
 assert.equal(classFeatureDetails('wizard',['Extra Attack'])[0].status,'unsupported');
});
test('level-specific preview preserves receipt keys and separates explanatory text',()=>{
 for(const [from,keys] of [[4,['Extra Attack']],[10,['Extra Attack (2)']],[16,['Action Surge (two uses)','Indomitable (three uses)']],[19,['Extra Attack (3)']]]){
  const p=previewClassLevel({classId:'fighter',fromLevel:from,toLevel:from+1,constitution:14});
  assert.deepEqual(p.requiresFeatureReview,keys);assert.deepEqual(p.featureDetails.map(d=>d.key),keys);
  assert.equal(p.hitPoints.maximumDelta,8);
 }
});

test('barbarian and rogue tables have class-specific help without promising subclass automation',()=>{
 for(const classId of ['barbarian','rogue'])for(let level=1;level<=20;level++){
  const keys=classProgression(classId,level).progression.featuresEn;
  const details=classFeatureDetails(classId,keys);
  for(const d of details){assert.ok(d.id, classId+': '+d.key);assert.equal(d.classId,classId);assert.ok(d.sourcePage>0);assert.equal(d.source.usage,'cc-by-4.0');}
 }
 const barbarian=classFeatureDetails('barbarian',['Extra Attack'])[0];
 assert.notEqual(barbarian.id,classFeatureDetails('fighter',['Extra Attack'])[0].id);
 assert.ok(!barbarian.text.includes('четыре'));
 for(const key of ['Primal Path','Path feature','Primal Champion'])assert.equal(classFeatureDetails('barbarian',[key])[0].status,'unsupported');
 for(const key of ['Expertise','Roguish Archetype','Roguish Archetype feature'])assert.equal(classFeatureDetails('rogue',[key])[0].status,'unsupported');
});
import {readFileSync} from 'node:fs';
test('feature catalog has unique stable IDs and class keys, licensed sources and no invented table entries',()=>{
 const d=JSON.parse(readFileSync(new URL('../catalog/srd51-class-features.json',import.meta.url),'utf8'));
 const ids=new Set(),keys=new Set();
 for(const f of d.features){
  assert.ok(!ids.has(f.id),f.id);ids.add(f.id);
  assert.match(f.id,new RegExp('^'+f.classId+'-'));
  assert.ok(['manual','choice','unsupported'].includes(f.status));
  const tableKeys=new Set(Array.from({length:20},(_,i)=>classProgression(f.classId,i+1).progression.featuresEn).flat());
  for(const key of f.keys){const scoped=f.classId+':'+key;assert.ok(!keys.has(scoped),scoped);keys.add(scoped);assert.ok(tableKeys.has(key),scoped);}
 }
 for(let level=1;level<=20;level++)for(const detail of classFeatureDetails('monk',classProgression('monk',level).progression.featuresEn))assert.ok(detail.id,detail.key);
 assert.equal(classFeatureDetails('monk',['Monastic Tradition'])[0].status,'unsupported');
 assert.equal(classFeatureDetails('monk',['Monastic Tradition feature'])[0].status,'unsupported');
});

import {classFeatureReference} from '../server/class-progression.mjs';
test('prior reference excludes future features and collapses repeated improvements by stable ID',()=>{
 const four=classFeatureReference('fighter',4);assert.ok(four.some(f=>f.key==='Second Wind'));assert.ok(!four.some(f=>f.id==='fighter-extra-attack'));
 const eleven=classFeatureReference('fighter',11);const attacks=eleven.filter(f=>f.id==='fighter-extra-attack');assert.equal(attacks.length,1);assert.equal(attacks[0].key,'Extra Attack (2)');
 assert.equal(eleven.filter(f=>f.id==='fighter-ability-score-improvement').length,1);
 eleven[0].name='changed';assert.notEqual(classFeatureReference('fighter',11)[0].name,'changed');
 assert.deepEqual(classFeatureReference('bard',5),[]);
 assert.throws(()=>classFeatureReference('fighter',0));assert.throws(()=>classFeatureReference('unknown',5));
});

test('wizard summaries cover table keys and preserve blocked high-level spell choices',()=>{
 for(let level=1;level<=20;level++)for(const d of classFeatureDetails('wizard',classProgression('wizard',level).progression.featuresEn))assert.ok(d.id,d.key);
 assert.equal(classFeatureDetails('wizard',['Signature Spell'])[0].id,'wizard-signature-spells');
 for(const [from,kind]of [[17,'spell-mastery'],[19,'signature-spells']]){
  const p=previewClassLevel({classId:'wizard',fromLevel:from,toLevel:from+1,constitution:14});assert.ok(p.choices.some(c=>c.kind===kind&&c.required));
  assert.ok(p.featureDetails.some(d=>d.status==='unsupported'));
 }
});
