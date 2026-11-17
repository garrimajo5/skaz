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

test('unanchored TCE primal companion is an optional replacement, not an additional PHB subclass',()=>{
 const ranger=reviewedClassProposals(navigation(),sources).find(c=>c.classKey==='ranger'),f=ranger.records.find(r=>r.title==='Первичный спутник');assert.ok(f.optionalReplacement);assert.equal(f.parent,'archetype.beast-master');assert.equal(f.sourceBasis,'explicit-supplement-section-source');assert.deepEqual(f.observedInitialLevels,[3]);assert.deepEqual(f.sourceIds,[sources.find(s=>s.title==="Tasha's Cauldron of Everything").sourceId]);assert.equal(ranger.records.find(r=>r.id===f.replacementForObservationId).title,'СПУТНИК СЛЕДОПЫТА');assert.equal(ranger.summary.subclass,8);assert.equal(ranger.summary['subclass-feature'],43);
});
test('supplement source or replacement target cannot disappear silently',()=>{
 const nav=navigation(),page=nav.pages.find(p=>p.url.includes('/97-'));page.headings.find(h=>h.title==='Спутники повелителя зверей').sourceResolution=[];assert.throws(()=>reviewedClassProposals(nav,sources),/supplemental source/);
 const second=navigation();second.pages.find(p=>p.url.includes('/97-')).headings.find(h=>h.title==='СПУТНИК СЛЕДОПЫТА'&&h.sectionAnchor==='archetype.beast-master').title='Renamed';assert.throws(()=>reviewedClassProposals(second,sources),/replacement target/);
});

test('excluded supplemental child cannot inherit a permitted parent source',()=>{const nav=navigation();nav.pages.find(p=>p.url.includes('/97-')).headings.find(h=>h.title==='Первичный спутник').inclusion='excluded-homebrew';assert.throws(()=>reviewedClassProposals(nav,sources),/Excluded supplemental feature/);});
