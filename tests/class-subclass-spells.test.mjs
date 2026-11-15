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

import {planSubclassSpellUpdates} from '../server/class-subclass-spells.mjs';
import {bundledCatalog} from '../server/bundled-catalog.mjs';
import {validateCatalog} from '../server/catalog.mjs';
const entries=new Map(validateCatalog(bundledCatalog().bundle).filter(e=>e.kind==='spell').map(e=>[e.id,e]));
const lookup=id=>structuredClone(entries.get(id));

test('prepared-spell delta separates additions, promotions and existing entries without duplicating or mutating the book',()=>{
 const selection={classId:'cleric',subclassId:'cleric-life',level:3},eligible=previewSubclassSpells(selection).alwaysPrepared.map(s=>s.catalogId);
 const book=[{catalogId:eligible[0],status:'known',entry:lookup(eligible[0])},{catalogId:eligible[1],status:'prepared',entry:lookup(eligible[1])},{catalogId:'srd51:2014:spell:fireball',status:'known',entry:lookup('srd51:2014:spell:fireball')}],before=structuredClone(book);
 const delta=planSubclassSpellUpdates(selection,book,lookup);assert.deepEqual(book,before);assert.deepEqual(delta.additions.map(s=>s.catalogId),eligible.slice(2));assert.equal(delta.promotions.length,1);assert.equal(delta.promotions[0].catalogId,eligible[0]);assert.equal(delta.alreadyPrepared.length,1);assert.equal(delta.applied,false);
 const future=book.map(s=>({...s,status:eligible.includes(s.catalogId)?'prepared':s.status})).concat(delta.additions.map(s=>({catalogId:s.catalogId,status:s.status,entry:lookup(s.catalogId)})));
 const again=planSubclassSpellUpdates(selection,future,lookup);assert.deepEqual(again.additions,[]);assert.deepEqual(again.promotions,[]);assert.equal(again.alreadyPrepared.length,4);assert.equal(future.find(s=>s.catalogId.endsWith(':fireball')).status,'known');
});

test('expanded lists never add spells or require their installation before any explicit spell choice',()=>{
 const delta=planSubclassSpellUpdates({classId:'warlock',subclassId:'warlock-fiend',level:9},[],()=>{throw Error('must not load unselected spells');});assert.equal(delta.expandedChoices.length,10);assert.deepEqual(delta.additions,[]);assert.deepEqual(delta.promotions,[]);assert.equal(delta.applied,false);
});

test('subclass spell delta rejects missing or forged sources, duplicates and overflow without partial writes',()=>{
 const selection={classId:'paladin',subclassId:'paladin-devotion',level:3},first=previewSubclassSpells(selection).alwaysPrepared[0].catalogId;
 assert.throws(()=>planSubclassSpellUpdates(selection,[],()=>null),/Источник/);
 const forged=lookup(first);forged.name.ru='Подмена';assert.throws(()=>planSubclassSpellUpdates(selection,[{catalogId:first,status:'known',entry:forged}],lookup),/Источник/);
 const s={catalogId:first,status:'prepared',entry:lookup(first)};assert.throws(()=>planSubclassSpellUpdates(selection,[s,s],lookup),/повторная/);assert.throws(()=>planSubclassSpellUpdates(selection,[{...s,status:'remove'}],lookup));
 const full=Array.from({length:1000},(_,i)=>({catalogId:'unrelated-'+i,status:'known'}));assert.throws(()=>planSubclassSpellUpdates(selection,full,lookup),/1000/);assert.equal(full.length,1000);
});

test('every eligible subclass table and terrain plans an idempotent sourced spellbook delta through level20',()=>{
 const entries=new Map(validateCatalog(bundledCatalog().bundle).map(entry=>[entry.id,entry]));
 for(const cls of classList())for(let level=classProgression(cls.slug,1).subclassLevel;level<=20;level++){
  const subclass=subclassReferenceOptions(cls.slug,level)[0];
  const tables=cls.slug==='druid'&&level>=3?previewSubclassSpells({classId:cls.slug,subclassId:subclass.id,level:2}).tableChoices.map(t=>t.id):[null];
  for(const tableId of tables){
   const selection={classId:cls.slug,subclassId:subclass.id,level,tableId},first=planSubclassSpellUpdates(selection,[],id=>entries.get(id));
   assert.equal(first.promotions.length,0);assert.equal(first.alreadyPrepared.length,0);assert.equal(first.applied,false);
   const book=first.additions.map(row=>({catalogId:row.catalogId,status:'prepared',entry:entries.get(row.catalogId)}));const before=structuredClone(book),again=planSubclassSpellUpdates(selection,book,id=>entries.get(id));
   assert.deepEqual(book,before);assert.deepEqual(again.additions,[]);assert.deepEqual(again.promotions,[]);assert.equal(again.alreadyPrepared.length,book.length);
   assert.equal(new Set(book.map(row=>row.catalogId)).size,book.length);
   if(cls.slug==='warlock')assert.equal(book.length,0,'expanded list is never a grant');
  }
 }
});
