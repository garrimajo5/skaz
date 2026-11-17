import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {featureSpellReferences} from '../scripts/catalog-feature-spell-references.mjs';
const classUrl='https://dnd.su/class/88-bard/',source={sourceId:'102',title:"Player's Handbook",group:'Core'};
const proposal={classUrl,records:[{id:'feature:x',kind:'base-feature',title:'Feature',headingOrdinal:2,parent:'base',sourceIds:['102']}]};
const knownSpells=new Map([['dndsu:spells:1',{ru:'Щит',en:'Shield',fields:{level:1}}]]);
const wrap=body=>'<div class="card__body new-article"><h2><span id="base">Base</span></h2><h3>Feature</h3>'+body+'<h3>Other</h3><p><a href="/spells/9-other/">other</a></p><div class="card__footer">';
const parse=html=>featureSpellReferences(html,{proposal,knownSpells,sources:[source]});
test('feature references separate individual spells and filtered list navigation without inferring grants',()=>{
 const r=parse(wrap('<p>Например <a href="/spells/1-shield/">Щит [Shield]</a>, <a href="/spells/?class=bard">список</a>.</p>')).records;assert.equal(r.length,2);assert.equal(r[0].reference.pageId,'dndsu:spells:1');assert.equal(r[1].reference.kind,'spell-list-navigation');assert.ok(r.every(r=>r.relationship==='unclassified-reference-not-a-grant'&&r.automation==='not-applied'));assert.deepEqual(r[0].featureSourceIds,['102']);
});
test('tables, comments, following features and footer cannot leak into non-table feature references',()=>{
 const h=wrap('<!--<h3>Fake</h3><a href="/spells/2-fake/">fake</a>--><table><tr><td><a href="/spells/3-table/">table</a></td></tr></table><p><a href="/spells/1-shield/">Щит</a></p>')+'<a href="/spells/4-footer/">footer</a>';assert.equal(parse(h).records.length,1);
});
test('child heading context and its source survive without pretending it certifies the whole feature',()=>{
 const r=parse(wrap('<h4>Choice</h4><p><strong>Источник: «Player\'s Handbook»</strong></p><p><a href="/spells/1-shield/">Щит</a></p>')).records[0];assert.equal(r.contextHeading,'Choice');assert.deepEqual(r.contextExplicitSourceIds,['102']);assert.equal(r.sourceBasis,'containing-feature-not-certification-of-link-rule');
});
test('unknown identities stay explicit and unsafe origins or stale headings fail',()=>{
 assert.equal(parse(wrap('<p><a href="/spells/999-unknown/">?</a></p>')).records[0].reference.registryStatus,'not-in-spell-index');assert.throws(()=>parse(wrap('<p><a href="https://foreign.test/spells/1-x/">x</a></p>')));assert.throws(()=>parse(wrap('').replace('<h3>Feature','<h3>Renamed')));assert.throws(()=>parse('<p>no article</p>'));
});
test('saved observations enumerate 134 references but certify zero spell grants',()=>{
 const r=JSON.parse(readFileSync(new URL('../catalog/dndsu-feature-spell-references.json',import.meta.url)));assert.equal(r.summary.references,134);assert.equal(r.summary.spellPageReferences,100);assert.equal(r.summary.listNavigationReferences,32);assert.equal(r.summary.searchNavigationReferences,2);assert.equal(r.summary.uniqueSpellPages,62);assert.equal(r.summary.unknownPages,0);assert.equal(r.summary.blankLabels,3);const rows=r.classes.flatMap(c=>c.records);assert.equal(new Set(rows.map(r=>r.id)).size,rows.length);assert.ok(rows.every(r=>r.automation==='not-applied'));
});

test('named search links retain candidates without becoming resolved spell page identities',()=>{
 const r=parse(wrap('<p><a href="/spells/?search=Shield">Щит [Shield]</a></p>')).records[0].reference;
 assert.equal(r.kind,'spell-search-navigation');assert.equal(r.pageId,null);assert.deepEqual(r.candidatePageIds,['dndsu:spells:1']);assert.equal(r.identityResolution,'unresolved-search-not-page-identity');
});
