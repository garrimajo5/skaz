import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spellGrantProposal} from '../scripts/catalog-spell-grant-proposals.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../catalog/'+p,import.meta.url)));
test('spell policies cover all extracted tables once, while remaining review proposals',()=>{
 const policies=read('dndsu-spell-grant-proposals.json').records,tables=read('dndsu-subclass-spell-tables.json').classes.flatMap(c=>c.tables);assert.equal(policies.length,50);assert.deepEqual(policies.flatMap(p=>p.tableIds).sort(),tables.map(t=>t.id).sort());assert.ok(policies.every(p=>p.automation==='not-applied'&&p.fullRules==='unverified'&&p.approval==='awaiting-independent-game-design-review'));
});
test('warlock expanded lists do not become automatically known spells',()=>{
 const records=read('dndsu-spell-grant-proposals.json').records.filter(p=>p.classUrl.includes('/104-'));assert.equal(records.length,9);assert.ok(records.every(p=>p.grantMode==='expanded-class-selection-list'&&p.automaticallyKnown===false));assert.equal(records.find(p=>p.parent==='patron.genie').selection,'general-column-plus-chosen-genie-kind');
});
test('lunar phase affects special casting rather than filtering the learned table spells',()=>{
 const r=read('dndsu-spell-grant-proposals.json').records.find(p=>p.parent==='origin.lunar-sorcery');assert.equal(r.selection,'all-table-columns-at-required-class-level');assert.equal(r.phaseSelection.doesNotFilterLearnedTableSpells,true);assert.equal(r.countsAgainstKnownSpellLimit,false);
});
test('terrain and affinity require choices, and learned cantrips are not marked prepared',()=>{
 const rs=read('dndsu-spell-grant-proposals.json').records;assert.equal(rs.find(p=>p.parent==='circle.land').selection,'choose-one-terrain-table');assert.equal(rs.find(p=>p.parent==='origin.divine-soul').selection,'choose-one-affinity-row');assert.equal(rs.find(p=>p.parent==='circle.spores').rowExceptions[0].grantMode,'learned-cantrip');assert.equal(rs.find(p=>p.parent==='archetype.swarmkeeper').cantripException.grantMode,'learned-if-not-already-known');
});
test('missing or changed supporting text cannot retain a policy proposal silently',()=>{
 const url='https://dnd.su/class/104-warlock/',table={id:'table',classUrl:url,parent:'patron.test',sourceIds:['102']};
 const html='<div class="card__body new-article"><h2><span id="patron.test">Patron</span></h2><p>При изучении заклинаний расширяется список.</p><div class="card__footer">';
 assert.equal(spellGrantProposal(html,[table])[0].automaticallyKnown,false);
 assert.throws(()=>spellGrantProposal(html.replace('список','набор'),[table]));assert.throws(()=>spellGrantProposal(html.replace('card__footer','other'),[table]));
});

test('dunamancy category matrices have an explicit undecided policy instead of guessed spell grants',()=>{
 const rs=read('dndsu-spell-grant-proposals.json').records.filter(r=>r.classUrl.includes('/105-'));assert.equal(rs.length,2);assert.ok(rs.every(r=>r.grantMode==='undetermined-matrix-availability'&&r.pending.includes('matrix-availability-and-GM-permission')));
});

test('duplicate section anchors and duplicate tables cannot choose ambiguous policy evidence',()=>{
 const table={id:'a',classUrl:'https://dnd.su/class/104-warlock/',parent:'patron.test',sourceIds:['102']};
 const section='<h2><span id="patron.test">Patron</span></h2><p>При изучении заклинаний расширяется список.</p>';
 const html='<div class="card__body new-article">'+section+'<div class="card__footer">';
 assert.throws(()=>spellGrantProposal(html,[table,table]),/Duplicate spell policy table/);
 assert.throws(()=>spellGrantProposal(html.replace(section,section+section),[table]),/Duplicate spell grant parent/);
});
