import test from 'node:test';import assert from 'node:assert/strict';
import {wizardAdvancedOptions,validateWizardAdvancedChoice} from '../server/class-wizard-choices.mjs';
import {bundledCatalog} from '../server/bundled-catalog.mjs';import {validateCatalog} from '../server/catalog.mjs';
const catalog=new Map(validateCatalog(bundledCatalog().bundle).filter(e=>e.kind==='spell').map(e=>[e.id,e]));
const id=s=>'srd51:2014:spell:'+s,book=(...ids)=>ids.map(s=>({catalogId:id(s),status:'known',entry:structuredClone(catalog.get(id(s)))}));
const choose=(kind,selected,spellbook,extra={})=>validateWizardAdvancedChoice({kind,classId:'wizard',level:kind==='mastery'?18:20,selected:selected.map(id),spellbook,...extra});

test('Spell Mastery chooses exactly one first and one second circle already in the wizard book',()=>{
 const b=book('magic-missile','shield','misty-step','fireball','cure-wounds'),before=structuredClone(b);
 assert.deepEqual(new Set(wizardAdvancedOptions('mastery',b).map(o=>o.id)),new Set(['magic-missile','shield','misty-step'].map(id)));
 const selection=choose('mastery',['misty-step','shield'],b);assert.deepEqual(selection.spellIds,['misty-step','shield'].map(id).sort());assert.equal(selection.sourcePage,53);assert.equal(selection.applied,false);assert.deepEqual(b,before);
 for(const ids of [['shield','magic-missile'],['shield','shield'],['shield','fireball'],['shield','blur'],['cure-wounds','misty-step']])assert.throws(()=>choose('mastery',ids,b));
});
test('Signature Spells require two different third-circle wizard spells but do not change preparation or charges',()=>{
 const b=book('fireball','counterspell','misty-step'),before=structuredClone(b),selection=choose('signature',['counterspell','fireball'],b);assert.equal(selection.acquiredLevel,20);assert.equal(selection.sourcePage,54);assert.equal(selection.applied,false);assert.deepEqual(b,before);
 assert.throws(()=>choose('signature',['fireball','misty-step'],b));assert.throws(()=>choose('signature',['fireball','fireball'],b));
});
test('advanced wizard choices reject wrong class, level, source and duplicate book rows',()=>{
 const b=book('shield','misty-step');for(const extra of [{classId:'bard'},{level:17},{level:19}])assert.throws(()=>choose('mastery',['shield','misty-step'],b,extra));
 const forged=structuredClone(b);forged[0].entry.text='Подмена';assert.throws(()=>choose('mastery',['shield','misty-step'],forged),/источником/);assert.throws(()=>wizardAdvancedOptions('mastery',[...b,b[0]]));assert.throws(()=>wizardAdvancedOptions('unknown',b));
 const rows=wizardAdvancedOptions('mastery',b);rows[0].name.ru='corrupt';assert.notEqual(wizardAdvancedOptions('mastery',b)[0].name.ru,'corrupt');
});

import {wizardChoiceOrigin,validateWizardMasteryOrigin} from '../server/class-wizard-choices.mjs';
test('stored mastery origin has exact source, level and stable choice key',()=>{
 const b=book('shield','misty-step'),origin=wizardChoiceOrigin({kind:'mastery',classId:'wizard',level:18,selected:['shield','misty-step'].map(id),spellbook:b});assert.equal(Object.hasOwn(origin,'applied'),false);assert.equal(origin.choiceId,'wizard:18:spell-mastery');assert.deepEqual(validateWizardMasteryOrigin(origin),origin);
 for(const edit of [o=>o.acquiredLevel=17,o=>o.sourcePage=54,o=>o.choiceId='fake',o=>o.ruleset='5e-2024',o=>o.spellIds=['shield','fireball'].map(id),o=>o.extra=true]){const bad=structuredClone(origin);edit(bad);assert.throws(()=>validateWizardMasteryOrigin(bad));}
});

import {openStore} from '../server/store.mjs';
import {prepareWizard} from '../scripts/fixtures/wizard-commands.mjs';
import {advancementView} from '../server/class-advancement-view.mjs';
test('advanced wizard view distinguishes existing book entries from optional new candidates',()=>{
 for(const [level,kind] of [[17,'spell-mastery'],[19,'signature-spells']]){
  const store=openStore(':memory:',{classAdvancement:true});try{
   const current=prepareWizard(store,level),choice='wizard:'+(level+1)+':'+kind,view=advancementView(current,'wizard',entryId=>catalog.get(entryId)),known=new Set(current.spellbook.map(row=>row.catalogId)),options=view.wizardOptions[choice];
   assert.ok(options.some(o=>!o.requiresNewSpell));assert.ok(options.some(o=>o.requiresNewSpell));for(const option of options)assert.equal(option.requiresNewSpell,!known.has(option.id));
  }finally{store.close();}
 }
});
