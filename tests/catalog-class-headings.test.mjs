import test from 'node:test';
import assert from 'node:assert/strict';
import {classHeadings,resolveSources,annotateClassSources} from '../scripts/catalog-class-headings.mjs';
const wrap=s=>'<div class="card__body new-article">'+s+'</div><div class="card__footer"></div>';
test('homebrew and playtest context follows section boundaries',()=>{const r=classHeadings(wrap('<h2><span id="hb.test">Custom</span></h2><h3>Power</h3><h2><span id="ua.test">Test</span></h2><h3>Test power</h3><h2><span id="phb.test">Official</span></h2><h3>Power</h3>'));assert.deepEqual(r.headings.map(x=>x.inclusion),['excluded-homebrew','excluded-homebrew','needs-playtest-review','needs-playtest-review','needs-section-source-review','needs-section-source-review']);assert.ok(r.headings.every(x=>x.fullRules==='unverified'));});
test('headings are navigation evidence, not prose or complete feature records',()=>{const r=classHeadings(wrap('<h2><span id="feature">Title &amp; name</span></h2><p>Do not copy these rules</p><h3></h3>')+'<h2>Comment heading</h2>');assert.equal(r.headings.length,1);assert.equal(r.emptyHeadingCount,1);assert.equal(r.headings[0].title,'Title & name');assert.equal(r.headings[0].recordType,'heading-not-certified-feature');assert.ok(!JSON.stringify(r).includes('Do not copy'));});
test('empty pages and missing article boundary fail closed',()=>{assert.throws(()=>classHeadings('<h2>Title</h2>'),/boundary/);assert.throws(()=>classHeadings(wrap('<p>Text only</p>')),/Empty/);});
test('empty top-level section does not leak homebrew scope into following headings',()=>{const r=classHeadings(wrap('<h2><span id="hb.test">Custom</span></h2><h3>Custom power</h3><h2></h2><h3>Unknown power</h3>'));assert.equal(r.headings.at(-1).inclusion,'needs-section-source-review');});
test('explicit sources and initial-level labels remain metadata, not full advancement rules',()=>{const r=classHeadings(wrap('<h3>Optional</h3><p><em>4-й уровень, <span tooltip-for="option.TCE">опциональное</span> умение</em></p><p><strong>Источник: «Book A»</strong></p><p>Level 20 is mentioned only in prose.</p>'));assert.deepEqual(r.headings[0].levelEvidence,[4]);assert.deepEqual(r.headings[0].optionalSourceTags,['TCE']);assert.deepEqual(r.headings[0].explicitSources,['Book A']);});
test('plain source labels and explicitly documented DMG title variant resolve without fuzzy guessing',async()=>{const {resolveSources}=await import('../scripts/catalog-class-headings.mjs');const r=classHeadings(wrap('<h2><span id="dragon">Dragon</span></h2><p><strong>Источник: Fizban’s Treasury of Dragons</strong></p>'));assert.deepEqual(r.headings[0].explicitSources,['Fizban’s Treasury of Dragons']);const s=resolveSources(['Dungeon Master Guide','Unrelated Guide'],[{sourceId:'101',title:"Dungeon Master\'s Guide"}]);assert.equal(s[0].status,'source-identified');assert.equal(s[0].resolutionBasis,'explicit-title-alias');assert.equal(s[1].status,'unresolved-source');});

test('known unquoted source lists resolve without splitting unknown titles containing commas',()=>{
 const sources=[{sourceId:'1',title:"Player's Handbook"},{sourceId:'2',title:"Tasha's Cauldron of Everything"}];
 const r=resolveSources(["Player's Handbook, Tasha’s Cauldron of Everything"],sources);assert.deepEqual(r.map(s=>s.sourceIds),[['1'],['2']]);assert.ok(r.every(s=>s.resolutionBasis==='explicit-known-title-list'));
 assert.equal(resolveSources(['Unknown, Other'],sources).length,1);
});
test('explicit UA source excludes descendants even when anchors omit ua prefix',()=>{
 const html='<div class="card__body new-article"><h2><span id="custom">Subclass</span></h2><p><strong>Источник: Unearthed Arcana: Mages of Strixhaven</strong></p><h3>Feature</h3><h2>Next</h2><h3>Other</h3><div class="card__footer">';
 const r=classHeadings(html).headings;assert.deepEqual(r.map(h=>h.inclusion),['needs-playtest-review','needs-playtest-review','needs-section-source-review','needs-section-source-review']);
});


test('an exact registered book title containing a comma wins over a possible list split',()=>{
 const sources=[{sourceId:'1',title:'First'},{sourceId:'2',title:'Second'},{sourceId:'3',title:'First, Second'}];
 assert.deepEqual(resolveSources(['First, Second'],sources).map(s=>s.sourceIds),[['3']]);
});

test('source-group Homebrew excludes custom-anchor sections and children without leaking into next section',()=>{
 const headings=classHeadings(wrap('<h2><span id="mhh.tradition">Custom</span></h2><p><strong>Источник: Midgard Heroes Handbook</strong></p><h3>Custom feature</h3><h2><span id="normal">Official</span></h2><h3>Official feature</h3>')).headings;
 const rows=annotateClassSources(headings,[{sourceId:'156',title:'Midgard Heroes Handbook',group:'Homebrew'}]);
 assert.deepEqual(rows.map(r=>r.inclusion),['excluded-homebrew','excluded-homebrew','needs-section-source-review','needs-section-source-review']);
 assert.equal(rows[1].exclusionBasis,'source-group-Homebrew');
});

test('an omitted empty top-level heading ends inherited Homebrew source scope',()=>{
 const headings=classHeadings(wrap('<h2><span id="mhh.test">Custom</span></h2><p><strong>Источник: Midgard Heroes Handbook</strong></p><h3>Custom feature</h3><h2> </h2><h3>Unknown new section</h3>')).headings;
 const rows=annotateClassSources(headings,[{sourceId:'156',title:'Midgard Heroes Handbook',group:'Homebrew'}]);
 assert.equal(rows.at(-1).inclusion,'needs-section-source-review');
});
