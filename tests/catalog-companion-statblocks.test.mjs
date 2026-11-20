import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {companionStatblock,outerListItems} from '../scripts/catalog-companion-statblocks.mjs';
const source={sourceId:'117',title:"Tasha's Cauldron of Everything",group:'Sourcebooks'};
const abilities=['Сила','Ловкость','Телосложение','Интеллект','Мудрость','Харизма'].map(name=>'<div class="stat" title="'+name+'"><div>Stat</div><div>10 (<strong>+0</strong>)</div></div>').join('');
const html=()=>'<div data-id="bestiary:1"><h2><span data-copy="Существо [Creature]">Name</span><span class="source-plaque" title="Tasha\'s Cauldron of Everything">TCE</span></h2><div class="card__body new-article"><ul><li class="size-type-alignment">Маленький Конструкт</li><li><strong>Класс Доспеха</strong>13 + БМ</li><li><strong>Хиты</strong>5 + пятикратный уровень</li><li><strong>Скорость</strong>30 футов</li><li class="abilities">'+abilities+'</li><li><strong>Бонус мастерства +2</strong></li><li class="subsection desc"><p><strong>Trait.</strong> text</p><ul><li>nested one</li><li>nested two</li></ul><p>tail</p></li></ul><div class="card__footer">';
const parse=h=>companionStatblock(h,{pageId:'dndsu:bestiary:1',sources:[source]});
test('nested lists stay in their section and do not become extra core fields',()=>{assert.equal(outerListItems('<li>x<ul><li>nested</li></ul>tail</li><li>y</li>').length,2);assert.throws(()=>outerListItems('<li>broken'),/Unclosed/);const r=parse(html());assert.equal(r.unknownFields.length,0);assert.equal(r.sections.length,1);const changed=parse(html().replace('nested two','changed'));assert.notEqual(r.sections[0].evidenceTextSha256,changed.sections[0].evidenceTextSha256);});
test('scaling expressions remain unevaluated and fixed proficiency labels are retained',()=>{const r=parse(html());assert.equal(r.fields.armorClass.raw,'13 + БМ');assert.equal(r.fields.hitPoints.interpretation,'not-evaluated');assert.equal(r.fields.proficiencyBonus.raw,'+2');assert.equal(r.formulaEvaluation,'not-implemented');assert.equal(r.automation,'not-applied');});
test('wrong identity, missing source or inconsistent ability values cannot certify a statblock',()=>{assert.throws(()=>parse(html().replace('bestiary:1','bestiary:2')));assert.throws(()=>parse(html().replace('source-plaque','other')));assert.throws(()=>parse(html().replace('10 (<strong>+0','10 (<strong>+2')));assert.throws(()=>parse(html().replace('Класс Доспеха','Unknown')));});
test('thirteen saved creature pages retain distinct drake versions and their provenance',()=>{const r=JSON.parse(readFileSync(new URL('../catalog/dndsu-companion-statblocks.json',import.meta.url)));assert.equal(r.records.length,13);assert.ok(r.records.every(r=>!r.unknownFields.length&&r.abilities.length===6&&r.fullRules==='unverified'));assert.equal(r.records.filter(r=>r.name.includes('[Drake Companion]')).length,3);assert.equal(r.records.reduce((n,r)=>n+r.redirects.length,0),12);assert.ok(r.records.find(r=>r.pageId==='dndsu:bestiary:3988').fields.hitPoints.raw.includes('Интеллекта'));});

import {validateCreatureEvidence} from '../scripts/catalog-companion-statblocks.mjs';
test('saved redirects cannot detach source attribution from the inspected creature ID',()=>{const r={pageId:'dndsu:bestiary:1',requestedUrl:'https://dnd.su/bestiary/1-old/',finalUrl:'https://dnd.su/bestiary/1-new/',redirects:[{from:'https://dnd.su/bestiary/1-old/',to:'https://dnd.su/bestiary/1-new/',status:301}]};validateCreatureEvidence(r);assert.throws(()=>validateCreatureEvidence({...r,redirects:[]}));assert.throws(()=>validateCreatureEvidence({...r,finalUrl:'https://dnd.su/bestiary/2-new/'}));assert.throws(()=>validateCreatureEvidence({...r,redirects:[{...r.redirects[0],status:403}]}));});

test('variant and narrative sections do not masquerade as base creature abilities',()=>{
 const r=parse(html().replace('<p><strong>Trait.','<h3>Полтергейст</h3><p><strong>Trait.'));
 assert.equal(r.sections[0].kind,'variant-statblock');
 const narrative=parse(html().replace('<p><strong>Trait.','<h3>Описание</h3><p><strong>Trait.'));assert.equal(narrative.sections[0].kind,'narrative');
 const unknown=parse(html().replace('<p><strong>Trait.','<h3>Новый вариант</h3><p><strong>Trait.'));assert.equal(unknown.sections[0].kind,'unclassified-section');
 const blank=parse(html().replace('Trait.',' '));assert.deepEqual(blank.sections[0].names,[]);assert.equal(blank.sections[0].emptyNameMarkers,1);
});

test('editorial notes and nested signatures are not creature abilities or section headings',()=>{
 const editorial='<div class="note additionalInfo"><h3>Редактор</h3><div><p><em><strong>— Editor</strong></em></p></div></div>';
 const r=parse(html().replace('<p><strong>Trait.',editorial+'<p><strong>Trait.'));
 assert.equal(r.sections[0].heading,'traits');assert.equal(r.sections[0].kind,'base-statblock');assert.deepEqual(r.sections[0].names,['Trait']);
 const changed=parse(html().replace('<p><strong>Trait.',editorial.replace('Editor','Another editor')+'<p><strong>Trait.'));
 assert.deepEqual(changed.sections[0].names,r.sections[0].names);
 assert.notEqual(changed.sections[0].evidenceTextSha256,r.sections[0].evidenceTextSha256);
});

test('editorial filtering uses exact class tokens and preserves adjacent rule content',()=>{
 for(const attrs of ['class="additionalInfoOther"','data-note="additionalInfo"','class="rule"']){
  const r=parse(html().replace('<p><strong>Trait.',`<div ${attrs}><p><strong>Other.</strong> rule</p></div><p><strong>Trait.`));
  assert.deepEqual(r.sections[0].names,['Other','Trait']);
 }
 const two='<div class="additionalInfo"><p><strong>Editor.</strong></p></div><p><strong>Between.</strong> rule</p><div class="additionalInfo"><p><strong>Editor2.</strong></p></div>';
 const r=parse(html().replace('<p><strong>Trait.',two+'<p><strong>Trait.'));assert.deepEqual(r.sections[0].names,['Between','Trait']);
 assert.throws(()=>parse(html().replace('<p><strong>Trait.','<div class="additionalInfo"><p><strong>Trait.')),/Unclosed editorial/);
});
