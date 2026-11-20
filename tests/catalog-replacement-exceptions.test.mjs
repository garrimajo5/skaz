import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {replacementExceptionAudit} from '../scripts/catalog-replacement-exceptions.mjs';
const feature={id:'test',headingOrdinal:1,title:'Spellcasting',parent:'test',sourceIds:['102']};
const article=text=>'<div class="card__body new-article"><h3>Spellcasting</h3><p>'+text+'</p><h3>Next</h3><p>заменять школу кроме 20</p><div class="card__footer">';
const parse=text=>replacementExceptionAudit(article(text),feature,{classUrl:'https://dnd.su/class/99-rogue/',bookPage:98});
test('erratum compares origin levels without silently repairing reference evidence',()=>{
 const r=parse('Вы можете заменять заклинание школы, если только оно не получено на 8, 14 или 20 уровне.');assert.deepEqual(r.referenceOriginLevels,[8,14,20]);assert.deepEqual(r.missingFromReference,[3]);assert.equal(r.status,'source-discrepancy-needs-review');assert.equal(r.automation,'not-applied');
 const fixed=parse('Вы можете заменять заклинание школы, кроме полученных на 3, 8, 14 или 20 уровне.');assert.equal(fixed.status,'matches-publisher-erratum');assert.deepEqual(fixed.missingFromReference,[]);
});
test('missing, ambiguous or stale source evidence fails rather than inheriting later feature',()=>{
 assert.throws(()=>parse('Нет правила замены.'));
 assert.throws(()=>parse('заменять школы кроме 3, 8, 14, 20 и 20'));
 assert.throws(()=>replacementExceptionAudit(article('заменять школы кроме 8, 14, 20'),{...feature,title:'Changed'},{}));
});
test('reviewed evidence keeps rogue discrepancy and matching fighter separately',()=>{
 const r=JSON.parse(readFileSync(new URL('../catalog/dndsu-replacement-exceptions.json',import.meta.url)));assert.equal(r.summary.sourceDiscrepancies,1);assert.deepEqual(r.records.map(x=>x.referenceOriginLevels),[[3,8,14,20],[8,14,20]]);assert.ok(r.records.every(x=>x.approval==='awaiting-independent-game-design-review'));
});
