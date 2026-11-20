import {createHash} from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reviewAlPreview,alPreviewReview,selectedAlPreviewFields,verifyAlPreviewCaptures} from '../scripts/catalog-al-preview-version-review.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../catalog/'+p,import.meta.url)));
const inputs=()=>[read('al-preview-version-evidence-2014.json'),read('scope-register-2014.json'),read('adventurers-league-publication-candidates-2014.json')];

test('six partial comparisons preserve two differences and never accept publisher identity or complete versions',()=>{
 const args=inputs(),before=JSON.stringify(args),r=reviewAlPreview(...args);
 assert.equal(JSON.stringify(args),before);
 assert.deepEqual(r.summary,{observations:6,withDifferences:2,differingFields:2,diceAverageWarnings:1});
 assert.deepEqual(r.rows.find(x=>x.name==='Brachiosaurus').differences,[{field:'stompAttackBonus',primary:10,secondary:8}]);
 assert.deepEqual(r.rows.find(x=>x.name==='Dilophosaurus').differences,[{field:'hitPoints',primary:26,secondary:22}]);
 assert.ok(r.rows.filter(x=>!x.differences.length).every(x=>x.result==='selected-fields-match-not-full-equivalence'));
 assert.ok(r.rows.every(x=>!x.accepted&&!x.automaticPatch&&!x.fullRulesVerified&&x.canonicalId===null));
});

test('source arithmetic discrepancy remains evidence, not an automatic correction',()=>{
 const r=reviewAlPreview(...inputs()).rows.find(x=>x.name==='Dilophosaurus');
 assert.deepEqual(r.averageWarnings,[{side:'primary',printedHitPoints:26,computedDiceAverage:22,action:'retain-source-observation-no-patch'}]);
 assert.equal(inputs()[0].records.find(x=>x.name==='Dilophosaurus').primary.selected.hitPoints,26);
});

test('missing duplicate foreign source wrong page and promoted comparisons fail closed',()=>{
 for(const mutate of [
  ([m])=>m.records.pop(),([m])=>m.records[1]=m.records[0],([m])=>m.accepted=true,
  ([m])=>m.records[0].secondary.sourceIds=['102'],([m])=>m.records[0].secondary.url='https://example.org/other',
  ([m])=>m.primaryEvidence.sha256='unknown',([m])=>m.primaryEvidence.url='https://example.org/book.pdf',
  ([m])=>m.primaryEvidence.publisherStatus='accepted',([m])=>m.records[0].primary.pdfPage=3,
  ([m])=>m.records[0].primary.visualVerified=false,([m])=>m.records[0].wholeStatBlockCompared=true,
  ([m])=>m.records[0].primary.selected.abilities.pop(),([m])=>m.records[0].primary.selected.hitDice.die=9,
  ([m])=>m.records[0].primary.selected.spellSaveDc=12,([m,,p])=>p.publications[0].units=[]
 ]){const args=inputs();mutate(args);assert.throws(()=>reviewAlPreview(...args));}
});

test('report reproduces with current input pins',()=>assert.deepEqual(alPreviewReview(),read('al-preview-version-review-2014.json')));

function fixture(attack=8){
 const ability=['Сила','Ловкость','Телосложение','Интеллект','Мудрость','Харизма'].map(name=>`<div class="stat" title="${name}">10 (+0)</div>`).join('');
 return `<div data-id="bestiary:5963"><span data-copy="Тест [Brachiosaurus]"></span><span class="source-plaque" title="Test">T</span><div class="card__body new-article"><ul><li class="size-type-alignment">Громадный Зверь</li><li><strong>Класс Доспеха</strong>16</li><li><strong>Хиты</strong>145 (10к20 + 40)</li><li><strong>Скорость</strong>30 футов</li><li class="abilities">${ability}</li><li class="subsection"><h3>Действия</h3><p><strong>Топот.</strong> Рукопашная атака оружием: +${attack} к попаданию.</p><p><strong>Хвост.</strong> Рукопашная атака оружием: +10 к попаданию.</p></li></ul><div class="card__footer">`;
}
const sources=[{sourceId:'169',title:'Test',group:'Other'}];
test('secondary extraction selects the named stomp rather than the adjacent tail attack',()=>{
 const r=selectedAlPreviewFields(fixture(),'dndsu:bestiary:5963',sources);
 assert.equal(r.selected.stompAttackBonus,8);assert.deepEqual(r.selected.hitDice,{count:10,die:20,modifier:40});
 assert.equal(selectedAlPreviewFields(fixture(9),'dndsu:bestiary:5963',sources).selected.stompAttackBonus,9);
 assert.throws(()=>selectedAlPreviewFields(fixture().replace('Хвост.','Топот.'),'dndsu:bestiary:5963',sources),/ambiguous/);
 assert.throws(()=>selectedAlPreviewFields(fixture().replace('Топот.','Другой.'),'dndsu:bestiary:5963',sources),/Missing/);
});

test('capture verification detects changed bytes and a forged transcription without pretending to OCR the primary',()=>{
 const hash=x=>createHash('sha256').update(x).digest('hex');
 const primary=Buffer.from('synthetic primary'),secondary=Buffer.from(fixture());
 const record={observationId:'dndsu:bestiary:5963',name:'Brachiosaurus',secondary:{sha256:hash(secondary),sourceIds:['169'],selected:selectedAlPreviewFields(fixture(),'dndsu:bestiary:5963',sources).selected}};
 const manifest={primaryEvidence:{sha256:hash(primary)},records:[record]};
 const captures=new Map([['primary.pdf',primary],[record.observationId,secondary]]);
 assert.equal(verifyAlPreviewCaptures(manifest,sources,captures).verifiedSecondaryCaptures,1);
 assert.equal(verifyAlPreviewCaptures(manifest,sources,captures).primaryManualTranscription,'requires-visual-review');
 const altered=new Map(captures);altered.set(record.observationId,Buffer.from(fixture(9)));
 assert.throws(()=>verifyAlPreviewCaptures(manifest,sources,altered),/Changed secondary/);
 const forged=structuredClone(manifest);forged.records[0].secondary.selected.stompAttackBonus=10;
 assert.throws(()=>verifyAlPreviewCaptures(forged,sources,captures),/selected evidence changed/);
 altered.set('primary.pdf',Buffer.from('different'));
 assert.throws(()=>verifyAlPreviewCaptures(manifest,sources,altered),/Changed primary/);
});

test('JSON key order is not a version difference, while changed dice remain a difference',()=>{
 const args=inputs(),record=args[0].records.find(r=>r.name==='Archelon');
 const dice=record.secondary.selected.hitDice;
 record.secondary.selected.hitDice={modifier:dice.modifier,die:dice.die,count:dice.count};
 assert.equal(reviewAlPreview(...args).rows.find(r=>r.name==='Archelon').differences.length,0);
 record.secondary.selected.hitDice.count++;
 assert.equal(reviewAlPreview(...args).rows.find(r=>r.name==='Archelon').differences[0].field,'hitDice');
});
