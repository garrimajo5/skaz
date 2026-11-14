import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {classFeatureDetails} from '../server/class-features.mjs';
import {classProgression,previewClassLevel} from '../server/class-progression.mjs';
import {bundledCatalog} from '../server/bundled-catalog.mjs';
const data=JSON.parse(readFileSync(new URL('../catalog/srd51-subclass-reference.json',import.meta.url),'utf8'));
const base=JSON.parse(readFileSync(new URL('../catalog/srd51-class-features.json',import.meta.url),'utf8'));
const get=id=>data.subclasses.find(s=>s.id===id);
test('twelve SRD subclass references have unique class-bound parents and licensed level-specific features',()=>{
 assert.equal(data.schemaVersion,1);assert.equal(data.ruleset,'5e-2014');assert.equal(data.source.sha256,base.source.sha256);assert.equal(data.source.attribution,base.source.attribution);assert.equal(data.source.usage,'cc-by-4.0');
 assert.equal(data.subclasses.length,12);assert.equal(new Set(data.subclasses.map(s=>s.classId)).size,12);const ids=new Set();
 for(const s of data.subclasses){assert.equal(s.status,'reference-only');assert.ok(!ids.has(s.id));ids.add(s.id);const parent=base.features.find(f=>f.id===s.parentId);assert.equal(parent.classId,s.classId);assert.equal(parent.status,'unsupported');assert.ok(s.features.length>=4);const keys=new Set();
  for(const f of s.features){assert.ok(!keys.has(f.key));keys.add(f.key);assert.ok(Number.isInteger(f.level)&&f.level>=classProgression(s.classId,1).subclassLevel&&f.level<=20);assert.ok(Number.isInteger(f.sourcePage)&&f.sourcePage>=s.sourcePage&&f.sourcePage<=s.sourcePage+2);assert.ok(f.text.length>60);}
 }
 assert.equal(data.subclasses.reduce((n,s)=>n+s.features.length,0),58);
});
test('all 86 subclass spell references resolve to exact current names and retain preparation semantics',()=>{
 const spells=new Map(bundledCatalog().bundle.entries.filter(e=>e.kind==='spell').map(e=>[e.id,e]));let links=0,tables=0;
 for(const s of data.subclasses)for(const t of s.spellTables||[]){tables++;assert.ok(['always-prepared','expanded-list'].includes(t.mode));assert.equal(t.levelKind,t.mode==='expanded-list'?'spell':'class');let previous=0;
  for(const r of t.rows){assert.ok(r.level>previous);previous=r.level;assert.equal(r.spellIds.length,2);assert.equal(new Set(r.spellIds).size,2);for(const id of r.spellIds){links++;assert.ok(spells.has(id),id);assert.deepEqual(data.spellNames[id],spells.get(id).name);}}
 }
 assert.equal(tables,10);assert.equal(links,86);assert.equal(Object.keys(data.spellNames).length,67);
 assert.equal(get('druid-land').spellTables.length,7);assert.deepEqual(get('druid-land').spellTables.map(t=>t.name),['Арктика','Побережье','Пустыня','Лес','Луг','Горы','Болото']);
 assert.equal(get('warlock-fiend').spellTables[0].mode,'expanded-list');assert.deepEqual(get('paladin-devotion').spellTables[0].rows.map(r=>r.level),[3,5,9,13,17]);
});
test('reference reads are isolated, include source and never become required choice IDs',()=>{
 for(const s of data.subclasses){const parent=base.features.find(f=>f.id===s.parentId),detail=classFeatureDetails(s.classId,[parent.keys[0]])[0],ref=detail.referenceOptions.find(o=>o.key===s.id);
  assert.equal(detail.status,'unsupported');assert.equal(ref.source.sha256,data.source.sha256);assert.match(ref.text,/будущие уровни/);assert.equal(ref.referenceOptions.length,s.features.length+(s.spellTables||[]).length);
  ref.referenceOptions[0].text='corrupt';assert.notEqual(classFeatureDetails(s.classId,[parent.keys[0]])[0].referenceOptions[0].referenceOptions[0].text,'corrupt');
  const level=classProgression(s.classId,1).subclassLevel;if(level>1){const plan=previewClassLevel({classId:s.classId,fromLevel:level-1,toLevel:level,constitution:14});assert.ok(plan.choices.some(c=>c.kind==='subclass'&&c.required));assert.ok(!plan.requiresFeatureReview.includes(s.features[0].key));}
 }
 const fiend=classFeatureDetails('warlock',['Otherworldly Patron'])[0].referenceOptions[0];assert.match(fiend.referenceOptions.at(-1).text,/не становятся известными/);
});
test('important 2014 exceptions remain explicit in subclass summaries',()=>{
 const feature=(id,key)=>get(id).features.find(f=>f.key===key).text;
 assert.match(feature('fighter-champion','Survivor'),/При 0 хитов/);
 assert.match(feature('barbarian-berserker','Frenzy'),/следующего хода/);assert.match(feature('barbarian-berserker','Frenzy'),/истощения/);
 assert.match(feature('rogue-thief','Thief’s Reflexes'),/врасплох/);
 assert.match(feature('wizard-evocation','Overchannel'),/1–5 круга/);assert.match(feature('wizard-evocation','Overchannel'),/игнорирует сопротивление и иммунитет/);
 assert.match(feature('warlock-fiend','Fiendish Resilience'),/серебряным/);
 assert.match(feature('cleric-life','Channel Divinity: Preserve Life'),/Нежить и конструкты/);
 assert.match(feature('sorcerer-draconic','Draconic Resilience'),/вручную/);
});
