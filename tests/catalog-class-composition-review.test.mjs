import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {buildClassComposition,classInputs} from '../scripts/catalog-class-composition-review.mjs';
const raw=classInputs.map(p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/\r\n/g,'\n'));
const inputs=()=>raw.map(JSON.parse);
test('all thirteen classes reconcile headings without declaring every heading a feature',()=>{
 const a=inputs(),before=JSON.stringify(a),r=buildClassComposition(...a),s=r.summary;
 assert.equal(s.classes,13);assert.equal(s.observedHeadings,2962);assert.equal(s.proposedHeadingUnits,913);assert.equal(s.excludedHeadingObservations,3);assert.equal(s.unclassifiedHeadings,512);assert.equal(s.choiceObservations,189);
 assert.equal(s.proposedHeadingUnits+s.excludedHeadingObservations+s.referenceExcludedHomebrewHeadings+s.playtestReviewHeadings+s.existingChoiceHeadings+s.existingSpellTableHeadings+s.unclassifiedHeadings,s.observedHeadings);assert.equal(JSON.stringify(a),before);
 assert.equal(s.proposalCountsByKind.subclass,118);assert.equal(s.explicitSourceSectionDecisions,12);assert.equal(r.approvedDenominator,null);
 for(const row of r.rows){assert.equal(row.fullPublicationInventoryVerified,false);assert.equal(row.approvedCanonicalUnits,null);assert.equal(row.proposalRecords.length+row.excludedHeadingOrdinals.length+row.referenceExcludedHomebrewHeadingOrdinals.length+row.playtestReviewHeadingOrdinals.length+row.existingChoiceHeadingLinks.length+row.existingSpellTableHeadingLinks.length+row.unclassifiedHeadingOrdinals.length,row.headings);}
});
test('page-only source link remains attributable by its explicit heading ordinal',()=>{
 const r=buildClassComposition(...inputs()),ranger=r.rows.find(r=>r.classSlug==='ranger');assert.ok(ranger.proposalRecords.some(r=>r.headingOrdinal===65));
});
test('missing duplicate and foreign classes fail',()=>{
 for(const change of [a=>a[0].rows.pop(),a=>a[0].rows[0].slug='unknown',a=>a[1].pages[0]=a[1].pages[1],a=>a[4].classes.pop(),a=>a[4].classes.push(a[2])]){const a=inputs();change(a);assert.throws(()=>buildClassComposition(...a));}
});
test('stale page evidence and misattributed headings fail',()=>{
 for(const change of [a=>a[2].inputPageSha256='stale',a=>a[2].records[0].headingOrdinal=9999,a=>a[2].records[0].title='Other',a=>a[2].records[0].sourceUrl='https://wrong.example/#feature',a=>a[2].records[1].id=a[2].records[0].id,a=>a[2].records[0].canonicalCatalogId='accepted']){const a=inputs();change(a);assert.throws(()=>buildClassComposition(...a));}
});
test('choice observations are separately conserved and cannot drift between classes',()=>{
 for(const change of [a=>a[5].groups[0].rawSha256='stale',a=>a[5].groups[0].records[1].id=a[5].groups[0].records[0].id,a=>a[5].groups[0].records[0].classUrl=a[0].rows[0].url,a=>a[5].groups[0].classUrl='https://wrong.example/']){const a=inputs();change(a);assert.throws(()=>buildClassComposition(...a));}
});
test('exclusion observations cannot hide represented headings or invent policy sections',()=>{
 for(const change of [a=>a[2].excluded[0].ordinal=a[2].records[0].headingOrdinal,a=>a[6].records[0].observation.title='Other',a=>a[6].records[0].observation.classUrl='https://wrong.example/']){const a=inputs();change(a);assert.throws(()=>buildClassComposition(...a));}
});
test('saved class composition is reproducible with pinned inputs',()=>{
 const r=buildClassComposition(...inputs());r.inputSha256=Object.fromEntries(classInputs.map((p,i)=>[p,createHash('sha256').update(raw[i]).digest('hex')]));assert.deepEqual(r,JSON.parse(readFileSync(new URL('../catalog/class-composition-review-2014.json',import.meta.url),'utf8')));
});

test('existing homebrew playtest and choice evidence reduces work without admitting excluded features',()=>{
 const r=buildClassComposition(...inputs());assert.equal(r.summary.referenceExcludedHomebrewHeadings,1057);assert.equal(r.summary.playtestReviewHeadings,323);assert.equal(r.summary.existingChoiceHeadings,109);
 const artificer=r.rows.find(r=>r.classSlug==='artificer');assert.ok(artificer.referenceExcludedHomebrewHeadingOrdinals.includes(88));assert.ok(artificer.existingChoiceHeadingLinks.some(l=>l.headingOrdinal===33));
 const a=inputs();a[1].pages.find(p=>p.url===a[2].classUrl).headings.find(h=>h.ordinal===a[2].records[0].headingOrdinal).inclusion='excluded-homebrew';assert.throws(()=>buildClassComposition(...a),/promoted/);
});
test('similar choice titles or different section anchors never silently link',()=>{
 const a=inputs(),g=a[5].groups.find(g=>g.classUrl.includes('137-'));g.records[0].title+=' changed';const r=buildClassComposition(...a),artificer=r.rows.find(r=>r.classSlug==='artificer');assert.ok(artificer.unclassifiedHeadingOrdinals.includes(33));assert.ok(!artificer.existingChoiceHeadingLinks.some(l=>l.headingOrdinal===33));
});

test('nested choice section works but ends at a sibling heading',()=>{
 const original=buildClassComposition(...inputs()).rows.find(r=>r.classSlug==='fighter');assert.ok(original.existingChoiceHeadingLinks.some(l=>l.headingOrdinal===20&&l.sectionAnchor==='feature.fighting-style'));
 const a=inputs(),p=a[1].pages.find(p=>p.url.includes('91-fighter'));p.headings.find(h=>h.ordinal===20).level=p.headings.find(h=>h.ordinal===19).level;const r=buildClassComposition(...a).rows.find(r=>r.classSlug==='fighter');assert.ok(r.unclassifiedHeadingOrdinals.includes(20));assert.ok(!r.existingChoiceHeadingLinks.some(l=>l.headingOrdinal===20));
});
test('shuffled or invalid heading structure is rejected rather than inventing parent sections',()=>{
 for(const mutate of [p=>p.headings.reverse(),p=>p.headings[0].level=0]){const a=inputs();mutate(a[1].pages[0]);assert.throws(()=>buildClassComposition(...a),/order or level/);}
});

test('existing spell tables reconcile by exact heading and subclass without accepting spell rules',()=>{
 const r=buildClassComposition(...inputs());assert.equal(r.summary.spellTableObservations,57);assert.equal(r.summary.existingSpellTableHeadings,45);const artificer=r.rows.find(r=>r.classSlug==='artificer');assert.ok(artificer.existingSpellTableHeadingLinks.some(l=>l.headingOrdinal===53&&l.sectionAnchor==='specialist.alchemist'));
 const a=inputs();a[7].classes.find(c=>c.classUrl.includes('137-')).tables[0].parent='specialist.armorer';const next=buildClassComposition(...a).rows.find(r=>r.classSlug==='artificer');assert.ok(next.unclassifiedHeadingOrdinals.includes(53));
});
test('stale duplicated or orphan spell tables fail rather than inflating coverage',()=>{
 for(const change of [a=>a[7].classes.pop(),a=>a[7].classes[0].rawSha256='stale',a=>{const c=a[7].classes.find(c=>c.tables.length);c.tables.push(c.tables[0]);},a=>a[7].classes.find(c=>c.tables.length).tables[0].classUrl='https://wrong.example/']){const a=inputs();change(a);assert.throws(()=>buildClassComposition(...a));}
});
