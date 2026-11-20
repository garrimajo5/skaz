import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spellReference,subclassSpellTables} from '../scripts/catalog-subclass-spell-tables.mjs';
const classUrl='https://dnd.su/class/94-paladin/';
const options={classUrl,proposal:{classUrl,records:[{kind:'subclass',parent:'oath.test',sourceIds:['102']}]},knownSpells:new Set(['dndsu:spells:70'])};
const wrap=s=>'<div class="card__body new-article"><h2><span id="oath.test">Test</span></h2>'+s+'<div class="card__footer">';
const link=(id=70,slug='shield')=>`<a href="/spells/${id}-${slug}/">Name</a>`;
const table=(header='Уровень паладина',rows='<tr><td>3</td><td>'+link()+'</td></tr>')=>`<h3>Spells</h3><table><tr class="table_header"><td>${header}</td><td>Заклинания</td></tr>${rows}</table>`;
test('spell reference uses numeric page identity without merging by display name or slug',()=>{
 assert.equal(spellReference('/spells/70-renamed/', 'Other',classUrl,options.knownSpells).pageId,'dndsu:spells:70');
 assert.equal(spellReference('/spells/999999-other/','Name',classUrl,options.knownSpells).registryStatus,'not-in-spell-index');
 for(const href of ['https://evil.test/spells/70-shield/','https://dnd.su:8443/spells/70-shield/','https://user@dnd.su/spells/70-shield/','/homebrew/spells/70-shield/','/spells/70-shield/?x=1','/spells/70-shield/#x'])assert.throws(()=>spellReference(href,'Name',classUrl,options.knownSpells));
});
test('ordinary subclass table preserves source, selector type and unverified rules',()=>{
 const r=subclassSpellTables(wrap(table()),options);assert.equal(r.tables.length,1);const t=r.tables[0];assert.deepEqual(t.sourceIds,['102']);assert.equal(t.rows[0].selectorMeaning,'class-level');assert.equal(t.automation,'not-applied');assert.equal(t.fullRules,'unverified');assert.equal(t.rows[0].cells[0].spells[0].canonicalCatalogId,null);
 assert.equal(subclassSpellTables(wrap(table('Уровень')),options).tables[0].rows[0].selectorMeaning,'unqualified-level');
 assert.equal(subclassSpellTables(wrap(table('Уровень заклинания')),options).tables[0].rows[0].selectorMeaning,'spell-level');
 assert.equal(subclassSpellTables(wrap(table('Склонность','<tr><td>Добро</td><td>'+link()+'</td></tr>')),options).tables[0].rows[0].selectorMeaning,'choice-label');
});
test('variant columns and spans remain explicit instead of granting every variant',()=>{
 const t='<h3>Spells</h3><table><tr><td>Уровень заклинания</td><td>Genie</td><td>Dao</td><td>Marid</td></tr><tr><td>1</td><td>'+link()+'</td><td>'+link(9,'bless')+'</td><td>'+link(10,'other')+'</td></tr><tr><td>9</td><td colspan="3">'+link(70)+' (restriction)</td></tr></table>';
 const rows=subclassSpellTables(wrap(t),options).tables[0].rows;assert.deepEqual(rows[0].cells.map(c=>c.headerLabels),[['Genie'],['Dao'],['Marid']]);assert.equal(rows[1].cells[0].columnSpan,3);assert.equal(rows[1].cells[0].unlinkedText,'(restriction)');
});
test('unreviewed subclass and random-effect tables are accounted for without importing them',()=>{
 const r=subclassSpellTables(wrap(table('к100')+'<h2><span id="hb.test">Homebrew</span></h2>'+table()),options);assert.equal(r.tables.length,0);assert.deepEqual(r.excluded.map(e=>e.reason),['not-a-reviewed-spell-list-shape','outside-reviewed-subclasses']);
});
test('missing class boundaries, wrong proposal, malformed spans and duplicate table identities fail closed',()=>{
 assert.throws(()=>subclassSpellTables(table(),options));assert.throws(()=>subclassSpellTables(wrap(table()),{...options,classUrl:'https://dnd.su/class/1-other/'}));
 for(const content of [table()+table(),table('Уровень','<tr><td>1</td><td colspan="2">'+link()+'</td></tr>'),table('Уровень','<tr><td rowspan="2">1</td><td>'+link()+'</td></tr>')])assert.throws(()=>subclassSpellTables(wrap(content),options));
});
test('commented tables and content outside the article cannot add references',()=>{
 const r=subclassSpellTables(wrap('<!--'+table()+'-->'+table())+table(),options);assert.equal(r.tables.length,1);assert.equal(r.candidateTables,1);
});
test('saved metadata covers all nine oaths and keeps terrain and lunar choices separate',()=>{
 const d=JSON.parse(readFileSync(new URL('../catalog/dndsu-subclass-spell-tables.json',import.meta.url)));assert.equal(d.summary.tables,57);assert.equal(d.summary.spellReferences,557);
 assert.equal(d.classes.find(c=>c.classUrl.includes('/94-')).tables.length,9);
 const druid=d.classes.find(c=>c.classUrl.includes('/90-'));assert.equal(druid.tables.filter(t=>t.parent==='circle.land').length,8);
 const lunar=d.classes.find(c=>c.classUrl.includes('/101-')).tables.find(t=>t.parent==='origin.lunar-sorcery');assert.deepEqual(lunar.headers.slice(1),['Полнолуние','Новолуние','Полумесяц']);
 const refs=d.classes.flatMap(c=>c.tables).flatMap(t=>t.rows).flatMap(r=>r.cells).flatMap(c=>c.spells);assert.ok(refs.every(r=>r.registryStatus==='observed-in-spell-index'&&r.fullRules==='unverified'));
});

test('empty labels and mismatched names remain explicit evidence, not extra named spells',()=>{
 const map=new Map([['dndsu:spells:70',{ru:'Щит',en:'Shield',fields:{level:1}}]]);
 assert.equal(spellReference('/spells/70-shield/','&nbsp;',classUrl,map).nameEvidence,'empty-label');
 assert.equal(spellReference('/spells/70-shield/','Wrong',classUrl,map).nameEvidence,'index-name-differs');
 assert.equal(spellReference('/spells/70-shield/','щит [shield]',classUrl,map).nameEvidence,'index-name-match');
});
test('spell-level comparisons parse ordinal labels and never compare class levels as spell levels',()=>{
 const knownSpells=new Map([['dndsu:spells:70',{ru:'Name',en:'Name',fields:{level:1}}]]);
 const parse=(header,selector)=>subclassSpellTables(wrap(table(header,'<tr><td>'+selector+'</td><td>'+link()+'</td></tr>')),{...options,knownSpells}).tables[0].rows[0].cells[0].spells[0].levelComparison;
 assert.equal(parse('Уровень заклинания','1-й'),'matches-table-selector');assert.equal(parse('Уровень заклинания','2'),'differs-from-table-selector');assert.equal(parse('Уровень паладина','3'),'not-applicable');
});

test('category matrices retain the first spell column and do not invent a row level',()=>{
 const t='<h3>Dunamancy</h3><table><tr><td>Дюнамантия</td><td>Хронургия</td><td>Гравитургия</td></tr><tr><td>'+link()+' (заговор)</td><td>'+link(1)+'</td><td>'+link(2)+'</td></tr></table>';
 const r=subclassSpellTables(wrap(t),options).tables[0];assert.equal(r.tableKind,'spell-category-matrix');assert.equal(r.rows[0].selector,null);assert.equal(r.rows[0].cells.length,3);assert.equal(r.rows[0].cells[0].columnStart,0);assert.equal(r.rows[0].cells[0].spells[0].levelComparison,'not-applicable');
});
test('a closing bracket outside a source link is preserved as a format issue',()=>{
 const map=new Map([['dndsu:spells:70',{ru:'Щит',en:'Shield',fields:{level:1}}]]);const r=spellReference('/spells/70-shield/','Щит [Shield',classUrl,map);assert.equal(r.nameEvidence,'index-name-match');assert.equal(r.labelFormatIssue,'unclosed-bracket');assert.equal(r.label,'Щит [Shield');
});
