import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {article,audit,booleanFilter,spellFields,withReviewedItemMappings} from '../scripts/dndsu-rule-fields.mjs';
import {bundledCatalog} from '../server/bundled-catalog.mjs';
import {readScopeBundle} from '../scripts/catalog-audit-inputs.mjs';
const json=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const baseline=json('catalog/dndsu-rule-index-2026-11-15.json');
const reviewed=json('catalog/dndsu-rule-item-mappings-2014.json');
const snapshot=withReviewedItemMappings(baseline,reviewed);
const manifest=json('catalog/dndsu-rule-clauses-2026-11-15.json');
const entries=bundledCatalog().bundle.entries;
const run=(e=entries,c=manifest.clauses)=>audit(snapshot,e,c);
test('audit is deterministic and preserves the historical baseline separately from later corrections',()=>{
  const historicalEntries=readScopeBundle().entries;
  const report=audit(baseline,historicalEntries,manifest.clauses);
  assert.deepEqual(run(),run());
  const historical=json('catalog/dndsu-rule-audit-2026-11-15.json');
  assert.equal(report.snapshotSha256,historical.snapshotSha256);
  assert.deepEqual(historical.summary,{sourcePages:4333,noNameCandidate:3758,candidateCards:580,fieldChecks:1856,differences:0,clauseChecks:25,clauseGaps:6,fullRulesVerified:0});
  if(report.catalogSha256===historical.catalogSha256)assert.deepEqual(report,historical);
});
test('all existing indexed cards have exactly one candidate row, including grouped aliases and artifact',()=>{
  const rows=run().rows.filter(r=>r.checks);
  assert.equal(new Set(rows.map(r=>r.id)).size,581);
  assert.deepEqual(new Set(rows.map(r=>r.id)),new Set(entries.filter(e=>['spell','monster','item','artifact'].includes(e.kind)).map(e=>e.id)));
  assert.equal(rows.find(r=>r.id.endsWith(':orb-of-dragonkind')).checks[0].status,'match');
  assert.equal(new Set(manifest.sources.map(s=>s.url)).size,13);
  assert.equal(new Set(manifest.clauses.map(c=>c.id+' '+c.field)).size,25);
  for(const c of manifest.clauses)assert.ok(manifest.sources.some(s=>s.url===c.url));
});
test('reviewed Staff of Fire mapping extends the current audit while preserving the old observation',()=>{
  const [mapping]=reviewed.items;
  const historical=baseline.sections.items.rows.find(row=>row.url===mapping.url);
  assert.deepEqual(historical.candidateIds,[]);
  assert.equal(historical.fields,undefined);
  const report=run();
  assert.equal(report.summary.fullRulesVerified,0);
  const staff=report.rows.find(row=>row.id===mapping.catalogId);
  assert.deepEqual(staff.checks,[{field:'attunement',expected:true,actual:true,status:'match'}]);
  assert.equal(staff.fullRules,'unverified');
  assert.equal(staff.url,historical.url);
  assert.throws(()=>withReviewedItemMappings(snapshot,reviewed),/exact reviewed snapshot/);
  assert.throws(()=>withReviewedItemMappings(baseline,{...reviewed,items:[mapping,mapping]}),/Invalid reviewed item mapping/);
});

test('metadata changes and missing values cannot pass',()=>{
  const changed=structuredClone(entries);
  const spell=changed.find(e=>e.id.endsWith(':shield'));
  spell.spell.level=9; spell.spell.components=['M']; delete spell.spell.ritual;
  const row=run(changed).rows.find(r=>r.id===spell.id);
  assert.deepEqual(row.checks.filter(c=>c.status==='different').map(c=>c.field),['level','components','ritual']);
});
test('missing local candidate fails instead of being counted as verified',()=>{
  assert.throws(()=>run(entries.filter(e=>!e.id.endsWith(':shield'))),/Stale candidate/);
});
test('missing expected fields, duplicate pages and unmapped catalog additions fail closed',()=>{
  let copy=structuredClone(snapshot);
  delete copy.sections.spells.rows.find(r=>r.candidateIds.length).fields.ritual;
  assert.throws(()=>audit(copy,entries),/field set/);
  copy=structuredClone(snapshot); copy.sections.items.rows.push(copy.sections.items.rows[0]);
  assert.throws(()=>audit(copy,entries),/snapshot row/);
  assert.throws(()=>run([...entries,{...entries.find(e=>e.kind==='spell'),id:'srd51:2014:spell:new-card'}]),/Unmapped catalog/);
});
test('name matches never imply full rules and all six historical gaps remain explicit',()=>{
  const rows=json('catalog/dndsu-rule-audit-2026-11-15.json').rows;
  assert.ok(rows.filter(r=>r.checks).every(r=>r.fullRules==='unverified'));
  const gaps=rows.flatMap(r=>r.clauses||[]).filter(c=>c.status!=='present');
  assert.deepEqual(gaps.map(c=>c.field).sort(),['damage-termination','flat-panels','targeting','undead-nature','undead-restoration','upcast-target-count'].sort());
  assert.equal(gaps.filter(c=>c.status==='version-difference').length,2);
});
test('deleting rule bodies makes every sampled clause non-present',()=>{
  const changed=entries.map(e=>({...e,text:''}));
  assert.equal(run(changed).summary.clauseGaps,25);
});
test('strict source filters accept cantrips and explicit false, reject unfamiliar encodings',()=>{
  assert.equal(booleanFilter(['1']),false); assert.equal(booleanFilter([2]),true);
  for(const bad of [[],['0'],['1','2'],null])assert.throws(()=>booleanFilter(bad));
  const card={level:'Заговор',school:'Вызов',filter_components:'1|1|0|',filter_concentration:['1'],filter_ritual:['1']};
  assert.deepEqual(spellFields(card),{level:0,school:'conjuration',components:['S','V'],concentration:false,ritual:false});
  for(const patch of [{school:'unknown'},{level:'10'},{filter_components:'1|0|'}])assert.throws(()=>spellFields({...card,...patch}));
});
test('article boundary excludes navigation, scripts and comments; malformed input fails',()=>{
  const html='nav <div itemprop="articleBody"><p>one&nbsp;two</p><script>bad()</script></div><div class="card__footer"></div><p>comments false evidence</p>';
  assert.equal(article(html),'one two');
  assert.throws(()=>article('<p>comments only</p>'),/boundaries/);
  assert.throws(()=>article('<div itemprop="articleBody">truncated'),/boundaries/);
});
