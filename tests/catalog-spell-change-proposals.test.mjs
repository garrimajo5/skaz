import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spellChangeProposal} from '../scripts/catalog-spell-change-proposals.mjs';
const feature={id:'test',headingOrdinal:1,title:'Spellcasting',sourceIds:['102']};
const html=text=>'<div class="card__body new-article"><h3>Spellcasting</h3><p>'+text+'</p><h3>Next</h3><p>Изменить список подготовленных после продолжительного отдыха</p><div class="card__footer">';
const parse=(text,policy,f=feature)=>spellChangeProposal(html(text),f,{classUrl:'https://dnd.su/class/88-bard/',classKey:'bard',policy});
const known='Получая уровень в этом классе, можно одно из известных заклинаний заменить другим согласно имеющимся ячейкам.';
test('class-level replacement does not become long-rest preparation',()=>{const r=parse(known,'replace-one-known-on-class-level');assert.equal(r.trigger,'gain-level-in-this-class');assert.equal(r.selection,'at-most-one-replacement');assert.equal(r.resource,'known-spells');assert.equal(r.optionalFeature,false);});
test('preparation requires long-rest timing and preparation duration',()=>{const text='Можно изменить список подготовленных заклинаний, завершая продолжительный отдых; не менее 1 минуты за уровень заклинания.';const r=parse(text,'change-prepared-after-long-rest');assert.equal(r.resource,'prepared-spells');assert.equal(r.preparationMinutesPerSpellLevel,1);assert.throws(()=>parse(text.replace('продолжительный','короткий'),'change-prepared-after-long-rest'));});
test('cantrip formulas require the explicit optional TCE source and spellbook condition',()=>{const text='Завершая продолжительный отдых, свериться в своей книге заклинаний и заменить один известный вам заговор.';assert.throws(()=>parse(text,'optional-replace-one-cantrip-after-long-rest'));const r=parse(text,'optional-replace-one-cantrip-after-long-rest',{...feature,sourceIds:['117']});assert.equal(r.optionalFeature,true);assert.equal(r.requiresSpellbook,true);assert.equal(r.resource,'known-cantrips');});
test('unknown policy or absent and ambiguous evidence fail',()=>{assert.throws(()=>parse(known,'guessed'));assert.throws(()=>parse('Нет условия','replace-one-known-on-class-level'));assert.throws(()=>parse(known+'</p><p>'+known,'replace-one-known-on-class-level'));});
test('snapshot keeps ten partial proposals separate from approved runtime rules',()=>{const r=JSON.parse(readFileSync(new URL('../catalog/dndsu-spell-change-proposals.json',import.meta.url)));assert.deepEqual(r.summary,{policies:10,classLevelReplacement:4,longRestPreparation:5,optionalCantripReplacement:1});assert.ok(r.records.every(r=>r.fullRules==='unverified'&&r.automation==='not-applied'));});

test('wizard preparation selects from its spellbook while artificer preparation uses its class list',()=>{const records=JSON.parse(readFileSync(new URL('../catalog/dndsu-spell-change-proposals.json',import.meta.url))).records;
 const wizard=records.find(r=>r.classKey==='wizard'&&r.resource==='prepared-spells'),artificer=records.find(r=>r.classKey==='artificer');assert.equal(wizard.requiresSpellbook,true);assert.equal(wizard.selectionPool,'spellbook');assert.equal(artificer.requiresSpellbook,false);assert.equal(artificer.selectionPool,'class-spell-list');assert.equal(artificer.trigger,'after-long-rest');assert.equal(artificer.preparationMinutesPerSpellLevel,1);
});

test('reviewed preparation continuation cannot spill into unrelated following feature',()=>{
 const text='Можно изменить список подготовленных заклинаний, завершая продолжительный отдых, изучении книги заклинаний; не менее 1 минуты за уровень заклинания.';
 const doc=html('Intro').replace('<h3>Next</h3><p>Изменить список подготовленных после продолжительного отдыха</p>','<h3>ВАША КНИГА ЗАКЛИНАНИЙ</h3><h4>Подготовка</h4><p>'+text+'</p><h3>Другое умение</h3><p>'+text+'</p>');
 const options={classUrl:'https://dnd.su/class/105-wizard/',classKey:'wizard',policy:'change-prepared-after-long-rest'};
 const r=spellChangeProposal(doc,feature,options);assert.equal(r.continuationContext.title,'ВАША КНИГА ЗАКЛИНАНИЙ');assert.equal(r.requiresSpellbook,true);
 assert.throws(()=>spellChangeProposal(doc.replace('ВАША КНИГА ЗАКЛИНАНИЙ','Неизвестный раздел'),feature,options),/continuation/);
});
