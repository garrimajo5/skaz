import test from 'node:test';
import assert from 'node:assert/strict';
import {classList,classProgression} from '../server/class-progression.mjs';
import {subclassReferenceOptions,previewSubclassSpells} from '../server/class-subclass-spells.mjs';
const preview=(classId,subclassId,level,tableId=null)=>previewSubclassSpells({classId,subclassId,level,tableId});

test('subclass options retain class boundaries and never infer a selected subclass',()=>{
 for(const c of classList()){
  const min=classProgression(c.slug,1).subclassLevel,options=subclassReferenceOptions(c.slug,min);assert.equal(options.length,1);assert.equal(options[0].eligible,true);assert.equal(options[0].requiresExplicitConfirmation,true);
  if(min>1){assert.equal(subclassReferenceOptions(c.slug,min-1)[0].eligible,false);assert.throws(()=>preview(c.slug,options[0].id,min-1));}
 }
 assert.throws(()=>preview('wizard','fighter-champion',3));assert.throws(()=>subclassReferenceOptions('artificer',1));assert.throws(()=>subclassReferenceOptions('fighter',21));
 const noSpells=preview('fighter','fighter-champion',20);assert.deepEqual(noSpells.alwaysPrepared,[]);assert.deepEqual(noSpells.expandedChoices,[]);assert.equal(noSpells.applied,false);
});

test('Fiend expands choices by pact spell circle without learning or preparing them automatically',()=>{
 for(const [level,count]of [[1,2],[2,2],[3,4],[5,6],[7,8],[9,10],[20,10]]){
  const p=preview('warlock','warlock-fiend',level);assert.equal(p.expandedChoices.length,count);assert.equal(p.alwaysPrepared.length,0);assert.equal(p.applied,false);
 }
 assert.throws(()=>preview('warlock','warlock-fiend',3,'fiend-expanded-spells'));
});

test('Life and Devotion use distinct class-level thresholds, not character level or spell circle',()=>{
 for(const [level,count]of [[1,2],[2,2],[3,4],[5,6],[7,8],[9,10]])assert.equal(preview('cleric','cleric-life',level).alwaysPrepared.length,count);
 for(const [level,count]of [[3,2],[4,2],[5,4],[8,4],[9,6],[13,8],[17,10]]){
  const p=preview('paladin','paladin-devotion',level);assert.equal(p.alwaysPrepared.length,count);assert.equal(p.expandedChoices.length,0);
 }
});

test('Land requires one explicit terrain from third level and never merges seven spell lists',()=>{
 const before=preview('druid','druid-land',2);assert.equal(before.tableChoices.length,7);assert.equal(before.alwaysPrepared.length,0);
 assert.throws(()=>preview('druid','druid-land',2,'arctic'));assert.throws(()=>preview('druid','druid-land',3));assert.throws(()=>preview('druid','druid-land',3,'unknown'));
 for(const choice of before.tableChoices){const at3=preview('druid','druid-land',3,choice.id),at9=preview('druid','druid-land',9,choice.id);assert.equal(at3.alwaysPrepared.length,2);assert.equal(at9.alwaysPrepared.length,8);assert.ok(at9.alwaysPrepared.every(s=>s.tableId===choice.id));}
 const first=preview('druid','druid-land',3,'arctic');first.alwaysPrepared[0].name.ru='corrupt';first.source.sha256='corrupt';assert.notEqual(preview('druid','druid-land',3,'arctic').alwaysPrepared[0].name.ru,'corrupt');assert.notEqual(preview('druid','druid-land',3,'arctic').source.sha256,'corrupt');
});
