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
 assert.throws(()=>classFeatureReference('artificer',5));
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

test('bard cleric and druid cover every table key with correct source pages and no cross-class lookup',()=>{
 const pages={bard:[12,13],cleric:[16,17],druid:[19,20,21]};
 for(const [classId,allowed]of Object.entries(pages))for(let level=1;level<=20;level++){
  const keys=classProgression(classId,level).progression.featuresEn;
  const details=classFeatureDetails(classId,keys);
  assert.deepEqual(details.map(d=>d.key),keys);
  for(const d of details){assert.ok(d.id,classId+':'+d.key);assert.equal(d.classId,classId);assert.ok(allowed.includes(d.sourcePage));assert.ok(d.text.length>60);}
 }
 assert.equal(classFeatureDetails('cleric',['Wild Shape'])[0].status,'unsupported');
 assert.equal(classFeatureDetails('bard',['Divine Intervention'])[0].id,undefined);
});
test('new help does not relax mandatory subclass and expertise choices or duplicate improved references',()=>{
 for(const [classId,from,kinds]of [['bard',2,['subclass','expertise']],['druid',1,['subclass']]]){
  const p=previewClassLevel({classId,fromLevel:from,toLevel:from+1,constitution:14});
  for(const kind of kinds)assert.ok(p.choices.some(c=>c.kind===kind&&c.required));
  assert.ok(p.featureDetails.some(d=>d.status==='unsupported'));
 }
 const bard=classFeatureReference('bard',10);assert.equal(bard.filter(d=>d.id==='bard-inspiration').length,1);
 assert.equal(bard.find(d=>d.id==='bard-inspiration').key,'Bardic Inspiration (d10)');
 assert.ok(!classFeatureReference('cleric',9).some(d=>d.id==='cleric-divine-intervention'));
 assert.ok(!classFeatureReference('druid',17).some(d=>['druid-beast-spells','druid-archdruid'].includes(d.id)));
 const channel=previewClassLevel({classId:'cleric',fromLevel:17,toLevel:18,constitution:14});
 assert.deepEqual(channel.requiresFeatureReview,['Channel Divinity (3/rest)']);
 assert.equal(channel.featureDetails[0].id,'cleric-channel-divinity');
});

test('all twelve tables have help while unsupported class choices remain explicit',()=>{
 const pages={paladin:[30,31,32],ranger:[35,36,37],sorcerer:[43,44],warlock:[46,47,48]};
 for(const [classId,allowed] of Object.entries(pages))for(let level=1;level<=20;level++)for(const d of classFeatureDetails(classId,classProgression(classId,level).progression.featuresEn)){
  assert.ok(d.id,classId+':'+d.key);assert.ok(allowed.includes(d.sourcePage));assert.equal(d.classId,classId);
 }
 for(const [classId,from,kinds]of [['paladin',1,['fighting-style']],['ranger',5,['favored-enemy-and-language','favored-terrain']],['sorcerer',2,['metamagic']],['warlock',1,['invocations']],['warlock',2,['pact-boon']]]){
  const p=previewClassLevel({classId,fromLevel:from,toLevel:from+1,constitution:14});
  for(const kind of kinds)assert.ok(p.choices.some(c=>c.kind===kind&&c.required));
 }
 assert.equal(classFeatureDetails('ranger',['Land `s Stride'])[0].id,'ranger-lands-stride');
 const w=classFeatureReference('warlock',17);assert.equal(w.filter(f=>f.id==='warlock-arcanum').length,1);
 assert.equal(w.find(f=>f.id==='warlock-arcanum').key,'Mystic Arcanum (9th level)');
 assert.ok(!classFeatureReference('sorcerer',19).some(f=>f.id==='sorcerer-restoration'));
});

test('invocation reference disclosure stays read-only while explicit choices are supported',()=>{
 const f=classFeatureDetails('warlock',['Eldritch Invocations'])[0];
 assert.equal(f.status,'choice');assert.equal(f.referenceOptions.length,32);assert.match(f.text,/учитываются вручную/);
 assert.equal(new Set(f.referenceOptions.map(o=>o.key)).size,32);
 for(const o of f.referenceOptions){assert.ok([48,49,50].includes(o.sourcePage));assert.ok(o.name.includes(o.key));assert.ok(o.text.length>30);}
 f.referenceOptions[0].text='changed';assert.notEqual(classFeatureDetails('warlock',['Eldritch Invocations'])[0].referenceOptions[0].text,'changed');
 const plan=previewClassLevel({classId:'warlock',fromLevel:1,toLevel:2,constitution:14});
 assert.ok(plan.choices.some(c=>c.kind==='invocations'&&c.required));
});
