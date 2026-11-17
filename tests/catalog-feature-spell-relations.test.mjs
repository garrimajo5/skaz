import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync,mkdtempSync,writeFileSync,unlinkSync,rmdirSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {featureRelationProposals} from '../scripts/catalog-feature-spell-relations.mjs';
const read=f=>JSON.parse(readFileSync(new URL('../catalog/'+f,import.meta.url)));const saved=()=>read('dndsu-feature-spell-relations.json');
test('every observed individual reference has exactly one proposed relationship; search links are unresolved',()=>{
 const r=saved(),refs=read('dndsu-feature-spell-references.json').classes.flatMap(c=>c.records);assert.equal(r.summary.relations,86);assert.equal(r.summary.classifiedReferences,100);assert.equal(r.summary.unresolvedSearchLinks,2);assert.equal(r.summary.excludedListLinks,32);assert.deepEqual(r.records.flatMap(r=>r.referenceIds).sort(),refs.filter(r=>r.reference.kind==='spell-page').map(r=>r.id).sort());assert.ok(r.records.every(r=>r.approval==='awaiting-independent-game-design-review'&&r.fullRules==='unverified'&&r.automation==='not-applied'));
});
test('the same warlock feature separates a learned cantrip from a fireball defence example',()=>{
 const rs=saved().records.filter(r=>r.parent==='patron.undying'&&r.featureTitle==='СРЕДИ МЁРТВЫХ');assert.deepEqual(rs.map(r=>r.relationship).sort(),['example-not-grant','learned-cantrip']);
});
test('spellbook addition, ritual access, temporary casting and permanent effects stay distinct',()=>{
 const rs=saved().records;assert.equal(rs.find(r=>r.featureTitle==='НЕЖИВЫЕ РАБЫ').relationship,'spellbook-add-if-absent');assert.equal(rs.find(r=>r.featureTitle==='ГЕНИЙ ПРЕОБРАЗОВАНИЯ').relationship,'feature-casting-not-spellbook-grant');assert.ok(rs.filter(r=>r.featureTitle==='ИСКАТЕЛЬ ДУХОВ').every(r=>r.relationship==='ritual-only-access'));assert.equal(rs.find(r=>r.featureTitle==='ЧИСТОТА ДУХА').relationship,'permanent-effect-not-known-grant');assert.equal(rs.find(r=>r.featureTitle==='ГЛАЗА ТЬМЫ').relationship,'learned-spell-at-level-three-with-special-casting');
});
test('optional source provenance and mandatory choices are preserved as proposals',()=>{
 const rs=saved().records,features=read('dndsu-reviewed-class-proposals.json').classes.flatMap(c=>c.records);const wild=rs.find(r=>r.featureTitle==='Дикий спутник');assert.deepEqual(wild.sourceIds,features.find(r=>r.id===wild.featureId).sourceIds);assert.ok(rs.filter(r=>r.featureTitle==='Сила великана').every(r=>r.relationship==='choose-one-cantrip'));assert.equal(rs.find(r=>r.featureTitle==='ПРЕДМЕТ ДОГОВОРА').relationship,'learned-if-pact-chain-selected');
});
test('changed evidence, duplicate classifications and changed heading identity fail closed',()=>{
 const dir=mkdtempSync(join(tmpdir(),'skaz-relation-test-')),file=join(dir,'class-88.html');
 const classUrl='https://dnd.su/class/88-bard/',f={id:'f',parent:'base',title:'Feature',headingOrdinal:2,sourceIds:['102']};const refs={classes:[{classUrl,records:[{id:'r',featureId:'f',reference:{kind:'spell-page',pageId:'dndsu:spells:1'}}]}]},index={records:[{en:'Shield',pageId:'dndsu:spells:1'}]},proposals=[{classUrl,records:[f]}],spec=[88,'base','Feature','Shield','example-not-grant',/Например/u];
 const html='<div class="card__body new-article"><h2>Base</h2><h3>Feature</h3><p>Например щит.</p><div class="card__footer">';
 try{writeFileSync(file,html);assert.equal(featureRelationProposals(dir,refs,index,proposals,[spec]).summary.classifiedReferences,1);assert.throws(()=>featureRelationProposals(dir,refs,index,proposals,[spec,spec]),/Overlapping/);writeFileSync(file,html.replace('Например','Иное'));assert.throws(()=>featureRelationProposals(dir,refs,index,proposals,[spec]),/Missing relation evidence/);writeFileSync(file,html.replace('Feature','Changed'));assert.throws(()=>featureRelationProposals(dir,refs,index,proposals,[spec]),/Stale relation heading/);}finally{unlinkSync(file);rmdirSync(dir);}
});
