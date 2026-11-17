import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reviewedClassProposals,reviewedSpecs} from '../scripts/catalog-reviewed-class-proposals.mjs';
const read=f=>JSON.parse(readFileSync(new URL('../catalog/'+f,import.meta.url)));
const navigation=()=>structuredClone(read('dndsu-class-headings.json'));
const sources=read('dndsu-source-register.json').sources;
test('eleven remaining class proposals include later 2014 books without approving rules',()=>{const result=reviewedClassProposals(navigation(),sources);assert.equal(result.length,11);assert.equal(new Set(result.map(c=>c.classUrl)).size,11);for(const c of result){assert.ok(c.pendingComponents.length);assert.ok(c.records.every(r=>r.canonicalCatalogId===null&&r.fullRules==='unverified'));assert.ok(c.summary['base-feature']>0);}assert.ok(result.find(c=>c.classKey==='sorcerer').records.some(r=>r.parent==='origin.lunar-sorcery'));});
test('druid features after an unanchored guidance section are preserved',()=>{const r=reviewedClassProposals(navigation(),sources).find(c=>c.classKey==='druid');assert.equal(r.summary['base-feature'],11);assert.ok(r.records.some(r=>r.sourceUrl.endsWith('#feature.archdruid')&&r.kind==='base-feature'));assert.ok(r.records.every(r=>!r.sourceUrl.endsWith('#null')));});
test('cleric unanchored optional spells retain TCE; artificer never inherits PHB',()=>{const result=reviewedClassProposals(navigation(),sources),tce=sources.find(s=>s.title==="Tasha's Cauldron of Everything").sourceId;const spell=result.find(c=>c.classKey==='cleric').records.find(r=>r.title==='Дополнительные заклинания жреца');assert.deepEqual(spell.sourceIds,[tce]);assert.equal(spell.sourceBasis,'explicit-option-TCE-marker');assert.ok(result.find(c=>c.classKey==='artificer').records.filter(r=>r.kind==='base-feature').every(r=>r.sourceIds[0]===tce));});
test('fighter commentary and choices are not extra class features; paladin tenets remain guidance',()=>{const result=reviewedClassProposals(navigation(),sources),fighter=result.find(c=>c.classKey==='fighter');assert.equal(fighter.excluded[0].title,'заметки о рыцаре эха');assert.ok(fighter.records.some(r=>r.kind==='choice-index'));assert.ok(result.find(c=>c.classKey==='paladin').records.some(r=>r.kind==='oath-guidance'));});
test('subclass feature anchors cannot become base class features',()=>{const result=reviewedClassProposals(navigation(),sources);const rogue=result.find(c=>c.classKey==='rogue').records.find(r=>r.sourceUrl.endsWith('#feature.assassinate'));assert.equal(rogue.kind,'subclass-feature');const ranger=result.find(c=>c.classKey==='ranger').records.find(r=>r.sourceUrl.endsWith('#feature.dread-ambusher'));assert.equal(ranger.kind,'subclass-feature');});

test('current source registry vetoes stale navigation approval for Homebrew books',()=>{
 const sources=read('dndsu-source-register.json').sources;
 sources.find(s=>s.title==="Player's Handbook").group='Homebrew';
 assert.throws(()=>reviewedClassProposals(navigation(),sources),/excluded proposal source/);
});
