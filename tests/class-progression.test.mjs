import test from 'node:test';
import assert from 'node:assert/strict';
import {classList,classProgression,previewClassLevel,resizeManagedResource} from '../server/class-progression.mjs';
const preview=(classId,fromLevel,extra={})=>previewClassLevel({classId,fromLevel,toLevel:fromLevel+1,constitution:14,...extra});
test('12 base classes and all 240 table rows are complete and returned defensively',()=>{
 assert.equal(classList().length,12);
 for(const c of classList())for(let level=1;level<=20;level++){
  const row=classProgression(c.slug,level).progression;assert.equal(row.level,level);assert.equal(row.proficiency,2+Math.floor((level-1)/4));
  row.featuresEn.push('mutated');assert.ok(!classProgression(c.slug,level).progression.featuresEn.includes('mutated'));
 }
 assert.throws(()=>classProgression('artificer',1),/не поддерживается/);
});
test('full, half and pact casting remain distinct at important transitions',()=>{
 assert.deepEqual(classProgression('wizard',5).progression.spellSlots,[4,3,2,0,0,0,0,0,0]);
 assert.deepEqual(classProgression('paladin',1).progression.spellSlots,[0,0,0,0,0]);
 assert.deepEqual(classProgression('ranger',5).progression.spellSlots,[4,2,0,0,0]);
 const w=classProgression('warlock',11).progression;assert.equal(w.pactSlots,3);assert.equal(w.pactSlotLevel,5);assert.equal(w.spellSlots,undefined);
 assert.ok(preview('warlock',10).choices.some(c=>c.kind==='mystic-arcanum'));
});
test('fighter and rogue additional ASIs use class levels, not generic four-level intervals',()=>{
 for(const [id,levels] of [['fighter',[4,6,8,12,14,16,19]],['rogue',[4,8,10,12,16,19]],['bard',[4,8,12,16,19]]]){
  assert.deepEqual(Array.from({length:19},(_,i)=>i+1).filter(n=>preview(id,n).choices.some(c=>c.kind==='ability-score-improvement-or-feat')).map(n=>n+1),levels);
 }
});
test('magical secrets are not offered again as ordinary known spells',()=>{
 const p=preview('bard',9);assert.equal(p.choices.find(c=>c.kind==='magical-secrets').count,2);assert.ok(!p.choices.some(c=>c.kind==='known-spells'));
 assert.equal(preview('sorcerer',2).choices.find(c=>c.kind==='metamagic').count,2);
 assert.equal(preview('sorcerer',9).choices.find(c=>c.kind==='metamagic').count,1);
});
test('HP minimum, actual roll, and retroactive Constitution changes are separate',()=>{
 assert.equal(preview('wizard',4,{constitution:1}).hitPoints.fromLevel,1);
 assert.equal(preview('fighter',3,{constitution:16,previousConstitution:14}).hitPoints.maximumDelta,12);
 const rolled=preview('fighter',3,{hpMethod:'roll',hpRoll:10});assert.equal(rolled.hitPoints.maximumDelta,12);
 assert.throws(()=>preview('wizard',4,{hpMethod:'roll',hpRoll:7}));
 assert.throws(()=>preview('wizard',4,{hpRoll:4}));
 assert.throws(()=>preview('wizard',4,{toLevel:7}));
});
test('resource resize preserves spent uses and leaves manual object unchanged',()=>{
 const r={id:'managed-slot-1',max:3,current:1};assert.deepEqual(resizeManagedResource(r,4),{id:r.id,max:4,current:2});assert.equal(r.max,3);
 assert.equal(resizeManagedResource(r,1).current,0);assert.throws(()=>resizeManagedResource({...r,current:4},5));
});
test('subclass milestones differ and all derived plans are explicitly previews',()=>{
 assert.ok(preview('wizard',1).choices.some(c=>c.kind==='subclass'));
 assert.ok(preview('fighter',2).choices.some(c=>c.kind==='subclass'));
 assert.ok(!preview('cleric',1).choices.some(c=>c.kind==='subclass'));
 assert.ok(preview('fighter',1).requiresFeatureReview.includes('Action Surge (one use)'));
 assert.equal(classProgression('barbarian',20).progression.rages,null);
});

import {spellChoiceOptions,validateSpellChoice} from '../server/class-progression.mjs';
const spell=id=>'srd51:2014:spell:'+id;
test('spell selection filters actual SRD membership, level, known spells and cantrips',()=>{
 const ranger=spellChoiceOptions('ranger',2,'known-spells');assert.ok(ranger.some(s=>s.spellId===spell('hunters-mark')));assert.ok(!ranger.some(s=>s.spellId===spell('fireball')));
 assert.ok(ranger.every(s=>s.level===1));
 const wizard=spellChoiceOptions('wizard',5,'spellbook-spells',{knownIds:[spell('fireball')]});assert.ok(wizard.every(s=>s.level>0&&s.level<=3));assert.ok(!wizard.some(s=>s.spellId===spell('fireball')));
 assert.ok(spellChoiceOptions('cleric',4,'cantrips').every(s=>s.level===0));
});
test('magical secrets allow other classes; arcanum cannot use ordinary pact level',()=>{
 assert.ok(spellChoiceOptions('bard',10,'magical-secrets').some(s=>s.spellId===spell('fireball')));
 assert.ok(spellChoiceOptions('bard',10,'magical-secrets').some(s=>s.level===0));
 const arcanum=spellChoiceOptions('warlock',11,'mystic-arcanum');assert.ok(arcanum.length);assert.ok(arcanum.every(s=>s.level===6));
 assert.deepEqual(spellChoiceOptions('warlock',12,'mystic-arcanum'),[]);
});
test('tampered choice counts, duplicates, high-level and already-known selections are rejected',()=>{
 const plan=preview('wizard',4),choice=plan.choices.find(c=>c.kind==='spellbook-spells');
 assert.deepEqual(validateSpellChoice(plan,choice.id,[spell('fireball'),spell('fly')]),[spell('fireball'),spell('fly')]);
 assert.throws(()=>validateSpellChoice(plan,choice.id,[spell('wish'),spell('fly')]));
 assert.throws(()=>validateSpellChoice(plan,choice.id,[spell('fly'),spell('fly')]));
 assert.throws(()=>validateSpellChoice(plan,choice.id,[spell('fireball'),spell('fly')],{knownIds:[spell('fly')]}));
 const forged=structuredClone(plan);forged.choices.find(c=>c.id===choice.id).count=1;
 assert.throws(()=>validateSpellChoice(forged,choice.id,[spell('fly')]));
 assert.throws(()=>spellChoiceOptions('wizard',5,'spellbook-spells',{knownIds:['unknown']}));
});

import {classResourceMaximums} from '../server/class-progression.mjs';
const abilities={str:10,dex:14,con:14,int:16,wis:12,cha:8};
test('base class resource maxima and recovery transitions are explicit, including unlimited',()=>{
 const resources=(id,level)=>classResourceMaximums(id,level,abilities);
 const pick=(id,level,key)=>resources(id,level).find(r=>r.id==='class-'+id+'-'+key);
 assert.equal(pick('bard',4,'inspiration').max,1);assert.equal(pick('bard',4,'inspiration').recovery,'long-rest');assert.equal(pick('bard',5,'inspiration').recovery,'short-rest');
 assert.equal(pick('fighter',17,'action-surge').max,2);assert.equal(pick('fighter',17,'indomitable').max,3);
 assert.equal(pick('monk',2,'ki').max,2);assert.equal(pick('paladin',5,'lay-on-hands').max,25);
 assert.equal(pick('druid',20,'wild-shape').max,null);assert.equal(pick('barbarian',20,'rage').max,null);
 assert.equal(pick('warlock',17,'pact-slots').max,4);assert.equal(resources('warlock',17).filter(r=>r.id.includes('arcanum')).length,4);assert.ok(!resources('warlock',17).some(r=>r.id.includes('-slot-')));
 assert.throws(()=>classResourceMaximums('bard',1,{cha:18}));
});

import {applyAbilityScoreChoice} from '../server/class-progression.mjs';
test('ASI applies exactly two points at an eligible level without overwriting the input',()=>{
 const increments={str:0,dex:0,con:1,int:1,wis:0,cha:0},before={...abilities,con:15};
 const after=applyAbilityScoreChoice(preview('wizard',3),before,increments);assert.equal(after.con,16);assert.equal(after.int,17);assert.equal(before.con,15);
 assert.throws(()=>applyAbilityScoreChoice(preview('wizard',2),before,increments));
 assert.throws(()=>applyAbilityScoreChoice(preview('wizard',3),before,{...increments,int:2}));
 assert.throws(()=>applyAbilityScoreChoice(preview('wizard',3),{...before,int:20},increments));
 assert.throws(()=>applyAbilityScoreChoice(preview('wizard',3),before,{...increments,extra:0}));
 assert.equal(preview('ranger',1).choices.some(c=>c.kind==='replace-known-spell'),false);
});

import {preparedSpellLimit} from '../server/class-progression.mjs';
test('prepared counts use class rules and never treat pact/known spells as prepared',()=>{
 assert.equal(preparedSpellLimit('wizard',5,16),8);assert.equal(preparedSpellLimit('cleric',1,8),1);
 assert.equal(preparedSpellLimit('paladin',1,16),null);assert.equal(preparedSpellLimit('paladin',5,16),5);
 assert.equal(preparedSpellLimit('warlock',10,18),null);
 assert.equal(classResourceMaximums('rogue',20,abilities)[0].max,1);
 assert.ok(classResourceMaximums('warlock',20,abilities).some(r=>r.id==='class-warlock-eldritch-master'&&r.max===1));
});

import {readFileSync} from 'node:fs';
import {bundledCatalog} from '../server/bundled-catalog.mjs';
test('class spell lists keep existing stable IDs and cannot drift from catalog levels',()=>{
 const lists=JSON.parse(readFileSync(new URL('../catalog/srd51-class-spells.json',import.meta.url),'utf8'));
 const cards=new Map(bundledCatalog().bundle.entries.filter(e=>e.kind==='spell').map(e=>[e.id,e]));
 const covered=new Set();let links=0;
 assert.equal(lists.ruleset,'5e-2014');assert.equal(Object.keys(lists.classes).length,8);
 for(const entries of Object.values(lists.classes)){
  assert.equal(new Set(entries.map(e=>e.spellId)).size,entries.length);
  for(const e of entries){const card=cards.get(e.spellId);assert.ok(card,e.spellId);assert.equal(e.level,card.spell.level);assert.equal(card.ruleset,lists.ruleset);assert.ok(e.sourcePage>=105&&e.sourcePage<=113);covered.add(e.spellId);links++;}
 }
 assert.equal(links,778);assert.deepEqual(covered,new Set(cards.keys()));
});
